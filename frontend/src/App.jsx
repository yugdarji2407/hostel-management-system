import React, { useState, useEffect, useCallback } from "react";
import {
  User, Home, FileText, History, Megaphone, Users, Building2,
  CheckCircle2, XCircle, Search, Plus, LogOut, Clock, Send,
  Bell, KeyRound, MapPin, ChevronRight, Menu, X, Loader2, Eye, EyeOff,
  ShieldCheck, Wrench, MessageSquare, CalendarCheck, WalletCards, BarChart3, FileArchive, QrCode
} from "lucide-react";
import * as api from "./api";

// ---------- Small building blocks ----------

function StampBadge({ status }) {
  const styles = {
    Approved: { color: "var(--forest)", label: "APPROVED" },
    Pending: { color: "var(--brass)", label: "PENDING" },
    Rejected: { color: "var(--rust)", label: "REJECTED" },
  }[status] || { color: "var(--slate)", label: status };
  return (
    <div className="stamp" style={{ color: styles.color, borderColor: styles.color }}>
      {styles.label}
    </div>
  );
}

// Leave objects come straight from the API, so fields are the DB column
// names: reason, leave_datetime, return_datetime, status, applied_at,
// student_name, enrollment_no, block, room.
function GatePassSlip({ leave }) {
  return (
    <div className="slip">
      <div className="slip-main">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-xs tracking-wide" style={{ color: "var(--slate)" }}>
            GATE PASS · #{leave.id}
          </span>
          <span className="font-mono text-xs" style={{ color: "var(--slate)" }}>
            applied {leave.applied_at}
          </span>
        </div>
        <p className="font-display text-lg mb-3" style={{ color: "var(--ink)" }}>
          {leave.reason}
        </p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="label-eyebrow">Leaving</div>
            <div className="font-mono">{leave.leave_datetime}</div>
          </div>
          <div>
            <div className="label-eyebrow">Expected return</div>
            <div className="font-mono">{leave.return_datetime}</div>
          </div>
        </div>
        {leave.destination && (
          <div className="mt-2 text-sm" style={{ color: "var(--slate)" }}>
            <span className="label-eyebrow">Destination </span>{leave.destination}
          </div>
        )}
        {leave.student_name && (
          <div className="mt-2 text-sm" style={{ color: "var(--slate)" }}>
            {leave.student_name} · Block {leave.block}, Room {leave.room} · {leave.enrollment_no}
          </div>
        )}
        <div className="flex items-center gap-2 mt-3">
          {leave?.valid && <a className="qr-pass" href={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`HOSTELPASS-${leave.id}`)}`} target="_blank" rel="noreferrer"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=64x64&data=${encodeURIComponent(`HOSTELPASS-${leave.id}`)}`} alt="Gate pass QR"/><span>QR PASS</span></a>}
          <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "var(--paper)", color: "var(--slate)" }}>
            Parent: {leave.parent_status}
          </span>
          {leave.valid && (
            <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "rgba(63,107,79,0.12)", color: "var(--forest)" }}>
              Valid — fully approved
            </span>
          )}
        </div>
      </div>
      <div className="slip-stub">
        <StampBadge status={leave.status} />
      </div>
    </div>
  );
}

