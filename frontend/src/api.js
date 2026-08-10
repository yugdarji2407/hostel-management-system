const BASE = import.meta.env.VITE_API_URL || "";
const TOKEN_KEY = "hosteliq_token";

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(token) { if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY); }

let refreshInFlight = null;

/** Calls /api/auth/refresh using the httpOnly cookie. Shared so concurrent 401s only trigger one refresh. */
function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${BASE}/api/auth/refresh`, { method: "POST", credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("refresh failed");
        const data = await res.json();
        setToken(data.token);
        return data.token;
      })
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

async function request(path, { method = "GET", body, auth = true, _retried = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res;
  try {
    // credentials: 'include' — the httpOnly refresh-token cookie only travels
    // with requests that opt in to this, even on same-origin dev proxying.
    res = await fetch(`${BASE}/api${path}`, { method, headers, credentials: "include", body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error("Unable to connect to server. Please check the backend and try again.");
  }

  // A 401 on an authenticated call likely means the short-lived access token
  // expired — silently refresh once via the cookie and retry, instead of
  // bouncing the user to the login screen for what should be invisible.
  if (res.status === 401 && auth && !_retried && path !== "/auth/refresh" && path !== "/auth/login") {
    try {
      await refreshAccessToken();
      return request(path, { method, body, auth, _retried: true });
    } catch {
      setToken(null);
      // fall through to normal error handling below with the original response
    }
  }

  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

// ---------- Auth ----------
// Password login — mobile number or enrollment number for students, email for admin/security.
// Email + password is rejected for students server-side; use loginWithEmailOtp instead.
export const login = (identifier, password, role) => request("/auth/login", { method: "POST", body: { identifier, password, role }, auth: false });
// Google Sign-In — credential is the ID token (JWT) handed back by Google Identity Services.
// Throws a normal error() on failure; a "no account" response carries err.code === "NO_ACCOUNT"
// plus err.googleEmail / err.googleName so the caller can route to registration pre-filled.
export const googleLogin = async (credential) => {
  const res = await fetch(`${BASE}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ credential }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    if (data?.code) err.code = data.code;
    if (data?.googleEmail) err.googleEmail = data.googleEmail;
    if (data?.googleName) err.googleName = data.googleName;
    throw err;
  }
  return data;
};
export const register = (payload) => request("/auth/register", { method: "POST", body: payload, auth: false });
export const logout = () => request("/auth/logout", { method: "POST" }).finally(() => setToken(null));
export const getMe = () => request("/auth/me");

// Email OTP login (students/anyone with an email account) — two steps.
export const requestEmailLoginOtp = (email) => request("/auth/login/email-otp/request", { method: "POST", body: { email }, auth: false });
export const verifyEmailLoginOtp = (email, otp) => request("/auth/login/email-otp/verify", { method: "POST", body: { email, otp }, auth: false });

// Forgot password — two steps.
export const forgotPassword = (email) => request("/auth/forgot-password", { method: "POST", body: { email }, auth: false });
export const resetPassword = (email, otp, newPassword) => request("/auth/reset-password", { method: "POST", body: { email, otp, newPassword }, auth: false });

export const getMyProfile = () => request("/students/me");
export const getStudents = (q, block) => {
  const params = new URLSearchParams(); if (q) params.set("q", q); if (block && block !== "All") params.set("block", block);
  const qs = params.toString(); return request(`/students${qs ? `?${qs}` : ""}`);
};
export const getStudent = (id) => request(`/students/${id}`);
export const createStudent = (payload) => request("/students", { method: "POST", body: payload });
export const updateStudent = (id, payload) => request(`/students/${id}`, { method: "PUT", body: payload });
export const deleteStudent = (id) => request(`/students/${id}`, { method: "DELETE" });
export const getMyLeaves = () => request("/leaves/me");
export const getLeaves = (status) => request(`/leaves${status ? `?status=${status}` : ""}`);
export const applyLeave = (payload) => request("/leaves", { method: "POST", body: payload });
export const decideLeave = (id, status) => request(`/leaves/${id}/decision`, { method: "PUT", body: { status } });
export const getSmsLogs = () => request("/sms-logs");
export const getBlocks = () => request("/blocks");
export const getRooms = (blockId) => request(`/blocks/${blockId}/rooms`);
export const createBlock = (blockNumber) => request("/blocks", { method: "POST", body: { blockNumber } });
export const createRoom = (payload) => request("/rooms", { method: "POST", body: payload });
export const getAnnouncements = () => request("/announcements");
export const postAnnouncement = (payload) => request("/announcements", { method: "POST", body: payload });
export const editAnnouncement = (id, payload) => request(`/announcements/${id}`, { method: "PUT", body: payload });
export const deleteAnnouncement = (id) => request(`/announcements/${id}`, { method: "DELETE" });
export const getStats = () => request("/stats");
export const getParentApproval = (token) => request(`/parent-approval/${token}`, { auth: false });
export const respondParentApproval = (token, decision) => request(`/parent-approval/${token}`, { method: "POST", body: { decision }, auth: false });

export const getComplaints = () => request("/complaints");
export const createComplaint = (payload) => request("/complaints", { method: "POST", body: payload });
export const updateComplaint = (id, payload) => request(`/complaints/${id}`, { method: "PUT", body: payload });
export const getMaintenance = () => request("/maintenance");
export const createMaintenance = (payload) => request("/maintenance", { method: "POST", body: payload });
export const updateMaintenance = (id, payload) => request(`/maintenance/${id}`, { method: "PUT", body: payload });
export const getAttendance = (studentId) => request(`/attendance${studentId ? `?studentId=${encodeURIComponent(studentId)}` : ""}`);
export const markAttendance = (payload) => request("/attendance", { method: "POST", body: payload });
export const getFees = (studentId) => request(`/fees${studentId ? `?studentId=${encodeURIComponent(studentId)}` : ""}`);
export const createFee = (payload) => request("/fees", { method: "POST", body: payload });
export const updateFee = (id, payload) => request(`/fees/${id}`, { method: "PUT", body: payload });
export const getDocuments = (studentId) => request(`/documents${studentId ? `?studentId=${encodeURIComponent(studentId)}` : ""}`);
export const createDocument = (payload) => request("/documents", { method: "POST", body: payload });
export const updateDocument = (id, payload) => request(`/documents/${id}`, { method: "PUT", body: payload });
export const getSecurityOverview = () => request("/security/overview");
export const scanGatePass = (payload) => request("/security/scan", { method: "POST", body: payload });
export const getAuditLogs = () => request("/audit-logs");
export const getAnalytics = () => request("/analytics");

export const sendOtp = (channel, destination, purpose = "registration") => request("/otp/send", { method: "POST", body: { channel, destination, purpose }, auth: false });
export const verifyOtp = (channel, destination, otp, purpose = "registration") => request("/otp/verify", { method: "POST", body: { channel, destination, otp, purpose }, auth: false });
