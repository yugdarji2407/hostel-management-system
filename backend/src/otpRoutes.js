const { issueOtp, verifyOtp, normalizePhone, normalizeEmail } = require("./services/otpService");
const { rateLimit } = require("./rateLimit");

function register(router, db) {
  router.post("/api/otp/send", rateLimit("otp-send", { windowMs: 15 * 60 * 1000, max: 15 }), async (req, res) => {
    try {
      const channel = String(req.body?.channel || "phone").toLowerCase();
      const destination = channel === "email" ? normalizeEmail(req.body?.destination) : normalizePhone(req.body?.destination);
      const purpose = String(req.body?.purpose || "registration");
      const allowed = new Set(["registration", "forgot-password", "login"]);
      if (!allowed.has(purpose)) return res.json(400, { error: "Invalid OTP purpose." });
      const result = await issueOtp(db, channel, destination, purpose);
      res.json(200, { success: true, message: `OTP sent to your ${channel}.`, expiresInSeconds: result.expiresInSeconds });
    } catch (error) {
      res.json(error.code === "OTP_COOLDOWN" ? 429 : 500, { error: error.message || "Unable to send OTP." });
    }
  });

  router.post("/api/otp/verify", async (req, res) => {
    try {
      const channel = String(req.body?.channel || "phone").toLowerCase();
      const destination = channel === "email" ? normalizeEmail(req.body?.destination) : normalizePhone(req.body?.destination);
      const purpose = String(req.body?.purpose || "registration");
      const otp = String(req.body?.otp || "").trim();
      if (!destination || !otp) return res.json(400, { error: "Destination and OTP are required." });
      const result = await verifyOtp(db, channel, destination, purpose, otp);
      if (!result.ok) return res.json(400, result);
      res.json(200, { success: true, message: `${channel === "email" ? "Email" : "Mobile number"} verified successfully.`, verificationToken: result.verificationToken });
    } catch (error) {
      res.json(400, { error: error.message || "Unable to verify OTP." });
    }
  });
}
module.exports = { register };
