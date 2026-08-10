const { db } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const crypto = require("node:crypto");

async function ensureTables() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS security_users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
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
      status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','In Progress','Resolved')),
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
      status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','In Progress','Resolved')),
      assigned_to TEXT,
      created_at TEXT NOT NULL DEFAULT now_text(),
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS fees (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      amount NUMERIC(10,2) NOT NULL,
      paid_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Partial','Paid')),
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
      status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Verified','Rejected')),
      uploaded_at TEXT NOT NULL DEFAULT now_text(),
      verified_at TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT now_text()
    );
    CREATE TABLE IF NOT EXISTS gate_scans (
      id SERIAL PRIMARY KEY,
      leave_id INTEGER NOT NULL REFERENCES leave_passes(id) ON DELETE CASCADE,
      security_user_id INTEGER,
      scan_type TEXT NOT NULL CHECK(scan_type IN ('OUT','IN')),
      scanned_at TEXT NOT NULL DEFAULT now_text()
    );

    CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance(student_id, attendance_date DESC);
    CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status);

    CREATE INDEX IF NOT EXISTS idx_complaints_student ON complaints(student_id);
    CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
    CREATE INDEX IF NOT EXISTS idx_complaints_created ON complaints(created_at);

    CREATE INDEX IF NOT EXISTS idx_maintenance_student ON maintenance_requests(student_id);
    CREATE INDEX IF NOT EXISTS idx_maintenance_block_room ON maintenance_requests(block_id, room_id);
    CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_requests(status);

    CREATE INDEX IF NOT EXISTS idx_fees_student ON fees(student_id);
    CREATE INDEX IF NOT EXISTS idx_fees_status ON fees(status);
    CREATE INDEX IF NOT EXISTS idx_fees_due_date ON fees(due_date);

    CREATE INDEX IF NOT EXISTS idx_documents_student ON documents(student_id);
    CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

    CREATE INDEX IF NOT EXISTS idx_gate_scans_leave ON gate_scans(leave_id, scanned_at DESC);
  `);

  // Keep older databases compatible with authRoutes' request-aware audit log.
  const { rows: auditCols } = await db.prepare(
    "SELECT column_name FROM information_schema.columns WHERE table_name = ?"
  ).all("audit_logs");
  const auditNames = auditCols.map((r) => r.column_name);
  if (!auditNames.includes("ip")) await db.exec("ALTER TABLE audit_logs ADD COLUMN ip TEXT");
  if (!auditNames.includes("user_agent")) await db.exec("ALTER TABLE audit_logs ADD COLUMN user_agent TEXT");
}

async function audit(req, action, type, id, details) {
  try {
    await db.prepare("INSERT INTO audit_logs (user_id, role, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)")
      .run(req.user?.userId || null, req.user?.role || null, action, type, id == null ? null : String(id), details ? JSON.stringify(details) : null);
  } catch {}
}

const studentJoin = `
SELECT s.id, s.enrollment_no, s.name, b.block_number AS block, r.room_number AS room,
       u.email, u.mobile, s.course, s.branch, s.semester
