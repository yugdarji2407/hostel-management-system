// router.js — a small Express-like router built on Node's http module.
const fs = require("node:fs");
const path = require("node:path");
const { parseCookies } = require("./cookies");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

class Router {
  // staticDir: absolute path to a built frontend (e.g. frontend/dist).
  // Any GET request that doesn't match an API route, and isn't under /api,
  // is served from there — with index.html as the SPA fallback so client-side
  // routing (if any is added later) still works on refresh.
  constructor({ staticDir } = {}) {
    this.routes = []; // { method, pattern: RegExp, keys: string[], handlers: fn[] }
    this.staticDir = staticDir || null;
  }

  _add(method, path, handlers) {
    const keys = [];
    const pattern = new RegExp(
      "^" +
        path
          .replace(/\/:([^/]+)/g, (_, key) => {
            keys.push(key);
            return "/([^/]+)";
          })
          .replace(/\//g, "\\/") +
        "$"
    );
    this.routes.push({ method, pattern, keys, handlers });
  }

  get(path, ...handlers) { this._add("GET", path, handlers); }
  post(path, ...handlers) { this._add("POST", path, handlers); }
  put(path, ...handlers) { this._add("PUT", path, handlers); }
  delete(path, ...handlers) { this._add("DELETE", path, handlers); }

  async handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);
    req.query = Object.fromEntries(url.searchParams.entries());
    req.cookies = parseCookies(req.headers.cookie);

    // ---- Security headers (Helmet-equivalent, hand-rolled — no dependency available) ----
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY"); // clickjacking
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data: https://*.googleusercontent.com; " +
      "script-src 'self' https://accounts.google.com; " +
      "style-src 'self' 'unsafe-inline'; " +
      "connect-src 'self' https://accounts.google.com; " +
      "frame-src https://accounts.google.com"
    );
    if (this.staticDir) {
      // Only relevant once this process is also serving HTTPS traffic (e.g. behind a TLS-terminating proxy).
      res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
    }

    // ---- CORS ----
    // Credentialed requests (the refresh-token cookie) can't use a wildcard
    // origin — browsers reject that combination — so the configured
    // frontend origin is reflected back explicitly instead.
    const allowedOrigin = process.env.FRONTEND_URL || req.headers.origin || "*";
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    if (allowedOrigin !== "*") {
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    for (const route of this.routes) {
      if (route.method !== req.method) continue;
      const match = pathname.match(route.pattern);
      if (!match) continue;

      req.params = {};
      route.keys.forEach((key, i) => (req.params[key] = match[i + 1]));
      req.body = await parseBody(req);

      res.json = (status, data) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };

      try {
        let i = 0;
        const next = async () => {
          const handler = route.handlers[i++];
          if (handler) await handler(req, res, next);
        };
        await next();
      } catch (err) {
        console.error(err);
        if (!res.writableEnded) res.json(500, { error: "Internal server error" });
      }
      return;
    }

    // No API route matched — try serving the built frontend.
    if (this.staticDir && req.method === "GET" && !pathname.startsWith("/api")) {
      const served = this._serveStatic(pathname, res);
      if (served) return;
    }

    res.json = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    res.json(404, { error: "Not found" });
  }

  _serveStatic(pathname, res) {
    const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    let filePath = path.join(this.staticDir, safePath);

    // Directory or no extension → fall back to index.html (SPA entry point).
    if (!path.extname(filePath)) {
      filePath = path.join(this.staticDir, "index.html");
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(this.staticDir, "index.html");
    }
    if (!fs.existsSync(filePath)) return false;

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
    return true;
  }
}

function parseBody(req) {
  return new Promise((resolve) => {
    if (req.method === "GET" || req.method === "DELETE") return resolve({});
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

module.exports = { Router };
