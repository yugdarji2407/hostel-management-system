// googleAuth.js — verifies Google Sign-In ID tokens using only Node's built-in
// crypto and fetch (Node >= 22.5, same as the rest of this backend — no
// google-auth-library dependency needed).
//
// How it works: the frontend uses Google Identity Services to get a signed
// ID token (a JWT) straight from Google. We NEVER trust that token blindly —
// we re-verify its RS256 signature ourselves against Google's public keys,
// then check issuer/audience/expiry, before trusting anything inside it.

const crypto = require("node:crypto");

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

let jwksCache = { keys: [], expiresAt: 0 };

async function getGoogleJwks() {
  if (Date.now() < jwksCache.expiresAt && jwksCache.keys.length) return jwksCache.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error("Unable to fetch Google signing keys.");
  const { keys } = await res.json();
  // Google rotates these keys infrequently; caching for an hour avoids
  // hitting their endpoint on every single login.
  jwksCache = { keys, expiresAt: Date.now() + 60 * 60 * 1000 };
  return keys;
}

function base64urlDecode(str) {
  return Buffer.from(str, "base64url");
}

/**
 * Verifies a Google-issued ID token (JWT) end-to-end: signature, issuer,
 * audience, and expiry. Throws on any failure. Returns the decoded payload
 * (sub, email, email_verified, name, picture, ...) on success.
 */
async function verifyGoogleIdToken(idToken, clientId) {
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured on the server.");
  if (!idToken || typeof idToken !== "string") throw new Error("Missing Google credential.");

  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Malformed Google credential.");
  const [headerPart, payloadPart, signaturePart] = parts;

  const header = JSON.parse(base64urlDecode(headerPart).toString("utf8"));
  const payload = JSON.parse(base64urlDecode(payloadPart).toString("utf8"));

  if (header.alg !== "RS256") throw new Error("Unexpected token signing algorithm.");

  const keys = await getGoogleJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("Google signing key not found (try again — keys may have rotated).");

  const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const signature = base64urlDecode(signaturePart);
  const signedData = `${headerPart}.${payloadPart}`;
  const valid = crypto.verify("RSA-SHA256", Buffer.from(signedData), publicKey, signature);
  if (!valid) throw new Error("Invalid Google credential signature.");

  if (!ISSUERS.has(payload.iss)) throw new Error("Unexpected token issuer.");
  if (payload.aud !== clientId) throw new Error("Token was not issued for this application.");
  if (!payload.exp || Math.floor(Date.now() / 1000) > payload.exp) throw new Error("Google credential has expired.");
  if (payload.email_verified !== true && payload.email_verified !== "true") {
    throw new Error("Google account email is not verified.");
  }

  return payload; // { sub, email, email_verified, name, picture, ... }
}

module.exports = { verifyGoogleIdToken };
