# Email + Phone OTP Setup

This update supports **two registration verification choices**:

- Email OTP via Brevo
- Phone SMS OTP via Twilio

The student chooses Email or Phone SMS on the registration screen. The backend verifies the OTP and returns a one-time verification token. The signup endpoint refuses to create the student until that token is valid.

## Local backend `.env`

Copy `backend/.env.example` to `backend/.env` and set the provider you want to test.

### Brevo

```env
BREVO_API_KEY=xkeysib-...
BREVO_SENDER_EMAIL=your-verified-sender@example.com
```

### Twilio

```env
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...
```

You can configure both at the same time. The UI lets the student choose which channel receives the OTP.

## Vercel frontend

Set:

```env
VITE_API_URL=https://YOUR-BACKEND.onrender.com
```

Redeploy the frontend after changing the variable.

## Render backend

Set:

```env
NODE_ENV=production
FRONTEND_URL=https://YOUR-FRONTEND.vercel.app
BREVO_API_KEY=...
BREVO_SENDER_EMAIL=...
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=...
OTP_TTL_MS=300000
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN_MS=60000
OTP_VERIFICATION_TTL_MS=600000
```

Never put Brevo or Twilio secrets in the Vercel frontend environment variables with the `VITE_` prefix.
