# Hostel Management System RBAC Policy

## Student
Students may:
- View their own profile.
- View their own block/room information.
- View their own attendance.
- View their own fees/payment history.
- Submit/view their own leave/get-pass requests.
- Upload/view their own documents.
- View notifications/notices intended for them.
- Submit their own complaints/maintenance requests where those modules exist.
- Search/view only data explicitly scoped to the authenticated student.

Students must NOT:
- Create/update/delete another student's profile.
- Assign or transfer rooms.
- Manage blocks/rooms/capacity.
- Manage users or roles.
- Approve/reject other students' leave requests.
- Mark or edit attendance for other students.
- Create/update fees for other students.
- Verify/reject other students' documents.
- Perform security checkout/return operations.
- Access admin settings, audit logs, analytics, or other privileged management endpoints.

## Admin / Warden / Staff
Admin/warden/staff permissions must be limited to the management responsibilities actually exposed by the application. Privileged actions must be checked server-side using the authenticated role, not merely hidden in React.

## Security
Security may:
- Search students for gate/security verification.
- View approved passes needed for gate operations.
- Record checkout/return.
- View security activity needed for those operations.

Security must not:
- Manage users/roles.
- Change fees.
- Change room capacity/allocation unless explicitly granted by an admin policy.
- Access unrelated admin settings or sensitive administrative data.

## Enforcement
Every protected API endpoint must enforce authorization on the backend. Frontend visibility is only a usability layer and is never the security boundary.

## Database
For student-owned resources, queries should scope by the authenticated student's `studentId`/account identity. For admin/security operations, require the corresponding role before executing the database operation.
