const { db } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

function register(router) {
  // GET /api/stats   (admin — headline numbers for the dashboard)
  router.get("/api/stats", requireAuth, requireRole("admin"), async (req, res) => {
    // Postgres returns COUNT(*) as a string (it's BIGINT under the hood) —
    // Number(...) everywhere here, unlike SQLite which just hands back a JS number.
    const students = Number((await db.prepare("SELECT COUNT(*) AS c FROM students").get()).c);
    const totalRooms = Number((await db.prepare("SELECT COUNT(*) AS c FROM rooms").get()).c);
    const occupiedRooms = Number((await db.prepare("SELECT COUNT(DISTINCT room_id) AS c FROM students WHERE room_id IS NOT NULL").get()).c);

    const leavesByStatus = Object.fromEntries(
      (await db.prepare("SELECT status, COUNT(*) AS c FROM leave_passes GROUP BY status").all()).map((r) => [r.status, Number(r.c)])
    );
    const parentPending = Number((await db.prepare("SELECT COUNT(*) AS c FROM leave_passes WHERE parent_status = 'Pending'").get()).c);
    const fullyValid = Number((await db.prepare("SELECT COUNT(*) AS c FROM leave_passes WHERE status = 'Approved' AND parent_status = 'Approved'").get()).c);

    const announcements = Number((await db.prepare("SELECT COUNT(*) AS c FROM announcements").get()).c);
    const notificationsSent = Number((await db.prepare("SELECT COUNT(*) AS c FROM sms_logs WHERE status = 'sent'").get()).c);
    const notificationsFailed = Number((await db.prepare("SELECT COUNT(*) AS c FROM sms_logs WHERE status = 'failed'").get()).c);

    res.json(200, {
      students,
      rooms: { total: totalRooms, occupied: occupiedRooms },
      leaves: {
        pending: leavesByStatus.Pending || 0,
        approved: leavesByStatus.Approved || 0,
        rejected: leavesByStatus.Rejected || 0,
        parentPending,
        fullyValid,
      },
      announcements,
      notifications: { sent: notificationsSent, failed: notificationsFailed },
    });
  });
}

module.exports = { register };
