// sms.js — sends (and logs) every outbound notification: login OTPs, the
// parent/guardian leave-approval link, and the final approved-leave alert.
//
// Ships with a MOCK sender (console log + sms_logs row) so the whole flow
// works with zero external accounts. To go live, replace the body of
// `sendMessage` with a real provider call (Twilio/MSG91/Fast2SMS for SMS,
// SendGrid/SES/nodemailer for email) and keep the same signature — every
// caller and the logging table stay unchanged.

const { db } = require("./db");
const { sendEmail, isConfigured } = require("./mailer");

async function sendMessage(destination, message) {
  // --- Real SMS provider example (Twilio), for reference ---
  // const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
  //   method: "POST",
  //   headers: {
  //     Authorization: "Basic " + Buffer.from(`${SID}:${AUTH_TOKEN}`).toString("base64"),
  //     "Content-Type": "application/x-www-form-urlencoded",
  //   },
  //   body: new URLSearchParams({ To: destination, From: TWILIO_NUMBER, Body: message }),
  // });
  // return resp.ok ? "sent" : "failed";
  //
  // --- Real email provider example (SendGrid), for reference ---
  // await fetch("https://api.sendgrid.com/v3/mail/send", { ... });

  console.log(`[notify mock] -> ${destination}: ${message}`);
  return "sent";
}

// Backwards-compatible alias used elsewhere in the codebase.
const sendSms = sendMessage;

async function logNotification({ leavePassId = null, recipientType, destination, message, status }) {
  await db.prepare(`
    INSERT INTO sms_logs (leave_pass_id, recipient_type, phone_number, message, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(leavePassId, recipientType, destination, message, status);
}

/** Sends a login OTP to a student or admin's email/mobile — real Gmail SMTP for email, mocked SMS for phone numbers. */
async function sendOtp(destination, code, purposeLabel) {
  const subject = `Hosteliq — your ${purposeLabel} verification code`;
  const message = `Your ${purposeLabel} verification code is ${code}. It expires in 5 minutes. Do not share this code with anyone.`;
  let status;

  if (destination.includes("@")) {
    if (!isConfigured()) {
      console.error(`[email OTP] No email provider configured — cannot email ${destination}. Set BREVO_API_KEY+BREVO_SENDER_EMAIL or GMAIL_USER+GMAIL_APP_PASSWORD (see mailer.js).`);
      status = "failed";
    } else {
      try {
        await sendEmail({ to: destination, subject, text: message });
        status = "sent";
      } catch (err) {
        console.error(`[email OTP] failed to send to ${destination}: ${err.message}`);
        status = "failed";
      }
    }
  } else {
    // Phone-number OTPs still go through the mock SMS sender — wire in Twilio/MSG91/etc.
    // here the same way mailer.js wires in Gmail, using this destination as the phone number.
    status = await sendMessage(destination, message);
  }

  // Operational visibility for the person running the server during local development
  // and QA — never returned via the API, and never logged when NODE_ENV=production.
  if (process.env.NODE_ENV !== "production") {
    console.log(`[OTP DEBUG — non-production only] ${purposeLabel} code for ${destination}: ${code}`);
  }

  await logNotification({ recipientType: `otp:${purposeLabel}`, destination, message, status });
  return status;
}

/** Sends the parent/guardian an approval link (+ the code, for an OTP-style fallback) when a student applies for leave. */
async function notifyParentApprovalRequest(leavePass, student, appBaseUrl) {
  const message =
    `Hosteliq: ${student.name} (${student.enrollment_no}) has requested a hostel leave pass ` +
    `to ${leavePass.destination || "an unspecified destination"} from ${leavePass.leave_datetime} to ${leavePass.return_datetime}. ` +
    `Reason: ${leavePass.reason}. Review and respond: ${appBaseUrl}/parent-approval/${leavePass.parent_token}`;

  const recipients = [
    { type: "father", destination: student.father_mobile },
    { type: "mother", destination: student.mother_mobile },
    { type: "guardian", destination: student.guardian_mobile },
  ].filter((r) => r.destination);

  const results = [];
  for (const r of recipients) {
    let status;
    try {
      status = await sendMessage(r.destination, message);
    } catch {
      status = "failed";
    }
    await logNotification({ leavePassId: leavePass.id, recipientType: `parent_approval:${r.type}`, destination: r.destination, message, status });
    results.push({ ...r, status });
  }
  return results;
}

/** Sends the final confirmation once BOTH admin and parent have approved the leave. */
async function notifyGuardiansOfLeave(leavePass, student) {
  const message =
    `Hosteliq: ${student.name} (${student.enrollment_no}, Block ${student.block_number}-${student.room_number}) ` +
    `has a fully approved leave pass to ${leavePass.destination || "the stated destination"}. ` +
    `Out: ${leavePass.leave_datetime}. Expected return: ${leavePass.return_datetime}. Reason: ${leavePass.reason}.`;

  const recipients = [
    { type: "father", destination: student.father_mobile },
    { type: "mother", destination: student.mother_mobile },
    { type: "guardian", destination: student.guardian_mobile },
  ].filter((r) => r.destination);

  const results = [];
  for (const r of recipients) {
    let status;
    try {
      status = await sendMessage(r.destination, message);
    } catch {
      status = "failed";
    }
    await logNotification({ leavePassId: leavePass.id, recipientType: r.type, destination: r.destination, message, status });
    results.push({ ...r, status });
  }
  return results;
}

module.exports = { sendSms, sendMessage, sendOtp, notifyParentApprovalRequest, notifyGuardiansOfLeave };
