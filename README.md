# KSV Hostel Student Portal

Integrated React + TypeScript frontend and production-oriented Node.js + Express + PostgreSQL + Prisma backend.

## Architecture
- `frontend/`: Vite React TypeScript UI
- `backend/`: Express API, Prisma schema, authentication, RBAC, QR, attendance, devices, complaints, applications, passes, bills and receipts
- PostgreSQL is the system of record.
- Authentication uses opaque HTTP-only cookie sessions. Passwords use Argon2id.
- Student ownership is derived from the authenticated session.

## Local development
1. Copy `backend/.env.example` to `backend/.env` and replace secrets.
2. Start PostgreSQL and Redis: `docker compose up -d postgres redis`.
3. From the repo root run `npm install`.
4. Run `npm run prisma:generate`.
5. Run `npm run prisma:migrate`.
6. Run `npm run seed` for development demo data.
7. Run `npm run dev`.

Frontend: http://localhost:5173
API: http://localhost:4000
Health: http://localhost:4000/health

## Demo account
Development only:
`demo.student@example.com`
`DemoPassword123!`

A first login from a new browser/device creates a pending device request. The development seed contains one approved device. Approve a new device from an existing approved device.

## Security model
- No passwords or raw session tokens are returned by APIs.
- Sessions are revocable and token hashes are stored server-side.
- Student-owned resources are scoped by authenticated user.
- QR tokens are short-lived, hashed at rest, and never contain private profile data.
- Attendance is staff-marked and unique per student/local hostel date.
- Device approval is transactional with a maximum of three approved devices.
- Financial/security/audit history is retained rather than physically deleted.
- CORS uses an explicit allowlist and mutating requests use origin checks.

## API
OpenAPI definition: `backend/openapi.yaml`.
All responses follow `{ success, data, meta, requestId }` or `{ success, error, requestId }`.

## Testing
The intended CI sequence is lint, typecheck, unit/integration/security tests, Prisma validation/migrations, OpenAPI validation and production build. Security-critical cases include IDOR, self-approval, cross-user approval, duplicate attendance, device races and ownership checks.

## Frontend integration
The Vite dev server proxies `/api` and `/health` to `localhost:4000`. For a separately hosted frontend, set `VITE_API_BASE` to the API origin. The frontend uses cookie credentials and no localStorage bearer tokens. Protected routes call `/api/v1/auth/me` and redirect to login on unauthenticated access. Unknown-device login returns a short-lived polling credential; the login page polls the backend until an existing approved device approves or rejects the request, then the backend creates the authenticated HTTP-only session. ID-card download is a real server-side endpoint and remains Admin-controlled.

For the seeded demo account, the seed creates an approved demo device. A first login from a different browser is intentionally treated as a new device and must be approved from another approved session, matching the security model. Do not add a production bypass for this behavior.

## Important deployment note
Before production deployment, configure real secrets, managed PostgreSQL/Redis, private object storage, an email provider, TLS, backups, and a production CORS allowlist. The repository does not claim those external services are provisioned automatically.


## PostgreSQL migrations

The project uses PostgreSQL as the only application database. The Prisma migrations now contain a complete `0001_initial` migration generated from `backend/prisma/schema.prisma`.

For a fresh PostgreSQL database:

```bash
cd backend
npm install
npm run prisma:generate
npx prisma migrate deploy
npm run seed
```

For development, `npm run prisma:db:push` remains available, but production/staging should use Prisma migrations.

## Database readiness

`GET /health/ready` now executes a real PostgreSQL `SELECT 1` query through Prisma. It returns HTTP 200 only when PostgreSQL is reachable and HTTP 503 when the database is unavailable.

## OTP verification

The portal now includes a database-backed OTP service for email and SMS delivery. OTPs are generated with Node's cryptographic random generator and stored only as Argon2id hashes in `OtpVerification`.

Supported endpoints:

