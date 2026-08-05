"use client";

import { useActionState, useState } from "react";
import { login, signup } from "@/app/login/actions";

export default function LoginForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loginState, loginAction, loginPending] = useActionState(login, undefined);
  const [signupState, signupAction, signupPending] = useActionState(signup, undefined);
  const isSignup = mode === "signup";
  const state = isSignup ? signupState : loginState;
  const pending = isSignup ? signupPending : loginPending;

  return <div style={{ display: "grid", gap: 16 }}>
    <form action={isSignup ? signupAction : loginAction} style={{ display: "grid", gap: 16 }}>
      <label className="attendance-field"><span>Email address</span><input name="email" type="email" autoComplete="email" required /></label>
      <label className="attendance-field"><span>Password</span><input name="password" type="password" minLength={isSignup ? 8 : undefined} autoComplete={isSignup ? "new-password" : "current-password"} required /></label>
      {isSignup && <label className="attendance-field"><span>Confirm password</span><input name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required /></label>}
      {state?.error && <p role="alert" style={{ margin: 0, color: "#b42318", fontWeight: 700 }}>{state.error}</p>}
      {state?.message && <p role="status" style={{ margin: 0, color: "#176b45", fontWeight: 700 }}>{state.message}</p>}
      <button type="submit" className="primary-button" disabled={pending}>{pending ? (isSignup ? "Creating account…" : "Signing in…") : (isSignup ? "Create account" : "Sign in")}</button>
    </form>
    <button type="button" className="secondary-button" onClick={() => setMode(isSignup ? "login" : "signup")} disabled={pending}>
      {isSignup ? "Already have an account? Sign in" : "New to SitePulse? Create an account"}
    </button>
  </div>;
}
