"use client";

import { useActionState } from "react";
import { login } from "@/app/login/actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return <form action={action} style={{ display: "grid", gap: 16 }}>
    <label className="attendance-field"><span>Email address</span><input name="email" type="email" autoComplete="email" required /></label>
    <label className="attendance-field"><span>Password</span><input name="password" type="password" autoComplete="current-password" required /></label>
    {state?.error && <p role="alert" style={{ margin: 0, color: "#b42318", fontWeight: 700 }}>{state.error}</p>}
    <button type="submit" className="primary-button" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
  </form>;
}