function SidebarLink({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors ${active ? "sidebar-active" : "sidebar-link"}`}
    >
      <Icon size={17} />
      <span>{label}</span>
    </button>
  );
}

function StatCard({ label, value, icon: Icon }) {
  return (
    <div className="paper-card p-5 flex items-center justify-between">
      <div>
        <div className="label-eyebrow">{label}</div>
        <div className="font-display text-3xl mt-1" style={{ color: "var(--ink)" }}>{value}</div>
      </div>
      <div className="icon-chip"><Icon size={20} /></div>
    </div>
  );
}

function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="toast">
      <Send size={15} />
      <span>{message}</span>
    </div>
  );
}

function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="mb-4 px-4 py-2 rounded-md text-sm" style={{ background: "rgba(168,68,47,0.1)", color: "var(--rust)", border: "1px solid var(--rust)" }}>
      {message}
    </div>
  );
}

// ---------- Login ----------

// Renders Google's official "Sign in with Google" button (loaded via the
// <script> tag in index.html) and hands the resulting ID token credential
// back to the caller. Silently renders nothing if no client ID is configured
// or the script hasn't loaded yet, rather than throwing.
function GoogleSignInButton({ onCredential }) {
  const containerRef = React.useRef(null);
  // Keep the latest callback in a ref instead of an effect dependency. The
  // caller (AuthenticatedApp) recreates its handler on every render, and if
  // that identity were a dependency here, this effect — and Google's
  // renderButton() — would re-run on every unrelated parent re-render,
  // injecting another button into the container each time.
  const onCredentialRef = React.useRef(onCredential);
  useEffect(() => { onCredentialRef.current = onCredential; }, [onCredential]);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const container = containerRef.current;
    if (!clientId || !container) return;

    let cancelled = false;
    let attempts = 0;

    const tryRender = () => {
      if (cancelled) return;
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => onCredentialRef.current(response.credential),
        });
        // Clear any previously rendered button before rendering a fresh one —
        // renderButton() appends rather than replaces, and this effect can
        // legitimately run more than once (e.g. React StrictMode's
        // mount/cleanup/mount in dev). Without this, duplicate "Sign in with
        // Google" buttons stack up in the same container.
        container.innerHTML = "";
        window.google.accounts.id.renderButton(container, {
          theme: "outline", size: "large", width: 320, text: "continue_with",
        });
        return;
      }
      // The GSI script loads async/defer, so it may not be ready the instant
      // this component mounts — poll briefly for it.
      if (attempts++ < 50) setTimeout(tryRender, 100);
    };
    tryRender();
    return () => { cancelled = true; };
    // Intentionally mount-only: re-renders are handled via onCredentialRef above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) return null;
  return <div className="google-signin-btn" ref={containerRef} style={{ display: "flex", justifyContent: "center", margin: "14px 0" }} />;
}

function LoginScreen({ onLogin, onEmailOtpLogin, onGoogleCredential, onGoToSignup }) {
  const [role, setRole] = useState("student");
  const [mode, setMode] = useState("password"); // 'password' | 'email-otp' | 'forgot'
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  // email-otp / forgot shared state
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const resetAuxState = () => { setError(""); setInfo(""); setOtp(""); setOtpSent(false); setNewPassword(""); };

  const submit = async () => {
    setError("");
    if (!identifier.trim() || !password) {
      setError("Enter your login details.");
      return;
    }
    setLoading(true);
    try { await onLogin(identifier.trim(), password, role); }
    catch (err) { setError(err?.message || "Login failed. Please try again."); }
    finally { setLoading(false); }
  };

  const sendLoginOtp = async () => {
    setError(""); setInfo("");
    if (!email.trim()) return setError("Enter your registered email.");
    setLoading(true);
    try {
      await api.requestEmailLoginOtp(email.trim());
      setOtpSent(true);
      setInfo("If that email is registered, a one-time code was sent to it.");
    } catch (err) { setError(err?.message || "Could not send OTP."); }
    finally { setLoading(false); }
  };

  const verifyLoginOtp = async () => {
    setError("");
    if (!otp.trim()) return setError("Enter the 6-digit code.");
    setLoading(true);
    try { await onEmailOtpLogin(email.trim(), otp.trim()); }
    catch (err) { setError(err?.message || "Invalid or expired code."); }
    finally { setLoading(false); }
  };

  const sendResetOtp = async () => {
    setError(""); setInfo("");
    if (!email.trim()) return setError("Enter your registered email.");
    setLoading(true);
    try {
      await api.forgotPassword(email.trim());
      setOtpSent(true);
      setInfo("If that email is registered, a password reset code was sent to it.");
    } catch (err) { setError(err?.message || "Could not send reset code."); }
    finally { setLoading(false); }
  };

  const completeReset = async () => {
    setError("");
    if (!otp.trim() || !newPassword) return setError("Enter the code and a new password.");
    if (newPassword.length < 8) return setError("New password must be at least 8 characters.");
    setLoading(true);
    try {
      await api.resetPassword(email.trim(), otp.trim(), newPassword);
      setMode("password");
      resetAuxState();
      setInfo("Password updated — sign in with your new password.");
      setIdentifier(email.trim());
    } catch (err) { setError(err?.message || "Could not reset password."); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-orb auth-orb-a" /><div className="auth-orb auth-orb-b" /><div className="auth-orb auth-orb-c" />
      <div className="auth-brand-panel">
        <div className="auth-brand-top"><KeyRound size={22} /><span>Hostel Management System</span></div>
        <div className="auth-hero">
          <div className="logo-orbit"><div className="logo-core"><Building2 size={42} /></div><span className="orbit-ring ring-one" /><span className="orbit-ring ring-two" /></div>
          <div className="auth-eyebrow">SMART HOSTEL REGISTRY</div>
          <h1>Everything your hostel needs, in one place.</h1>
          <p>Student profiles, rooms, gate passes and hostel notices connected to one secure database.</p>
        </div>
        <div className="auth-foot">Blocks A–C · Secure SQLite registry</div>
      </div>

      <div className="auth-card-wrap">
        <div className="auth-card">
          <div className="auth-eyebrow">Welcome back</div>
          <h2>Login to your account</h2>

          {mode === "password" && (
            <>
              <p className="auth-subtitle">Use your registered enrollment number, email or mobile number.</p>
              <div className="role-switch">
                {['student','admin','security'].map((r) => <button key={r} className={role === r ? 'active' : ''} onClick={() => { setRole(r); resetAuxState(); }}><User size={15}/>{r}</button>)}
              </div>
              <ErrorBanner message={error} />
              {info && <p className="text-sm mb-3" style={{ color: "var(--forest)" }}>{info}</p>}
              <label className="auth-label">Enrollment No. / Email / Phone</label>
              <div className="auth-input-wrap"><User size={17}/><input className="auth-input" value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder={role === 'admin' ? 'Admin email' : role === 'security' ? 'Security email' : 'Enrollment / Email / Phone'} onKeyDown={e => e.key === 'Enter' && submit()} /></div>
              <label className="auth-label">Password</label>
              <div className="auth-input-wrap"><KeyRound size={17}/><input className="auth-input password-input" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" onKeyDown={e => e.key === 'Enter' && submit()} /><button className="eye-btn" type="button" onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>
              <div className="auth-options">
                <button type="button" className="link-btn" onClick={() => { setMode("forgot"); resetAuxState(); setEmail(identifier.includes("@") ? identifier : ""); }}>Forgot Password?</button>
                <span className="sync-dot"><i/> Secure login</span>
              </div>
              <button className="auth-submit" disabled={loading} onClick={submit}>{loading ? <Loader2 size={18} className="spin"/> : <>Sign In <ChevronRight size={19}/></>}</button>
              {role !== "security" && (
                <>
                  <div className="auth-divider"><span>or</span></div>
                  <GoogleSignInButton onCredential={onGoogleCredential} />
                </>
              )}
              {role === "student" && (
                <p className="text-sm mt-3 text-center">
                  <button className="link-btn" onClick={() => { setMode("email-otp"); resetAuxState(); }}>Sign in with email + one-time code instead</button>
                </p>
              )}
              {role === 'student' && <p className="register-line">New Student? <button onClick={onGoToSignup}>Register Here</button></p>}
              <div className="powered">Powered by <strong>HOSTEL STUDENTS</strong></div>
            </>
          )}

          {mode === "email-otp" && (
            <>
              <p className="auth-subtitle">We'll email you a 6-digit one-time code — no password needed.</p>
              <ErrorBanner message={error} />
              {info && <p className="text-sm mb-3" style={{ color: "var(--forest)" }}>{info}</p>}
              <label className="auth-label">Registered email</label>
              <div className="auth-input-wrap"><User size={17}/><input className="auth-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@campus.edu" disabled={otpSent} /></div>
              {otpSent && (
                <>
                  <label className="auth-label">6-digit code</label>
                  <div className="auth-input-wrap"><KeyRound size={17}/><input className="auth-input" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="123456" inputMode="numeric" onKeyDown={e => e.key === 'Enter' && verifyLoginOtp()} autoFocus /></div>
                </>
              )}
              <button className="auth-submit" disabled={loading} onClick={otpSent ? verifyLoginOtp : sendLoginOtp}>
                {loading ? <Loader2 size={18} className="spin"/> : otpSent ? <>Verify & Sign In <ChevronRight size={19}/></> : "Send code"}
              </button>
              <p className="text-sm mt-3 text-center">
                <button className="link-btn" onClick={() => { setMode("password"); resetAuxState(); }}>Back to password login</button>
              </p>
            </>
          )}

          {mode === "forgot" && (
            <>
              <p className="auth-subtitle">Enter your email — we'll send a code to reset your password.</p>
              <ErrorBanner message={error} />
              {info && <p className="text-sm mb-3" style={{ color: "var(--forest)" }}>{info}</p>}
              <label className="auth-label">Registered email</label>
              <div className="auth-input-wrap"><User size={17}/><input className="auth-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@campus.edu" disabled={otpSent} /></div>
              {otpSent && (
                <>
                  <label className="auth-label">6-digit code</label>
                  <div className="auth-input-wrap"><KeyRound size={17}/><input className="auth-input" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="123456" inputMode="numeric" /></div>
                  <label className="auth-label">New password</label>
                  <div className="auth-input-wrap"><KeyRound size={17}/><input className="auth-input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 8 characters" onKeyDown={e => e.key === 'Enter' && completeReset()} /></div>
                </>
              )}
              <button className="auth-submit" disabled={loading} onClick={otpSent ? completeReset : sendResetOtp}>
                {loading ? <Loader2 size={18} className="spin"/> : otpSent ? "Reset password" : "Send reset code"}
              </button>
              <p className="text-sm mt-3 text-center">
                <button className="link-btn" onClick={() => { setMode("password"); resetAuxState(); }}>Back to sign in</button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SignupScreen({ onSignup, onGoToLogin, prefill }) {
  const [form, setForm] = useState({
    enrollment:'', name: prefill?.name || '', email: prefill?.email || '', mobile:'', password:'', confirmPassword:'',
    father:'', fatherPhone:'', mother:'', motherPhone:'', guardian:'', guardianPhone:'',
    course:'', branch:'', semester:''
  });
  const [error, setError] = useState(prefill ? 'No account found for that Google email — finish registering below (a password is still required for account recovery).' : '');
  const [loading, setLoading] = useState(false);

  const set = key => e => setForm(f => ({...f, [key]: e.target.value}));

  const submit = async () => {
    setError('');
    if (!form.enrollment || !form.name || !form.email || !form.mobile || !form.password) {
      return setError('Enrollment, name, email, mobile and password are required.');
    }
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');
    if (form.password !== form.confirmPassword) return setError("Passwords don't match.");

    setLoading(true);
    try {
      await onSignup(form);
    } catch (e) {
      setError(e?.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    ['enrollment','Enrollment Number *'],['name','Full Name *'],['email','Email *'],
    ['mobile','Mobile Number *'],['course','Course'],['branch','Branch'],['semester','Semester'],
    ['father',"Father's Name"],['fatherPhone',"Father's Mobile"],['mother',"Mother's Name"],
    ['motherPhone',"Mother's Mobile"],['guardian',"Guardian's Name"],['guardianPhone',"Guardian's Mobile"]
  ];

  return (
    <div className="auth-page signup-page">
      <div className="auth-orb auth-orb-a"/>
      <div className="auth-orb auth-orb-b"/>
      <div className="auth-card signup-card">
        <div className="auth-brand-top signup-brand"><KeyRound size={22}/><span>Hostel Management System</span></div>
        <div className="auth-eyebrow">New student</div>
        <h2>Create your account</h2>
        <p className="auth-subtitle">Register once — you'll sign in with your mobile number and password, or your email via a one-time code, from now on.</p>
        <ErrorBanner message={error}/>

        <div className="signup-grid">
          {fields.map(([key,label]) =>
            <input key={key} className="auth-input standalone"
              type={key === 'email' ? 'email' : 'text'}
              inputMode={key.toLowerCase().includes('phone') || key === 'mobile' ? 'tel' : undefined}
              placeholder={label} value={form[key]} onChange={set(key)}
            />
          )}
          <input className="auth-input standalone" type="password" placeholder="Password * (min. 8 characters)"
            value={form.password} onChange={set('password')}/>
          <input className="auth-input standalone" type="password" placeholder="Confirm Password *"
            value={form.confirmPassword} onChange={set('confirmPassword')}/>
        </div>

        <button className="auth-submit" disabled={loading} onClick={submit}>
          {loading ? <Loader2 size={18} className="spin"/> : <>Create Account <ChevronRight size={19}/></>}
        </button>
        <p className="register-line">Already registered? <button onClick={onGoToLogin}>Sign In</button></p>
      </div>
    </div>
  );
}

// ---------- Student views ----------

function StudentDashboard({ profile, leaves, announcements }) {
  const pending = leaves.filter((l) => l.status === "Pending").length;
  return (
    <div className="space-y-6">
      <div>
        <div className="label-eyebrow">Welcome back</div>
        <h1 className="font-display text-3xl" style={{ color: "var(--ink)" }}>{profile?.name}</h1>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard label="Block · Room" value={`${profile?.block ?? "—"}-${profile?.room ?? "—"}`} icon={MapPin} />
        <StatCard label="Pending passes" value={pending} icon={Clock} />
        <StatCard label="Total gate passes" value={leaves.length} icon={FileText} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="label-eyebrow mb-3">Recent gate passes</h2>
          <div className="space-y-4">
            {leaves.slice(0, 2).map((l) => <GatePassSlip key={l.id} leave={l} />)}
            {leaves.length === 0 && <p className="text-sm" style={{ color: "var(--slate)" }}>No gate passes yet.</p>}
          </div>
        </div>
        <div>
          <h2 className="label-eyebrow mb-3">Notice board</h2>
          <div className="space-y-3">
            {announcements.slice(0, 3).map((a) => (
              <div key={a.id} className="paper-card p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Megaphone size={14} color="var(--brass)" />
                  <span className="font-display text-base" style={{ color: "var(--ink)" }}>{a.title}</span>
                </div>
                <p className="text-sm" style={{ color: "var(--slate)" }}>{a.message}</p>
                <div className="text-xs font-mono mt-2" style={{ color: "var(--slate)" }}>{a.created_at}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentProfile({ profile }) {
  if (!profile) return null;
  const rows = [
    ["Enrollment number", profile.enrollment_no],
    ["Student name", profile.name],
    ["Email ID", profile.email],
    ["Mobile number", profile.mobile],
    ["Father's name", profile.father_name],
    ["Father's mobile", profile.father_mobile],
    ["Mother's name", profile.mother_name],
    ["Mother's mobile", profile.mother_mobile],
    ["Guardian's name", profile.guardian_name],
    ["Guardian's mobile", profile.guardian_mobile],
    ["Block", profile.block],
    ["Room", profile.room],
  ];
  return (
    <div>
      <div className="label-eyebrow">Registry entry</div>
      <h1 className="font-display text-3xl mb-6" style={{ color: "var(--ink)" }}>My profile</h1>
      <div className="id-card mb-6">
        <div className="flex items-center gap-4">
          <div className="id-photo"><User size={28} /></div>
          <div>
            <div className="font-display text-xl" style={{ color: "var(--paper)" }}>{profile.name}</div>
            <div className="font-mono text-sm" style={{ color: "var(--brass-light)" }}>{profile.enrollment_no}</div>
            <div className="text-sm mt-1" style={{ color: "var(--brass-light)" }}>Block {profile.block} · Room {profile.room}</div>
          </div>
        </div>
      </div>
      <div className="paper-card divide-y" style={{ borderColor: "var(--line)" }}>
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between px-5 py-3 text-sm" style={{ borderColor: "var(--line)" }}>
            <span style={{ color: "var(--slate)" }}>{label}</span>
            <span className="font-mono" style={{ color: "var(--ink)" }}>{value || "—"}</span>
          </div>
        ))}
      </div>
      <p className="text-xs mt-3" style={{ color: "var(--slate)" }}>Profile details are managed by hostel admin. Contact the office to request a correction.</p>
    </div>
  );
}

function LeaveApply({ profile, onSubmit }) {
  const [reason, setReason] = useState("");
  const [destination, setDestination] = useState("");
  const [leaveAt, setLeaveAt] = useState("");
  const [returnAt, setReturnAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = reason && destination && leaveAt && returnAt && !submitting;

  const submit = async () => {
    setError("");
    setSubmitting(true);
    try {
      await onSubmit({ reason, destination, leaveAt: leaveAt.replace("T", " "), returnAt: returnAt.replace("T", " ") });
      setReason(""); setDestination(""); setLeaveAt(""); setReturnAt("");
    } catch (err) {
      setError(err.message || "Could not submit request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="label-eyebrow">New request</div>
      <h1 className="font-display text-3xl mb-6" style={{ color: "var(--ink)" }}>Apply for a gate pass</h1>

      <div className="paper-card p-6 space-y-4">
        <div className="text-sm" style={{ color: "var(--slate)" }}>
          Filed under {profile?.name} · {profile?.enrollment_no} · Block {profile?.block}-{profile?.room}
        </div>
        <ErrorBanner message={error} />
        <div>
          <label className="label-eyebrow block mb-1">Reason for leave</label>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Visiting home for a family function" className="field" />
        </div>
        <div>
          <label className="label-eyebrow block mb-1">Destination</label>
          <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. Ahmedabad" className="field" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label-eyebrow block mb-1">Date & time of leaving</label>
            <input type="datetime-local" value={leaveAt} onChange={(e) => setLeaveAt(e.target.value)} className="field" />
          </div>
          <div>
            <label className="label-eyebrow block mb-1">Expected return</label>
            <input type="datetime-local" value={returnAt} onChange={(e) => setReturnAt(e.target.value)} className="field" />
          </div>
        </div>
        <button disabled={!canSubmit} onClick={submit} className="btn-primary w-full disabled:opacity-40">
          {submitting ? <Loader2 className="animate-spin mx-auto" size={16} /> : "Submit gate pass request"}
        </button>
        <p className="text-xs" style={{ color: "var(--slate)" }}>
          Your parent/guardian will get an approval link by SMS/email, and your gate pass becomes valid once both they and the admin approve it.
        </p>
      </div>
    </div>
  );
}

function LeaveHistory({ leaves }) {
  return (
    <div>
      <div className="label-eyebrow">Full record</div>
      <h1 className="font-display text-3xl mb-6" style={{ color: "var(--ink)" }}>Gate pass history</h1>
      <div className="space-y-4">
      
      
        {leaves.map((l) => <GatePassSlip key={l.id} leave={l} />)}
        {leaves.length === 0 && <p className="text-sm" style={{ color: "var(--slate)" }}>No gate passes on record yet.</p>}
      </div>
    </div>
  );
}

function AnnouncementsView({ announcements }) {
  return (
    <div>
      <div className="label-eyebrow">Notice board</div>
      <h1 className="font-display text-3xl mb-6" style={{ color: "var(--ink)" }}>Announcements</h1>
      <div className="space-y-4">
        {announcements.map((a) => (
          <div key={a.id} className="paper-card p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Megaphone size={16} color="var(--brass)" />
                <span className="font-display text-lg" style={{ color: "var(--ink)" }}>{a.title}</span>
              </div>
              <span className="text-xs font-mono" style={{ color: "var(--slate)" }}>{a.created_at}</span>
            </div>
            <p className="text-sm" style={{ color: "var(--slate)" }}>{a.message}</p>
          </div>
        ))}
        {announcements.length === 0 && <p className="text-sm" style={{ color: "var(--slate)" }}>No announcements yet.</p>}
      </div>
    </div>
  );
}

// ---------- Admin views ----------

function AdminDashboard({ studentCount, leaves, blocks, stats }) {
  const pending = leaves.filter((l) => l.status === "Pending").length;
  const totalRooms = blocks.reduce((s, b) => s + b.rooms, 0);
  const occupied = blocks.reduce((s, b) => s + b.occupied, 0);
  return (
    <div className="space-y-6">
      <div>
        <div className="label-eyebrow">Front desk</div>
        <h1 className="font-display text-3xl" style={{ color: "var(--ink)" }}>Admin overview</h1>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard label="Students registered" value={studentCount} icon={Users} />
        <StatCard label="Pending gate passes" value={pending} icon={Clock} />
        <StatCard label="Occupancy" value={`${occupied}/${totalRooms}`} icon={Building2} />
      </div>
      {stats && (
        <div className="grid sm:grid-cols-4 gap-4">
          <StatCard label="Fully valid passes" value={stats.leaves.fullyValid} icon={CheckCircle2} />
          <StatCard label="Awaiting parent" value={stats.leaves.parentPending} icon={Clock} />
          <StatCard label="Announcements posted" value={stats.announcements} icon={Megaphone} />
          <StatCard label="Notifications sent" value={stats.notifications.sent} icon={Send} />
        </div>
      )}
      <div>
        <h2 className="label-eyebrow mb-3">Block occupancy</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {blocks.map((b) => (
            <div key={b.id} className="paper-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-display text-lg" style={{ color: "var(--ink)" }}>Block {b.block}</span>
                <span className="font-mono text-xs" style={{ color: "var(--slate)" }}>{b.occupied}/{b.rooms}</span>
              </div>
              <div className="occ-bar"><div className="occ-fill" style={{ width: `${b.rooms ? (b.occupied / b.rooms) * 100 : 0}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StudentFormModal({ blocks, student, onClose, onSave }) {
  const [form, setForm] = useState(() => ({ enrollment: student?.enrollment_no || '', name: student?.name || '', email: student?.email || '', mobile: student?.mobile || '', password: '', block: student?.block || '', room: student?.room || '', father: student?.father_name || '', fatherPhone: student?.father_mobile || '', mother: student?.mother_name || '', motherPhone: student?.mother_mobile || '', guardian: student?.guardian_name || '', guardianPhone: student?.guardian_mobile || '', course: student?.course || '', branch: student?.branch || '', semester: student?.semester || '' }));
  const [error,setError]=useState(''); const [saving,setSaving]=useState(false); const set=k=>e=>setForm(f=>({...f,[k]:e.target.value}));
  const submit=async()=>{setError(''); if(!form.enrollment||!form.name||!form.email||!form.mobile||(!student&&!form.password)) return setError('Enrollment, name, email, mobile and password are required.'); setSaving(true); try{await onSave(form);onClose();}catch(e){setError(e?.message||'Could not save student.');}finally{setSaving(false)}};
  return <div className="modal-backdrop"><div className="paper-card modal-card"><div className="modal-head"><div><div className="label-eyebrow">{student?'Edit registry record':'New registry record'}</div><h2 className="font-display text-xl">{student?'Edit student':'Add student'}</h2></div><button onClick={onClose}><X size={18}/></button></div><ErrorBanner message={error}/><div className="signup-grid admin-form-grid">
    {['enrollment','name','email','mobile','course','branch','semester'].map(k=><input key={k} className="field" placeholder={k.replace(/([A-Z])/g,' $1')} value={form[k]} onChange={set(k)} disabled={k==='enrollment'}/>) }
    {!student && <input className="field" type="password" placeholder="Password" value={form.password} onChange={set('password')}/>} {student && <input className="field" type="password" placeholder="New password (optional)" value={form.password} onChange={set('password')}/>} 
    <select className="field" value={form.block} onChange={set('block')}><option value="">Block</option>{blocks.map(b=><option key={b.id} value={b.block}>{b.block}</option>)}</select><input className="field" placeholder="Room number" value={form.room} onChange={set('room')}/>
    {['father','fatherPhone','mother','motherPhone','guardian','guardianPhone'].map(k=><input key={k} className="field" placeholder={k.replace(/([A-Z])/g,' $1')} value={form[k]} onChange={set(k)}/>)}</div><div className="flex gap-3 mt-5"><button className="btn-secondary flex-1" onClick={onClose}>Cancel</button><button className="btn-primary flex-1" disabled={saving} onClick={submit}>{saving?<Loader2 size={16} className="spin"/>:student?'Save changes':'Create student'}</button></div></div></div>;
}

function AdminStudents({ students, blocks, query, setQuery, blockFilter, setBlockFilter, onCreate, onUpdate, onDelete }) {
  const [editing,setEditing]=useState(null); const [showAdd,setShowAdd]=useState(false); const [deleting,setDeleting]=useState(null);
  const confirmDelete=async(id)=>{if(!window.confirm('Delete this student and their account? This cannot be undone.'))return;setDeleting(id);try{await onDelete(id)}finally{setDeleting(null)}};
  return <div><div className="flex items-center justify-between mb-6 flex-wrap gap-3"><div><div className="label-eyebrow">Student registry</div><h1 className="font-display text-3xl">Students</h1><p className="text-sm mt-1" style={{color:'var(--slate)'}}>{students.length} student{students.length===1?'':'s'} currently stored in the Supabase database</p></div><button className="btn-primary flex items-center gap-2" onClick={()=>setShowAdd(true)}><Plus size={16}/> Add student</button></div>
    <div className="flex flex-col sm:flex-row gap-3 mb-4"><div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" color="var(--slate)"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, enrollment, email, phone or room..." className="field pl-9"/></div><select value={blockFilter} onChange={e=>setBlockFilter(e.target.value)} className="field sm:w-40"><option value="All">All blocks</option>{blocks.map(b=><option key={b.id} value={b.block}>Block {b.block}</option>)}</select></div>
    <div className="paper-card overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left" style={{borderBottom:'1px solid var(--line)'}}>{['Enrollment','Name','Block-Room','Course','Contact','Actions'].map(h=><th key={h} className="label-eyebrow px-4 py-3">{h}</th>)}</tr></thead><tbody>{students.map(s=><tr key={s.id} className="table-row" style={{borderBottom:'1px solid var(--line)'}}><td className="px-4 py-3 font-mono">{s.enrollment_no}</td><td className="px-4 py-3">{s.name}<div className="text-xs" style={{color:'var(--slate)'}}>{s.email}</div></td><td className="px-4 py-3 font-mono">{s.block??'—'}-{s.room??'—'}</td><td className="px-4 py-3">{s.course||'—'}<div className="text-xs" style={{color:'var(--slate)'}}>{s.branch||''}</div></td><td className="px-4 py-3">{s.mobile||'—'}</td><td className="px-4 py-3"><div className="flex gap-2 justify-end"><button className="btn-secondary" onClick={()=>setEditing(s)}>Edit</button><button className="btn-danger" disabled={deleting===s.id} onClick={()=>confirmDelete(s.id)}>{deleting===s.id?'...':'Delete'}</button></div></td></tr>)}{students.length===0&&<tr><td colSpan={6} className="px-4 py-10 text-center" style={{color:'var(--slate)'}}>No students are currently stored in the database.</td></tr>}</tbody></table></div>
    {(showAdd||editing)&&<StudentFormModal blocks={blocks} student={editing} onClose={()=>{setShowAdd(false);setEditing(null)}} onSave={editing?f=>onUpdate(editing.id,f):onCreate}/>}</div>;
}

function AdminLeaves({ leaves, onDecide }) {
  const [busyId, setBusyId] = useState(null);
  const pending = leaves.filter((l) => l.status === "Pending");
  const decided = leaves.filter((l) => l.status !== "Pending");

  const decide = async (id, status) => {
    setBusyId(id);
    try {
      await onDecide(id, status);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="label-eyebrow">Approvals</div>
      <h1 className="font-display text-3xl mb-6" style={{ color: "var(--ink)" }}>Gate pass requests</h1>

      <h2 className="label-eyebrow mb-3">Awaiting decision ({pending.length})</h2>
      <div className="space-y-4 mb-8">
        {pending.map((l) => (
          <div key={l.id} className="paper-card p-5">
            <GatePassSlip leave={l} />
            <div className="flex gap-3 mt-4">
              <button
                disabled={busyId === l.id}
                onClick={() => decide(l.id, "Approved")}
                className="btn-secondary flex items-center gap-2 disabled:opacity-50"
                style={{ borderColor: "var(--forest)", color: "var(--forest)" }}
              >
                <CheckCircle2 size={16} /> Approve
              </button>
              <button
                disabled={busyId === l.id}
                onClick={() => decide(l.id, "Rejected")}
                className="btn-secondary flex items-center gap-2 disabled:opacity-50"
                style={{ borderColor: "var(--rust)", color: "var(--rust)" }}
              >
                <XCircle size={16} /> Reject
              </button>
            </div>
          </div>
        ))}
        {pending.length === 0 && <p className="text-sm" style={{ color: "var(--slate)" }}>Nothing waiting on you right now.</p>}
      </div>

      <h2 className="label-eyebrow mb-3">Recently decided</h2>
      <div className="space-y-4">
        {decided.slice(0, 4).map((l) => <GatePassSlip key={l.id} leave={l} />)}
      </div>
    </div>
  );
}

function AdminBlocks({ blocks }) {
  return (
    <div>
      <div className="label-eyebrow">Facilities</div>
      <h1 className="font-display text-3xl mb-6" style={{ color: "var(--ink)" }}>Blocks & rooms</h1>
      <div className="grid md:grid-cols-3 gap-5">
        {blocks.map((b) => (
          <div key={b.id} className="paper-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={18} color="var(--brass)" />
              <span className="font-display text-xl" style={{ color: "var(--ink)" }}>Block {b.block}</span>
            </div>
            <div className="text-sm mb-1" style={{ color: "var(--slate)" }}>{b.rooms} rooms · {b.occupied} occupied</div>
            <div className="occ-bar mb-4"><div className="occ-fill" style={{ width: `${b.rooms ? (b.occupied / b.rooms) * 100 : 0}%` }} /></div>
          </div>
        ))}
        {blocks.length === 0 && <p className="text-sm" style={{ color: "var(--slate)" }}>No blocks set up yet.</p>}
      </div>
    </div>
  );
}

function AnnouncementRow({ announcement: a, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(a.title);
  const [message, setMessage] = useState(a.message);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await onEdit(a.id, { title, message });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this announcement?")) return;
    setBusy(true);
    try {
      await onDelete(a.id);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="paper-card p-4 space-y-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="field" />
        <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} className="field" />
        <div className="flex gap-2">
          <button className="btn-secondary flex-1" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
          <button className="btn-primary flex-1 disabled:opacity-50" onClick={save} disabled={busy || !title || !message}>
            {busy ? <Loader2 className="animate-spin mx-auto" size={16} /> : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="paper-card p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-lg" style={{ color: "var(--ink)" }}>{a.title}</span>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-mono" style={{ color: "var(--slate)" }}>{a.updated_at ? `edited ${a.updated_at}` : a.created_at}</span>
          <button onClick={() => setEditing(true)} className="text-xs underline" style={{ color: "var(--ink)" }}>Edit</button>
          <button onClick={remove} disabled={busy} className="text-xs underline" style={{ color: "var(--rust)" }}>Delete</button>
        </div>
      </div>
      <p className="text-sm mt-1" style={{ color: "var(--slate)" }}>{a.message}</p>
    </div>
  );
}

function AdminAnnouncements({ announcements, onPost, onEdit, onDelete }) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);

  const post = async () => {
    setPosting(true);
    try {
      await onPost({ title, message });
      setTitle(""); setMessage("");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div>
      <div className="label-eyebrow">Broadcast</div>
      <h1 className="font-display text-3xl mb-6" style={{ color: "var(--ink)" }}>Announcements</h1>

      <div className="paper-card p-5 mb-6 space-y-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="field" />
        <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message for all students..." className="field" />
        <button
          disabled={!title || !message || posting}
          onClick={post}
          className="btn-primary flex items-center gap-2 disabled:opacity-40"
        >
          {posting ? <Loader2 className="animate-spin" size={16} /> : <><Bell size={16} /> Post to notice board</>}
        </button>
      </div>

      <div className="space-y-3">
        {announcements.map((a) => (
          <AnnouncementRow key={a.id} announcement={a} onEdit={onEdit} onDelete={onDelete} />
        ))}
        {announcements.length === 0 && <p className="text-sm" style={{ color: "var(--slate)" }}>No announcements yet.</p>}
      </div>
    </div>
  );
}


// ---------- Advanced hostel modules ----------
function SectionTitle({ eyebrow, title, subtitle }) { return <div className="mb-6"><div className="label-eyebrow">{eyebrow}</div><h1 className="font-display text-3xl" style={{color:"var(--ink)"}}>{title}</h1>{subtitle&&<p className="text-sm mt-1" style={{color:"var(--slate)"}}>{subtitle}</p>}</div>; }

function ComplaintView({ complaints, onCreate, onUpdate, admin=false }) {
  const [form,setForm]=useState({category:"Electrical",title:"",description:""}); const [busy,setBusy]=useState(false);
  const submit=async()=>{setBusy(true);try{await onCreate(form);setForm({category:"Electrical",title:"",description:""})}finally{setBusy(false)}};
  return <div><SectionTitle eyebrow="Support" title="Complaints" subtitle={admin?"Track and resolve student complaints.":"Report a hostel issue and follow its progress."}/>{!admin&&<div className="paper-card p-5 mb-6 space-y-3"><select className="field" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{['Electrical','Plumbing','Cleaning','Internet','Other'].map(x=><option key={x}>{x}</option>)}</select><input className="field" placeholder="Complaint title" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><textarea className="field" rows="3" placeholder="Describe the problem" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/><button className="btn-primary" disabled={!form.title||!form.description||busy} onClick={submit}>{busy?'Submitting...':'Submit complaint'}</button></div>}<div className="space-y-3">{complaints.map(c=><div className="paper-card p-5" key={c.id}><div className="flex justify-between gap-3"><div><div className="label-eyebrow">{c.category}</div><h3 className="font-display text-lg">{c.title}</h3><p className="text-sm mt-1" style={{color:'var(--slate)'}}>{c.description}</p>{admin&&<div className="text-xs mt-2">{c.student_name} · {c.enrollment_no}</div>}</div><span className="status-pill">{c.status}</span></div>{admin&&<div className="flex gap-2 mt-4"><button className="btn-secondary" onClick={()=>onUpdate(c.id,{status:'In Progress'})}>In Progress</button><button className="btn-primary" onClick={()=>onUpdate(c.id,{status:'Resolved'})}>Resolve</button></div>}</div>)}{complaints.length===0&&<div className="paper-card p-8 text-center text-sm" style={{color:'var(--slate)'}}>No complaints found.</div>}</div></div>;
}

function MaintenanceView({ requests, onCreate, onUpdate, admin=false, blocks=[] }) {
  const [form,setForm]=useState({category:'Fan',title:'',description:'',blockId:'',roomId:''}); const [busy,setBusy]=useState(false);
  const submit=async()=>{setBusy(true);try{await onCreate(form);setForm({category:'Fan',title:'',description:'',blockId:'',roomId:''})}finally{setBusy(false)}};
  return <div><SectionTitle eyebrow="Facilities" title="Hostel Maintenance" subtitle={admin?"Assign and close maintenance requests.":"Report maintenance problems in your room or block."}/>{!admin&&<div className="paper-card p-5 mb-6 space-y-3"><select className="field" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{['Fan','Light','AC','Water','Furniture','Internet','Other'].map(x=><option key={x}>{x}</option>)}</select><input className="field" placeholder="Issue title" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><textarea className="field" rows="3" placeholder="Describe the issue" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/><button className="btn-primary" disabled={!form.title||!form.description||busy} onClick={submit}>{busy?'Sending...':'Create maintenance request'}</button></div>}<div className="space-y-3">{requests.map(r=><div className="paper-card p-5" key={r.id}><div className="flex justify-between"><div><div className="label-eyebrow">{r.category}</div><h3 className="font-display text-lg">{r.title}</h3><p className="text-sm" style={{color:'var(--slate)'}}>{r.description}</p><div className="text-xs mt-2">{r.block?`Block ${r.block} · Room ${r.room||'—'}`:''} {admin&&r.student_name?` · ${r.student_name}`:''}</div></div><span className="status-pill">{r.status}</span></div>{admin&&<div className="flex gap-2 mt-4"><button className="btn-secondary" onClick={()=>onUpdate(r.id,{status:'In Progress'})}>In Progress</button><button className="btn-primary" onClick={()=>onUpdate(r.id,{status:'Resolved'})}>Resolve</button></div>}</div>)}{requests.length===0&&<div className="paper-card p-8 text-center text-sm" style={{color:'var(--slate)'}}>No maintenance requests.</div>}</div></div>;
}

function AttendanceView({ records, students=[], onMark, admin=false }) {
  const [studentId,setStudentId]=useState(students[0]?.id||''); const [date,setDate]=useState(new Date().toISOString().slice(0,10)); const [status,setStatus]=useState('Present');
  const submit=async()=>{if(studentId) await onMark({studentId,date,status})};
  const counts=records.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}); const total=records.length; const pct=total?Math.round(((counts.Present||0)+(counts.Late||0))/total*100):0;
  return <div><SectionTitle eyebrow="Daily register" title="Attendance" subtitle={admin?"Mark daily attendance for students.":"Your attendance history and percentage."}/>{admin&&<div className="paper-card p-5 mb-6 grid md:grid-cols-4 gap-3"><select className="field" value={studentId} onChange={e=>setStudentId(e.target.value)}>{students.map(s=><option key={s.id} value={s.id}>{s.name} · {s.enrollment_no}</option>)}</select><input className="field" type="date" value={date} onChange={e=>setDate(e.target.value)}/><select className="field" value={status} onChange={e=>setStatus(e.target.value)}>{['Present','Absent','Leave','Late'].map(x=><option key={x}>{x}</option>)}</select><button className="btn-primary" onClick={submit}>Save attendance</button></div>}<div className="grid sm:grid-cols-4 gap-4 mb-6"><StatCard label="Attendance" value={`${pct}%`} icon={CheckCircle2}/><StatCard label="Present" value={counts.Present||0} icon={CheckCircle2}/><StatCard label="Absent" value={counts.Absent||0} icon={XCircle}/><StatCard label="Leave" value={counts.Leave||0} icon={Clock}/></div><div className="paper-card overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="label-eyebrow px-4 py-3 text-left">Date</th>{admin&&<th className="label-eyebrow px-4 py-3 text-left">Student</th>}<th className="label-eyebrow px-4 py-3 text-left">Status</th></tr></thead><tbody>{records.map(r=><tr className="table-row" key={r.id}><td className="px-4 py-3 font-mono">{r.attendance_date}</td>{admin&&<td className="px-4 py-3">{r.student_name}</td>}<td className="px-4 py-3">{r.status}</td></tr>)}</tbody></table></div></div>;
}

function FeesView({ fees, students=[], onCreate, admin=false }) {
  const [form,setForm]=useState({studentId:students[0]?.id||'',amount:'',paidAmount:'',dueDate:'',note:''});
  const submit=async()=>{await onCreate(form);setForm({...form,amount:'',paidAmount:'',note:''})}; const billed=fees.reduce((s,f)=>s+Number(f.amount),0); const paid=fees.reduce((s,f)=>s+Number(f.paid_amount),0);
  return <div><SectionTitle eyebrow="Finance" title="Hostel Fees" subtitle={admin?"Manage fee records and payment status.":"View your hostel fee balance and payment history."}/>{admin&&<div className="paper-card p-5 mb-6 grid md:grid-cols-5 gap-3"><select className="field" value={form.studentId} onChange={e=>setForm({...form,studentId:e.target.value})}>{students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><input className="field" placeholder="Amount" type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/><input className="field" placeholder="Paid amount" type="number" value={form.paidAmount} onChange={e=>setForm({...form,paidAmount:e.target.value})}/><input className="field" type="date" value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/><button className="btn-primary" onClick={submit}>Add fee</button></div>}<div className="grid sm:grid-cols-3 gap-4 mb-6"><StatCard label="Billed" value={`₹${billed.toLocaleString()}`} icon={FileText}/><StatCard label="Paid" value={`₹${paid.toLocaleString()}`} icon={CheckCircle2}/><StatCard label="Pending" value={`₹${Math.max(0,billed-paid).toLocaleString()}`} icon={Clock}/></div><div className="space-y-3">{fees.map(f=><div className="paper-card p-5 flex justify-between" key={f.id}><div><div className="font-display text-lg">{admin?f.student_name:'Hostel fee'}</div><div className="text-sm" style={{color:'var(--slate)'}}>₹{Number(f.amount).toLocaleString()} · Paid ₹{Number(f.paid_amount).toLocaleString()} · Due {f.due_date||'—'}</div></div><span className="status-pill">{f.status}</span></div>)}</div></div>;
}

function DocumentsView({ documents, onCreate, onUpdate, admin=false }) {
  const [form,setForm]=useState({documentType:'ID Proof',fileName:'',fileUrl:''});
  return <div><SectionTitle eyebrow="Records" title="Documents" subtitle={admin?"Verify student documents.":"Keep your required hostel documents on record."}/>{!admin&&<div className="paper-card p-5 mb-6 grid md:grid-cols-3 gap-3"><select className="field" value={form.documentType} onChange={e=>setForm({...form,documentType:e.target.value})}>{['ID Proof','Admission Document','Parent Document','Medical Document','Other'].map(x=><option key={x}>{x}</option>)}</select><input className="field" placeholder="File name" value={form.fileName} onChange={e=>setForm({...form,fileName:e.target.value})}/><input className="field" placeholder="File URL" value={form.fileUrl} onChange={e=>setForm({...form,fileUrl:e.target.value})}/><button className="btn-primary md:col-span-3" disabled={!form.fileName||!form.fileUrl} onClick={async()=>{await onCreate(form);setForm({...form,fileName:'',fileUrl:''})}}>Add document</button></div>}<div className="space-y-3">{documents.map(d=><div className="paper-card p-5 flex items-center justify-between gap-4" key={d.id}><div><div className="label-eyebrow">{d.document_type}</div><div className="font-display text-lg">{d.file_name}</div>{admin&&<div className="text-xs">{d.student_name} · {d.enrollment_no}</div>}<a className="text-xs" href={d.file_url} target="_blank" rel="noreferrer">Open document</a></div>{admin?<select className="field w-32" value={d.status} onChange={async e=>onUpdate(d.id,{status:e.target.value})}>{['Pending','Verified','Rejected'].map(x=><option key={x}>{x}</option>)}</select>:<span className="status-pill">{d.status}</span>}</div>)}</div></div>;
}

function SecurityDashboard({ passes, onScan }) {
  return <div><SectionTitle eyebrow="Gate control" title="Security Dashboard" subtitle="Verify approved leave passes and record gate movement."/><div className="paper-card p-5 mb-6"><div className="label-eyebrow mb-2">QR / Pass ID verification</div><div className="flex gap-3"><input id="scanPass" className="field flex-1" placeholder="Enter approved pass ID"/><button className="btn-primary" onClick={()=>{const id=document.getElementById('scanPass').value;if(id)onScan({leaveId:id,scanType:'OUT'})}}>Scan OUT</button><button className="btn-secondary" onClick={()=>{const id=document.getElementById('scanPass').value;if(id)onScan({leaveId:id,scanType:'IN'})}}>Scan IN</button></div><p className="text-xs mt-2" style={{color:'var(--slate)'}}>For a physical QR reader, configure the scanner to type the pass ID into this field.</p></div><div className="space-y-3">{passes.map(p=><div className="paper-card p-5" key={p.id}><div className="flex justify-between gap-4"><div><div className="label-eyebrow">PASS #{p.id}</div><h3 className="font-display text-lg">{p.name}</h3><div className="text-sm" style={{color:'var(--slate)'}}>{p.enrollment_no} · Block {p.block} · Room {p.room}</div><div className="text-sm mt-2">{p.destination} · {p.leave_datetime} → {p.return_datetime}</div></div><span className="status-pill">{p.last_scan||'READY'}</span></div></div>)}{passes.length===0&&<div className="paper-card p-8 text-center" style={{color:'var(--slate)'}}>No fully approved passes are ready at the gate.</div>}</div></div>;
}

function AnalyticsView({ analytics }) {
  const max=Math.max(1,...(analytics?.blocks||[]).map(x=>Number(x.students)));
  return <div><SectionTitle eyebrow="Insights" title="Advanced Analytics" subtitle="Live statistics calculated from the database."/><div className="grid sm:grid-cols-3 gap-4 mb-6"><StatCard label="Fees billed" value={`₹${Number(analytics?.fees?.billed||0).toLocaleString()}`} icon={FileText}/><StatCard label="Fees collected" value={`₹${Number(analytics?.fees?.paid||0).toLocaleString()}`} icon={CheckCircle2}/><StatCard label="Complaint count" value={(analytics?.complaints||[]).reduce((s,x)=>s+Number(x.count),0)} icon={Bell}/></div><div className="grid md:grid-cols-2 gap-5"><div className="paper-card p-5"><div className="label-eyebrow mb-4">Students by block</div>{(analytics?.blocks||[]).map(b=><div key={b.block} className="mb-4"><div className="flex justify-between text-sm mb-1"><span>Block {b.block}</span><span>{b.students}</span></div><div className="occ-bar"><div className="occ-fill" style={{width:`${Number(b.students)/max*100}%`}}/></div></div>)}</div><div className="paper-card p-5"><div className="label-eyebrow mb-4">Leave trends</div>{(analytics?.leaveTrend||[]).slice(0,10).map((x,i)=><div key={i} className="flex justify-between text-sm py-2" style={{borderBottom:'1px solid var(--line)'}}><span>{x.month} · {x.status}</span><strong>{x.count}</strong></div>)}</div></div></div>;
}

// ---------- Parent approval (public page, reached from the emailed/texted link) ----------

function ParentApprovalPage({ token }) {
  const [leave, setLeave] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    api.getParentApproval(token)
      .then(setLeave)
      .catch((err) => setError(err.message || "This link is invalid or has expired."))
      .finally(() => setLoading(false));
  }, [token]);

  const respond = async (decision) => {
    setDeciding(true);
    setError("");
    try {
      const res = await api.respondParentApproval(token, decision);
      setLeave(res.leave);
    } catch (err) {
      setError(err.message || "Could not submit your response.");
    } finally {
      setDeciding(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--paper)" }}>
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <KeyRound size={22} color="var(--brass)" />
          <span className="font-display text-xl tracking-wide" style={{ color: "var(--ink)" }}>Hosteliq</span>
        </div>
        <div className="label-eyebrow mb-2 text-center">Parent / guardian approval</div>
        <h2 className="font-display text-2xl mb-6 text-center" style={{ color: "var(--ink)" }}>Leave pass request</h2>

        {loading ? (
          <div className="flex justify-center"><Loader2 className="animate-spin" size={24} /></div>
        ) : error ? (
          <ErrorBanner message={error} />
        ) : (
          <>
            <GatePassSlip leave={leave} />
            {leave.parent_status === "Pending" ? (
              <div className="flex gap-3 mt-5">
                <button
                  disabled={deciding}
                  onClick={() => respond("Rejected")}
                  className="btn-secondary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ borderColor: "var(--rust)", color: "var(--rust)" }}
                >
                  <XCircle size={16} /> Deny
                </button>
                <button
                  disabled={deciding}
                  onClick={() => respond("Approved")}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <CheckCircle2 size={16} /> Approve
                </button>
              </div>
            ) : (
              <p className="text-sm mt-5 text-center" style={{ color: "var(--slate)" }}>
                You already responded: <strong>{leave.parent_status}</strong>.
                {leave.valid && " This leave pass is fully approved."}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- App shell ----------

const studentNav = [
  { key: "dashboard", label: "Dashboard", icon: Home },
  { key: "profile", label: "My profile", icon: User },
  { key: "apply", label: "Apply for leave", icon: FileText },
  { key: "history", label: "Leave history", icon: History },
  { key: "announcements", label: "Announcements", icon: Megaphone },
];

const adminNav = [
  { key: "dashboard", label: "Dashboard", icon: Home },
  { key: "students", label: "Students", icon: Users },
  { key: "leaves", label: "Gate passes", icon: FileText },
  { key: "blocks", label: "Blocks & rooms", icon: Building2 },
  { key: "announcements", label: "Announcements", icon: Megaphone },
  { key: "complaints", label: "Complaints", icon: MessageSquare },
  { key: "maintenance", label: "Maintenance", icon: Wrench },
  { key: "attendance", label: "Attendance", icon: CalendarCheck },
  { key: "fees", label: "Fees", icon: WalletCards },
  { key: "documents", label: "Documents", icon: FileArchive },
];

const adminNavExtra = [
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "security", label: "Gate Security", icon: ShieldCheck },
];

function AuthenticatedApp() {
  const [booting, setBooting] = useState(true);
  const [authScreen, setAuthScreen] = useState("login"); // 'login' | 'signup'
  const [googlePrefill, setGooglePrefill] = useState(null); // { name, email } when Google sign-in found no matching account
  const [user, setUser] = useState(null);       // { id, role, email, mobile }
  const [profile, setProfile] = useState(null); // student profile, if role === student
  const [page, setPage] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState("");

  const [students, setStudents] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [stats, setStats] = useState(null);
  const [query, setQuery] = useState("");
  const [blockFilter, setBlockFilter] = useState("All");
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [complaints,setComplaints]=useState([]); const [maintenance,setMaintenance]=useState([]); const [attendance,setAttendance]=useState([]); const [fees,setFees]=useState([]); const [documents,setDocuments]=useState([]); const [analytics,setAnalytics]=useState(null); const [securityPasses,setSecurityPasses]=useState([]);

  const fireToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3200);
  };

  // ---- Restore session on load ----
  useEffect(() => {
    (async () => {
      if (!api.getToken()) { setBooting(false); return; }
      try {
        const me = await api.getMe();
        setUser(me.user);
        setProfile(me.profile);
      } catch {
        api.setToken(null);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  // ---- Data loaders ----
  const loadAnnouncements = useCallback(() => api.getAnnouncements().then(setAnnouncements), []);
  const loadBlocks = useCallback(() => api.getBlocks().then(setBlocks), []);

  const loadStudentData = useCallback(async () => {
    const [p, l, c, m, a, f, d] = await Promise.all([api.getMyProfile(), api.getMyLeaves(), api.getComplaints(), api.getMaintenance(), api.getAttendance(), api.getFees(), api.getDocuments()]);
    setProfile(p); setLeaves(l); setComplaints(c); setMaintenance(m); setAttendance(a); setFees(f); setDocuments(d); await loadAnnouncements();
  }, [loadAnnouncements]);

  const loadAdminData = useCallback(async () => {
    const [s, l, b, st, c, m, a, f, d, an] = await Promise.all([api.getStudents(), api.getLeaves(), api.getBlocks(), api.getStats(), api.getComplaints(), api.getMaintenance(), api.getAttendance(), api.getFees(), api.getDocuments(), api.getAnalytics()]);
    setStudents(s); setLeaves(l); setBlocks(b); setStats(st); setComplaints(c); setMaintenance(m); setAttendance(a); setFees(f); setDocuments(d); setAnalytics(an); await loadAnnouncements();
  }, [loadAnnouncements]);

  const loadSecurityData = useCallback(async()=>{ setSecurityPasses(await api.getSecurityOverview()); },[]);

  const loadData = useCallback(() => {
    if (!user) return;
    setDataError("");
    setDataLoading(true);
    const loader = user.role === "student" ? loadStudentData() : user.role === "security" ? loadSecurityData() : loadAdminData();
    loader
      .catch((err) => setDataError(err.message || "Unable to load your data. Please try again."))
      .finally(() => setDataLoading(false));
  }, [user, loadStudentData, loadAdminData]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Debounced admin student search
  useEffect(() => {
    if (!user || user.role !== "admin") return;
    const t = setTimeout(() => {
      api.getStudents(query, blockFilter).then(setStudents);
    }, 250);
    return () => clearTimeout(t);
  }, [query, blockFilter, user]);

  // ---- Actions ----
  // Password-based login for students and admins.
  const handleLogin = async (identifier, password, role) => {
    const res = await api.login(identifier, password, role);
    api.setToken(res.token);
    setUser(res.user);
    setProfile(res.profile);
    setPage("dashboard");
  };

  const handleEmailOtpLogin = async (email, otp) => {
    const res = await api.verifyEmailLoginOtp(email, otp);
    api.setToken(res.token);
    setUser(res.user);
    setProfile(res.profile);
    setPage("dashboard");
  };

  // Called with the Google ID token credential once the user picks an
  // account in the Google button. On success, logs in exactly like any
  // other method; if no account matches that Google email yet, routes to
  // registration pre-filled with the name/email Google gave us.
  const handleGoogleLogin = useCallback(async (credential) => {
    try {
      const res = await api.googleLogin(credential);
      api.setToken(res.token);
      setUser(res.user);
      setProfile(res.profile);
      setPage("dashboard");
    } catch (err) {
      if (err.code === "NO_ACCOUNT") {
        setGooglePrefill({ name: err.googleName || "", email: err.googleEmail || "" });
        setAuthScreen("signup");
      } else {
        fireToast(err?.message || "Google sign-in failed.");
      }
    }
  }, []);

  const handleSignup = async (form) => {
    await api.register(form);
    setGooglePrefill(null);
    setAuthScreen("login");
    fireToast("Account created successfully. Sign in with your password.");
  };

  const handleLogout = () => {
    api.logout().catch(() => {}); // revoke refresh token + clear cookie server-side; ignore network errors, we still clear locally
    setUser(null);
    setProfile(null);
    setStudents([]); setLeaves([]); setAnnouncements([]); setBlocks([]);
    setPage("dashboard");
  };

  const handleLeaveSubmit = async (payload) => {
    await api.applyLeave(payload);
    fireToast("Gate pass request submitted");
    setPage("history");
    await loadStudentData();
  };

  const handleDecide = async (id, status) => {
    const res = await api.decideLeave(id, status);
    if (status === "Approved") {
      const sentCount = (res.sms || []).filter((r) => r.status === "sent").length;
      fireToast(sentCount > 0 ? `SMS sent to ${sentCount} guardian contact(s)` : "Approved");
    } else {
      fireToast("Request rejected");
    }
    await loadAdminData();
  };

  const handlePost = async (payload) => {
    await api.postAnnouncement(payload);
    fireToast("Announcement posted to all students");
    await loadAnnouncements();
  };

  const handleEditAnnouncement = async (id, payload) => {
    await api.editAnnouncement(id, payload);
    fireToast("Announcement updated");
    await loadAnnouncements();
  };

  const handleDeleteAnnouncement = async (id) => {
    await api.deleteAnnouncement(id);
    fireToast("Announcement deleted");
    await loadAnnouncements();
  };

  const handleCreateStudent = async (payload) => {
    await api.createStudent(payload);
    fireToast("Student added to the registry");
    await loadAdminData();
  };

  const handleUpdateStudent = async (id, payload) => {
    await api.updateStudent(id, payload);
    fireToast("Student record updated in Supabase");
    await loadAdminData();
  };

  const handleDeleteStudent = async (id) => {
    await api.deleteStudent(id);
    fireToast("Student removed from Supabase");
    await loadAdminData();
  };

  const handleComplaintCreate=async(payload)=>{await api.createComplaint(payload);fireToast("Complaint submitted");if(user.role==="student")setComplaints(await api.getComplaints());else await loadAdminData();};
  const handleComplaintUpdate=async(id,payload)=>{await api.updateComplaint(id,payload);fireToast("Complaint updated");await loadAdminData();};
  const handleMaintenanceCreate=async(payload)=>{await api.createMaintenance(payload);fireToast("Maintenance request submitted");if(user.role==="student")setMaintenance(await api.getMaintenance());else await loadAdminData();};
  const handleMaintenanceUpdate=async(id,payload)=>{await api.updateMaintenance(id,payload);fireToast("Maintenance updated");await loadAdminData();};
  const handleAttendance=async(payload)=>{await api.markAttendance(payload);fireToast("Attendance saved");await loadAdminData();};
  const handleFeeCreate=async(payload)=>{await api.createFee(payload);fireToast("Fee record created");await loadAdminData();};
  const handleDocumentCreate=async(payload)=>{await api.createDocument(payload);fireToast("Document added");if(user.role==="student")setDocuments(await api.getDocuments());else await loadAdminData();};
  const handleDocumentUpdate=async(id,payload)=>{await api.updateDocument(id,payload);fireToast("Document status updated");await loadAdminData();};
  const handleScan=async(payload)=>{await api.scanGatePass(payload);fireToast(`Gate ${payload.scanType} recorded`);setSecurityPasses(await api.getSecurityOverview());};

  if (booting) {
    return (
      <>
        <GlobalStyle />
        <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--paper)" }}>
          <Loader2 className="animate-spin" size={28} color="var(--ink)" />
        </div>
      </>
    );
  }

  if (!user) return (
    <>
      <GlobalStyle />
      {authScreen === "signup" ? (
        <SignupScreen
          onSignup={handleSignup}
          onGoToLogin={() => { setGooglePrefill(null); setAuthScreen("login"); }}
          prefill={googlePrefill}
        />
      ) : (
        <LoginScreen
          onLogin={handleLogin}
          onEmailOtpLogin={handleEmailOtpLogin}
          onGoogleCredential={handleGoogleLogin}
          onGoToSignup={() => setAuthScreen("signup")}
        />
      )}
    </>
  );

  const rawNav = user.role === "student" ? studentNav : user.role === "security" ? [{key:"security",label:"Gate Security",icon:ShieldCheck}] : [...adminNav,...adminNavExtra];
  // De-duplicate by key defensively, in case a future edit to the nav source
  // arrays re-introduces an overlapping entry (this is what previously caused
  // sidebar links like Complaints/Maintenance/Fees to render twice).
  const nav = Array.from(new Map(rawNav.map((n) => [n.key, n])).values());

  const renderPage = () => {
    if (user.role === "student") {
      switch (page) {
        case "profile": return <StudentProfile profile={profile} />;
        case "apply": return <LeaveApply profile={profile} onSubmit={handleLeaveSubmit} />;
        case "history": return <LeaveHistory leaves={leaves} />;
        case "announcements": return <AnnouncementsView announcements={announcements} />;
        case "complaints": return <ComplaintView complaints={complaints} onCreate={handleComplaintCreate}/>;
        case "maintenance": return <MaintenanceView requests={maintenance} onCreate={handleMaintenanceCreate} blocks={blocks}/>;
        case "attendance": return <AttendanceView records={attendance}/>;
        case "fees": return <FeesView fees={fees}/>;
        case "documents": return <DocumentsView documents={documents} onCreate={handleDocumentCreate}/>;
        default: return <StudentDashboard profile={profile} leaves={leaves} announcements={announcements} />;
      }
    }
    if (user.role === "security") return <SecurityDashboard passes={securityPasses} onScan={handleScan}/>;
    switch (page) {
      case "students":
        return (
          <AdminStudents
            students={students} blocks={blocks}
            query={query} setQuery={setQuery}
            blockFilter={blockFilter} setBlockFilter={setBlockFilter}
            onCreate={handleCreateStudent}
            onUpdate={handleUpdateStudent}
            onDelete={handleDeleteStudent}
          />
        );
      case "leaves": return <AdminLeaves leaves={leaves} onDecide={handleDecide} />;
      case "blocks": return <AdminBlocks blocks={blocks} />;
      case "complaints": return <ComplaintView complaints={complaints} onCreate={handleComplaintCreate} onUpdate={handleComplaintUpdate} admin/>;
      case "maintenance": return <MaintenanceView requests={maintenance} onCreate={handleMaintenanceCreate} onUpdate={handleMaintenanceUpdate} admin blocks={blocks}/>;
      case "attendance": return <AttendanceView records={attendance} students={students} onMark={handleAttendance} admin/>;
      case "fees": return <FeesView fees={fees} students={students} onCreate={handleFeeCreate} admin/>;
      case "documents": return <DocumentsView documents={documents} onCreate={handleDocumentCreate} onUpdate={handleDocumentUpdate} admin/>;
      case "analytics": return <AnalyticsView analytics={analytics}/>;
      case "security": return <SecurityDashboard passes={securityPasses} onScan={handleScan}/>;
      case "announcements":
        return (
          <AdminAnnouncements
            announcements={announcements}
            onPost={handlePost}
            onEdit={handleEditAnnouncement}
            onDelete={handleDeleteAnnouncement}
          />
        );
      default: return <AdminDashboard studentCount={students.length} leaves={leaves} blocks={blocks} stats={stats} />;
    }
  };

  return (
    <>
      <GlobalStyle />
      <div className="min-h-screen flex" style={{ background: "var(--paper)" }}>
        <aside className={`sidebar ${menuOpen ? "block" : "hidden"} md:block`}>
          <div className="flex items-center gap-2 px-4 py-5">
            <KeyRound size={20} color="var(--brass-light)" />
            <span className="font-display text-lg" style={{ color: "var(--paper)" }}>Hosteliq</span>
          </div>
          <nav className="px-2 space-y-1">
            {nav.map((n) => (
              <SidebarLink key={n.key} icon={n.icon} label={n.label} active={page === n.key} onClick={() => { setPage(n.key); setMenuOpen(false); }} />
            ))}
          </nav>
          <div className="px-2 mt-6">
            <SidebarLink icon={LogOut} label="Sign out" onClick={handleLogout} />
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="topbar">
            <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="ml-auto flex items-center gap-2 text-sm" style={{ color: "var(--slate)" }}>
              <span className="capitalize">{user.role}</span>
              <span>·</span>
              <span>{user.role === "student" ? profile?.name : user.email}</span>
            </div>
          </header>
          <main className="flex-1 p-6 md:p-10">
            {dataLoading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="animate-spin" size={24} color="var(--ink)" />
              </div>
            ) : dataError ? (
              <div className="paper-card p-8 text-center max-w-md mx-auto">
                <p className="font-display text-lg mb-2" style={{ color: "var(--ink)" }}>Unable to connect to server</p>
                <p className="text-sm mb-5" style={{ color: "var(--slate)" }}>{dataError}</p>
                <button onClick={loadData} className="btn-primary">Retry</button>
              </div>
            ) : (
              <div key={page} className="page-transition">
                {renderPage()}
              </div>
            )}
          </main>
        </div>
      </div>
      <Toast message={toast} />
    </>
  );
}

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

      :root {
        --paper: #ECE9E0;
        --paper-card: #F5F3EC;
        --ink: #1B2A4A;
        --ink-light: #2F4066;
        --brass: #A8763A;
        --brass-light: #D9B876;
        --forest: #3F6B4F;
        --rust: #A8442F;
        --slate: #5B5D57;
        --line: #CFCABB;
      }
      * { font-family: 'Inter', sans-serif; }
      .font-display { font-family: 'Fraunces', serif; }
      .font-mono { font-family: 'IBM Plex Mono', monospace; }

      .label-eyebrow {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--brass);
      }

      .paper-card {
        background: var(--paper-card);
        border: 1px solid var(--line);
        border-radius: 8px;
      }

      .field {
        width: 100%;
        background: var(--paper-card);
        border: 1px solid var(--line);
        border-radius: 6px;
        padding: 10px 12px;
        font-size: 14px;
        color: var(--ink);
        outline: none;
      }
      .field:focus {
        border-color: var(--brass);
        box-shadow: 0 0 0 3px rgba(168,118,58,0.18);
      }

      .btn-primary {
        background: var(--ink);
        color: var(--paper);
        border-radius: 6px;
        padding: 10px 18px;
        font-size: 14px;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s ease;
      }
      .btn-primary:hover:not(:disabled) { background: var(--ink-light); }

      .btn-secondary {
        background: transparent;
        border: 1px solid var(--line);
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 500;
      }

      .icon-chip {
        width: 40px; height: 40px;
        border-radius: 8px;
        background: var(--ink);
        color: var(--brass-light);
        display: flex; align-items: center; justify-content: center;
      }

      .sidebar {
        width: 240px;
        background: var(--ink);
        min-height: 100vh;
        flex-shrink: 0;
        position: sticky;
        top: 0;
      }
      .sidebar-link { color: rgba(236,233,224,0.65); }
      .sidebar-link:hover { color: var(--paper); background: rgba(255,255,255,0.05); }
      .sidebar-active { background: rgba(217,184,118,0.15); color: var(--brass-light); }

      .topbar {
        height: 60px;
        display: flex; align-items: center;
        padding: 0 20px;
        border-bottom: 1px solid var(--line);
        background: var(--paper);
        position: sticky; top: 0; z-index: 10;
      }

      .occ-bar { height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; }
      .occ-fill { height: 100%; background: var(--brass); }

      .id-card {
        background: linear-gradient(135deg, var(--ink), var(--ink-light));
        border-radius: 10px;
        padding: 20px 22px;
      }
      .id-photo {
        width: 56px; height: 56px;
        border-radius: 50%;
        background: rgba(255,255,255,0.12);
        color: var(--brass-light);
        display: flex; align-items: center; justify-content: center;
      }

      .slip {
        display: flex;
        border: 1px solid var(--line);
        border-radius: 8px;
        overflow: hidden;
        background: var(--paper-card);
      }
      .slip-main { flex: 1; padding: 16px 18px; }
      .slip-stub {
        width: 110px;
        border-left: 2px dashed var(--line);
        display: flex; align-items: center; justify-content: center;
        padding: 12px;
      }
      .stamp {
        border: 2px solid;
        border-radius: 6px;
        padding: 6px 8px;
        font-family: 'IBM Plex Mono', monospace;
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.05em;
        transform: rotate(-6deg);
        text-align: center;
      }

      .brand-panel { background: var(--ink); position: relative; }
      .key-grid {
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 8px;
        max-width: 220px;
      }
      .key-tag {
        width: 14px; height: 14px;
        border-radius: 50%;
        background: rgba(217,184,118,0.35);
        animation: pulse 3s ease-in-out infinite;
      }
      @keyframes pulse {
        0%, 100% { opacity: 0.35; }
        50% { opacity: 0.9; }
      }

      .toast {
        position: fixed;
        bottom: 24px; left: 50%;
        transform: translateX(-50%);
        background: var(--ink);
        color: var(--paper);
        padding: 10px 18px;
        border-radius: 999px;
        font-size: 13px;
        display: flex; align-items: center; gap: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        z-index: 50;
      }

      @media (prefers-reduced-motion: reduce) {
        .key-tag { animation: none; }
      }
    `}</style>
  );
}

// Minimal manual routing (no router dependency needed): the parent-approval
// link points straight at this path and renders standalone, outside the
// normal login-gated app shell. Kept as a separate top-level component (not
// a branch inside AuthenticatedApp) so hook call order there is never
// conditional on the URL.
export default function App() {
  const parentApprovalMatch = window.location.pathname.match(/^\/parent-approval\/([^/]+)\/?$/);
  if (parentApprovalMatch) {
    return (
      <>
        <GlobalStyle />
        <ParentApprovalPage token={parentApprovalMatch[1]} />
      </>
    );
  }
  return <AuthenticatedApp />;
}
