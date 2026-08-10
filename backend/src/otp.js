// otp.js — one-time codes for student login, admin login, and parent leave approval.
// Codes are hashed at rest (never stored in plain text), single-use, short-lived,
// and rate-limited by attempt count.
//
// Note: nothing in the current routes imports this module (the active OTP
// flows go through services/otpService.js instead) — converted to async for
// consistency with the rest of the Postgres-backed db layer regardless.

const crypto = require("node:crypto");
const { db } = require("./db");

const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;

function hashCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000)); // 6 digits
}

/** Creates and stores a fresh OTP for (identifier, purpose), invalidating any earlier unused ones. */
async function issueOtp(identifier, purpose, meta = null) {
  await db.prepare("UPDATE otp_codes SET used = 1 WHERE identifier = ? AND purpose = ? AND used = 0")
    .run(identifier, purpose);

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
  await db.prepare(
    "INSERT INTO otp_codes (identifier, purpose, code_hash, meta, expires_at) VALUES (?, ?, ?, ?, ?)"
  ).run(identifier, purpose, hashCode(code), meta ? JSON.stringify(meta) : null, expiresAt);

  return { code, expiresInSeconds: OTP_TTL_MINUTES * 60 };
}

/** Verifies a submitted code. Returns { ok, meta } or { ok: false, error }. */
async function verifyOtp(identifier, purpose, submittedCode) {
  const row = await db
    .prepare(
      "SELECT * FROM otp_codes WHERE identifier = ? AND purpose = ? AND used = 0 ORDER BY id DESC LIMIT 1"
    )
    .get(identifier, purpose);

  if (!row) return { ok: false, error: "No OTP was requested for this account. Request a new one." };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: "Too many incorrect attempts. Request a new OTP." };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, error: "This OTP has expired. Request a new one." };

  if (hashCode(String(submittedCode)) !== row.code_hash) {
    await db.prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?").run(row.id);
    return { ok: false, error: "Incorrect OTP." };
  }

  await db.prepare("UPDATE otp_codes SET used = 1 WHERE id = ?").run(row.id);
  return { ok: true, meta: row.meta ? JSON.parse(row.meta) : null };
}

module.exports = { issueOtp, verifyOtp, OTP_TTL_MINUTES };
