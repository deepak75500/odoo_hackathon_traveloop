import { useState, useRef } from "react";
import { api, saveSession } from "../api.js";
import { Button, Field, Icons } from "../components/ui.jsx";

// ---------------------------------------------------------------------------
// API base URL
// In dev, Vite runs on :5173 but FastAPI on :8082, so relative /uploads/…
// won't load. Set VITE_API_URL=http://localhost:8082 in your .env file.
// In production (same origin) leave it unset — it defaults to "".
// ---------------------------------------------------------------------------
const API_BASE = import.meta.env.VITE_API_URL ?? "";

/** Turns a server-relative path into a full URL the browser can load. */
function resolveUrl(path) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${API_BASE}${path}`;
}

// ---------------------------------------------------------------------------
// Country codes
// ---------------------------------------------------------------------------
const COUNTRY_CODES = [
  { code: "+91",  label: "🇮🇳 +91  India" },
  { code: "+1",   label: "🇺🇸 +1   USA / Canada" },
  { code: "+44",  label: "🇬🇧 +44  UK" },
  { code: "+61",  label: "🇦🇺 +61  Australia" },
  { code: "+971", label: "🇦🇪 +971 UAE" },
  { code: "+65",  label: "🇸🇬 +65  Singapore" },
  { code: "+60",  label: "🇲🇾 +60  Malaysia" },
  { code: "+49",  label: "🇩🇪 +49  Germany" },
  { code: "+33",  label: "🇫🇷 +33  France" },
  { code: "+81",  label: "🇯🇵 +81  Japan" },
  { code: "+86",  label: "🇨🇳 +86  China" },
  { code: "+82",  label: "🇰🇷 +82  South Korea" },
  { code: "+55",  label: "🇧🇷 +55  Brazil" },
  { code: "+27",  label: "🇿🇦 +27  South Africa" },
  { code: "+7",   label: "🇷🇺 +7   Russia" },
  { code: "+966", label: "🇸🇦 +966 Saudi Arabia" },
  { code: "+62",  label: "🇮🇩 +62  Indonesia" },
  { code: "+92",  label: "🇵🇰 +92  Pakistan" },
  { code: "+880", label: "🇧🇩 +880 Bangladesh" },
  { code: "+94",  label: "🇱🇰 +94  Sri Lanka" },
  { code: "+977", label: "🇳🇵 +977 Nepal" },
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
function validateEmail(email) {
  if (!email?.trim()) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()))
    return "Enter a valid email address (e.g. name@gmail.com).";
  return "";
}
function validatePhone(number) {
  if (!number?.trim()) return "";
  const d = number.replace(/\s/g, "");
  if (!/^\d{6,12}$/.test(d)) return "Enter 6–12 digits (no dashes or spaces).";
  return "";
}
function validatePassword(pw) {
  if (!pw) return "Password is required.";
  if (pw.length < 8) return "Must be at least 8 characters.";
  return "";
}

// ---------------------------------------------------------------------------
// Tiny UI helpers
// ---------------------------------------------------------------------------
function ErrorMsg({ msg }) {
  if (!msg) return null;
  return (
    <p style={{ color: "#e53e3e", fontSize: "0.78rem", marginTop: "3px", marginBottom: 0 }}>
      ⚠ {msg}
    </p>
  );
}

function Spinner() {
  return (
    <span style={{
      display: "inline-block", width: 14, height: 14,
      border: "2px solid currentColor", borderTopColor: "transparent",
      borderRadius: "50%", animation: "spin 0.7s linear infinite",
    }} />
  );
}

// ---------------------------------------------------------------------------
// uploadPhoto
// POST /api/upload/photo  — multipart with two fields:
//   file    : the image file
//   old_url : current server path so the backend can delete it (prevents orphans)
// Returns { url: "/uploads/photos/<uuid>.<ext>" }
// ---------------------------------------------------------------------------
async function uploadPhoto(file, oldUrl = "") {
  const fd = new FormData();
  fd.append("file", file);
  if (oldUrl) fd.append("old_url", oldUrl); // backend deletes the old file

  const res = await fetch(`${API_BASE}/api/upload/photo`, { method: "POST", body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Photo upload failed.");
  }
  return (await res.json()).url; // "/uploads/photos/abc123.jpg"
}

// ---------------------------------------------------------------------------
// PhotoPicker
// value        — current photo_url stored in the parent form (server path)
// onChange(url)— called with new server URL or "" to clear
// onError(msg) — field error setter
// onUploading  — true while a network request is in flight
// ---------------------------------------------------------------------------
function PhotoPicker({ value, onChange, onError, onUploading }) {
  const fileRef    = useRef(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!ALLOWED.includes(file.type)) {
      onError("Only JPG, PNG, WEBP or GIF images are allowed."); return;
    }
    if (file.size > 5 * 1024 * 1024) {
      onError("Image must be smaller than 5 MB."); return;
    }

    onError("");
    setUploading(true);
    onUploading(true);

    try {
      // Pass the existing value as old_url — backend deletes the previous file.
      // This prevents orphaned files when the user uploads multiple times.
      const serverUrl = await uploadPhoto(file, value);
      onChange(serverUrl);
    } catch (err) {
      onError(err.message);
      onChange("");
    } finally {
      setUploading(false);
      onUploading(false);
    }
  }

  function clear() {
    onChange("");
    onError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  // resolveUrl converts "/uploads/photos/abc.jpg" → full URL using API_BASE
  const previewSrc = resolveUrl(value);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>

      {/* Avatar preview — always reads from the server URL via resolveUrl */}
      {previewSrc ? (
        <div style={{ position: "relative", width: "80px", height: "80px" }}>
          <img
            src={previewSrc}
            alt="Profile"
            style={{
              width: "80px", height: "80px", borderRadius: "50%",
              objectFit: "cover", border: "2px solid var(--border, #ddd)",
            }}
            onError={clear}
          />
          {uploading && (
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              background: "rgba(0,0,0,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 18,
            }}>
              <Spinner />
            </div>
          )}
          {!uploading && (
            <button type="button" onClick={clear} title="Remove" style={{
              position: "absolute", top: "-4px", right: "-4px",
              width: "20px", height: "20px", borderRadius: "50%",
              border: "none", background: "#e53e3e", color: "#fff",
              fontSize: "11px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>✕</button>
          )}
        </div>
      ) : (
        <div style={{
          width: "80px", height: "80px", borderRadius: "50%",
          border: "2px dashed var(--border,#ccc)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#aaa", fontSize: "24px",
        }}>
          {uploading ? <Spinner /> : "👤"}
        </div>
      )}

      {/* Upload button */}
      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
        style={{
          padding: "6px 14px", borderRadius: "6px",
          border: "1px solid var(--border,#ddd)", background: "var(--surface,#f5f5f5)",
          cursor: uploading ? "wait" : "pointer", fontSize: "0.82rem",
          display: "inline-flex", alignItems: "center", gap: "6px",
          opacity: uploading ? 0.65 : 1, width: "fit-content",
        }}
      >
        {uploading ? <><Spinner /> Uploading…</> : "📁 Choose photo"}
      </button>

      {value && !uploading && (
        <span style={{ fontSize: "0.72rem", color: "#38a169" }}>✓ Photo saved</span>
      )}

      <input ref={fileRef} type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: "none" }} onChange={handleFile}
      />

      <p style={{ fontSize: "0.72rem", color: "#888", margin: 0 }}>
        JPG / PNG / WEBP / GIF · max 5 MB · stored at <code>/uploads/photos/</code>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ForgotPasswordModal
// 3-step flow: email → OTP (sent via SMTP) → new password → auto-login
// ---------------------------------------------------------------------------
function ForgotPasswordModal({ onClose, onSuccess }) {
  const [step, setStep]       = useState("email");  // "email" | "otp" | "password" | "done"
  const [email, setEmail]     = useState("");
  const [otp, setOtp]         = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState("");

  async function sendOtp() {
    const emailErr = validateEmail(email);
    if (emailErr) { setError(emailErr); return; }
    setBusy(true); setError("");
    try {
      await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      // Always advance (don't reveal if email exists)
      setStep("otp");
    } catch {
      setError("Network error. Please try again.");
    } finally { setBusy(false); }
  }

  async function verifyOtp() {
    if (otp.length !== 6) { setError("Enter the 6-digit OTP from your email."); return; }
    setBusy(true); setError("");
    try {
      const res  = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Invalid OTP.");
      setResetToken(data.reset_token);
      setStep("password");
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  async function resetPassword() {
    const pwErr = validatePassword(password);
    if (pwErr) { setError(pwErr); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      const res  = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Reset failed.");
      // Auto-login with the new session the backend created
      saveSession(data.token, data.user);
      onSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  const overlay = {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 999,
  };
  const card = {
    background: "var(--surface,#fff)",
    borderRadius: "12px",
    padding: "32px 28px",
    width: "100%", maxWidth: "380px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
    display: "flex", flexDirection: "column", gap: "16px",
  };
  const inputStyle = {
    width: "100%", padding: "10px 12px",
    borderRadius: "8px", border: "1px solid var(--border,#ddd)",
    fontSize: "0.95rem", boxSizing: "border-box",
  };
  const btn = (disabled) => ({
    padding: "10px 0", borderRadius: "8px", border: "none",
    background: disabled ? "#ccc" : "#3182ce", color: "#fff",
    fontWeight: 600, fontSize: "0.95rem", cursor: disabled ? "not-allowed" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
  });

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: "1.15rem" }}>
            {step === "email"    && "Forgot Password"}
            {step === "otp"      && "Enter OTP"}
            {step === "password" && "New Password"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer" }}>✕</button>
        </div>

        {/* Step 1 — Email */}
        {step === "email" && (
          <>
            <p style={{ margin: 0, fontSize: "0.88rem", color: "#555" }}>
              Enter your account email. We'll send a 6-digit OTP.
            </p>
            <input
              type="email" placeholder="your@email.com"
              value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && sendOtp()}
              style={inputStyle} autoFocus
            />
            {error && <ErrorMsg msg={error} />}
            <button style={btn(busy)} disabled={busy} onClick={sendOtp}>
              {busy ? <><Spinner /> Sending…</> : "Send OTP"}
            </button>
          </>
        )}

        {/* Step 2 — OTP */}
        {step === "otp" && (
          <>
            <p style={{ margin: 0, fontSize: "0.88rem", color: "#555" }}>
              A 6-digit OTP was sent to <strong>{email}</strong>.<br />
              Check your inbox (and spam folder). It expires in 10 minutes.
            </p>
            <input
              type="text" placeholder="123456" maxLength={6}
              value={otp}
              onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "")); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
              style={{ ...inputStyle, letterSpacing: "6px", fontSize: "1.4rem", textAlign: "center" }}
              autoFocus
            />
            {error && <ErrorMsg msg={error} />}
            <button style={btn(busy || otp.length < 6)} disabled={busy || otp.length < 6} onClick={verifyOtp}>
              {busy ? <><Spinner /> Verifying…</> : "Verify OTP"}
            </button>
            <button onClick={() => { setStep("email"); setOtp(""); setError(""); }}
              style={{ background: "none", border: "none", color: "#3182ce", cursor: "pointer", fontSize: "0.85rem" }}>
              ← Use a different email
            </button>
          </>
        )}

        {/* Step 3 — New password */}
        {step === "password" && (
          <>
            <p style={{ margin: 0, fontSize: "0.88rem", color: "#555" }}>
              OTP verified ✓ Set your new password.
            </p>
            <input
              type="password" placeholder="New password (min 8 chars)"
              value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
              style={inputStyle} autoFocus
            />
            <input
              type="password" placeholder="Confirm new password"
              value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && resetPassword()}
              style={inputStyle}
            />
            {error && <ErrorMsg msg={error} />}
            <button style={btn(busy)} disabled={busy} onClick={resetPassword}>
              {busy ? <><Spinner /> Resetting…</> : "Reset Password & Login"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AuthScreen
// ---------------------------------------------------------------------------
export default function AuthScreen({ onAuth }) {
  const [mode, setMode]                     = useState("login");
  const [busy, setBusy]                     = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [showFP, setShowFP]                 = useState(false);
  const [signedUp, setSignedUp]             = useState("");   // email shown after signup
  const [error, setError]                   = useState("");
  const [fieldErrors, setFieldErrors]       = useState({});
  const [dialCode, setDialCode]             = useState("+91");
  const [form, setForm] = useState({
    first_name: "", last_name: "",
    email: "demo@traveloop.test", password: "password123",
    phone: "", city: "", country: "", bio: "", photo_url: "",
  });

  function update(field, value) {
    setForm((p) => ({ ...p, [field]: value }));
    setFieldErrors((p) => ({ ...p, [field]: "" }));
  }

  function validate() {
    const errs = {};
    const eErr = validateEmail(form.email);   if (eErr) errs.email    = eErr;
    const pErr = validatePassword(form.password); if (pErr) errs.password = pErr;
    if (mode === "signup") {
      if (!form.first_name.trim()) errs.first_name = "First name is required.";
      if (!form.last_name.trim())  errs.last_name  = "Last name is required.";
      const phErr = validatePhone(form.phone); if (phErr) errs.phone = phErr;
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit() {
    if (busy || photoUploading) return;
    setError("");
    if (!validate()) return;
    setBusy(true);
    try {
      const fullPhone = form.phone.trim() ? `${dialCode}${form.phone.trim()}` : "";
      const payload =
        mode === "login"
          ? await api.login({ email: form.email, password: form.password })
          : await api.signup({
              first_name: form.first_name, last_name: form.last_name,
              email: form.email, password: form.password,
              phone: fullPhone, city: form.city, country: form.country,
              bio: form.bio,
              photo_url: form.photo_url,   // server path, e.g. /uploads/photos/abc.jpg
              language: "English",
            });

      saveSession(payload.token, payload.user);

      if (mode === "signup") {
        // Show a brief "check your email" notice before entering the dashboard
        setSignedUp(form.email);
        setTimeout(() => onAuth(payload.user), 2800);
      } else {
        onAuth(payload.user);
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    setMode((m) => (m === "login" ? "signup" : "login"));
    setError(""); setFieldErrors({}); setSignedUp("");
  }

  const submitDisabled = busy || photoUploading;

  // ---------------------------------------------------------------------------
  // Signup success notice
  // ---------------------------------------------------------------------------
  if (signedUp) {
    return (
      <main className="auth-shell">
        <section className="auth-card" style={{ textAlign: "center", gap: "16px" }}>
          <div style={{ fontSize: "52px" }}>🎉</div>
          <h2 style={{ margin: 0 }}>Welcome aboard!</h2>
          <p style={{ color: "#555", margin: 0 }}>
            A welcome email has been sent to <strong>{signedUp}</strong>.<br />
            Taking you to your dashboard…
          </p>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Spinner />
          </div>
        </section>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  // ---------------------------------------------------------------------------
  // Main auth card
  // ---------------------------------------------------------------------------
  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {showFP && (
        <ForgotPasswordModal
          onClose={() => setShowFP(false)}
          onSuccess={(user) => { setShowFP(false); onAuth(user); }}
        />
      )}

      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand auth-brand">
            <Icons.Plane size={28} />
            <span>Traveloop</span>
          </div>
          <h1>{mode === "login" ? "Login" : "Registration"}</h1>

          <div className={mode === "signup" ? "auth-form register-grid" : "auth-form"}>

            {mode === "signup" && (
              <>
                <div>
                  <Field label="First name">
                    <input value={form.first_name} onChange={(e) => update("first_name", e.target.value)}
                      autoComplete="given-name"
                      style={fieldErrors.first_name ? { borderColor: "#e53e3e" } : {}} />
                  </Field>
                  <ErrorMsg msg={fieldErrors.first_name} />
                </div>
                <div>
                  <Field label="Last name">
                    <input value={form.last_name} onChange={(e) => update("last_name", e.target.value)}
                      autoComplete="family-name"
                      style={fieldErrors.last_name ? { borderColor: "#e53e3e" } : {}} />
                  </Field>
                  <ErrorMsg msg={fieldErrors.last_name} />
                </div>
              </>
            )}

            <div className={mode === "signup" ? "wide" : ""}>
              <Field label="Email address">
                <input type="email" value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  autoComplete="email"
                  style={fieldErrors.email ? { borderColor: "#e53e3e" } : {}} />
              </Field>
              <ErrorMsg msg={fieldErrors.email} />
            </div>

            <div className={mode === "signup" ? "wide" : ""}>
              <Field label="Password">
                <input type="password" value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  style={fieldErrors.password ? { borderColor: "#e53e3e" } : {}} />
              </Field>
              <ErrorMsg msg={fieldErrors.password} />
            </div>

            {mode === "signup" && (
              <>
                {/* Phone */}
                <div className="wide">
                  <label className="field">
                    <span>Phone <small style={{ color: "#888" }}>(optional)</small></span>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <select value={dialCode} onChange={(e) => setDialCode(e.target.value)}
                        style={{
                          flexShrink: 0, width: "160px", padding: "0 8px",
                          borderRadius: "6px", border: "1px solid var(--border,#ddd)",
                          background: "var(--surface,#fff)", fontSize: "0.85rem",
                        }}>
                        {COUNTRY_CODES.map((c) => (
                          <option key={c.code} value={c.code}>{c.label}</option>
                        ))}
                      </select>
                      <input value={form.phone}
                        onChange={(e) => update("phone", e.target.value.replace(/[^\d\s]/g, ""))}
                        placeholder="9876543210" autoComplete="tel-national" maxLength={12}
                        style={{ flex: 1, ...(fieldErrors.phone ? { borderColor: "#e53e3e" } : {}) }} />
                    </div>
                  </label>
                  <ErrorMsg msg={fieldErrors.phone} />
                </div>

                {/* City & Country */}
                <Field label="City">
                  <input value={form.city} onChange={(e) => update("city", e.target.value)} autoComplete="address-level2" />
                </Field>
                <Field label="Country">
                  <input value={form.country} onChange={(e) => update("country", e.target.value)} autoComplete="country-name" />
                </Field>

                {/* Photo upload */}
                <div className="wide">
                  <label className="field">
                    <span>Profile photo <small style={{ color: "#888" }}>(optional)</small></span>
                  </label>
                  {/* Flow:
                       1. User picks file → POST /api/upload/photo (sends old_url to delete prev)
                       2. Backend saves to uploads/photos/, returns { url }
                       3. url stored in form.photo_url
                       4. signup payload sends photo_url → backend writes to users table
                       5. GET /api/me returns photo_url → displayed via StaticFiles /uploads mount
                  */}
                  <PhotoPicker
                    value={form.photo_url}
                    onChange={(url) => update("photo_url", url)}
                    onError={(msg) => setFieldErrors((p) => ({ ...p, photo_url: msg }))}
                    onUploading={setPhotoUploading}
                  />
                  <ErrorMsg msg={fieldErrors.photo_url} />
                  {photoUploading && (
                    <p style={{ fontSize: "0.78rem", color: "#c07a00", marginTop: "4px" }}>
                      ⏳ Photo uploading — please wait before registering…
                    </p>
                  )}
                </div>

                {/* Bio */}
                <label className="field wide">
                  <span>Additional information</span>
                  <textarea value={form.bio} onChange={(e) => update("bio", e.target.value)} rows={3} />
                </label>
              </>
            )}

            {error && (
              <p className="error-text wide" style={{ color: "#e53e3e", fontWeight: 500 }}>
                ⚠ {error}
              </p>
            )}

            <Button
              icon={mode === "login" ? Icons.User : Icons.Plus}
              disabled={submitDisabled}
              onClick={submit}
            >
              {busy ? "Please wait…"
                : photoUploading ? "Uploading photo…"
                : mode === "login" ? "Login"
                : "Register now"}
            </Button>
          </div>

          <div className="auth-links">
            <button type="button" onClick={switchMode}>
              {mode === "login" ? "Create account" : "Use login"}
            </button>
            <button type="button" onClick={() => setShowFP(true)}>
              Forgot password
            </button>
          </div>
        </section>

        <aside className="auth-photo">
          <div>
            <span>Demo account</span>
            <strong>demo@traveloop.test</strong>
            <small>password123</small>
          </div>
        </aside>
      </main>
    </>
  );
}