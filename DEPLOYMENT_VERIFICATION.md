# Deployment Verification Report

Date: 2026-08-11

## Completed source/configuration checks

- Admin credentials are read only from backend `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables.
- Real admin credentials are not present in the project source or example environment files.
- Production startup now requires both Admin environment variables and rejects partial configuration.
- `.env.example` files contain placeholders only.
- PostgreSQL is the Prisma datasource and migration provider.
- All 45 Prisma models have corresponding migration tables across the checked migrations.
- No SQLite references were found in the project.
- Login OTP verification completes the pending login challenge and issues the server-side HTTP-only session.
- Admin routes are protected by backend `requireAuth` + `requireRole('ADMIN')`.
- Docker production start path was corrected to the actual TypeScript build output.
- The backend `prebuild` script no longer performs a network-dependent `npm install`.

## Verification blocked by environment

The repository does not contain installed dependencies. An offline `npm install` was attempted and failed because required packages were not available in the local npm cache and the environment could not retrieve them from the registry.

Therefore these could not be truthfully completed here:

- Prisma CLI validation/generate
- `prisma migrate deploy` against a real PostgreSQL instance
- Backend dependency-based TypeScript build
- Frontend dependency-based TypeScript/Vite build
- Runtime Admin login
- Runtime Student registration/login/OTP
- Runtime PostgreSQL CRUD/API verification

The final deployment must run the commands in `README.md` after dependencies and the target PostgreSQL/Redis/OTP providers are available.

## Build dependency correction

The backend package now declares `prisma` and `typescript` under `dependencies`, not only `devDependencies`. This is intentional because the production build command runs `prisma generate` and `tsc`. This fixes Render's `sh: 1: prisma: not found` failure without changing application functionality.

Prisma CLI and `@prisma/client` are pinned to the same 6.19.3 version used by the lockfile.

