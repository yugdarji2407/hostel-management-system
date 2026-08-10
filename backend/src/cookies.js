// cookies.js — minimal cookie parsing/serialization, since cookie-parser
// isn't available (no network access to npm install it here). Good enough
// for the one job we need: reading/setting the httpOnly refresh-token cookie.

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

/**
 * Builds a Set-Cookie header value.
 * `secure`: pass true only when the request arrived over HTTPS (or via a
 * trusted proxy header) — a Secure cookie is silently dropped by browsers
 * over plain HTTP, which would break local development if forced on.
 */
function serializeCookie(name, value, { maxAgeSeconds, path = "/", httpOnly = true, secure = false, sameSite = "Strict" } = {}) {
  let cookie = `${name}=${encodeURIComponent(value)}; Path=${path}`;
  if (maxAgeSeconds !== undefined) cookie += `; Max-Age=${maxAgeSeconds}`;
  if (httpOnly) cookie += "; HttpOnly";
  if (secure) cookie += "; Secure";
  if (sameSite) cookie += `; SameSite=${sameSite}`;
  return cookie;
}

function clearCookie(name, opts = {}) {
  return serializeCookie(name, "", { ...opts, maxAgeSeconds: 0 });
}

function isHttps(req) {
  return req.headers["x-forwarded-proto"] === "https" || req.socket?.encrypted === true;
}

module.exports = { parseCookies, serializeCookie, clearCookie, isHttps };
