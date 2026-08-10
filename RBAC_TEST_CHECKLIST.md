# End-to-End RBAC Test Checklist

## Student
- Login
- Logout
- Refresh session
- View own profile
- View own block/room
- View own attendance
- View own fees
- View own leave requests
- View/upload own documents
- View notices/notifications
- Attempt to read another student's record -> must fail
- Attempt to update another student's record -> must fail
- Attempt admin room/user/fee/attendance operations -> must fail
- Attempt security checkout/return -> must fail

## Admin/Warden/Staff
- Login
- Dashboard
- Student search
- Student create/update
- Block/room management
- Room assignment/capacity
- Attendance management
- Fee management
- Leave approval/rejection
- Document verification
- Notifications/announcements
- Audit/activity logs according to role

## Security
- Login
- Search/verify student
- View valid approved passes
- Checkout
- Return
- Security history
- Attempt unrelated admin mutation -> must fail

## Database persistence
For every create/update:
1. Perform the action in the website.
2. Refresh the page.
3. Log out/in.
4. Query Supabase and confirm the record.
5. Confirm relationships remain correct.

## API security
Use browser Network tools or an API client to attempt unauthorized endpoints. A hidden button is not sufficient; the server must reject unauthorized requests.
