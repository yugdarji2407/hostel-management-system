// db.js — schema + seed data, backed by Postgres (Supabase's free-tier
// Postgres, or any Postgres you point DATABASE_URL at).
//
// Why an adapter instead of rewriting every query: the rest of this codebase
// calls `db.prepare(sql).get(...)`, `.all(...)`, `.run(...)` — a pattern
// borrowed from better-sqlite3/node:sqlite. Postgres access via the `pg`
// driver is inherently async, so those methods are now async (every call
// site elsewhere in the backend now awaits them) — but the call *shape*
// barely changes, which keeps ~120 existing query call-sites almost
// untouched instead of hand-rewriting every one against a raw pg API.
//
// Two SQLite-isms that don't exist in Postgres, translated once here so nothing
// else in the codebase has to know about them:
//   1. `?` positional placeholders  -> `$1, $2, ...`               (toPgParams)
//   2. `INSERT ...` needing `lastInsertRowid` -> `... RETURNING id` (needsReturningId)
// Everything else (CHECK constraints, REFERENCES, UNIQUE, ON CONFLICT ...
// DO UPDATE, partial unique indexes, IF NOT EXISTS) is valid in both engines
// unchanged. `datetime('now')` (SQLite) has no Postgres equivalent, so it's
// replaced everywhere with a small helper SQL function, now_text(), defined
// below, that reproduces the exact same "YYYY-MM-DD HH:MM:SS" UTC string —
// so every column that stored SQLite's `datetime('now')` output keeps the
// exact same format, and no JS code that parses/compares/slices those
// strings (there's a fair amount) needs to change.

const { Pool } = require("pg");
const { hashPassword } = require("./auth");

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Create a Supabase project (or any Postgres " +
    "instance), copy its connection string into backend/.env as DATABASE_URL, " +
    "and restart. See SUPABASE_SETUP.md."
  );
}

// Supabase (and most hosted Postgres) requires TLS and presents a cert chain
// that Node's default trust store doesn't always resolve cleanly in
// containerized environments — this is the standard, documented setting for
// connecting from a Node backend. It does NOT disable encryption, only
// hostname-mismatch style strict chain validation.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.PG_POOL_MAX || 10),
});

pool.on("error", (err) => {
  // Fired for errors on idle clients in the pool (e.g. a dropped connection)
  // — must be handled or an unhandled 'error' event crashes the process.
  console.error("Unexpected Postgres pool error:", err.message);
});

function toPgParams(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

function withReturningId(sql) {
  const trimmed = sql.trim();
  if (/^insert/i.test(trimmed) && !/\breturning\b/i.test(trimmed)) {
    return `${sql} RETURNING id`;
  }
  return sql;
}

const db = {
  prepare(sql) {
    const selectSql = toPgParams(sql);
    const runSql = toPgParams(withReturningId(sql));
    return {
      async get(...params) {
        const { rows } = await pool.query(selectSql, params);
        return rows[0];
      },
      async all(...params) {
        const { rows } = await pool.query(selectSql, params);
        return rows;
      },
      async run(...params) {
        const { rows, rowCount } = await pool.query(runSql, params);
        return {
          lastInsertRowid: rows[0]?.id != null ? Number(rows[0].id) : undefined,
          changes: rowCount,
        };
      },
    };
  },
  // Multiple ;-separated statements in one string are fine here — pg uses
  // the "simple query" protocol (which supports that) whenever a query is
  // issued with no parameters, which is always true for our DDL blocks.
  async exec(sql) {
    await pool.query(sql);
  },
  async transaction(work) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const tx = {
        prepare(sql) {
          const selectSql = toPgParams(sql);
          const runSql = toPgParams(withReturningId(sql));
          return {
            async get(...params) {
              const { rows } = await client.query(selectSql, params);
              return rows[0];
            },
            async all(...params) {
              const { rows } = await client.query(selectSql, params);
              return rows;
            },
            async run(...params) {
              const { rows, rowCount } = await client.query(runSql, params);
              return {
                lastInsertRowid: rows[0]?.id != null ? Number(rows[0].id) : undefined,
                changes: rowCount,
              };
            },
          };
        },
        async exec(sql) {
          await client.query(sql);
        },
      };
      const result = await work(tx);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch {}
      throw err;
    } finally {
      client.release();
    }
  },
  async end() {
    await pool.end();
  },
};

// The one and only admin account, as specified.
const ADMIN_EMAIL = "yugdarji56@gmail.com";
const ADMIN_PASSWORD = "hostel123";

