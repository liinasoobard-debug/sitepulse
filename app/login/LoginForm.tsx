"use client";

import { useActionState, useState } from "react";
import { login } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/client";
import PasswordField from "@/components/PasswordField";

type ForgotStatus = "idle" | "sending" | "sent" | "error";

export default function LoginForm({ nextPath = "" }: { nextPath?: string }) {
  const [loginState, loginAction, loginPending] = useActionState(login, undefined);

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
    <form action={loginAction} style={{ display: "grid", gap: 16 }}>
      <input type="hidden" name="next" value={nextPath} />
      <label className="attendance-field"><span>Email address</span><input name="email" type="email" autoComplete="email" required /></label>
      <PasswordField label="Password" name="password" autoComplete="current-password" />
      <button type="button" className="forgot-password-link" onClick={() => { setForgotOpen((open) => !open); setForgotStatus("idle"); setForgotError(""); }}>
        Forgot password?
      </button>
      {loginState?.error && <p role="alert" style={{ margin: 0, color: "#b42318", fontWeight: 700 }}>{loginState.error}</p>}
      <button type="submit" className="primary-button" disabled={loginPending}>{loginPending ? "Signing in…" : "Sign in"}</button>
    </form>
    {forgotOpen && <div className="forgot-password-panel">
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
  </div>;
}
