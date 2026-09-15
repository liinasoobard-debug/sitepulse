"use client";

import { useActionState, useState } from "react";
import { login, signup } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/client";
import PasswordField from "@/components/PasswordField";

type ForgotStatus = "idle" | "sending" | "sent" | "error";

export default function LoginForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loginState, loginAction, loginPending] = useActionState(login, undefined);
  const [signupState, signupAction, signupPending] = useActionState(signup, undefined);
  const isSignup = mode === "signup";
  const state = isSignup ? signupState : loginState;
  const pending = isSignup ? signupPending : loginPending;

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStatus, setForgotStatus] = useState<ForgotStatus>("idle");
  const [forgotError, setForgotError] = useState("");

  async function handleForgotSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = forgotEmail.trim();
    if (!email || !email.includes("@")) {
      setForgotStatus("error");
      setForgotError("Enter a valid email address.");
      return;
    }

    setForgotStatus("sending");
    setForgotError("");
    try {
      const supabase = createClient();
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setForgotStatus("sent");
    } catch {
      setForgotStatus("error");
      setForgotError("Unable to send the reset email right now. Try again shortly.");
    }
  }

  return <div style={{ display: "grid", gap: 16 }}>
    <form action={isSignup ? signupAction : loginAction} style={{ display: "grid", gap: 16 }}>
      <label className="attendance-field"><span>Email address</span><input name="email" type="email" autoComplete="email" required /></label>
      <PasswordField label="Password" name="password" minLength={isSignup ? 8 : undefined} autoComplete={isSignup ? "new-password" : "current-password"} />
      {isSignup && <PasswordField label="Confirm password" name="confirmPassword" minLength={8} autoComplete="new-password" />}
      {!isSignup && <button type="button" className="forgot-password-link" onClick={() => { setForgotOpen((open) => !open); setForgotStatus("idle"); setForgotError(""); }}>
        Forgot password?
      </button>}
      {state?.error && <p role="alert" style={{ margin: 0, color: "#b42318", fontWeight: 700 }}>{state.error}</p>}
      {state?.message && <p role="status" style={{ margin: 0, color: "#176b45", fontWeight: 700 }}>{state.message}</p>}
      <button type="submit" className="primary-button" disabled={pending}>{pending ? (isSignup ? "Creating account…" : "Signing in…") : (isSignup ? "Create account" : "Sign in")}</button>
    </form>
    {!isSignup && forgotOpen && <div className="forgot-password-panel">
      {forgotStatus === "sent" ? (
        <p role="status" style={{ margin: 0, color: "#176b45", fontWeight: 700 }}>
          If an account exists for that email, a password reset link has been sent.
        </p>
      ) : (
        <form onSubmit={handleForgotSubmit} style={{ display: "grid", gap: 10 }}>
          <label className="attendance-field">
            <span>Email address</span>
            <input type="email" value={forgotEmail} onChange={(event) => setForgotEmail(event.target.value)} autoComplete="email" required />
          </label>
          {forgotStatus === "error" && <p role="alert" style={{ margin: 0, color: "#b42318", fontWeight: 700 }}>{forgotError}</p>}
          <button type="submit" className="secondary-button" disabled={forgotStatus === "sending"}>
            {forgotStatus === "sending" ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </div>}
    <button type="button" className="secondary-button" onClick={() => setMode(isSignup ? "login" : "signup")} disabled={pending}>
      {isSignup ? "Already have an account? Sign in" : "New to SitePulse? Create an account"}
    </button>
  </div>;
}
