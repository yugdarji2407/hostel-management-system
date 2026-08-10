// mailer.js — sends real email through either Brevo's REST API or Gmail's
// SMTP server, whichever is configured. Both are implemented with zero
// external dependencies (Brevo via plain `fetch`, Gmail via raw SMTP over
// Node's built-in `tls` module) — no nodemailer / SDK needed for either.
//
// Which one is used: sendEmail() tries Brevo first if BREVO_API_KEY is set,
// otherwise falls back to Gmail if GMAIL_USER/GMAIL_APP_PASSWORD are set,
// otherwise rejects (caller — see sms.js — treats that as a delivery
// failure and logs it; it never throws the whole request).
//
// ---- Option A: Brevo (recommended — simple REST call, no TLS handshake) ----
//   1. Sign in at https://app.brevo.com, go to Settings -> SMTP & API -> API Keys.
//   2. Create a key, then set:
//        BREVO_API_KEY=xkeysib-...
//        BREVO_SENDER_EMAIL=youraddress@example.com   (must be a verified sender in Brevo)
//
// ---- Option B: Gmail SMTP ----
//   1. Enable 2-Step Verification on the sending Gmail account.
//   2. Create an "App Password" at https://myaccount.google.com/apppasswords
//      (choose "Mail" / "Other", 16 characters, no spaces).
//   3. Set:
//        GMAIL_USER=youraddress@gmail.com
//        GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx

const tls = require("node:tls");
const readline = require("node:readline");

const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 465; // implicit TLS

function base64(str) {
  return Buffer.from(str, "utf8").toString("base64");
}

function isBrevoConfigured() {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
}

function isGmailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function isConfigured() {
  return isBrevoConfigured() || isGmailConfigured();
}

/** Sends via Brevo's transactional email REST API — a single POST, no SDK. */
async function sendBrevoEmail({ to, subject, text }) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: process.env.BREVO_SENDER_EMAIL, name: "Hosteliq" },
      to: [{ email: to }],
      subject,
      textContent: text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo API responded ${res.status}: ${body.slice(0, 300)}`);
  }
  return true;
}

/** Picks whichever provider is configured (Brevo preferred) and sends through it. */
async function sendEmail({ to, subject, text }) {
  if (isBrevoConfigured()) return sendBrevoEmail({ to, subject, text });
  if (isGmailConfigured()) return sendGmailEmail({ to, subject, text });
  throw new Error("Email is not configured: set BREVO_API_KEY + BREVO_SENDER_EMAIL, or GMAIL_USER + GMAIL_APP_PASSWORD.");
}

function sendGmailEmail({ to, subject, text }) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return Promise.reject(new Error("Email is not configured: set GMAIL_USER and GMAIL_APP_PASSWORD."));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      err ? reject(err) : resolve(true);
    };

    const socket = tls.connect({ host: SMTP_HOST, port: SMTP_PORT, servername: SMTP_HOST });
    socket.setTimeout(15000, () => finish(new Error("SMTP connection timed out")));
    socket.on("error", (err) => finish(new Error(`SMTP connection error: ${err.message}`)));

    const rl = readline.createInterface({ input: socket });
    const send = (line) => socket.write(line + "\r\n");

    const message =
      `From: Hosteliq <${user}>\r\n` +
      `To: ${to}\r\n` +
      `Subject: ${subject}\r\n` +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\n` +
      `\r\n${text}\r\n`;

    let stage = "connect";

    rl.on("line", (line) => {
      const code = line.slice(0, 3);
      const continues = line[3] === "-"; // multi-line SMTP replies use "250-" until the final "250 "
      if (continues) return;

      const fail = (label) => finish(new Error(`${label} failed: ${line}`));

      switch (stage) {
        case "connect":
          send("EHLO hosteliq.local");
          stage = "ehlo";
          break;
        case "ehlo":
          if (!code.startsWith("2")) return fail("EHLO");
          send("AUTH LOGIN");
          stage = "auth_login";
          break;
        case "auth_login":
          if (!code.startsWith("3")) return fail("AUTH LOGIN");
          send(base64(user));
          stage = "auth_user";
          break;
        case "auth_user":
          if (!code.startsWith("3")) return fail("AUTH (username)");
          send(base64(pass));
          stage = "auth_pass";
          break;
        case "auth_pass":
          if (!code.startsWith("2")) return fail("Authentication");
          send(`MAIL FROM:<${user}>`);
          stage = "mail_from";
          break;
        case "mail_from":
          if (!code.startsWith("2")) return fail("MAIL FROM");
          send(`RCPT TO:<${to}>`);
          stage = "rcpt_to";
          break;
        case "rcpt_to":
          if (!code.startsWith("2")) return fail("RCPT TO");
          send("DATA");
          stage = "data";
          break;
        case "data":
          if (!code.startsWith("3")) return fail("DATA");
          socket.write(message + ".\r\n");
          stage = "sent";
          break;
        case "sent":
          if (!code.startsWith("2")) return fail("Message submission");
          send("QUIT");
          finish();
          break;
      }
    });
  });
}

module.exports = { sendEmail, sendGmailEmail, sendBrevoEmail, isConfigured };
