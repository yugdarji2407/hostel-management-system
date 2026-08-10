// rateLimit.js — simple in-memory fixed-window rate limiter, since
// express-rate-limit isn't available (no network access here). Keyed by
// client IP + route. Good enough for a single-process deployment; swap for
// a Redis-backed limiter if this ever runs behind multiple instances.

const buckets = new Map(); // key -> { count, resetAt }

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

/** windowMs: e.g. 15*60*1000. max: requests allowed per window. */
function rateLimit(name, { windowMs, max }) {
  return (req, res, next) => {
    const key = `${name}:${clientIp(req)}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.json(429, { error: "Too many requests. Please wait a moment and try again." });
    }
    return next();
  };
}

// Periodic cleanup so the map doesn't grow unbounded over a long-running process.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref();

module.exports = { rateLimit, clientIp };