- `POST /api/v1/otp/email/request`
- `POST /api/v1/otp/email/verify`
- `POST /api/v1/otp/email/resend`
- `POST /api/v1/otp/sms/request`
- `POST /api/v1/otp/sms/verify`
- `POST /api/v1/otp/sms/resend`

The default password-reset flow is: request email/SMS OTP → verify OTP → set a new password. Existing login/device approval remains unchanged.

Required production OTP environment variables include `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and either `TWILIO_PHONE_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID`. OTP expiry, length, attempt limits, resend cooldown, rate limits, and retention are configurable through `OTP_*` variables.

For a Vercel frontend calling a Render backend, set `COOKIE_SAME_SITE=none` and serve both sides over HTTPS so authentication and password-reset cookies can be sent cross-site.


## Production environment configuration

Never commit a real `.env` file. Copy `backend/.env.example` to a deployment secret store or local `backend/.env` and set real values there.

### Backend-only variables

Required:
- `NODE_ENV=production`
- `PORT`
- `DATABASE_URL`
- `FRONTEND_URL`
- `CORS_ORIGINS`
- `SESSION_COOKIE_NAME`
- `PASSWORD_RESET_COOKIE_NAME`
- `LOGIN_CHALLENGE_COOKIE_NAME`
- `SESSION_SECRET`
- `QR_TOKEN_SECRET`
- `COOKIE_SAME_SITE` (`none` when frontend and API are on different HTTPS sites)
- `TRUST_PROXY`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

OTP production variables:
- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL`
- `BREVO_SENDER_NAME`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID`
- the `OTP_*` configuration variables in `backend/.env.example`

Optional infrastructure:
- `REDIS_URL`
- `HOSTEL_TIMEZONE`
- `ATTACHMENTS_DIR`
- `MAX_ATTACHMENT_SIZE_MB`

`ADMIN_EMAIL` and `ADMIN_PASSWORD` are read only by the backend bootstrap/authentication code. They are never sent to the frontend and must not be placed in any `VITE_*` variable.

### Frontend variables

- `VITE_API_BASE` is the only current frontend environment variable. It may contain the public API origin, for example `https://api.example.com`.
- Do not put database URLs, Admin credentials, SMTP/Brevo/Twilio credentials, session secrets, or API keys in `VITE_*` variables.

## Exact migration and production build sequence

From the repository root:

```bash
npm ci
npm run prisma:generate
npm --workspace backend run prisma:migrate:deploy
npm run build
npm test
```

For a fresh local database, start PostgreSQL first:

```bash
docker compose up -d postgres redis
npm ci
npm run prisma:generate
npm --workspace backend run prisma:migrate:deploy
npm run seed
npm run build
```

Do not use `prisma db push` for production. Use `prisma migrate deploy`.

### Deployment

1. Configure all backend secrets in the hosting provider's server-side environment settings.
2. Configure `VITE_API_BASE` only in the frontend build environment if the frontend is deployed separately.
3. Run `npm ci`, Prisma generate, `prisma migrate deploy`, and `npm run build`.
4. Start the backend with `npm --workspace backend run start`.
5. Serve the frontend using the output of `frontend`'s Vite build.
6. Configure the production CORS allowlist to the exact frontend origin.
7. Use HTTPS for both frontend and backend. If they are on different sites, use `COOKIE_SAME_SITE=none`.
8. Verify `/health/ready` after deployment. It must report `database: "ok"`.

## Render backend deployment configuration

If this repository is deployed as a Render Web Service using the `backend` directory as the Root Directory, use:

```text
Root Directory: backend
Build Command: npm install && npm run build
Start Command: npm start
```

`prisma` and `typescript` are runtime/build dependencies of the backend package so the Render build can execute `prisma generate` and `tsc` even when production installs omit `devDependencies`.

Do not put frontend, database, Brevo, Twilio, or Admin secrets in frontend variables. Configure backend secrets in Render's server-side Environment settings.

