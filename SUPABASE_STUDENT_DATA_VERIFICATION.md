# Student data verification

The student flow is now:

1. Frontend admin form (`StudentFormModal`) collects enrollment, name, email, mobile, password, block, room, parent/guardian details, course, branch and semester.
2. `frontend/src/api.js` sends the form to `POST /api/students`.
3. `backend/src/routes/studentRoutes.js` validates the selected block/room, checks room capacity, creates the `users` row and `students` row in one PostgreSQL transaction, then reads the complete student record back with a JOIN.
4. The returned record contains email/mobile from `users`, profile fields from `students`, and block/room names from `blocks`/`rooms`.
5. The admin dashboard reloads `/api/students`, so the saved record is retrieved from PostgreSQL and displayed again.
6. A student session uses `/api/students/me`, which retrieves the same joined record for the student dashboard.

Important: public student self-registration intentionally does not choose a room. Room assignment is an admin operation. The room remains NULL until an admin assigns a block and room.

Use `supabase/verify_student_data.sql` in Supabase SQL Editor to verify the stored rows and relationships.
