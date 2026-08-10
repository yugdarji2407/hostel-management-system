const { db } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

function register(router) {
  router.get("/api/blocks", requireAuth, async (req, res) => {
    const blocks = await db.prepare("SELECT * FROM blocks ORDER BY block_number").all();
    const result = await Promise.all(blocks.map(async (b) => {
      const totals = await db
        .prepare("SELECT COUNT(*) AS rooms FROM rooms WHERE block_id = ?")
        .get(b.id);
      const occupied = await db
        .prepare(`
          SELECT COUNT(DISTINCT room_id) AS occupied
          FROM students WHERE block_id = ? AND room_id IS NOT NULL
        `)
        .get(b.id);
      return { id: b.id, block: b.block_number, rooms: Number(totals.rooms), occupied: Number(occupied.occupied) };
    }));
    res.json(200, result);
  });

  router.get("/api/blocks/:id/rooms", requireAuth, async (req, res) => {
    const rooms = await db
      .prepare(`
        SELECT r.id, r.room_number, r.capacity,
               (SELECT COUNT(*) FROM students s WHERE s.room_id = r.id) AS occupants
        FROM rooms r WHERE r.block_id = ? ORDER BY r.room_number
      `)
      .all(req.params.id);
    res.json(200, rooms);
  });

  router.post("/api/blocks", requireAuth, requireRole("admin"), async (req, res) => {
    const { blockNumber } = req.body;
    if (!blockNumber) return res.json(400, { error: "blockNumber is required." });
    try {
      const info = await db.prepare("INSERT INTO blocks (block_number) VALUES (?)").run(blockNumber);
      res.json(201, { id: Number(info.lastInsertRowid), block_number: blockNumber });
    } catch {
      res.json(409, { error: "That block already exists." });
    }
  });

  router.post("/api/rooms", requireAuth, requireRole("admin"), async (req, res) => {
    const { blockId, roomNumber, capacity } = req.body;
    if (!blockId || !roomNumber) return res.json(400, { error: "blockId and roomNumber are required." });
    try {
      const info = await db
        .prepare("INSERT INTO rooms (block_id, room_number, capacity) VALUES (?, ?, ?)")
        .run(blockId, roomNumber, capacity || 1);
      res.json(201, { id: Number(info.lastInsertRowid), blockId, roomNumber, capacity: capacity || 1 });
    } catch {
      res.json(409, { error: "That room already exists in this block." });
    }
  });
}

module.exports = { register };
