# RBAC/API Audit

## Backend route files found
- `backend/src/otpRoutes.js`
- `backend/src/routes/announcementRoutes.js`
- `backend/src/routes/authRoutes.js`
- `backend/src/routes/blockRoutes.js`
- `backend/src/routes/leaveRoutes.js`
- `backend/src/routes/statsRoutes.js`
- `backend/src/routes/studentRoutes.js`
- `backend/src/routes/upgradeRoutes.js`

## Required verification
- Every student-owned GET/POST/PUT/DELETE must scope records to the authenticated student's identity.
- Every admin management mutation must require an admin/warden/staff role.
- Every security mutation must require the security role.
- Frontend route guards must match backend authorization, but must not be treated as the security boundary.
- After login, refresh, logout/login, verify that the role is restored consistently.
