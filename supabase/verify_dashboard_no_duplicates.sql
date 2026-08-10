-- Dashboard/student data integrity checks for Supabase PostgreSQL.
-- Every query below should return zero rows for integrity checks.

-- Duplicate student account links
SELECT user_id, COUNT(*) AS count
FROM students
GROUP BY user_id
HAVING COUNT(*) > 1;

-- Duplicate enrollment numbers
SELECT enrollment_no, COUNT(*) AS count
FROM students
GROUP BY enrollment_no
HAVING COUNT(*) > 1;

-- Duplicate user emails (case-insensitive)
SELECT LOWER(email) AS email, COUNT(*) AS count
FROM users
WHERE email IS NOT NULL
GROUP BY LOWER(email)
HAVING COUNT(*) > 1;

-- Students whose room belongs to another block
SELECT s.id, s.enrollment_no, s.block_id, r.block_id AS room_block_id
FROM students s
JOIN rooms r ON r.id = s.room_id
WHERE s.block_id IS NOT NULL AND s.block_id <> r.block_id;

-- Room capacity violations
SELECT r.id, b.block_number, r.room_number, r.capacity,
       COUNT(s.id) AS occupied
FROM rooms r
JOIN blocks b ON b.id = r.block_id
LEFT JOIN students s ON s.room_id = r.id
GROUP BY r.id, b.block_number, r.room_number, r.capacity
HAVING COUNT(s.id) > r.capacity;

-- Orphan student accounts
SELECT s.id, s.enrollment_no
FROM students s
LEFT JOIN users u ON u.id = s.user_id
WHERE u.id IS NULL;

-- Orphan student rooms
SELECT s.id, s.enrollment_no
FROM students s
LEFT JOIN rooms r ON r.id = s.room_id
WHERE s.room_id IS NOT NULL AND r.id IS NULL;

-- Exact student lookup template:
-- SELECT s.id, s.enrollment_no, s.name, u.email, u.mobile,
--        s.father_name, s.father_mobile, s.mother_name, s.mother_mobile,
--        s.guardian_name, s.guardian_mobile,
--        b.block_number AS block, r.room_number AS room,
--        s.course, s.branch, s.semester
-- FROM students s
-- JOIN users u ON u.id = s.user_id
-- LEFT JOIN blocks b ON b.id = s.block_id
-- LEFT JOIN rooms r ON r.id = s.room_id
-- WHERE s.enrollment_no = 'YOUR_ENROLLMENT_NO';
