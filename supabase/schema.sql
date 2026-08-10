-- Hosteliq Hostel Management System
-- Complete Supabase/PostgreSQL schema + development seed data.
--
-- This file is safe to run more than once on the same database.
-- The Node backend also runs the same migrations automatically at startup.

CREATE OR REPLACE FUNCTION now_text() RETURNS text AS $$
  SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS');
$$ LANGUAGE sql STABLE;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('student','admin')),
  email TEXT UNIQUE,
  mobile TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT now_text(),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  token_version INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  google_id TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS blocks (
  id SERIAL PRIMARY KEY,
  block_number TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  room_number TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity > 0),
  UNIQUE(block_id, room_number)
);

CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrollment_no TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  father_name TEXT,
  father_mobile TEXT,
  mother_name TEXT,
  mother_mobile TEXT,
  guardian_name TEXT,
  guardian_mobile TEXT,
  course TEXT,
  branch TEXT,
  semester TEXT,
  block_id INTEGER REFERENCES blocks(id) ON DELETE SET NULL,
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS leave_passes (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  destination TEXT,
  leave_datetime TEXT NOT NULL,
  return_datetime TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending','Approved','Rejected')),
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  parent_status TEXT NOT NULL DEFAULT 'Pending'
    CHECK (parent_status IN ('Pending','Approved','Rejected')),
  parent_token TEXT UNIQUE,
  parent_responded_at TEXT,
  finalized_at TEXT,
  applied_at TEXT NOT NULL DEFAULT now_text()
);

CREATE TABLE IF NOT EXISTS sms_logs (
  id SERIAL PRIMARY KEY,
  leave_pass_id INTEGER REFERENCES leave_passes(id) ON DELETE CASCADE,
  recipient_type TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent','failed')),
  sent_at TEXT NOT NULL DEFAULT now_text()
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id SERIAL PRIMARY KEY,
  identifier TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  meta TEXT,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0,1)),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TEXT NOT NULL DEFAULT now_text()
);

CREATE TABLE IF NOT EXISTS otp_verifications (
  id SERIAL PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('email','phone')),
  destination TEXT NOT NULL,
  purpose TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_sent_at BIGINT NOT NULL,
  verified_at BIGINT,
  verification_token_hash TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT now_text(),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS security_users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT now_text()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  read INTEGER NOT NULL DEFAULT 0 CHECK (read IN (0,1)),
  created_at TEXT NOT NULL DEFAULT now_text()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  user_agent TEXT,
  ip TEXT,
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0,1)),
  created_at TEXT NOT NULL DEFAULT now_text()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT now_text()
);

CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('Present','Absent','Leave','Late')),
  marked_by INTEGER,
  created_at TEXT NOT NULL DEFAULT now_text(),
  UNIQUE(student_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS complaints (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK(status IN ('Pending','In Progress','Resolved')),
  assigned_to TEXT,
  admin_comment TEXT,
  created_at TEXT NOT NULL DEFAULT now_text(),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS maintenance_requests (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
  block_id INTEGER REFERENCES blocks(id) ON DELETE SET NULL,
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK(status IN ('Pending','In Progress','Resolved')),
  assigned_to TEXT,
  created_at TEXT NOT NULL DEFAULT now_text(),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS fees (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  paid_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK(status IN ('Pending','Partial','Paid')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT now_text(),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK(status IN ('Pending','Verified','Rejected')),
  uploaded_at TEXT NOT NULL DEFAULT now_text(),
  verified_at TEXT
);

CREATE TABLE IF NOT EXISTS gate_scans (
  id SERIAL PRIMARY KEY,
  leave_id INTEGER NOT NULL REFERENCES leave_passes(id) ON DELETE CASCADE,
  security_user_id INTEGER REFERENCES security_users(id) ON DELETE SET NULL,
  scan_type TEXT NOT NULL CHECK(scan_type IN ('OUT','IN')),
  scanned_at TEXT NOT NULL DEFAULT now_text()
);

-- Core indexes
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id
  ON users(google_id) WHERE google_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_user ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_students_enrollment ON students(enrollment_no);
CREATE INDEX IF NOT EXISTS idx_students_block ON students(block_id);
CREATE INDEX IF NOT EXISTS idx_students_room ON students(room_id);
CREATE INDEX IF NOT EXISTS idx_rooms_block ON rooms(block_id);

CREATE INDEX IF NOT EXISTS idx_leave_student ON leave_passes(student_id);
CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_passes(status);
CREATE INDEX IF NOT EXISTS idx_leave_parent_status ON leave_passes(parent_status);
CREATE INDEX IF NOT EXISTS idx_leave_datetime ON leave_passes(leave_datetime);
CREATE INDEX IF NOT EXISTS idx_leave_applied ON leave_passes(applied_at);

CREATE INDEX IF NOT EXISTS idx_sms_leave ON sms_logs(leave_pass_id);
CREATE INDEX IF NOT EXISTS idx_sms_status ON sms_logs(status);

CREATE INDEX IF NOT EXISTS idx_otp_codes_identifier
  ON otp_codes(identifier, purpose, used);
CREATE INDEX IF NOT EXISTS idx_otp_destination_purpose
  ON otp_verifications(destination, purpose, channel);
CREATE INDEX IF NOT EXISTS idx_otp_verification_token
  ON otp_verifications(verification_token_hash);

CREATE INDEX IF NOT EXISTS idx_announcements_admin ON announcements(admin_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

CREATE INDEX IF NOT EXISTS idx_attendance_student_date
  ON attendance(student_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status);

CREATE INDEX IF NOT EXISTS idx_complaints_student ON complaints(student_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_created ON complaints(created_at);

CREATE INDEX IF NOT EXISTS idx_maintenance_student ON maintenance_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_block_room
  ON maintenance_requests(block_id, room_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_requests(status);

CREATE INDEX IF NOT EXISTS idx_fees_student ON fees(student_id);
CREATE INDEX IF NOT EXISTS idx_fees_status ON fees(status);
CREATE INDEX IF NOT EXISTS idx_fees_due_date ON fees(due_date);

CREATE INDEX IF NOT EXISTS idx_documents_student ON documents(student_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

CREATE INDEX IF NOT EXISTS idx_gate_scans_leave
  ON gate_scans(leave_id, scanned_at DESC);

-- ---------------------------------------------------------------------------
-- Development seed
-- Password hashes below are Node crypto.scryptSync-compatible hashes for
-- hostel123 and security123 respectively. Change these credentials after setup.
-- Student records are intentionally NOT seeded. Students are created by the app.
-- ---------------------------------------------------------------------------

INSERT INTO blocks (block_number) VALUES
  ('A'), ('B'), ('C')
ON CONFLICT (block_number) DO NOTHING;

INSERT INTO rooms (block_id, room_number, capacity)
SELECT b.id, v.room_number, 2
FROM (
  SELECT 'A'::text AS block_number, generate_series(101,140)::text AS room_number
  UNION ALL
  SELECT 'B'::text, generate_series(301,336)::text
  UNION ALL
  SELECT 'C'::text, generate_series(201,244)::text
) v
JOIN blocks b ON b.block_number = v.block_number
ON CONFLICT (block_id, room_number) DO NOTHING;

INSERT INTO users
  (role, email, mobile, password_hash, password_salt)
VALUES
  (
    'admin',
    'yugdarji56@gmail.com',
    NULL,
    '3c19b9eb4af2ce9f0783c1736a18c6c84b3bd916919dd01daf1595bbfa6fbc398c7f601b005d817164895a7a83a57363ab76e20a32376e544beb1ee9451e3e4f',
    '5d41affe0d11acba3cfd3528e6510c05'
  )
ON CONFLICT (email) DO NOTHING;

INSERT INTO security_users
  (name, email, password_hash, password_salt)
VALUES
  (
    'Hostel Gate Security',
    'security@hostel.local',
    'bc7e1d852c05b3e69095702fb485298b31094f83f168c2ae269200b701cd1a27e8346c14b3af0775902299149a8afa93406f7f43cdc291ca5cd9b85a0a0f0e3d',
    'b4e393a16c252e404baebe11976f90f5'
  )
ON CONFLICT (email) DO NOTHING;
