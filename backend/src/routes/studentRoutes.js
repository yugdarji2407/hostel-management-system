const { db } = require("../db");
const { hashPassword } = require("../auth");
const { requireAuth, requireRole } = require("../middleware/auth");

const STUDENT_SELECT = `
  SELECT s.id, s.enrollment_no, s.name, s.father_name, s.father_mobile,
         s.mother_name, s.mother_mobile, s.guardian_name, s.guardian_mobile,
         b.block_number AS block, r.room_number AS room,
         u.email, u.mobile, s.course, s.branch, s.semester
  FROM students s
  JOIN users u ON u.id = s.user_id
  LEFT JOIN blocks b ON b.id = s.block_id
  LEFT JOIN rooms r ON r.id = s.room_id
`;

function register(router) {
  router.get("/api/students", requireAuth, requireRole("admin"), async (req, res) => {
    const { q, block } = req.query;
    let sql = STUDENT_SELECT + " WHERE 1=1";
    const args = [];
    if (q) {
      // ILIKE, not LIKE — Postgres's LIKE is case-sensitive (SQLite's isn't
      // for ASCII), and this is a search box people expect to be forgiving.
      sql += " AND (s.enrollment_no ILIKE ? OR s.name ILIKE ? OR r.room_number ILIKE ? OR u.email ILIKE ? OR u.mobile ILIKE ?)";
      args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (block && block !== "All") {
      sql += " AND b.block_number = ?";
      args.push(block);
    }
    sql += " ORDER BY s.name";
    res.json(200, await db.prepare(sql).all(...args));
  });

  router.get("/api/students/me", requireAuth, requireRole("student"), async (req, res) => {
    const student = await db.prepare(STUDENT_SELECT + " WHERE s.id = ?").get(req.user.studentId);
    if (!student) return res.json(404, { error: "Profile not found." });
    res.json(200, student);
  });

  router.get("/api/students/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const student = await db.prepare(STUDENT_SELECT + " WHERE s.id = ?").get(req.params.id);
    if (!student) return res.json(404, { error: "Student not found." });
    res.json(200, student);
  });

  router.post("/api/students", requireAuth, requireRole("admin"), async (req, res) => {
    const {
      enrollment, name, email, mobile, password,
      father, fatherPhone, mother, motherPhone, guardian, guardianPhone,
      course, branch, semester, block, room,
    } = req.body;

    if (!enrollment || !name || !email || !mobile || !password) {
      return res.json(400, { error: "Enrollment number, name, email, mobile number and password are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedMobile = String(mobile).trim();

    try {
      const created = await db.transaction(async (tx) => {
        const blockRow = block ? await tx.prepare("SELECT id FROM blocks WHERE block_number = ?").get(String(block).trim()) : null;
        if (block && !blockRow) {
          const err = new Error("Selected block does not exist.");
          err.statusCode = 400;
          throw err;
        }

        // Lock the room row while checking occupancy so two admins cannot
        // assign the last bed at the same time.
        const roomRow = block && room
          ? await tx.prepare("SELECT id, capacity FROM rooms WHERE block_id = ? AND room_number = ? FOR UPDATE").get(blockRow.id, String(room).trim())
          : null;
        if (room && !roomRow) {
          const err = new Error("Selected room does not exist in that block.");
          err.statusCode = 400;
          throw err;
        }
        if (roomRow) {
          const occupantsRow = await tx.prepare("SELECT COUNT(*) AS c FROM students WHERE room_id = ?").get(roomRow.id);
          if (Number(occupantsRow.c) >= Number(roomRow.capacity)) {
            const err = new Error("That room is already full.");
            err.statusCode = 409;
            throw err;
          }
        }

        const { hash, salt } = hashPassword(password);
        const userInfo = await tx
          .prepare("INSERT INTO users (role, email, mobile, password_hash, password_salt) VALUES ('student', ?, ?, ?, ?)")
          .run(normalizedEmail, normalizedMobile, hash, salt);

        const studentInfo = await tx
          .prepare(`
            INSERT INTO students
              (user_id, enrollment_no, name, father_name, father_mobile, mother_name, mother_mobile, guardian_name, guardian_mobile, course, branch, semester, block_id, room_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            Number(userInfo.lastInsertRowid), String(enrollment).trim(), String(name).trim(),
            father || null, fatherPhone || null, mother || null, motherPhone || null,
            guardian || father || null, guardianPhone || fatherPhone || null,
            course || null, branch || null, semester || null,
            blockRow ? blockRow.id : null, roomRow ? roomRow.id : null
          );

        return await tx.prepare(STUDENT_SELECT + " WHERE s.id = ?").get(Number(studentInfo.lastInsertRowid));
      });

      res.json(201, created);
    } catch (err) {
      if (err.statusCode) return res.json(err.statusCode, { error: err.message });

      if (err.code === "23505" || String(err.message).includes("UNIQUE")) {
        return res.json(409, { error: "Enrollment number or email already exists." });
      }
      throw err;
    }
  });

  router.put("/api/students/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const existing = await db.prepare("SELECT * FROM students WHERE id = ?").get(req.params.id);
    if (!existing) return res.json(404, { error: "Student not found." });

    const fields = req.body;
    let blockId = existing.block_id;
    let roomId = existing.room_id;
    if (fields.block) {
      const blockRow = await db.prepare("SELECT id FROM blocks WHERE block_number = ?").get(fields.block);
      if (!blockRow) return res.json(400, { error: "Selected block does not exist." });
      blockId = blockRow.id;
      if (fields.room) {
        const roomRow = await db.prepare("SELECT id, capacity FROM rooms WHERE block_id = ? AND room_number = ?").get(blockId, fields.room);
        if (!roomRow) return res.json(400, { error: "Selected room does not exist in that block." });
        const occupantsRow = await db.prepare("SELECT COUNT(*) AS c FROM students WHERE room_id = ? AND id <> ?").get(roomRow.id, req.params.id);
        if (Number(occupantsRow.c) >= roomRow.capacity) return res.json(409, { error: "That room is already full." });
        roomId = roomRow.id;
      } else if (fields.room === "") roomId = null;
    }

    await db.prepare(`
      UPDATE students SET
        name = ?, father_name = ?, father_mobile = ?, mother_name = ?, mother_mobile = ?,
        guardian_name = ?, guardian_mobile = ?, course = ?, branch = ?, semester = ?, block_id = ?, room_id = ?
      WHERE id = ?
    `).run(
      fields.name ?? existing.name,
      fields.father ?? existing.father_name,
      fields.fatherPhone ?? existing.father_mobile,
      fields.mother ?? existing.mother_name,
      fields.motherPhone ?? existing.mother_mobile,
      fields.guardian ?? existing.guardian_name,
      fields.guardianPhone ?? existing.guardian_mobile,
      fields.course ?? existing.course,
      fields.branch ?? existing.branch,
      fields.semester ?? existing.semester,
      blockId, roomId,
      req.params.id
    );
    const userUpdates = [];
    const userArgs = [];
    if (fields.email) { userUpdates.push("email = ?"); userArgs.push(String(fields.email).trim().toLowerCase()); }
    if (fields.mobile) { userUpdates.push("mobile = ?"); userArgs.push(String(fields.mobile).trim()); }
    if (fields.password) { const { hash, salt } = hashPassword(fields.password); userUpdates.push("password_hash = ?", "password_salt = ?"); userArgs.push(hash, salt); }
    if (userUpdates.length) { userArgs.push(existing.user_id); await db.prepare(`UPDATE users SET ${userUpdates.join(", ")} WHERE id = ?`).run(...userArgs); }

    res.json(200, await db.prepare(STUDENT_SELECT + " WHERE s.id = ?").get(req.params.id));
  });

  router.delete("/api/students/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const existing = await db.prepare("SELECT * FROM students WHERE id = ?").get(req.params.id);
    if (!existing) return res.json(404, { error: "Student not found." });
    await db.prepare("DELETE FROM students WHERE id = ?").run(req.params.id);
    await db.prepare("DELETE FROM users WHERE id = ?").run(existing.user_id);
    res.json(200, { success: true });
  });
}

module.exports = { register };
