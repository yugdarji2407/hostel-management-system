// auth.js — password hashing + signed session tokens, using only Node's crypto module.
// No bcrypt / jsonwebtoken dependency required (see README for why).

const crypto = require("node:crypto");

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me-in-production";
const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 30 * 60); // 30 minutes
const REFRESH_TOKEN_TTL_SECONDS = Number(process.env.REFRESH_TOKEN_TTL_SECONDS || 7 * 24 * 60 * 60); // 7 days

// scrypt is Node's built-in password-hashing KDF — deliberately memory-hard
// (like bcrypt/argon2) to resist GPU cracking, salted per-user, and requires
// zero external dependency. It's the direct substitute for bcrypt here.
function hashPassword(plainPassword) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(plainPassword, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(plainPassword, hash, salt) {
  const candidate = crypto.scryptSync(plainPassword, salt, 64).toString("hex");
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

// Short-lived access token (JWT-equivalent: HMAC-SHA256 signed, same
// structure as a real JWT). Carries tokenVersion so a password reset or
// explicit "log out everywhere" can invalidate every access token already
// issued, even though they're stateless and normally unrevokable — see
// requireAuth in middleware/auth.js, which checks this against the DB.
function sign(payload, ttlSeconds = ACCESS_TOKEN_TTL_SECONDS) {
  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    ...payload,
    jti: crypto.randomBytes(8).toString("hex"), // guarantees uniqueness even for tokens issued in the same second
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const headerPart = base64url(JSON.stringify(header));
  const bodyPart = base64url(JSON.stringify(body));
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(`${headerPart}.${bodyPart}`)
    .digest("base64url");
  return `${headerPart}.${bodyPart}.${signature}`;
}

function verify(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, bodyPart, signature] = parts;
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(`${headerPart}.${bodyPart}`)
    .digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const payload = JSON.parse(Buffer.from(bodyPart, "base64url").toString("utf8"));
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
  return payload;
}

// Refresh tokens are NOT JWTs — just high-entropy random bytes. Only their
// SHA-256 hash is ever stored (in the refresh_tokens table); the raw value
// exists only in the httpOnly cookie on the client, so a database leak alone
// can't be used to forge a session (same principle as password hashing).
function generateRefreshToken() {
  return crypto.randomBytes(48).toString("base64url");
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = {
  hashPassword, verifyPassword, sign, verify,
  generateRefreshToken, hashRefreshToken,
  ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS,
};
