import React, { useEffect, useState } from "react";

export default function SmsOtpVerification({
  phone,
  purpose = "registration",
  apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  onVerified,
}) {
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setInterval(() => setSeconds((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  async function sendOtp() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`${apiBaseUrl}/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, purpose }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to send OTP.");

      setSent(true);
      setSeconds(data.expiresInSeconds || 300);
      setMessage("OTP sent to your mobile number.");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`${apiBaseUrl}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp, purpose }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Invalid OTP.");

      setMessage("Mobile number verified.");
      onVerified?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sms-otp-card">
      <div className="sms-otp-header">
        <strong>Verify mobile number</strong>
        <span>{seconds > 0 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : ""}</span>
      </div>

      {!sent ? (
        <button type="button" onClick={sendOtp} disabled={loading || !phone}>
          {loading ? "Sending..." : "Send OTP"}
        </button>
      ) : (
        <>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            placeholder="Enter 6-digit OTP"
            aria-label="6-digit OTP"
          />
          <div className="sms-otp-actions">
            <button type="button" onClick={verify} disabled={loading || otp.length !== 6}>
              {loading ? "Verifying..." : "Verify OTP"}
            </button>
            <button type="button" onClick={sendOtp} disabled={loading || seconds > 0}>
              Resend OTP
            </button>
          </div>
        </>
      )}

      {message && <p className="sms-otp-success">{message}</p>}
      {error && <p className="sms-otp-error">{error}</p>}
    </div>
  );
}