FROM students s JOIN users u ON u.id=s.user_id
LEFT JOIN blocks b ON b.id=s.block_id LEFT JOIN rooms r ON r.id=s.room_id`;

function register(router) {
  router.get("/api/complaints", requireAuth, async (req, res) => {
    let sql = `SELECT c.*, s.name AS student_name, s.enrollment_no FROM complaints c JOIN students s ON s.id=c.student_id`;
    const args = [];
    if (req.user.role === "student") { sql += " WHERE c.student_id = ?"; args.push(req.user.studentId); }
    sql += " ORDER BY c.created_at DESC";
    res.json(200, await db.prepare(sql).all(...args));
  });
  router.post("/api/complaints", requireAuth, requireRole("student"), async (req, res) => {
    const { category, title, description } = req.body;
    if (!category || !title || !description) return res.json(400, { error: "Category, title and description are required." });
    const r = await db.prepare("INSERT INTO complaints(student_id,category,title,description) VALUES(?,?,?,?)").run(req.user.studentId, category, title, description);
    await audit(req, "CREATE", "complaint", r.lastInsertRowid, { category, title });
    res.json(201, await db.prepare("SELECT * FROM complaints WHERE id=?").get(r.lastInsertRowid));
  });
  router.put("/api/complaints/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const { status, assignedTo, adminComment } = req.body;
    await db.prepare("UPDATE complaints SET status=COALESCE(?,status),assigned_to=COALESCE(?,assigned_to),admin_comment=COALESCE(?,admin_comment),updated_at=now_text() WHERE id=?").run(status || null, assignedTo || null, adminComment || null, req.params.id);
    await audit(req, "UPDATE", "complaint", req.params.id, { status });
    res.json(200, { success: true });
  });

  router.get("/api/maintenance", requireAuth, async (req, res) => {
    let sql = `SELECT m.*,s.name AS student_name,s.enrollment_no,b.block_number AS block,r.room_number AS room FROM maintenance_requests m LEFT JOIN students s ON s.id=m.student_id LEFT JOIN blocks b ON b.id=m.block_id LEFT JOIN rooms r ON r.id=m.room_id`;
    const args = []; if (req.user.role === "student") { sql += " WHERE m.student_id=?"; args.push(req.user.studentId); } sql += " ORDER BY m.created_at DESC";
    res.json(200, await db.prepare(sql).all(...args));
  });
  router.post("/api/maintenance", requireAuth, async (req, res) => {
    const { category, title, description, blockId, roomId } = req.body;
    if (!category || !title || !description) return res.json(400, { error: "Category, title and description are required." });
    const studentId = req.user.role === "student" ? req.user.studentId : null;
    const r = await db.prepare("INSERT INTO maintenance_requests(student_id,block_id,room_id,category,title,description) VALUES(?,?,?,?,?,?)").run(studentId, blockId || null, roomId || null, category, title, description);
    await audit(req, "CREATE", "maintenance", r.lastInsertRowid, { category, title }); res.json(201, { id: Number(r.lastInsertRowid) });
  });
  router.put("/api/maintenance/:id", requireAuth, requireRole("admin"), async (req, res) => {
    await db.prepare("UPDATE maintenance_requests SET status=COALESCE(?,status),assigned_to=COALESCE(?,assigned_to),updated_at=now_text() WHERE id=?").run(req.body.status || null, req.body.assignedTo || null, req.params.id);
    await audit(req, "UPDATE", "maintenance", req.params.id, req.body); res.json(200, { success: true });
  });

  router.get("/api/attendance", requireAuth, async (req, res) => {
    const studentId = req.user.role === "student" ? req.user.studentId : (req.query.studentId || null);
    if (!studentId && req.user.role !== "admin") return res.json(400, { error: "studentId required" });
    const sql = `SELECT a.*,s.name AS student_name,s.enrollment_no FROM attendance a JOIN students s ON s.id=a.student_id ${studentId ? "WHERE a.student_id=?" : ""} ORDER BY attendance_date DESC`;
    res.json(200, await db.prepare(sql).all(...(studentId ? [studentId] : [])));
  });
  router.post("/api/attendance", requireAuth, requireRole("admin"), async (req, res) => {
    const { studentId, date, status } = req.body;
    if (!studentId || !date || !["Present", "Absent", "Leave", "Late"].includes(status)) return res.json(400, { error: "studentId, date and valid status are required." });
    await db.prepare("INSERT INTO attendance(student_id,attendance_date,status,marked_by) VALUES(?,?,?,?) ON CONFLICT(student_id,attendance_date) DO UPDATE SET status=excluded.status,marked_by=excluded.marked_by").run(studentId, date, status, req.user.userId);
    await audit(req, "MARK", "attendance", studentId, { date, status }); res.json(200, { success: true });
  });

  router.get("/api/fees", requireAuth, async (req, res) => {
    const studentId = req.user.role === "student" ? req.user.studentId : (req.query.studentId || null);
    const sql = `SELECT f.*,s.name AS student_name,s.enrollment_no FROM fees f JOIN students s ON s.id=f.student_id ${studentId ? "WHERE f.student_id=?" : ""} ORDER BY f.created_at DESC`;
    res.json(200, await db.prepare(sql).all(...(studentId ? [studentId] : [])));
  });
  router.post("/api/fees", requireAuth, requireRole("admin"), async (req, res) => {
    const { studentId, amount, paidAmount = 0, dueDate, note } = req.body;
    if (!studentId || Number(amount) <= 0) return res.json(400, { error: "Student and positive amount are required." });
    const paid = Math.max(0, Number(paidAmount)); const status = paid >= Number(amount) ? "Paid" : paid > 0 ? "Partial" : "Pending";
    const r = await db.prepare("INSERT INTO fees(student_id,amount,paid_amount,due_date,status,note) VALUES(?,?,?,?,?,?)").run(studentId, amount, paid, dueDate || null, status, note || null);
    res.json(201, { id: Number(r.lastInsertRowid) });
  });
  router.put("/api/fees/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const old = await db.prepare("SELECT * FROM fees WHERE id=?").get(req.params.id); if (!old) return res.json(404, { error: "Fee record not found" });
    const paid = req.body.paidAmount == null ? Number(old.paid_amount) : Number(req.body.paidAmount); const amount = req.body.amount == null ? Number(old.amount) : Number(req.body.amount); const status = paid >= amount ? "Paid" : paid > 0 ? "Partial" : "Pending";
    await db.prepare("UPDATE fees SET amount=?,paid_amount=?,due_date=?,status=?,note=?,updated_at=now_text() WHERE id=?").run(amount, paid, req.body.dueDate ?? old.due_date, status, req.body.note ?? old.note, req.params.id); res.json(200, { success: true });
  });

  router.get("/api/documents", requireAuth, async (req, res) => {
    const studentId = req.user.role === "student" ? req.user.studentId : (req.query.studentId || null);
    const sql = `SELECT d.*,s.name AS student_name,s.enrollment_no FROM documents d JOIN students s ON s.id=d.student_id ${studentId ? "WHERE d.student_id=?" : ""} ORDER BY d.uploaded_at DESC`;
    res.json(200, await db.prepare(sql).all(...(studentId ? [studentId] : [])));
  });
  router.post("/api/documents", requireAuth, requireRole("student"), async (req, res) => {
    const { documentType, fileName, fileUrl } = req.body; if (!documentType || !fileName || !fileUrl) return res.json(400, { error: "Document type, file name and file URL are required." });
    const r = await db.prepare("INSERT INTO documents(student_id,document_type,file_name,file_url) VALUES(?,?,?,?)").run(req.user.studentId, documentType, fileName, fileUrl); res.json(201, { id: Number(r.lastInsertRowid) });
  });
  router.put("/api/documents/:id", requireAuth, requireRole("admin"), async (req, res) => {
    await db.prepare("UPDATE documents SET status=?,verified_at=CASE WHEN ?='Verified' THEN now_text() ELSE verified_at END WHERE id=?").run(req.body.status, req.body.status, req.params.id);
    res.json(200, { success: true });
  });

  router.get("/api/security/overview", requireAuth, requireRole("admin", "security"), async (req, res) => {
    const rows = await db.prepare(`SELECT l.id,l.reason,l.destination,l.leave_datetime,l.return_datetime,l.status,l.parent_status,l.student_id,s.name,s.enrollment_no,b.block_number AS block,r.room_number AS room,
      (SELECT scan_type FROM gate_scans g WHERE g.leave_id=l.id ORDER BY scanned_at DESC LIMIT 1) AS last_scan
      FROM leave_passes l JOIN students s ON s.id=l.student_id LEFT JOIN blocks b ON b.id=s.block_id LEFT JOIN rooms r ON r.id=s.room_id
      WHERE l.status='Approved' AND l.parent_status='Approved' ORDER BY l.leave_datetime DESC`).all();
    res.json(200, rows);
  });
  router.post("/api/security/scan", requireAuth, requireRole("admin", "security"), async (req, res) => {
    const { leaveId, scanType } = req.body; if (!leaveId || !["OUT", "IN"].includes(scanType)) return res.json(400, { error: "leaveId and scanType are required." });
    const leave = await db.prepare("SELECT * FROM leave_passes WHERE id=? AND status='Approved' AND parent_status='Approved'").get(leaveId); if (!leave) return res.json(404, { error: "Valid approved pass not found." });
    await db.prepare("INSERT INTO gate_scans(leave_id,security_user_id,scan_type) VALUES(?,?,?)").run(leaveId, req.user.userId || null, scanType);
    await audit(req, "SCAN", "gate_pass", leaveId, { scanType }); res.json(200, { success: true });
  });
  router.get("/api/audit-logs", requireAuth, requireRole("admin"), async (req, res) => res.json(200, await db.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200").all()));

  router.get("/api/analytics", requireAuth, requireRole("admin"), async (req, res) => {
    const blocksRaw = await db.prepare(`SELECT b.block_number AS block,COUNT(s.id) AS students FROM blocks b LEFT JOIN students s ON s.block_id=b.id GROUP BY b.id ORDER BY b.block_number`).all();
    const leaveTrendRaw = await db.prepare(`SELECT substr(applied_at,1,7) AS month,status,COUNT(*) AS count FROM leave_passes GROUP BY month,status ORDER BY month DESC LIMIT 24`).all();
    const complaintsRaw = await db.prepare("SELECT status,COUNT(*) AS count FROM complaints GROUP BY status").all();
    const fees = await db.prepare("SELECT COALESCE(SUM(amount),0) AS billed,COALESCE(SUM(paid_amount),0) AS paid FROM fees").get();
    const attendanceRaw = await db.prepare("SELECT status,COUNT(*) AS count FROM attendance GROUP BY status").all();
    // COUNT(*)/COUNT(col) come back as strings from Postgres (they're BIGINT) — Number() them for the frontend's charts.
    res.json(200, {
      blocks: blocksRaw.map((r) => ({ ...r, students: Number(r.students) })),
      leaveTrend: leaveTrendRaw.map((r) => ({ ...r, count: Number(r.count) })),
      complaints: complaintsRaw.map((r) => ({ ...r, count: Number(r.count) })),
      fees: { billed: Number(fees.billed), paid: Number(fees.paid) },
      attendance: attendanceRaw.map((r) => ({ ...r, count: Number(r.count) })),
    });
  });
}
module.exports = { register, ensureTables };
