# SMS OTP Update

Added:
- Persistent OTP records (Postgres-backed)
- OTP expiry and attempt limits
- Resend cooldown
- Secure OTP hashing
- Twilio-compatible SMS sending
- Development OTP logging
- `/api/otp/send` and `/api/otp/verify`
- Reusable React SMS OTP component
- `.env.example` configuration

For real SMS, configure a supported SMS provider in `backend/.env`.
