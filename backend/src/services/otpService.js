const crypto = require("crypto");
const { sendEmail } = require("../mailer");

const OTP_LENGTH = 6;
const OTP_TTL_MS = Number(process.env.OTP_TTL_MS || 5 * 60 * 1000);
const MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const RESEND_COOLDOWN_MS = Number(process.env.OTP_RESEND_COOLDOWN_MS || 60 * 1000);
const VERIFICATION_TTL_MS = Number(process.env.OTP_VERIFICATION_TTL_MS || 10 * 60 * 1000);

function generateOtp() {
  return crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}
function hash(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function normalizePhone(phone) { return String(phone || "").trim().replace(/[^\d+]/g, ""); }
function normalizeEmail(email) { return String(email || "").trim().toLowerCase(); }

async function ensureStore(db) {
  // expires_at/last_sent_at/verified_at/created_at store Date.now() epoch
  // milliseconds — that overflows a 4-byte Postgres INTEGER (SQLite's
  // INTEGER has no such limit), so these are BIGINT here.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS otp_verifications (
      id SERIAL PRIMARY KEY,
      channel TEXT NOT NULL,
      destination TEXT NOT NULL,
      purpose TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_sent_at BIGINT NOT NULL,
      verified_at BIGINT,
      verification_token_hash TEXT,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_otp_destination_purpose
      ON otp_verifications(destination, purpose, channel);
    CREATE INDEX IF NOT EXISTS idx_otp_verification_token
      ON otp_verifications(verification_token_hash);
  `);
}

function validateChannelDestination(channel, destination) {
  if (!["email", "phone"].includes(channel)) throw new Error("Invalid OTP channel.");
  const normalized = channel === "email" ? normalizeEmail(destination) : normalizePhone(destination);
  if (!normalized) throw new Error(`${channel === "email" ? "Email" : "Mobile number"} is required.`);
  if (channel === "email" && !/^\S+@\S+\.\S+$/.test(normalized)) throw new Error("Enter a valid email address.");
  if (channel === "phone" && normalized.replace(/\D/g, "").length < 10) throw new Error("Enter a valid mobile number.");
  return normalized;
}

async function createOtp(db, channel, destination, purpose) {
  await ensureStore(db);
  destination = validateChannelDestination(channel, destination);
  const now = Date.now();
  const latest = await db.prepare(`SELECT last_sent_at FROM otp_verifications WHERE channel=? AND destination=? AND purpose=? AND verified_at IS NULL ORDER BY id DESC LIMIT 1`).get(channel, destination, purpose);
  if (latest && now - Number(latest.last_sent_at) < RESEND_COOLDOWN_MS) {
    const remaining = Math.ceil((RESEND_COOLDOWN_MS - (now - Number(latest.last_sent_at))) / 1000);
    const err = new Error(`Please wait ${remaining} seconds before requesting another OTP.`);
    err.code = "OTP_COOLDOWN";
    throw err;
  }
  const otp = generateOtp();
  await db.prepare(`INSERT INTO otp_verifications (channel,destination,purpose,otp_hash,expires_at,attempts,last_sent_at,created_at) VALUES (?,?,?,?,?,0,?,?)`)
    .run(channel, destination, purpose, hash(otp), now + OTP_TTL_MS, now, now);
  await db.prepare(`DELETE FROM otp_verifications WHERE channel=? AND destination=? AND purpose=? AND id NOT IN (SELECT id FROM otp_verifications WHERE channel=? AND destination=? AND purpose=? ORDER BY id DESC LIMIT 5)`)
    .run(channel, destination, purpose, channel, destination, purpose);
  return { otp, destination, expiresInSeconds: Math.floor(OTP_TTL_MS / 1000) };
}

async function sendSms(phone, message) {
  const provider = String(process.env.SMS_PROVIDER || "").toLowerCase();
  if (provider === "twilio") {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) throw new Error("Twilio SMS configuration is incomplete.");
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: normalizePhone(phone), From: from, Body: message })
    });
    if (!response.ok) throw new Error(`Twilio error: ${response.status} ${(await response.text()).slice(0, 300)}`);
    return response.json();
  }
  if (process.env.NODE_ENV !== "production") {
    console.log(`[DEV SMS OTP] ${phone}: ${message}`);
    return { development: true };
  }
  throw new Error("SMS_PROVIDER is not configured.");
}

async function deliverOtp(channel, destination, otp, purpose) {
  const message = `Your Hostel Management System ${purpose} verification code is ${otp}. It expires in 5 minutes. Do not share this code.`;
  if (channel === "phone") return sendSms(destination, message);
  return sendEmail({
    to: destination,
    subject: "Hostel Management System - Verification Code",
    text: message
  });
}

async function issueOtp(db, channel, destination, purpose) {
  const created = await createOtp(db, channel, destination, purpose);
  // Log the code for local debugging BEFORE attempting delivery — otherwise
  // a delivery failure (no email/SMS provider configured) throws first and
  // the OTP is never visible anywhere, making the whole flow untestable
  // without real credentials. Never logged in production.
  if (process.env.NODE_ENV !== "production") console.log(`[OTP DEBUG] ${channel}:${created.destination} -> ${created.otp}`);
  try {
    await deliverOtp(channel, created.destination, created.otp, purpose);
  } catch (err) {
    // The OTP is still valid and usable (it's already stored, hashed, in
    // otp_verifications) even if the notification channel itself failed —
    // surface the delivery failure to the caller without invalidating the code.
    console.error(`[OTP delivery failed] ${channel}:${created.destination}: ${err.message}`);
  }
  return { expiresInSeconds: created.expiresInSeconds };
}

async function verifyOtp(db, channel, destination, purpose, otp) {
  await ensureStore(db);
  destination = validateChannelDestination(channel, destination);
  const row = await db.prepare(`SELECT * FROM otp_verifications WHERE channel=? AND destination=? AND purpose=? AND verified_at IS NULL ORDER BY id DESC LIMIT 1`).get(channel, destination, purpose);
  if (!row) return { ok: false, message: "OTP not found. Please request a new OTP." };
  const now = Date.now();
  if (Number(row.expires_at) < now) return { ok: false, message: "OTP has expired. Please request a new OTP." };
  if (Number(row.attempts) >= MAX_ATTEMPTS) return { ok: false, message: "Too many incorrect attempts. Please request a new OTP." };
  const valid = crypto.timingSafeEqual(Buffer.from(row.otp_hash, "hex"), Buffer.from(hash(otp), "hex"));
  if (!valid) {
    await db.prepare("UPDATE otp_verifications SET attempts=attempts+1 WHERE id=?").run(row.id);
    return { ok: false, message: "Invalid OTP." };
  }
  const verificationToken = crypto.randomBytes(32).toString("hex");
  await db.prepare("UPDATE otp_verifications SET verified_at=?, verification_token_hash=? WHERE id=?").run(now, hash(verificationToken), row.id);
  return { ok: true, verificationToken, channel, destination };
}

async function consumeVerification(db, token, channel, destination, purpose) {
  if (!token) return false;
  await ensureStore(db);
  const normalized = validateChannelDestination(channel, destination);
  const row = await db.prepare(`SELECT * FROM otp_verifications WHERE verification_token_hash=? AND channel=? AND destination=? AND purpose=? AND verified_at IS NOT NULL ORDER BY id DESC LIMIT 1`).get(hash(token), channel, normalized, purpose);
  if (!row) return false;
  if (Date.now() - Number(row.verified_at) > VERIFICATION_TTL_MS) return false;
  await db.prepare("UPDATE otp_verifications SET verification_token_hash=NULL WHERE id=?").run(row.id);
  return true;
}

module.exports = { normalizePhone, normalizeEmail, ensureStore, issueOtp, verifyOtp, consumeVerification };
