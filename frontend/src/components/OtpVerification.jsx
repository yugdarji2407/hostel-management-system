import React, { useEffect, useMemo, useState } from "react";
import { Mail, Phone, ShieldCheck, Loader2, RefreshCw } from "lucide-react";
import * as api from "../api";

export default function OtpVerification({ email, phone, purpose = "registration", onVerified }) {
  const [channel, setChannel] = useState("email");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [verificationToken, setVerificationToken] = useState("");

  const destination = useMemo(() => channel === "email" ? email : phone, [channel, email, phone]);

  useEffect(() => {
    if (!seconds) return;
    const timer = setInterval(() => setSeconds(v => Math.max(0, v - 1)), 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  function switchChannel(next) {
    if (verified) return;
    setChannel(next); setSent(false); setOtp(""); setSeconds(0); setMessage(""); setError(""); setVerificationToken("");
  }

  async function send() {
    setError(""); setMessage("");
    if (!destination?.trim()) return setError(channel === "email" ? "Enter your email first." : "Enter your mobile number first.");
    setLoading(true);
    try {
      const result = await api.sendOtp(channel, destination, purpose);
      setSent(true); setSeconds(result.expiresInSeconds || 300);
      setMessage(`OTP sent to your ${channel}.`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function verify() {
    setError(""); setMessage("");
    if (otp.length !== 6) return setError("Enter the 6-digit OTP.");
    setLoading(true);
    try {
      const result = await api.verifyOtp(channel, destination, otp, purpose);
      setVerificationToken(result.verificationToken);
      setVerified(true); setMessage(result.message || "Verified successfully.");
      onVerified?.({ channel, destination, verificationToken: result.verificationToken });
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="sms-otp-card">
      <div className="sms-otp-header">
        <div>
          <strong>Verify your contact</strong>
          <p>Choose where you want to receive your OTP.</p>
        </div>
        {verified && <ShieldCheck size={20} />}
      </div>

      <div className="otp-channel-switch">
        <button type="button" className={channel === "email" ? "active" : ""} onClick={() => switchChannel("email")} disabled={verified}>
          <Mail size={16} /> Email
        </button>
        <button type="button" className={channel === "phone" ? "active" : ""} onClick={() => switchChannel("phone")} disabled={verified}>
          <Phone size={16} /> Phone SMS
        </button>
      </div>

      <div className="otp-destination">{destination || (channel === "email" ? "Enter your email above" : "Enter your mobile number above")}</div>

      {!sent && !verified && (
        <button type="button" className="otp-primary" onClick={send} disabled={loading || !destination}>
          {loading ? <><Loader2 size={16} className="spin"/> Sending...</> : <>Send OTP to {channel === "email" ? "Email" : "Phone"}</>}
        </button>
      )}

      {sent && !verified && (
        <>
          <input className="auth-input standalone otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp}
            onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="Enter 6-digit OTP" />
          <div className="otp-meta"><span>{seconds ? `Expires in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "OTP expired"}</span></div>
          <div className="sms-otp-actions">
            <button type="button" className="otp-primary" onClick={verify} disabled={loading || otp.length !== 6}>
              {loading ? <><Loader2 size={16} className="spin"/> Verifying...</> : <><ShieldCheck size={16}/> Verify OTP</>}
            </button>
            <button type="button" className="otp-secondary" onClick={send} disabled={loading || seconds > 0}>
              <RefreshCw size={15}/> Resend
            </button>
          </div>
        </>
      )}

      {verified && <div className="otp-verified"><ShieldCheck size={17}/> {channel === "email" ? "Email" : "Mobile number"} verified</div>}
      {message && !verified && <p className="sms-otp-success">{message}</p>}
      {error && <p className="sms-otp-error">{error}</p>}
    </div>
  );
}
