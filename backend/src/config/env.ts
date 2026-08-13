import { z } from 'zod';
const schema=z.object({NODE_ENV:z.enum(['development','test','production']).default('development'),PORT:z.coerce.number().default(4000),DATABASE_URL:z.string().min(1),FRONTEND_URL:z.string().url(),CORS_ORIGINS:z.string().min(1),SESSION_COOKIE_NAME:z.string().default('ksv_session'),PASSWORD_RESET_COOKIE_NAME:z.string().default('ksv_password_reset'),LOGIN_CHALLENGE_COOKIE_NAME:z.string().default('ksv_login_challenge'),COOKIE_SAME_SITE:z.enum(['lax','strict','none']).default('lax'),SESSION_SECRET:z.string().min(32),QR_TOKEN_SECRET:z.string().min(32),TRUST_PROXY:z.string().default('false'),REDIS_URL:z.string().optional(),HOSTEL_TIMEZONE:z.string().default('Asia/Kolkata'),ATTACHMENTS_DIR:z.string().default('./var/attachments'),MAX_ATTACHMENT_SIZE_MB:z.coerce.number().default(5),BREVO_API_KEY:z.string().optional(),BREVO_SENDER_EMAIL:z.string().email().optional(),BREVO_SENDER_NAME:z.string().default('KSV Hostel'),TWILIO_ACCOUNT_SID:z.string().optional(),TWILIO_AUTH_TOKEN:z.string().optional(),TWILIO_PHONE_NUMBER:z.string().optional(),TWILIO_MESSAGING_SERVICE_SID:z.string().optional(),OTP_DEFAULT_COUNTRY_CODE:z.string().default('+91'),OTP_LENGTH:z.coerce.number().int().min(4).max(8).default(6),OTP_EXPIRY_SECONDS:z.coerce.number().int().min(30).max(3600).default(600),OTP_MAX_ATTEMPTS:z.coerce.number().int().min(1).max(10).default(5),OTP_RESEND_COOLDOWN_SECONDS:z.coerce.number().int().min(10).max(3600).default(60),OTP_RATE_WINDOW_SECONDS:z.coerce.number().int().min(60).max(86400).default(3600),OTP_MAX_REQUESTS_PER_WINDOW:z.coerce.number().int().min(1).max(20).default(5),OTP_VERIFY_RATE_WINDOW_SECONDS:z.coerce.number().int().min(60).max(3600).default(900),OTP_MAX_VERIFY_REQUESTS_PER_WINDOW:z.coerce.number().int().min(1).max(30).default(10),OTP_RETENTION_SECONDS:z.coerce.number().int().min(3600).max(2592000).default(86400),ADMIN_EMAIL:z.string().email().optional(),ADMIN_PASSWORD:z.string().min(8).optional()});
const parsed=schema.safeParse(process.env);
if(!parsed.success){
  const issues=parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${issues}`);
}
const config=parsed.data;
if((config.ADMIN_EMAIL && !config.ADMIN_PASSWORD) || (!config.ADMIN_EMAIL && config.ADMIN_PASSWORD)){
  throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be provided together.');
}
if(config.NODE_ENV==='production' && (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD)){
  throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required in production.');
}
export const env=config;
export const corsOrigins=env.CORS_ORIGINS.split(',').map(s=>s.trim()).filter(Boolean);
