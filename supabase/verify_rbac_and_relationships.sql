-- Supabase integrity checks for Hostel Management System.
-- These checks identify data conditions that can undermine role-based access.

-- Students without a valid account
SELECT s.id, s.enrollment_no
FROM students s
LEFT JOIN users u ON u.id = s.user_id
WHERE u.id IS NULL;

-- Duplicate account links
SELECT user_id, COUNT(*)
FROM students
GROUP BY user_id
HAVING COUNT(*) > 1;

-- Duplicate enrollment numbers
SELECT enrollment_no, COUNT(*)
FROM students
GROUP BY enrollment_no
HAVING COUNT(*) > 1;

-- Student assigned to a room belonging to another block
SELECT s.id, s.enrollment_no, s.block_id, r.block_id AS room_block_id
FROM students s
JOIN rooms r ON r.id = s.room_id
WHERE s.block_id IS NOT NULL
  AND s.block_id <> r.block_id;

-- Room capacity violations
SELECT r.id, b.block_number, r.room_number, r.capacity,
       COUNT(s.id) AS occupied
FROM rooms r
JOIN blocks b ON b.id = r.block_id
LEFT JOIN students s ON s.room_id = r.id
GROUP BY r.id, b.block_number, r.room_number, r.capacity
HAVING COUNT(s.id) > r.capacity;
