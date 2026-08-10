const crypto = require("node:crypto");
const { db } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { notifyGuardiansOfLeave, notifyParentApprovalRequest } = require("../sms");

const LEAVE_SELECT = `
  SELECT l.*, s.enrollment_no, s.name AS student_name, b.block_number AS block, r.room_number AS room
  FROM leave_passes l
  JOIN students s ON s.id = l.student_id
  LEFT JOIN blocks b ON b.id = s.block_id
  LEFT JOIN rooms r ON r.id = s.room_id
`;

const STUDENT_WITH_LOCATION = `
  SELECT s.*, b.block_number, r.room_number FROM students s
  LEFT JOIN blocks b ON b.id = s.block_id
  LEFT JOIN rooms r ON r.id = s.room_id
  WHERE s.id = ?
`;

// A leave pass is only truly valid once BOTH the admin and the parent/guardian have approved it.
function withValidFlag(leave) {
  if (!leave) return leave;
  return { ...leave, valid: leave.status === "Approved" && leave.parent_status === "Approved" };
}

function appBaseUrl(req) {
  return process.env.APP_URL || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
}

/** Sends the final confirmation exactly once, the moment both approvals are in. */
async function maybeFinalize(leaveId) {
  const leave = await db.prepare(LEAVE_SELECT + " WHERE l.id = ?").get(leaveId);
  if (!leave) return null;
  if (leave.status === "Approved" && leave.parent_status === "Approved" && !leave.finalized_at) {
    const student = await db.prepare(STUDENT_WITH_LOCATION).get(leave.student_id);
    await notifyGuardiansOfLeave(leave, student);
    await db.prepare("UPDATE leave_passes SET finalized_at = now_text() WHERE id = ?").run(leaveId);
    return db.prepare(LEAVE_SELECT + " WHERE l.id = ?").get(leaveId);
  }
  return leave;
}

function register(router) {
  // GET /api/leaves?status=   (admin — all requests, optionally filtered by admin status)
  router.get("/api/leaves", requireAuth, requireRole("admin"), async (req, res) => {
    let sql = LEAVE_SELECT;
    const args = [];
    if (req.query.status) {
      sql += " WHERE l.status = ?";
      args.push(req.query.status);
    }
    sql += " ORDER BY l.applied_at DESC";
    res.json(200, (await db.prepare(sql).all(...args)).map(withValidFlag));
  });

  // GET /api/leaves/me   (student — own history)
  router.get("/api/leaves/me", requireAuth, requireRole("student"), async (req, res) => {
    const rows = await db
      .prepare(LEAVE_SELECT + " WHERE l.student_id = ? ORDER BY l.applied_at DESC")
      .all(req.user.studentId);
    res.json(200, rows.map(withValidFlag));
  });

  // POST /api/leaves   (student — apply for a gate pass; notifies parent/guardian for their approval)
  router.post("/api/leaves", requireAuth, requireRole("student"), async (req, res) => {
    const { reason, destination, leaveAt, returnAt } = req.body;
    if (!reason || !destination || !leaveAt || !returnAt) {
      return res.json(400, { error: "Reason, destination, leave date/time and return date/time are required." });
    }

    const parentToken = crypto.randomBytes(24).toString("hex");
    const info = await db
      .prepare("INSERT INTO leave_passes (student_id, reason, destination, leave_datetime, return_datetime, parent_token) VALUES (?, ?, ?, ?, ?, ?)")
      .run(req.user.studentId, reason, destination, leaveAt, returnAt, parentToken);

    const leaveId = Number(info.lastInsertRowid);
    const leave = await db.prepare(LEAVE_SELECT + " WHERE l.id = ?").get(leaveId);
    const student = await db.prepare(STUDENT_WITH_LOCATION).get(req.user.studentId);
    const parentNotify = await notifyParentApprovalRequest(leave, student, appBaseUrl(req));

    res.json(201, { leave: withValidFlag(leave), parentNotified: parentNotify });
  });

  // PUT /api/leaves/:id/decision   (admin — approve or reject their side of the request)
  router.put("/api/leaves/:id/decision", requireAuth, requireRole("admin"), async (req, res) => {
    const { status } = req.body;
    if (!["Approved", "Rejected"].includes(status)) {
      return res.json(400, { error: "Status must be 'Approved' or 'Rejected'." });
    }

    const leave = await db.prepare(LEAVE_SELECT + " WHERE l.id = ?").get(req.params.id);
    if (!leave) return res.json(404, { error: "Gate pass request not found." });
    if (leave.status !== "Pending") {
      return res.json(409, { error: `This request was already ${leave.status.toLowerCase()} by the admin.` });
    }

    await db.prepare("UPDATE leave_passes SET status = ?, reviewed_by = ?, reviewed_at = now_text() WHERE id = ?")
      .run(status, req.user.userId, req.params.id);

    const updated = await maybeFinalize(req.params.id);
    res.json(200, { leave: withValidFlag(updated) });
  });

  // GET /api/parent-approval/:token   (public — no auth; the parent lands here from the emailed/texted link)
  router.get("/api/parent-approval/:token", async (req, res) => {
    const leave = await db.prepare(LEAVE_SELECT + " WHERE l.parent_token = ?").get(req.params.token);
    if (!leave) return res.json(404, { error: "This approval link is invalid or has already been used." });
    res.json(200, withValidFlag(leave));
  });

  // POST /api/parent-approval/:token   (public)  { decision: 'Approved' | 'Rejected' }
  router.post("/api/parent-approval/:token", async (req, res) => {
    const { decision } = req.body;
    if (!["Approved", "Rejected"].includes(decision)) {
      return res.json(400, { error: "Decision must be 'Approved' or 'Rejected'." });
    }

    const leave = await db.prepare(LEAVE_SELECT + " WHERE l.parent_token = ?").get(req.params.token);
    if (!leave) return res.json(404, { error: "This approval link is invalid or has already been used." });
    if (leave.parent_status !== "Pending") {
      return res.json(409, { error: `A parent/guardian already responded (${leave.parent_status.toLowerCase()}).` });
    }

    await db.prepare("UPDATE leave_passes SET parent_status = ?, parent_responded_at = now_text() WHERE id = ?")
      .run(decision, leave.id);

    const updated = await maybeFinalize(leave.id);
    res.json(200, { leave: withValidFlag(updated) });
  });

  // GET /api/sms-logs   (admin — delivery log for every OTP, parent link, and confirmation sent)
  router.get("/api/sms-logs", requireAuth, requireRole("admin"), async (req, res) => {
    const rows = await db
      .prepare(`
        SELECT sl.*, s.name AS student_name, s.enrollment_no
        FROM sms_logs sl
        LEFT JOIN leave_passes l ON l.id = sl.leave_pass_id
        LEFT JOIN students s ON s.id = l.student_id
        ORDER BY sl.sent_at DESC
        LIMIT 200
      `)
      .all();
    res.json(200, rows);
  });
}

module.exports = { register };