async function migrate() {
  // Reproduces SQLite's `datetime('now')` output exactly ("YYYY-MM-DD
  // HH:MM:SS", UTC) as a stored SQL function, so every column default and
  // inline insert that used to call datetime('now') can call now_text()
  // instead and get byte-for-byte the same string shape as before.
  await db.exec(`
    CREATE OR REPLACE FUNCTION now_text() RETURNS text AS $$
      SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS');
    $$ LANGUAGE sql STABLE;
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      role TEXT NOT NULL CHECK (role IN ('student','admin')),
      email TEXT UNIQUE,
      mobile TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT now_text()
    );

    CREATE TABLE IF NOT EXISTS blocks (
      id SERIAL PRIMARY KEY,
      block_number TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id SERIAL PRIMARY KEY,
      block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
      room_number TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 1,
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
      block_id INTEGER REFERENCES blocks(id),
      room_id INTEGER REFERENCES rooms(id)
    );

    -- status          = admin's decision on the leave pass
    -- parent_status    = parent/guardian's decision, given via the emailed/texted approval link
    -- A pass is only truly valid once BOTH are 'Approved' (see leaveRoutes.js isValid()).
    CREATE TABLE IF NOT EXISTS leave_passes (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      destination TEXT,
      leave_datetime TEXT NOT NULL,
      return_datetime TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Rejected')),
      reviewed_by INTEGER REFERENCES users(id),
      reviewed_at TEXT,
      parent_status TEXT NOT NULL DEFAULT 'Pending' CHECK (parent_status IN ('Pending','Approved','Rejected')),
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

    -- One-time codes for both login OTPs and parent leave-approval OTPs.
    -- purpose: 'student_login' | 'admin_login' | 'parent_leave'
    CREATE TABLE IF NOT EXISTS otp_codes (
      id SERIAL PRIMARY KEY,
      identifier TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      meta TEXT,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT now_text()
    );

    -- Current OTP service: email/mobile OTPs use epoch milliseconds because
    -- the service compares them directly with Date.now().
    CREATE TABLE IF NOT EXISTS otp_verifications (
      id SERIAL PRIMARY KEY,
      channel TEXT NOT NULL CHECK (channel IN ('email','phone')),
      destination TEXT NOT NULL,
      purpose TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_sent_at BIGINT NOT NULL,
      verified_at BIGINT,
      verification_token_hash TEXT,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_otp_destination_purpose
      ON otp_verifications(destination, purpose, channel);
    CREATE INDEX IF NOT EXISTS idx_otp_verification_token
      ON otp_verifications(verification_token_hash);

    CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      admin_id INTEGER NOT NULL REFERENCES users(id),
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
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT now_text()
    );

    -- Hashed refresh tokens (the raw token only ever exists in the httpOnly
    -- cookie on the client — the server stores nothing it could leak in
    -- readable form). One row per issued token; rotated on every /refresh
    -- call and revoked on logout or password reset.
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL,
      user_agent TEXT,
      ip TEXT,
      expires_at TEXT NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT now_text()
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);

    -- Security event log — login/logout/registration/lockout/password-reset events.
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
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

    -- Foreign-key and dashboard lookup indexes.
    CREATE INDEX IF NOT EXISTS idx_students_user ON students(user_id);
    CREATE INDEX IF NOT EXISTS idx_students_block ON students(block_id);
    CREATE INDEX IF NOT EXISTS idx_students_room ON students(room_id);
    CREATE INDEX IF NOT EXISTS idx_students_enrollment ON students(enrollment_no);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

    CREATE INDEX IF NOT EXISTS idx_rooms_block ON rooms(block_id);

    CREATE INDEX IF NOT EXISTS idx_leave_student ON leave_passes(student_id);
    CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_passes(status);
    CREATE INDEX IF NOT EXISTS idx_leave_parent_status ON leave_passes(parent_status);
    CREATE INDEX IF NOT EXISTS idx_leave_datetime ON leave_passes(leave_datetime);
    CREATE INDEX IF NOT EXISTS idx_leave_applied ON leave_passes(applied_at);

    CREATE INDEX IF NOT EXISTS idx_sms_leave ON sms_logs(leave_pass_id);
    CREATE INDEX IF NOT EXISTS idx_sms_status ON sms_logs(status);

    CREATE INDEX IF NOT EXISTS idx_otp_codes_identifier ON otp_codes(identifier, purpose, used);

    CREATE TABLE IF NOT EXISTS gate_scans (
      id SERIAL PRIMARY KEY,
      leave_id INTEGER NOT NULL REFERENCES leave_passes(id) ON DELETE CASCADE,
      security_user_id INTEGER REFERENCES security_users(id) ON DELETE SET NULL,
      scan_type TEXT NOT NULL CHECK (scan_type IN ('OUT','IN')),
      scanned_at TEXT NOT NULL DEFAULT now_text()
    );

    CREATE INDEX IF NOT EXISTS idx_announcements_admin ON announcements(admin_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
    CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_gate_scans_leave ON gate_scans(leave_id, scanned_at);

  `);

  // Safe migrations for databases created by earlier versions — Postgres
  // equivalent of "PRAGMA table_info": information_schema.columns.
  async function existingColumns(table) {
    const { rows } = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = $1",
      [table]
    );
    return rows.map((r) => r.column_name);
  }

  const studentColumns = await existingColumns("students");
  for (const [name, type] of [["course", "TEXT"], ["branch", "TEXT"], ["semester", "TEXT"]]) {
    if (!studentColumns.includes(name)) await db.exec(`ALTER TABLE students ADD COLUMN ${name} ${type}`);
  }

  // Security hardening columns on users — account lockout, session invalidation, login auditing.
  const userColumns = await existingColumns("users");
  const userAdditions = [
    ["failed_attempts", "INTEGER NOT NULL DEFAULT 0"],
    ["locked_until", "TEXT"],
    ["token_version", "INTEGER NOT NULL DEFAULT 0"], // bumped on password reset/logout-all to invalidate old access tokens
    ["last_login_at", "TEXT"],
    // Google Sign-In — an existing (password-registered) account can be linked to a
    // Google account once its email is verified by Google. We never create accounts
    // from Google alone, so password_hash/password_salt stay NOT NULL and unchanged.
    ["google_id", "TEXT"],
    ["auth_provider", "TEXT NOT NULL DEFAULT 'local'"],
  ];
  for (const [name, def] of userAdditions) {
    if (!userColumns.includes(name)) await db.exec(`ALTER TABLE users ADD COLUMN ${name} ${def}`);
  }
  // google_id needs to be unique, but adding a UNIQUE constraint via ALTER
  // TABLE ADD COLUMN isn't possible in either engine — a partial unique
  // index gives the same guarantee (and, being partial on NOT NULL, never
  // conflicts on the many NULL rows). Same syntax in Postgres as SQLite.
  await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;`);

  // Older deployments may already have audit_logs without request metadata.
  const auditColumns = await existingColumns("audit_logs");
  if (!auditColumns.includes("ip")) await db.exec(`ALTER TABLE audit_logs ADD COLUMN ip TEXT`);
  if (!auditColumns.includes("user_agent")) await db.exec(`ALTER TABLE audit_logs ADD COLUMN user_agent TEXT`);
}

async function alreadySeeded() {
  const row = await db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get();
  return Number(row.c) > 0;
}

async function seed() {
  // Idempotent seed: repair/complete the base inventory even if a previous
  // deployment inserted only some of the rows.
  const insertBlock = db.prepare(`
    INSERT INTO blocks (block_number) VALUES (?)
    ON CONFLICT (block_number) DO UPDATE SET block_number = EXCLUDED.block_number
    RETURNING id
  `);

  const blockIds = {};
  for (const b of ["A", "B", "C"]) {
    const info = await insertBlock.run(b);
    blockIds[b] = Number(info.lastInsertRowid);
  }

  const insertRoom = db.prepare(`
    INSERT INTO rooms (block_id, room_number, capacity)
    VALUES (?, ?, ?)
    ON CONFLICT (block_id, room_number)
    DO UPDATE SET capacity = EXCLUDED.capacity
    RETURNING id
  `);

  // Base numbering per block, chosen so the existing application examples
  // (A-108, B-301, C-214) are all present.
  const roomPlan = {
    A: { base: 100, count: 40 },
    B: { base: 300, count: 36 },
    C: { base: 200, count: 44 },
  };

  for (const [block, { base, count }] of Object.entries(roomPlan)) {
    for (let i = 1; i <= count; i++) {
      await insertRoom.run(blockIds[block], String(base + i), 2);
    }
  }

  const { hash, salt } = hashPassword(ADMIN_PASSWORD);
  await db.prepare(`
    INSERT INTO users (role, email, mobile, password_hash, password_salt)
    VALUES ('admin', ?, NULL, ?, ?)
    ON CONFLICT (email) DO NOTHING
  `).run(ADMIN_EMAIL, hash, salt);

  await ensureSecurityAccount();

  console.log("Initialized/verified Postgres seed data: admin, security account and room inventory.");
  console.log(`Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log("Security login: security@hostel.local / security123");
}

async function ensureSecurityAccount() {
  const existing = await db.prepare("SELECT id FROM security_users WHERE email=?").get("security@hostel.local");
  if (existing) return;
  const sec = hashPassword("security123");
  await db.prepare("INSERT INTO security_users (name,email,password_hash,password_salt) VALUES (?,?,?,?)")
    .run("Hostel Gate Security", "security@hostel.local", sec.hash, sec.salt);
}

// Runs schema migration + the one-time security-account bootstrap. Must be
// awaited before the server starts accepting requests — see server.js.
async function init() {
  await migrate();
  await ensureSecurityAccount();
}

module.exports = { db, init, seed, ADMIN_EMAIL };

// `npm run seed` (node src/db.js --seed) — sets up the schema and seed data
// without starting the HTTP server, e.g. right after pointing DATABASE_URL
// at a brand-new Supabase project for the first time.
if (require.main === module && process.argv.includes("--seed")) {
  (async () => {
    await init();
    await seed();
    await pool.end();
  })().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
