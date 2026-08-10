const { db } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

function register(router) {
  router.get("/api/announcements", requireAuth, async (req, res) => {
    const rows = await db.prepare("SELECT * FROM announcements ORDER BY created_at DESC").all();
    res.json(200, rows);
  });

  router.post("/api/announcements", requireAuth, requireRole("admin"), async (req, res) => {
    const { title, message } = req.body;
    if (!title || !message) return res.json(400, { error: "Title and message are required." });
    const info = await db
      .prepare("INSERT INTO announcements (admin_id, title, message) VALUES (?, ?, ?)")
      .run(req.user.userId, title, message);
    const created = await db.prepare("SELECT * FROM announcements WHERE id = ?").get(Number(info.lastInsertRowid));
    res.json(201, created);
  });

  // PUT /api/announcements/:id   (admin only)  { title, message }
  router.put("/api/announcements/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const existing = await db.prepare("SELECT * FROM announcements WHERE id = ?").get(req.params.id);
    if (!existing) return res.json(404, { error: "Announcement not found." });
    const { title, message } = req.body;
    if (!title || !message) return res.json(400, { error: "Title and message are required." });
    await db.prepare("UPDATE announcements SET title = ?, message = ?, updated_at = now_text() WHERE id = ?")
      .run(title, message, req.params.id);
    res.json(200, await db.prepare("SELECT * FROM announcements WHERE id = ?").get(req.params.id));
  });

  // DELETE /api/announcements/:id   (admin only)
  router.delete("/api/announcements/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const existing = await db.prepare("SELECT * FROM announcements WHERE id = ?").get(req.params.id);
    if (!existing) return res.json(404, { error: "Announcement not found." });
    await db.prepare("DELETE FROM announcements WHERE id = ?").run(req.params.id);
    res.json(200, { success: true });
  });
}

module.exports = { register };
