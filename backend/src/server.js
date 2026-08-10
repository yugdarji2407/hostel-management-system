const http = require("node:http");
const path = require("node:path");
const { Router } = require("./router");
const { db, init, seed } = require("./db");
const { ensureTables } = require("./routes/upgradeRoutes");

// If the frontend has been built (frontend/dist), serve it from this same
// server/port — so the whole app runs with a single `npm start` here.
const staticDir = path.join(__dirname, "..", "..", "frontend", "dist");
const router = new Router({ staticDir });

require("./routes/authRoutes").register(router);
require("./routes/studentRoutes").register(router);
require("./routes/leaveRoutes").register(router);
require("./routes/blockRoutes").register(router);
require("./routes/announcementRoutes").register(router);
require("./routes/statsRoutes").register(router);
require("./routes/upgradeRoutes").register(router);
require("./otpRoutes").register(router, db);

router.get("/api/health", (req, res) => res.json(200, { status: "ok", time: new Date().toISOString() }));

const PORT = process.env.PORT || 4000;
const server = http.createServer((req, res) => router.handle(req, res));

// Schema migration + seed data must finish against Postgres before the
// server accepts traffic — these are now async (network calls to Supabase),
// unlike the old synchronous local SQLite file open.
(async () => {
  try {
    await init();          // core schema (users, students, leave_passes, ...)
    await ensureTables();  // attendance/fees/documents/complaints/... tables
    await seed();           // no-op if the database already has data
    server.listen(PORT, () => {
      console.log(`Hostel Management API listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
})();

module.exports = { server };
