# Security & Authentication — What Was Built

> **Update:** the database layer described below as SQLite has since been
> migrated to Postgres (Supabase) — see SUPABASE_SETUP.md. The security
> mechanisms this doc describes (scrypt password hashing, JWT-equivalent
> sessions, OTP, audit logs, account lockout) are unchanged; only the
> storage engine underneath them changed.

This documents the authentication/security hardening pass, against the
"Google-standard authentication" spec you provided. Two requested pieces of
infrastructure aren't present in this sandbox (no network access at all —
confirmed by testing), so they're substituted with equivalents built from
Node's standard library. Everything else in the spec is implemented and
tested against a live server with real HTTP requests — see "What I tested"
below.

## Two adaptations, explained

**MongoDB → SQLite (since migrated to Postgres/Supabase).** I have no network access to install `mongoose` or run
a MongoDB server (MongoDB isn't a package, it's a whole database service —
there's nowhere to `npm install` it into). SQLite via Node's built-in
`node:sqlite` gives you the same durability guarantees (ACID, survives
restarts, foreign keys, indexes) with zero setup. If you need MongoDB
specifically for other reasons (a hosting requirement, existing
infrastructure), the query layer is isolated enough in each route file that
swapping it is a contained job — ask and I can do it once you have DB
credentials to test against.

**bcrypt → scrypt.** Same situation — no network to `npm install bcrypt`.
Node's built-in `crypto.scrypt` is used instead: it's a salted,
memory-hard password hashing KDF (a NIST/IETF-standard algorithm, one of
the three the OWASP password storage guide recommends alongside bcrypt and
Argon2) — not a downgrade, just a different well-regarded choice available
without a dependency.

Similarly, "JWT via jsonwebtoken", "Helmet", "express-rate-limit", and
"cookie-parser" are all hand-implemented with Node's `crypto`/`http`/`tls`
modules rather than the named npm packages, for the same reason (no network
to install anything). Each is called out below.

## What's implemented

### 1. Registration — no OTP
`POST /api/auth/register` — name, email, mobile, password (min. 8 chars).
Passwords hashed with scrypt, never stored in plain text. Email and mobile
uniqueness enforced at the database level (UNIQUE constraints) plus
friendly duplicate-detection error messages. Redirects to login on success.

### 2. Login — split by identifier
- **Mobile / enrollment number + password** (`POST /api/auth/login`) —
  verified with `crypto.timingSafeEqual` against the scrypt hash.
- **Email → OTP required** — the same endpoint explicitly *rejects* an
  email identifier with a password ("Email accounts must sign in with a
  one-time code"), directing to:
  - `POST /api/auth/login/email-otp/request` — sends a 6-digit code, valid
    5 minutes, one-time use, resend cooldown, max 5 verify attempts (all in
    `services/otpService.js`, which already existed in your project and is
    solid — I reused it rather than rewriting).
  - `POST /api/auth/login/email-otp/verify` — verifies the code and issues
    a session directly.
- Both paths issue a short-lived (30 min) access token **and** rotate a
  refresh token into an httpOnly cookie (see Sessions, below).

### 3. Forgot password
- `POST /api/auth/forgot-password` — sends a reset OTP to the email if an
  account exists. Deliberately returns the same message either way ("If
  that email is registered...") so this endpoint can't be used to check
  which emails are registered.
- `POST /api/auth/reset-password` — verifies the OTP, hashes the new
  password, and **invalidates every previously-issued session** (bumps
  `token_version`, so old access tokens stop working immediately even
  though they're not expired; revokes every refresh token in the DB).

### 4. Sessions — access + refresh tokens
- **Access token**: HMAC-SHA256 signed (same structure as a real JWT —
  header.payload.signature, base64url), 30-minute expiry, carries a
  `tokenVersion` claim checked against the DB on every request.
- **Refresh token**: high-entropy random bytes (not a JWT) — only its
  SHA-256 hash is ever stored in `refresh_tokens`, so a database leak alone
  can't forge a session. Delivered as an **httpOnly, SameSite=Strict**
  cookie, `Secure` automatically when served over HTTPS. **Rotated on every
  use**: `POST /api/auth/refresh` issues a new access+refresh pair and
  immediately revokes the one just used — reusing an already-rotated
  refresh token now correctly fails, which is the standard defense against
  a stolen-refresh-token replay.
- The frontend (`api.js`) automatically calls `/refresh` once on any 401
  and retries the original request — session renewal is invisible to the
  user until the refresh token itself expires (7 days).
- `POST /api/auth/logout` revokes the refresh token server-side and clears
  the cookie.

### 5. Account lockout & brute-force protection
5 failed password attempts locks the account for 15 minutes
(`failed_attempts` / `locked_until` columns on `users`), reset on any
successful login. Applies to mobile/enrollment password login.

### 6. Rate limiting
In-memory, IP + endpoint keyed (`rateLimit.js`) — 20 requests/15 min on
login and registration, 10/15 min on OTP-send and forgot-password. Returns
`429` with a `Retry-After` header when exceeded. Tested by sending 25
requests in a row: the first 20 processed normally, the rest correctly
`429`'d.

### 7. Audit logging
Every security-relevant event is recorded in `audit_logs` (already existed
in your schema, now actually populated): `register`, `login_success`,
`login_failed` (with reason), `login_blocked_locked`,
`password_reset_requested`, `password_reset_completed`, `logout` — each
with the acting user, IP, and user-agent.

### 8. Security headers & CORS (Helmet-equivalent)
Every response now includes `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY` (clickjacking), `Referrer-Policy`,
`Permissions-Policy`, a `Content-Security-Policy`, and
`Strict-Transport-Security` when serving over HTTPS. CORS no longer uses a
wildcard origin — with the refresh-token cookie in play, `*` and
credentials can't be combined (browsers reject it); the configured
`FRONTEND_URL` (or the request's own `Origin` in dev) is reflected instead,
with `Access-Control-Allow-Credentials: true`.

### 9. Input validation
Email format and mobile-number-length checks on registration; password
minimum length (8) enforced on registration and reset. SQL injection is
prevented throughout by parameterized queries (`?` placeholders) — there is
no string-concatenated SQL anywhere in the codebase. XSS: this is a JSON
API with a React frontend, which escapes rendered content by default; there
is no server-side HTML templating that could inject unescaped user input.

## What I deliberately left alone

Your project already had substantial scaffolding beyond authentication
(`attendance`, `complaints`, `fees`, `documents`, `gate_scans`,
`security_users` tables and their routes) from `upgradeRoutes.js`. None of
that is part of this security spec, so I didn't touch it — it's untouched
and still there.

## What I tested (all against a live server, real HTTP requests)

- Registration with no OTP step required — succeeds immediately.
- Mobile+password login succeeds; the *same* email+password combination is
  correctly rejected with a message pointing to email-OTP login.
- 5 wrong passwords in a row locks the account (423); a 6th attempt with
  the *correct* password is still locked; unlocks automatically after the
  window.
- Email OTP login: request → (captured the dev-only console-logged code,
  since no email provider is configured in this sandbox) → wrong code
  rejected (401) → correct code issues a session.
- Forgot password → reset → old password now fails, new password works →
  an access token obtained *before* the reset is rejected (401) on the very
  next authenticated request, proving `token_version` invalidation works.
- Refresh token rotation: refreshed once, then tried reusing the
  *original* (now-rotated-out) cookie — correctly rejected; the *new*
  cookie still works.
- Rate limiting: 25 rapid login attempts → first 20 processed, requests
  21–25 correctly `429`.
- Security headers and `Access-Control-Allow-Credentials` present on every
  response.
- Audit log correctly records `register`, `login_failed` (with reason),
  and `login_success` for a real sequence of actions.
- Full regression pass: register → mobile login → profile fetch → admin
  login → admin sees the new student in the list → refresh → rooms
  endpoint — all passing together in one run.

## What I have not been able to verify

- **Real email delivery.** This sandbox has no outbound network access at
  all, so OTP emails can't actually reach an inbox from here — I verified
  the OTP is correctly generated, hashed, stored, rate-limited, and
  expired, using the existing dev-mode console log as the stand-in for
  "the user received it". Test real delivery with your Brevo/Gmail/Twilio
  credentials in your own environment.
- **A real browser.** I don't have one in this sandbox. I checked the
  frontend with a JSX-aware parser (TypeScript's, since Babel wasn't
  available in this particular environment) — zero syntax errors — and
  manually traced every function/prop reference the login/registration
  screens touch, but I have not watched it render or clicked through it.

## Setup

```bash
cd backend && npm start      # http://localhost:4000
```

Environment variables (`backend/.env`, copy from `.env.example`):
- `JWT_SECRET` — set a long random string in production.
- `ACCESS_TOKEN_TTL_SECONDS` / `REFRESH_TOKEN_TTL_SECONDS` — defaults 1800 / 604800.
- `BREVO_API_KEY` + `BREVO_SENDER_EMAIL`, or `TWILIO_*` for SMS — for OTP delivery.
- `FRONTEND_URL` — your deployed frontend origin, required for cookies to work cross-origin in production (`*` won't work with credentials).

Seeded accounts: `yugdarji56@gmail.com` / `hostel123` (admin),
`security@hostel.local` / `security123` (gate security).
