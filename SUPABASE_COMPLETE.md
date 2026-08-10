# Supabase database coverage

The backend now targets PostgreSQL through the `pg` driver and Supabase.

## Tables

- users
- students
- blocks
- rooms
- leave_passes
- sms_logs
- otp_codes
- otp_verifications
- announcements
- security_users
- notifications
- refresh_tokens
- audit_logs
- attendance
- complaints
- maintenance_requests
- fees
- documents
- gate_scans

## Seed data

- Admin account: `yugdarji56@gmail.com` / `hostel123`
- Security account: `security@hostel.local` / `security123`
- Blocks: A, B, C
- Rooms: A-101 to A-140, B-301 to B-336, C-201 to C-244
- Student records are intentionally not seeded. Students are created by the application.

## Application connection

- Backend uses `DATABASE_URL` and the `pg` package.
- Startup runs Postgres migrations before listening for requests.
- Render should run the backend from the `backend` root directory.
- Vercel should build the frontend from the `frontend` root directory.
- Vercel uses `VITE_API_URL` to call the Render backend.
- The frontend never receives `DATABASE_URL` or backend secrets.

## Manual database setup

Run `supabase/schema.sql` in the Supabase SQL Editor.

The script is idempotent for table/index creation and seed inserts. The backend
also runs the schema/seed checks automatically, so using the SQL script first
does not create duplicate seed rows.
