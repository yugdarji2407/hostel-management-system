# KSV Hostel Student Portal - End-to-End Audit Report

Date: 2026-08-11

## Scope

Audited the uploaded project `KSV_Hostel_Student_Portal_OTP_DEPLOYMENT_READY.zip` across frontend, backend, PostgreSQL/Prisma configuration, authentication, OTP, admin authorization, security configuration, integration route mapping, and deployment files.

The audit distinguishes code/configuration verification from runtime verification. No external service credentials or live production deployment/database were available in this sandbox, and dependency installation was blocked by an uncached npm registry package.

## Fixes applied

1. Student registration now creates the account in `PENDING` state and sends a registration OTP through the existing OTP service.
2. Registration OTP verification activates the pending user/student.
3. Login now rejects unverified `PENDING` accounts.
4. Registration UI now includes OTP verification, expiry information, resend cooldown, and failure handling.
5. Frontend/backend integration checker was corrected to recognize the valid `/api/v1/announcements` and `/api/v1/admin/...` route groups.

## Verified locally

- PostgreSQL is the only Prisma datasource.
- Prisma migration lock provider is `postgresql`.
- 45 Prisma models are present in the schema.
- Migration files contain the expected table progression: 42 tables in `0001_initial`, 1 OTP table in `0002_otp_authentication`, and 2 registration/admin announcement tables in `0003_registration_admin_announcements`.
- No SQLite implementation references were found.
- No `.env` file with secrets exists in the uploaded project; only `.env.example` files are present.
- No private-key material was found by the secret scan.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` are read from backend environment configuration and are not embedded as actual credential values.
- Admin routes use backend `requireAuth` + `requireRole('ADMIN')` authorization.
- OTP uses cryptographically generated numeric codes, Argon2id hashing, expiry, attempt limits, resend cooldown, request rate limiting, used/invalidated/blocked states, and explicit delivery-failure handling.
- Frontend uses HTTP credentials/cookies and does not store bearer tokens in localStorage.
- Frontend static route references map to backend route groups after fixing the integration checker.
- OTP integration checker passes.
- Frontend link targets found in static `to="/..."` references correspond to declared routes.

## Not verified because the environment blocked runtime execution

- `npm ci` could not complete. Offline installation failed because package `zod` was not available in the local npm cache, and the online installation attempt could not complete in this sandbox.
- Backend dependency-based TypeScript compilation.
- Frontend Vite production build.
- Vitest execution.
- Prisma client generation using the project dependency.
- `prisma migrate deploy` against a real PostgreSQL database.
- Real PostgreSQL CRUD operations.
- Real backend server startup with project dependencies.
- Real browser/UI interaction testing.
- Live Brevo email delivery.
- Live Twilio SMS delivery.
- Runtime student registration, OTP receipt/verification, login/session, leave/pass, admin approval, and end-to-end production flow.
- Actual deployed frontend-to-backend communication.
- Actual production hosting environment variable configuration.

## Important remaining verification requirements

A final production acceptance test must be run in an environment with:
- project dependencies installed,
- a real PostgreSQL database,
- Redis if the deployment uses the worker,
- valid Brevo and/or Twilio credentials,
- production `ADMIN_EMAIL` and `ADMIN_PASSWORD`,
- production frontend/backend URLs and CORS,
- HTTPS and the configured cookie SameSite policy.

Do not mark OTP delivery or production deployment as verified until a real OTP is received and the complete session/database flow succeeds.

## Final status table

| Feature | Status | Problem / Evidence | Required Fix |
|---|---|---|---|
| Frontend | ⚠️ NOT VERIFIED | Source was inspected, but dependency-based Vite build/browser execution was blocked | Run `npm ci` and `npm run build`; perform browser smoke tests |
| Backend | ⚠️ NOT VERIFIED | Routes/config inspected, runtime server could not be started without dependencies | Install dependencies and run API tests/server |
| PostgreSQL | ⚠️ NOT VERIFIED | Prisma datasource/migrations are PostgreSQL; no live DB available | Run Prisma generate + migrate deploy against real PostgreSQL and CRUD tests |
| Student Registration | ✅ CODE VERIFIED / RUNTIME NOT VERIFIED | Registration is now gated by `REGISTRATION` OTP | Verify live Brevo delivery + OTP activation |
| OTP | ✅ CODE VERIFIED / DELIVERY NOT VERIFIED | Argon2 hash, expiry, attempts, cooldown, rate limits and delivery failure handling present; integration checker passes | Test real Brevo/Twilio delivery |
| Student Login | ✅ CODE VERIFIED / RUNTIME NOT VERIFIED | Password check + login challenge + OTP + HTTP-only session flow is implemented | Run real login/session test |
| Admin Login | ✅ CODE VERIFIED / RUNTIME NOT VERIFIED | Admin credentials come from backend env only; admin APIs are RBAC protected | Run live admin login with configured env variables |
| Leave Pass | ✅ CODE VERIFIED / RUNTIME NOT VERIFIED | Student creates pass; admin/finance route supports approve/reject | Verify complete DB + UI flow |
| Admin Approval | ✅ CODE VERIFIED / RUNTIME NOT VERIFIED | Backend approval/rejection endpoints and role checks exist | Verify with real admin/session and DB |
| API Integration | ✅ STATIC CHECK PASSED | Integration route checker passes after supporting announcements routes | Runtime API contract test still required |
| Security | ✅ STATIC AUDIT PASSED / RUNTIME PENETRATION NOT VERIFIED | No embedded admin credentials, `.env` secrets, private keys, or SQLite refs found; admin routes enforce roles | Perform authenticated security/IDOR tests on deployed instance |
| Production Build | ⚠️ NOT VERIFIED | npm dependency installation unavailable | Run `npm ci`, Prisma generate, `npm run build`, `npm test` |
| Deployment | ⚠️ NOT VERIFIED | Deployment config is documented, but no real deployment environment was available | Deploy and verify `/health/ready`, CORS, cookies, DB, frontend API calls |

## Recommended production verification sequence

```text
npm ci
npm run prisma:generate
npm --workspace backend run prisma:migrate:deploy
npm run build
npm test
npm run seed   # development/local only, not production unless explicitly intended

Start backend
Check /health
Check /health/ready

Create student
-> registration OTP received
-> OTP verified
-> user/student ACTIVE
-> login password accepted
-> login OTP received
-> OTP verified
-> HTTP-only session created
-> student dashboard loads

Create leave/pass
-> PostgreSQL row created
-> admin sees request
-> admin approves/rejects
-> student sees updated status
```
