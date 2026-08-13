import argon2 from 'argon2';
import { randomInt, randomBytes } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { sha256 } from '../lib/security.js';
import { env } from '../config/env.js';
import { audit } from './audit.js';

type Purpose = 'LOGIN' | 'REGISTRATION' | 'PASSWORD_RESET' | 'VERIFICATION';
type Method = 'EMAIL' | 'SMS';

const OTP_PURPOSES: Purpose[] = ['LOGIN', 'REGISTRATION', 'PASSWORD_RESET', 'VERIFICATION'];
const OTP_METHODS: Method[] = ['EMAIL', 'SMS'];

function assertPurpose(value: string): asserts value is Purpose {
  if (!OTP_PURPOSES.includes(value as Purpose)) throw new Error('INVALID_OTP_PURPOSE');
}

function assertMethod(value: string): asserts value is Method {
  if (!OTP_METHODS.includes(value as Method)) throw new Error('INVALID_OTP_METHOD');
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizePhone(value: string) {
  const raw = value.replace(/[\s().-]/g, '');
  if (raw.startsWith('+')) return raw;
  if (raw.startsWith('00')) return `+${raw.slice(2)}`;
  return `${env.OTP_DEFAULT_COUNTRY_CODE}${raw.replace(/^0+/, '')}`;
}

function maskEmail(email: string) {
  const [name, domain] = email.split('@');
  if (!domain) return '***';
  return `${name.slice(0, 1)}***@${domain}`;
}

function maskPhone(phone: string) {
  return `${phone.slice(0, 3)}${'*'.repeat(Math.max(0, phone.length - 7))}${phone.slice(-4)}`;
}

function generateOtp(length: number) {
  const min = 10 ** (length - 1);
  const max = 10 ** length;
  return String(randomInt(min, max)).padStart(length, '0');
}

async function hashOtp(otp: string) {
  return argon2.hash(otp, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

async function verifyOtpHash(hash: string, otp: string) {
  return argon2.verify(hash, otp).catch(() => false);
}

async function sendEmailOtp(to: string, otp: string) {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) throw new Error('OTP_EMAIL_NOT_CONFIGURED');
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'accept': 'application/json', 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME },
      to: [{ email: to }],
      subject: 'KSV Hostel verification code',
      textContent: `Your KSV Hostel verification code is ${otp}. It expires in ${Math.round(env.OTP_EXPIRY_SECONDS / 60)} minutes. Do not share this code with anyone.`,
      htmlContent: `<p>Your KSV Hostel verification code is <strong>${otp}</strong>.</p><p>This code expires in ${Math.round(env.OTP_EXPIRY_SECONDS / 60)} minutes. Do not share it with anyone.</p>`,
    }),
  });
  if (!response.ok) throw new Error(`BREVO_DELIVERY_FAILED_${response.status}`);
}

async function sendSmsOtp(to: string, otp: string) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || (!env.TWILIO_PHONE_NUMBER && !env.TWILIO_MESSAGING_SERVICE_SID)) throw new Error('OTP_SMS_NOT_CONFIGURED');
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const body = new URLSearchParams({
    To: to,
    ...(env.TWILIO_MESSAGING_SERVICE_SID ? { MessagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID } : { From: env.TWILIO_PHONE_NUMBER! }),
    Body: `KSV Hostel OTP: ${otp}. Expires in ${Math.round(env.OTP_EXPIRY_SECONDS / 60)} minutes. Do not share it.`,
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error(`TWILIO_DELIVERY_FAILED_${response.status}`);
}

async function findAccount(method: Method, recipient: string) {
  if (method === 'EMAIL') {
    const email = normalizeEmail(recipient);
    const user = await prisma.user.findUnique({ where: { normalizedEmail: email }, include: { student: true } });
    return user ? { user, recipient: email, studentId: user.student?.id ?? null } : null;
  }
  const phone = normalizePhone(recipient);
  const digits = phone.replace(/^\+/, '');
  const local = digits.endsWith('91') ? digits.slice(2) : digits;
  const candidates = Array.from(new Set([phone, local, `+${digits}`]));
  const student = await prisma.student.findFirst({ where: { phone: { in: candidates } }, include: { user: true } });
  return student ? { user: student.user, recipient: phone, studentId: student.id } : null;
}

async function enforceAccountRateLimit(userId: string, method: Method, purpose: Purpose, ipAddress: string) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - env.OTP_RATE_WINDOW_SECONDS * 1000);
  const recent = await prisma.otpVerification.count({
    where: {
      userId,
      deliveryMethod: method,
      purpose,
      createdAt: { gte: windowStart },
    },
  });
  if (recent >= env.OTP_MAX_REQUESTS_PER_WINDOW) throw new Error('OTP_RATE_LIMITED');
  const ipRecent = await prisma.otpVerification.count({ where: { ipAddress, createdAt: { gte: windowStart } } });
  if (ipRecent >= env.OTP_MAX_REQUESTS_PER_WINDOW * 2) throw new Error('OTP_RATE_LIMITED');
}

