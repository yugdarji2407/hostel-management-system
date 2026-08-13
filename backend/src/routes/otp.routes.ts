import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requestOtp, verifyOtp } from '../services/otp.js';
import { getLoginChallenge, completeLoginChallenge } from '../services/auth.js';
import { fail, ok } from '../lib/http.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

const r = Router();
const purposeSchema = z.enum(['LOGIN', 'REGISTRATION', 'PASSWORD_RESET', 'VERIFICATION']).default('PASSWORD_RESET');
const requestSchema = z.object({ recipient: z.string().min(3).max(254), purpose: purposeSchema.optional() });
const verifySchema = z.object({ recipient: z.string().min(3).max(254), otp: z.string().regex(/^\d+$/), purpose: purposeSchema.optional() });

const generationLimiter = rateLimit({
  windowMs: env.OTP_RATE_WINDOW_SECONDS * 1000,
  limit: env.OTP_MAX_REQUESTS_PER_WINDOW,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'OTP_RATE_LIMITED', message: 'Too many OTP requests. Please try again later.', details: [] } },
});
const verificationLimiter = rateLimit({
  windowMs: env.OTP_VERIFY_RATE_WINDOW_SECONDS * 1000,
  limit: env.OTP_MAX_VERIFY_REQUESTS_PER_WINDOW,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'OTP_RATE_LIMITED', message: 'Too many verification attempts. Please try again later.', details: [] } },
});

function mapError(error: unknown, res: any) {
  const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
  if (code === 'OTP_RESEND_COOLDOWN') return fail(res, 429, code, 'Please wait before requesting another OTP.', []);
  if (code === 'OTP_RATE_LIMITED') return fail(res, 429, code, 'Too many OTP requests. Please try again later.', []);
  if (code === 'OTP_DELIVERY_FAILED') return fail(res, 502, code, 'We could not deliver the verification code. Please try again later.', []);
  if (code === 'OTP_EMAIL_NOT_CONFIGURED' || code === 'OTP_SMS_NOT_CONFIGURED') return fail(res, 503, 'OTP_DELIVERY_UNAVAILABLE', 'This verification method is temporarily unavailable.', []);
  if (code === 'AUTH_LOGIN_CHALLENGE_EXPIRED') return fail(res, 401, code, 'Login verification expired. Please login again.');
  if (code === 'OTP_MAX_ATTEMPTS') return fail(res, 429, code, 'Maximum verification attempts reached. Request a new OTP.', []);
  if (code === 'OTP_INVALID' || code === 'OTP_INVALID_OR_EXPIRED') return fail(res, 400, code, 'The verification code is invalid or expired.', []);
  if (code === 'INVALID_OTP_PURPOSE' || code === 'INVALID_OTP_METHOD') return fail(res, 400, 'VALIDATION_ERROR', 'Invalid OTP request.', []);
  return fail(res, 500, 'INTERNAL_ERROR', 'Something went wrong.', []);
}

function recipientMatchesChallenge(method:'EMAIL'|'SMS',recipient:string,challenge:any){
  if(method==='EMAIL') return challenge.user.email.toLowerCase()===recipient.trim().toLowerCase();
  const digits=(v:string)=>v.replace(/\D/g,'');
  return digits(challenge.user.student?.phone||'')===digits(recipient);
}
async function requireLoginChallenge(req:any,method:'EMAIL'|'SMS',recipient:string){
  const raw=req.cookies?.[env.LOGIN_CHALLENGE_COOKIE_NAME] as string|undefined;
  const challenge=raw?await getLoginChallenge(raw):null;
  if(!raw || !challenge || !recipientMatchesChallenge(method,recipient,challenge)) throw new Error('AUTH_LOGIN_CHALLENGE_EXPIRED');
  return {raw,challenge};
}
async function requestHandler(method: 'EMAIL' | 'SMS', req: any, res: any, resend = false) {
  try {
    const p = requestSchema.parse(req.body);
    if(p.purpose==='LOGIN') await requireLoginChallenge(req,method,p.recipient);
    const data = await requestOtp({ method, recipient: p.recipient, purpose: p.purpose, ipAddress: req.ip, userAgent: req.get('user-agent'), resend });
    return ok(res, data);
  } catch (error) {
    return mapError(error, res);
  }
}

async function verifyHandler(method: 'EMAIL' | 'SMS', req: any, res: any) {
  try {
    const p = verifySchema.parse(req.body);
    const loginChallenge=p.purpose==='LOGIN'?await requireLoginChallenge(req,method,p.recipient):null;
    const data = await verifyOtp({ method, recipient: p.recipient, otp: p.otp, purpose: p.purpose, ipAddress: req.ip, userAgent: req.get('user-agent') });
    if (data.resetToken) {
      res.cookie(env.PASSWORD_RESET_COOKIE_NAME, data.resetToken, { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: env.COOKIE_SAME_SITE, path: '/', maxAge: 15 * 60 * 1000 });
    }
    if(p.purpose==='REGISTRATION'){
      const activated=await prisma.$transaction(async tx=>{
        const updated=await tx.user.updateMany({where:{id:data.userId,status:'PENDING'},data:{status:'ACTIVE'}});
        if(updated.count!==1)return false;
        await tx.student.updateMany({where:{userId:data.userId,status:'PENDING'},data:{status:'ACTIVE'}});
        return true;
      });
      if(!activated)return fail(res,409,'REGISTRATION_ALREADY_VERIFIED','Registration is already verified.');
      return ok(res,{verified:true,status:'REGISTRATION_VERIFIED'});
    }
    if(p.purpose==='LOGIN' && loginChallenge){
      const session=await completeLoginChallenge(loginChallenge.raw,{ip:req.ip??'',userAgent:req.get('user-agent')||'',rememberDevice:true});
      if(!session) return fail(res,401,'AUTH_LOGIN_CHALLENGE_EXPIRED','Login verification expired. Please login again.');
      res.cookie(env.SESSION_COOKIE_NAME,session.raw,{httpOnly:true,secure:env.NODE_ENV==='production',sameSite:env.COOKIE_SAME_SITE,path:'/',maxAge:session.expires.getTime()-Date.now()});
      res.clearCookie(env.LOGIN_CHALLENGE_COOKIE_NAME,{httpOnly:true,secure:env.NODE_ENV==='production',sameSite:env.COOKIE_SAME_SITE,path:'/'});
      return ok(res,{verified:true,status:'AUTHENTICATED',role:session.role});
    }
    return ok(res, { verified: data.verified });
  } catch (error) {
    return mapError(error, res);
  }
}

r.post('/email/request', generationLimiter, (req, res) => requestHandler('EMAIL', req, res));
r.post('/email/resend', generationLimiter, (req, res) => requestHandler('EMAIL', req, res, true));
r.post('/email/verify', verificationLimiter, (req, res) => verifyHandler('EMAIL', req, res));
r.post('/sms/request', generationLimiter, (req, res) => requestHandler('SMS', req, res));
r.post('/sms/resend', generationLimiter, (req, res) => requestHandler('SMS', req, res, true));
r.post('/sms/verify', verificationLimiter, (req, res) => verifyHandler('SMS', req, res));

export default r;
