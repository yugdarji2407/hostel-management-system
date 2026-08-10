const { verify } = require("../auth");
const { db } = require("../db");

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = verify(token);
  if (!payload) return res.json(401, { error: "Not authenticated. Please sign in again." });

  // tokenVersion revocation check: a password reset (or future "log out
  // everywhere" action) bumps users.token_version, which immediately
  // invalidates every access token issued before that point — even though
  // they're otherwise still cryptographically valid and unexpired.
  if (payload.role !== "security") {
    const current = await db.prepare("SELECT token_version FROM users WHERE id = ?").get(payload.userId);
    if (!current || (payload.tokenVersion ?? 0) !== current.token_version) {
      return res.json(401, { error: "Your session is no longer valid. Please sign in again." });
    }
  }

  req.user = payload; // { userId, role, studentId?, tokenVersion }
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.json(403, { error: `Only ${roles.join(" or ")} can do this.` });
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole };
