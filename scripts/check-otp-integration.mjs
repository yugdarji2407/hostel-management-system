import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const schema=fs.readFileSync(path.join(root,'backend/prisma/schema.prisma'),'utf8');
const migration=fs.readFileSync(path.join(root,'backend/prisma/migrations/0001_initial/migration.sql'),'utf8');
const otpMigration=fs.readFileSync(path.join(root,'backend/prisma/migrations/0002_otp_authentication/migration.sql'),'utf8');
const service=fs.readFileSync(path.join(root,'backend/src/services/otp.ts'),'utf8');
const routes=fs.readFileSync(path.join(root,'backend/src/routes/otp.routes.ts'),'utf8');
const frontend=fs.readFileSync(path.join(root,'frontend/src/pages/Pages.tsx'),'utf8');
const requiredModelFields=['userId','studentId','purpose','deliveryMethod','recipient','otpHash','createdAt','expiresAt','usedAt','attempts','maxAttempts','resendAvailableAt','lastSentAt','status'];
for(const field of requiredModelFields){if(!schema.includes(field))throw new Error(`Missing OTP model field: ${field}`)}
for(const endpoint of ['/email/request','/email/verify','/email/resend','/sms/request','/sms/verify','/sms/resend']){if(!routes.includes(endpoint))throw new Error(`Missing OTP endpoint: ${endpoint}`)}
for(const token of ['randomInt','argon2.hash','otpHash','expiresAt','maxAttempts','resendAvailableAt','OTP_RATE_LIMITED','DELIVERY_FAILED']){if(!service.includes(token))throw new Error(`Missing OTP security behavior: ${token}`)}
for(const token of ['Email OTP','Mobile OTP','Resend OTP','Verify OTP']){if(!frontend.includes(token))throw new Error(`Missing frontend OTP flow: ${token}`)}
if(!otpMigration.includes('CREATE TABLE \"OtpVerification\"'))throw new Error('OTP migration does not create OtpVerification');
if(!otpMigration.includes('CREATE TYPE \"OtpPurpose\"'))throw new Error('OTP migration does not create OTP enums');
if(migration.includes('OtpVerification'))throw new Error('Base initial migration was modified by OTP feature; OTP must remain a forward migration');
console.log('OTP integration audit passed. Database model, OTP migration, six API endpoints, security controls, and frontend email/SMS password-reset flow are present.');
