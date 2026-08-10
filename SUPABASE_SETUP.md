# Supabase (Postgres) setup

The backend stores everything in Postgres. Supabase gives you a free
hosted Postgres instance in a couple of minutes — this is the fastest path,
but any Postgres connection string (Railway, Neon, RDS, a local Postgres)
works identically, since the backend just talks standard Postgres via the
`pg` driver.

## 1. Create the project

1. Go to [supabase.com](https://supabase.com) and sign in (GitHub login is fastest).
2. **New project** → pick an organization → give it a name (e.g. `hostel-management`) → set a database password (save it, you'll need it in the connection string) → pick the region closest to you → **Create new project**.
3. Wait ~2 minutes for it to provision.

## 2. Get the connection string

1. In your new project: **Project Settings** (gear icon) → **Database**.
2. Under **Connection string**, choose the **URI** tab.
3. For this Render backend, prefer the **Session pooler** connection if Supabase provides it for your project. Render is a long-running Node service, so a session/direct PostgreSQL connection is the simplest choice. The transaction pooler on port `6543` is also supported by the `pg` driver if that is the connection Supabase provides for your network.
4. Copy the connection string.
5. Replace the password placeholder with the database password you set in step 1.

## 3. Configure the backend

```bash
cd backend
cp .env.example .env
```

Open `.env` and set:
```
DATABASE_URL=<paste-the-Supabase-Postgres-URI-here>
```

## 4. Install and start

```bash
npm install     # pulls in the pg driver
npm start
```

On first boot the server automatically:
- creates every table (`users`, `students`, `blocks`, `rooms`, `leave_passes`, `attendance`, `fees`, `documents`, `complaints`, `maintenance_requests`, `security_users`, `notifications`, `refresh_tokens`, `audit_logs`, `gate_scans`, `otp_verifications`, ...)
- seeds the admin account (`yugdarji56@gmail.com` / `hostel123`), the security account (`security@hostel.local` / `security123`), and the block/room inventory

You should see:
```
Initialized Postgres database with admin, security account and room inventory.
Hostel Management API listening on http://localhost:4000
```

If instead you see a connection error, double-check: the password in
`DATABASE_URL` doesn't still say `[YOUR-PASSWORD]`, there are no stray
spaces/quotes around the value, and your network allows outbound
connections to port `6543`/`5432`.

## 5. Verify in the Supabase dashboard

**Table Editor** (left sidebar) in your Supabase project should now show
all the tables listed above, with the seeded rows in `users`, `blocks`,
`rooms`, `security_users`. This is also where you can browse/edit data by
hand if you ever need to.

## 6. Re-running the seed on its own

If you ever want to (re-)run migrations/seeding without starting the HTTP
server (e.g. right after creating a brand-new project, or in a deploy
script):
```bash
npm run seed
```
This is safe to run repeatedly — table creation is `IF NOT EXISTS`, and
seeding is skipped once the `users` table has any rows.

## 7. Deploying

Whatever host you deploy the backend to (Render, Railway, Fly.io, a VPS,
...), set the same `DATABASE_URL` (and the other variables from
`.env.example` — `JWT_SECRET`, `GOOGLE_CLIENT_ID`, email/SMS provider keys)
as environment variables on that host. Nothing else about the deployment
changes — the backend still serves the built frontend from the same port
if `frontend/dist` exists (see the root `README.md`).

## Notes on the free tier

- Supabase's free tier pauses a project after 7 days of no API activity.
  The first request after a pause takes a few extra seconds while it wakes
  up — after that it behaves normally. A cron job or uptime pinger hitting
  `/api/health` periodically avoids this if it matters for your use case.
- Free tier includes 500MB of database storage, which is far more than a
  single hostel's worth of student/room/leave/fee/document records will
  use.


## 8. Deploying the backend on Render and frontend on Vercel

This project is intentionally split into two services:

### Render: backend

Create a **Web Service** from the GitHub repository.

Use:

- **Root Directory:** `backend`
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Environment:** Node

Set these Render environment variables:

```env
NODE_ENV=production
JWT_SECRET=<long-random-secret>
DATABASE_URL=<your-Supabase-Postgres-connection-string>
FRONTEND_URL=https://<your-vercel-domain>.vercel.app
APP_URL=https://<your-vercel-domain>.vercel.app
```

Also add your email/SMS/Google variables if those features are enabled:

```env
BREVO_API_KEY=...
BREVO_SENDER_EMAIL=...
GOOGLE_CLIENT_ID=...
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=...
```

Do **not** commit `backend/.env` to GitHub.

Render provides the `PORT` environment variable automatically. The backend uses
`process.env.PORT`, so you normally should not create a fixed `PORT=10000`
variable.

### Vercel: frontend

Import the same GitHub repository as a separate Vercel project.

Use:

- **Root Directory:** `frontend`
- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

Set:

```env
VITE_API_URL=https://<your-render-backend>.onrender.com
```

Do not put `DATABASE_URL`, `JWT_SECRET`, Brevo keys, Twilio keys, or other
backend secrets in Vercel. The frontend only needs the public Render API URL.

After changing `VITE_API_URL`, redeploy the Vercel project because Vite embeds
`VITE_*` variables during the build.

### Supabase

The database lives only in Supabase. Render connects to it using
`DATABASE_URL`. Vercel never connects directly to the database.

The backend runs `init()` and `seed()` before it starts accepting requests, so
a new Supabase database can be initialized automatically. You can also paste
`supabase/schema.sql` into the Supabase SQL Editor to create the complete
schema and development seed manually.

### Final connection

```text
Vercel frontend
      |
      | HTTPS API requests
      v
Render Node.js backend
      |
      | PostgreSQL DATABASE_URL
      v
Supabase PostgreSQL
```
