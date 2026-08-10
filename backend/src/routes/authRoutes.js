const { db, ADMIN_EMAIL } = require("../db");
const {
  verifyPassword, hashPassword, sign,
  generateRefreshToken, hashRefreshToken, REFRESH_TOKEN_TTL_SECONDS,
} = require("../auth");
const { requireAuth } = require("../middleware/auth");
const { verifyOtp: verifyChannelOtp, issueOtp, normalizeEmail } = require("../services/otpService");
const { serializeCookie, clearCookie, isHttps } = require("../cookies");
const { rateLimit } = require("../rateLimit");
const { verifyGoogleIdToken } = require("../googleAuth");

const REFRESH_COOKIE = "hms_refresh";
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;

const PROFILE_SELECT = `
  SELECT s.*, b.block_number AS block, r.room_number AS room,
         u.email, u.mobile
  FROM students s
  JOIN users u ON u.id = s.user_id
  LEFT JOIN blocks b ON b.id = s.block_id
  LEFT JOIN rooms r ON r.id = s.room_id
  WHERE s.user_id = ?
`;

async function audit(req, action, { userId = null, role = null, entityType = null, entityId = null, details = null } = {}) {
  try {
    await db.prepare(`
      INSERT INTO audit_logs (user_id, role, action, entity_type, entity_id, details, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId, role, action, entityType, entityId,
      details ? JSON.stringify(details) : null,
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || null,
      req.headers["user-agent"] || null
    );
  } catch (err) {
    console.error("audit log write failed:", err.message);
  }
}

function isLocked(user) {
  return user.locked_until && new Date(user.locked_until).getTime() > Date.now();
}

async function recordFailedAttempt(userId) {
  const user = await db.prepare("SELECT failed_attempts FROM users WHERE id = ?").get(userId);
  const attempts = (user?.failed_attempts || 0) + 1;
  if (attempts >= LOCKOUT_THRESHOLD) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
    await db.prepare("UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?").run(attempts, lockedUntil, userId);
    return { locked: true, lockedUntil };
  }
  await db.prepare("UPDATE users SET failed_attempts = ? WHERE id = ?").run(attempts, userId);
  return { locked: false };
}

async function clearFailedAttempts(userId) {
  await db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = now_text() WHERE id = ?").run(userId);
}

/** Issues an access token + rotates a refresh-token cookie for a successful login/registration. */
async function issueSession(req, res, user, status = 200) {
  let profile = null;
  if (user.role === "student") profile = await db.prepare(PROFILE_SELECT).get(user.id);

  const accessToken = sign({
    userId: user.id,
    role: user.role,
    studentId: profile ? profile.id : undefined,
    tokenVersion: user.token_version || 0,
  });

  const refreshToken = generateRefreshToken();
  await db.prepare(`
    INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    user.id, hashRefreshToken(refreshToken),
    req.headers["user-agent"] || null,
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || null,
    new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString()
  );

  res.setHeader("Set-Cookie", serializeCookie(REFRESH_COOKIE, refreshToken, {
    maxAgeSeconds: REFRESH_TOKEN_TTL_SECONDS,
    path: "/api/auth",
    httpOnly: true,
    secure: isHttps(req),
    sameSite: "Strict",
  }));

  res.json(status, {
    token: accessToken,
    user: { id: user.id, role: user.role, email: user.email, mobile: user.mobile },
    profile,
  });
}

function findStudentUserByIdentifier(identifier) {
  const trimmed = identifier.trim();
  return db.prepare(`
    SELECT u.* FROM users u
    JOIN students s ON s.user_id = u.id
    WHERE u.role = 'student' AND (LOWER(u.email) = LOWER(?) OR u.mobile = ? OR s.enrollment_no = ?)
  `).get(trimmed, trimmed, trimmed);
}

function register(router) {
  // ---------- Registration — NO OTP required, per current policy ----------
  router.post("/api/auth/register", rateLimit("register", { windowMs: 15 * 60 * 1000, max: 20 }), async (req, res) => {
    const {
      enrollment, name, email, mobile, password,
      father, fatherPhone, mother, motherPhone, guardian, guardianPhone,
      course, branch, semester,
    } = req.body;

    if (!enrollment || !name || !email || !mobile || !password) {
      return res.json(400, { error: "Enrollment number, name, email, mobile number and password are required." });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.json(400, { error: "Enter a valid email address." });
    if (mobile.replace(/\D/g, "").length < 10) return res.json(400, { error: "Enter a valid mobile number." });
    if (password.length < 8) return res.json(400, { error: "Password must be at least 8 characters." });

    try {
      const { hash, salt } = hashPassword(password);
      const createdUserId = await db.transaction(async (tx) => {
        const userInfo = await tx
          .prepare("INSERT INTO users (role, email, mobile, password_hash, password_salt) VALUES ('student', ?, ?, ?, ?)")
          .run(email.trim().toLowerCase(), mobile.trim(), hash, salt);

        await tx.prepare(`
          INSERT INTO students
            (user_id, enrollment_no, name, father_name, father_mobile, mother_name, mother_mobile,
             guardian_name, guardian_mobile, course, branch, semester)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          Number(userInfo.lastInsertRowid), enrollment.trim(), name.trim(),
          father || null, fatherPhone || null, mother || null, motherPhone || null,
          guardian || null, guardianPhone || null, course || null, branch || null, semester || null
        );
        return Number(userInfo.lastInsertRowid);
      });

      await audit(req, "register", { userId: createdUserId, role: "student" });
      res.json(201, { message: "Account created successfully. You can now sign in.", identifier: email.trim().toLowerCase() });
    } catch (err) {
      // Postgres reports uniqueness violations differently from SQLite —
      // code 23505, not a "UNIQUE" substring in the message.
      if (err.code === "23505" || String(err.message).includes("UNIQUE")) {
        return res.json(409, { error: "Enrollment number, email, or mobile number is already registered." });
      }
      console.error(err);
      res.json(500, { error: "Unable to create the student account." });
    }
  });

  // ---------- Mobile/enrollment login: password, no OTP ----------
  // Email identifiers are deliberately rejected here for students — they
  // must use /api/auth/login/email-otp instead (see below).
  router.post("/api/auth/login", rateLimit("login", { windowMs: 15 * 60 * 1000, max: 20 }), async (req, res) => {
    const { identifier, password, role = "student" } = req.body;
    if (!identifier || !password) return res.json(400, { error: "Login identifier and password are required." });
    const trimmed = identifier.trim();

    let user;
    if (role === "admin") {
      user = await db.prepare("SELECT * FROM users WHERE role = 'admin' AND email = ?").get(trimmed.toLowerCase());
    } else if (role === "security") {
      const security = await db.prepare("SELECT id,name,email,password_hash,password_salt FROM security_users WHERE email = ?").get(trimmed.toLowerCase());
      if (!security || !verifyPassword(password, security.password_hash, security.password_salt)) {
        await audit(req, "login_failed", { role: "security", details: { identifier: trimmed } });
        return res.json(401, { error: "Incorrect security login details." });
      }
      const token = sign({ userId: security.id, role: "security", securityId: security.id });
      await audit(req, "login_success", { userId: security.id, role: "security" });
      return res.json(200, { token, user: { id: security.id, role: "security", email: security.email, mobile: null }, profile: { name: security.name } });
    } else {
      if (trimmed.includes("@")) {
        return res.json(400, { error: "Email accounts must sign in with a one-time code — use email login instead of a password." });
      }
      user = await findStudentUserByIdentifier(trimmed);
    }

    if (!user) {
      await audit(req, "login_failed", { role, details: { identifier: trimmed, reason: "no_such_account" } });
      return res.json(401, { error: "Incorrect login details." });
    }
    if (isLocked(user)) {
      await audit(req, "login_blocked_locked", { userId: user.id, role: user.role });
      return res.json(423, { error: `Account temporarily locked after repeated failed attempts. Try again after ${new Date(user.locked_until).toLocaleTimeString()}.` });
    }
    if (!verifyPassword(password, user.password_hash, user.password_salt)) {
      const result = await recordFailedAttempt(user.id);
      await audit(req, "login_failed", { userId: user.id, role: user.role, details: { reason: "bad_password", locked: result.locked } });
      if (result.locked) {
        return res.json(423, { error: `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.` });
      }
      return res.json(401, { error: "Incorrect login details." });
    }

    await clearFailedAttempts(user.id);
    await audit(req, "login_success", { userId: user.id, role: user.role });
    await issueSession(req, res, user);
  });

  // ---------- Email login, step 1: send OTP (reuses /api/otp/send under the hood via the shared service) ----------
  router.post("/api/auth/login/email-otp/request", rateLimit("email-otp", { windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.json(400, { error: "Email is required." });
    const user = await db.prepare("SELECT id FROM users WHERE LOWER(email) = ?").get(email);
    // Same response whether or not the account exists, so this endpoint can't be used to enumerate registered emails.
    if (user) {
      try {
        await issueOtp(db, "email", email, "login");
      } catch (err) {
        if (err.code !== "OTP_COOLDOWN") console.error(err);
      }
    }
    res.json(200, { message: "If that email is registered, a one-time code has been sent." });
  });

  // ---------- Email login, step 2: verify OTP and issue a session ----------
  router.post("/api/auth/login/email-otp/verify", rateLimit("email-otp", { windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || "").trim();
    if (!email || !otp) return res.json(400, { error: "Email and OTP are required." });

    const result = await verifyChannelOtp(db, "email", email, "login", otp);
    if (!result.ok) {
      await audit(req, "login_failed", { role: "student", details: { identifier: email, reason: "bad_otp" } });
      return res.json(401, result);
    }

    const user = await db.prepare("SELECT * FROM users WHERE LOWER(email) = ?").get(email);
    if (!user) return res.json(404, { error: "Account not found." });

    await clearFailedAttempts(user.id);
    await audit(req, "login_success", { userId: user.id, role: user.role, details: { method: "email_otp" } });
    await issueSession(req, res, user);
  });

  // ---------- Google Sign-In ----------
  // We never create an account from a Google token alone (the spec requires a
  // full student profile — enrollment number, block, course, etc. — that
  // Google can't supply). Google Sign-In only works for an email that already
  // has an account here: first successful use auto-links it (safe, because
  // Google has already verified that email belongs to whoever is signing in);
  // every later sign-in with that same Google account just logs straight in.
  router.post("/api/auth/google", rateLimit("google-auth", { windowMs: 15 * 60 * 1000, max: 20 }), async (req, res) => {
    const { credential } = req.body || {};
    if (!credential) return res.json(400, { error: "Missing Google credential." });

    let payload;
    try {
      payload = await verifyGoogleIdToken(credential, process.env.GOOGLE_CLIENT_ID);
    } catch (err) {
      audit(req, "login_failed", { role: "google", details: { reason: "bad_google_token", message: err.message } });
      return res.json(401, { error: err.message || "Could not verify Google sign-in." });
    }

    const email = String(payload.email || "").trim().toLowerCase();

    // Already linked — straight login.
    let user = await db.prepare("SELECT * FROM users WHERE google_id = ?").get(payload.sub);

    // First time with this Google account — link it to a matching existing
    // account by verified email, for both students and admin.
    if (!user && email) {
      const existing = await db.prepare("SELECT * FROM users WHERE LOWER(email) = ?").get(email);
      if (existing) {
        await db.prepare("UPDATE users SET google_id = ?, auth_provider = 'linked' WHERE id = ?").run(payload.sub, existing.id);
        user = await db.prepare("SELECT * FROM users WHERE id = ?").get(existing.id);
        await audit(req, "google_account_linked", { userId: existing.id, role: existing.role });
      }
    }

    if (!user) {
      // No matching account — hand back enough info for the frontend to
      // pre-fill the registration form; nothing is created yet.
      return res.json(404, {
        error: "No account found for this Google account. Please register first.",
        code: "NO_ACCOUNT",
        googleEmail: email,
        googleName: payload.name || "",
      });
    }
    if (isLocked(user)) {
      await audit(req, "login_blocked_locked", { userId: user.id, role: user.role });
      return res.json(423, { error: `Account temporarily locked after repeated failed attempts. Try again after ${new Date(user.locked_until).toLocaleTimeString()}.` });
    }

    await clearFailedAttempts(user.id);
    await audit(req, "login_success", { userId: user.id, role: user.role, details: { method: "google" } });
    await issueSession(req, res, user);
  });

  // ---------- Forgot password: request OTP ----------
  router.post("/api/auth/forgot-password", rateLimit("forgot-password", { windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.json(400, { error: "Email is required." });
    const user = await db.prepare("SELECT id FROM users WHERE LOWER(email) = ?").get(email);
    if (user) {
      try {
        await issueOtp(db, "email", email, "forgot-password");
        await audit(req, "password_reset_requested", { userId: user.id });
      } catch (err) {
        if (err.code !== "OTP_COOLDOWN") console.error(err);
      }
    }
    // Same response either way — don't reveal whether the email is registered.
    res.json(200, { message: "If that email is registered, a password reset code has been sent." });
  });

  // ---------- Forgot password: verify OTP + set new password ----------
  router.post("/api/auth/reset-password", rateLimit("forgot-password", { windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || "").trim();
    const newPassword = req.body?.newPassword;
    if (!email || !otp || !newPassword) return res.json(400, { error: "Email, OTP and new password are required." });
    if (newPassword.length < 8) return res.json(400, { error: "Password must be at least 8 characters." });

    const result = await verifyChannelOtp(db, "email", email, "forgot-password", otp);
    if (!result.ok) return res.json(401, result);

    const user = await db.prepare("SELECT * FROM users WHERE LOWER(email) = ?").get(email);
    if (!user) return res.json(404, { error: "Account not found." });

    const { hash, salt } = hashPassword(newPassword);
    // Bumping token_version invalidates every access token issued before this
    // point, and every refresh token is revoked below — a full "log out everywhere".
    await db.prepare("UPDATE users SET password_hash = ?, password_salt = ?, token_version = token_version + 1, failed_attempts = 0, locked_until = NULL WHERE id = ?")
      .run(hash, salt, user.id);
    await db.prepare("UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?").run(user.id);

    await audit(req, "password_reset_completed", { userId: user.id, role: user.role });
    res.json(200, { message: "Password updated. Please sign in with your new password." });
  });

  // ---------- Refresh: mint a new access token from the httpOnly refresh cookie, rotating it ----------
  router.post("/api/auth/refresh", async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw) return res.json(401, { error: "No refresh session found. Please sign in again." });

    const tokenHash = hashRefreshToken(raw);
    const row = await db.prepare("SELECT * FROM refresh_tokens WHERE token_hash = ?").get(tokenHash);
    if (!row || row.revoked || new Date(row.expires_at).getTime() < Date.now()) {
      res.setHeader("Set-Cookie", clearCookie(REFRESH_COOKIE, { path: "/api/auth" }));
      return res.json(401, { error: "Session expired. Please sign in again." });
    }

    const user = await db.prepare("SELECT * FROM users WHERE id = ?").get(row.user_id);
    if (!user) return res.json(401, { error: "Account not found." });

    // Rotate: revoke the token that was just used and issue a brand new one.
    // A reused (already-revoked) refresh token is a strong signal of theft;
    // issueSession() below creates the replacement.
    await db.prepare("UPDATE refresh_tokens SET revoked = 1 WHERE id = ?").run(row.id);
    await issueSession(req, res, user);
  });

  // ---------- Logout: revoke the current refresh token and clear the cookie ----------
  router.post("/api/auth/logout", requireAuth, async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (raw) {
      await db.prepare("UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?").run(hashRefreshToken(raw));
    }
    res.setHeader("Set-Cookie", clearCookie(REFRESH_COOKIE, { path: "/api/auth" }));
    await audit(req, "logout", { userId: req.user.userId, role: req.user.role });
    res.json(200, { success: true });
  });

  router.get("/api/auth/me", requireAuth, async (req, res) => {
    if (req.user.role === "security") {
      const security = await db.prepare("SELECT id,email FROM security_users WHERE id=?").get(req.user.userId);
      if (!security) return res.json(404, { error: "Security account not found." });
      return res.json(200, { user: { id: security.id, role: "security", email: security.email, mobile: null }, profile: await db.prepare("SELECT name FROM security_users WHERE id=?").get(security.id) });
    }
    const user = await db.prepare("SELECT id, role, email, mobile FROM users WHERE id = ?").get(req.user.userId);
    if (!user) return res.json(404, { error: "User not found." });
    const profile = user.role === "student" ? await db.prepare(PROFILE_SELECT).get(user.id) : null;
    res.json(200, { user, profile });
  });

  // Kept for backwards compatibility with older clients — registration moved to /api/auth/register.
  router.post("/api/auth/signup", (req, res) => res.json(410, { error: "This endpoint moved to /api/auth/register." }));
}

module.exports = { register };
