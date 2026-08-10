-- Supabase verification for Hostel Management System
-- Run in Supabase SQL Editor after creating a test student from the app.

-- 1) Confirm user/account information.
SELECT
  u.id AS user_id,
  u.role,
  u.email,
  u.mobile,
  u.created_at
FROM users u
WHERE u.role = 'student'
ORDER BY u.id DESC;

-- 2) Confirm complete student profile + block/room.
SELECT
  s.id AS student_id,
  s.enrollment_no,
  s.name,
  u.email,
  u.mobile,
  s.father_name,
  s.father_mobile,
  s.mother_name,
  s.mother_mobile,
  s.guardian_name,
  s.guardian_mobile,
  s.course,
  s.branch,
  s.semester,
  b.block_number AS block,
  r.room_number AS room,
  r.capacity
FROM students s
JOIN users u ON u.id = s.user_id
LEFT JOIN blocks b ON b.id = s.block_id
LEFT JOIN rooms r ON r.id = s.room_id
ORDER BY s.id DESC;

-- 3) Check for broken student -> user relationships.
SELECT s.id, s.enrollment_no
FROM students s
LEFT JOIN users u ON u.id = s.user_id
WHERE u.id IS NULL;

-- 4) Check for invalid block/room relationships.
SELECT s.id, s.enrollment_no, s.block_id, s.room_id
FROM students s
LEFT JOIN blocks b ON b.id = s.block_id
LEFT JOIN rooms r ON r.id = s.room_id
WHERE (s.block_id IS NOT NULL AND b.id IS NULL)
   OR (s.room_id IS NOT NULL AND r.id IS NULL);

-- 5) Check room occupancy.
SELECT
  b.block_number AS block,
  r.room_number AS room,
  r.capacity,
  COUNT(s.id) AS occupants
FROM rooms r
JOIN blocks b ON b.id = r.block_id
LEFT JOIN students s ON s.room_id = r.id
GROUP BY b.block_number, r.room_number, r.capacity
ORDER BY b.block_number, r.room_number;

-- 6) Search the exact student by email/mobile/enrollment.
-- Replace the values below with the test student's data.
SELECT
  s.id,
  s.enrollment_no,
  s.name,
  u.email,
  u.mobile,
  b.block_number AS block,
  r.room_number AS room
FROM students s
JOIN users u ON u.id = s.user_id
LEFT JOIN blocks b ON b.id = s.block_id
LEFT JOIN rooms r ON r.id = s.room_id
WHERE LOWER(u.email) = LOWER('student@example.com')
   OR u.mobile = '9999999999'
   OR s.enrollment_no = 'TEST001';