export async function requestOtp(input: { method: Method; recipient: string; purpose?: Purpose; ipAddress: string; userAgent?: string; resend?: boolean }) {
  const method = input.method;
  const purpose = input.purpose ?? 'PASSWORD_RESET';
  assertMethod(method); assertPurpose(purpose);
  const account = await findAccount(method, input.recipient);
  const generic = { accepted: true, message: method === 'EMAIL' ? 'If the account exists, a verification code has been sent.' : 'If the account exists, a verification code has been sent.' };
  if (!account) return { ...generic, expiresAt: new Date(Date.now() + env.OTP_EXPIRY_SECONDS * 1000).toISOString(), resendAvailableAt: new Date(Date.now() + env.OTP_RESEND_COOLDOWN_SECONDS * 1000).toISOString() };

  await enforceAccountRateLimit(account.user.id, method, purpose, input.ipAddress);
  const now = new Date();
  const active = await prisma.otpVerification.findFirst({
    where: { userId: account.user.id, purpose, deliveryMethod: method, status: 'ACTIVE', expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
  });
  if (active && active.resendAvailableAt > now) {
    throw Object.assign(new Error('OTP_RESEND_COOLDOWN'), { retryAt: active.resendAvailableAt });
  }

  const otp = generateOtp(env.OTP_LENGTH);
  const otpHash = await hashOtp(otp);
  const expiresAt = new Date(now.getTime() + env.OTP_EXPIRY_SECONDS * 1000);
  const resendAvailableAt = new Date(now.getTime() + env.OTP_RESEND_COOLDOWN_SECONDS * 1000);

  await prisma.otpVerification.updateMany({
    where: { userId: account.user.id, purpose, deliveryMethod: method, status: 'ACTIVE' },
    data: { status: 'INVALIDATED', invalidatedAt: now },
  });

  const record = await prisma.otpVerification.create({
    data: {
      userId: account.user.id,
      studentId: account.studentId,
      purpose,
      deliveryMethod: method,
      recipient: account.recipient,
      otpHash,
      expiresAt,
      resendAvailableAt,
      lastSentAt: now,
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      status: 'ACTIVE',
    },
  });

  try {
    if (method === 'EMAIL') await sendEmailOtp(account.recipient, otp);
    else await sendSmsOtp(account.recipient, otp);
  } catch (error) {
    await prisma.otpVerification.update({ where: { id: record.id }, data: { status: 'DELIVERY_FAILED', failureReason: error instanceof Error ? error.message.slice(0, 120) : 'DELIVERY_FAILED' } });
    throw new Error('OTP_DELIVERY_FAILED');
  }

  await audit({ actorUserId: account.user.id, action: 'OTP_REQUESTED', entityType: 'OtpVerification', entityId: record.id, targetUserId: account.user.id, ipAddress: input.ipAddress, userAgent: input.userAgent, metadata: { purpose, deliveryMethod: method } });
  return { ...generic, expiresAt: expiresAt.toISOString(), resendAvailableAt: resendAvailableAt.toISOString(), destination: method === 'EMAIL' ? maskEmail(account.recipient) : maskPhone(account.recipient) };
}

export async function verifyOtp(input: { method: Method; recipient: string; otp: string; purpose?: Purpose; ipAddress: string; userAgent?: string }) {
  const method = input.method; const purpose = input.purpose ?? 'PASSWORD_RESET';
  assertMethod(method); assertPurpose(purpose);
  if (!/^\d+$/.test(input.otp) || input.otp.length !== env.OTP_LENGTH) throw new Error('OTP_INVALID');
  const account = await findAccount(method, input.recipient);
  if (!account) throw new Error('OTP_INVALID');
  const now = new Date();
  const otpRecord = await prisma.otpVerification.findFirst({ where: { userId: account.user.id, purpose, deliveryMethod: method, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } });
  if (!otpRecord) throw new Error('OTP_INVALID_OR_EXPIRED');
  if (otpRecord.expiresAt <= now) {
    await prisma.otpVerification.update({ where: { id: otpRecord.id }, data: { status: 'EXPIRED' } });
    throw new Error('OTP_INVALID_OR_EXPIRED');
  }
  if (otpRecord.attempts >= otpRecord.maxAttempts) {
    await prisma.otpVerification.update({ where: { id: otpRecord.id }, data: { status: 'BLOCKED' } });
    throw new Error('OTP_MAX_ATTEMPTS');
  }

  const valid = await verifyOtpHash(otpRecord.otpHash, input.otp);
  if (!valid) {
    const attempts = otpRecord.attempts + 1;
    await prisma.otpVerification.update({ where: { id: otpRecord.id }, data: { attempts, status: attempts >= otpRecord.maxAttempts ? 'BLOCKED' : 'ACTIVE' } });
    throw new Error(attempts >= otpRecord.maxAttempts ? 'OTP_MAX_ATTEMPTS' : 'OTP_INVALID');
  }

  const rawResetToken = purpose === 'PASSWORD_RESET' ? randomBytes(32).toString('base64url') : null;
  const completed = await prisma.$transaction(async tx => {
    const claimed = await tx.otpVerification.updateMany({
      where: { id: otpRecord.id, status: 'ACTIVE', usedAt: null, expiresAt: { gt: now } },
      data: { status: 'USED', usedAt: now },
    });
    if (claimed.count !== 1) return false;
    if (rawResetToken) {
      await tx.passwordResetToken.updateMany({ where: { userId: account.user.id, usedAt: null }, data: { usedAt: now } });
      await tx.passwordResetToken.create({ data: { userId: account.user.id, tokenHash: sha256(rawResetToken), expiresAt: new Date(now.getTime() + 15 * 60 * 1000) } });
    }
    return true;
  });
  if (!completed) throw new Error('OTP_INVALID_OR_EXPIRED');
  await audit({ actorUserId: account.user.id, action: 'OTP_VERIFIED', entityType: 'OtpVerification', entityId: otpRecord.id, targetUserId: account.user.id, ipAddress: input.ipAddress, userAgent: input.userAgent, metadata: { purpose, deliveryMethod: method } });
  return { verified: true, userId: account.user.id, resetToken: rawResetToken };
}

export async function cleanupExpiredOtps() {
  const now = new Date();
  await prisma.otpVerification.updateMany({ where: { status: 'ACTIVE', expiresAt: { lt: now } }, data: { status: 'EXPIRED' } });
  await prisma.otpVerification.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date(now.getTime() - env.OTP_RETENTION_SECONDS * 1000) } }, { status: { in: ['USED', 'INVALIDATED', 'BLOCKED', 'DELIVERY_FAILED'] }, createdAt: { lt: new Date(now.getTime() - env.OTP_RETENTION_SECONDS * 1000) } }] } });
}
