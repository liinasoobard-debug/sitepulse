"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PasswordField from "@/components/PasswordField";

type Status = "checking" | "ready" | "invalid" | "submitting" | "success";

function hasRecoveryLinkError() {
  if (typeof window === "undefined") return false;
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const searchParams = new URLSearchParams(window.location.search);
  return Boolean(hashParams.get("error") || searchParams.get("error"));
}

export default function ResetPasswordForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(() => (hasRecoveryLinkError() ? "invalid" : "checking"));
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldError, setFieldError] = useState("");

  useEffect(() => {
    if (status !== "checking") return;
    const supabase = createClient();
    let active = true;
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) setStatus("ready");
    });

    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setStatus("ready");
    });

    const timeout = setTimeout(() => {
      setStatus((current) => (current === "checking" ? "invalid" : current));
    }, 4000);

    return () => {
      active = false;
      clearTimeout(timeout);
      subscription.subscription.unsubscribe();
    };
  }, [status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError("");
    if (password.length < 8) {
      setFieldError("Use at least 8 characters for your password.");
      return;
    }
    if (password !== confirmPassword) {
      setFieldError("Passwords do not match.");
      return;
    }

    setStatus("submitting");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setStatus("ready");
        setFieldError("Unable to update your password. Request a new reset link and try again.");
        return;
      }
      setStatus("success");
    } catch {
      setStatus("ready");
      setFieldError("Unable to update your password. Request a new reset link and try again.");
    }
  }

  if (status === "checking") {
    return <p style={{ color: "#5f6b76", lineHeight: 1.6 }}>Checking your reset link…</p>;
  }

  if (status === "invalid") {
    return <div style={{ display: "grid", gap: 16 }}>
      <p role="alert" style={{ margin: 0, color: "#b42318", fontWeight: 700 }}>
        This reset link is invalid or has expired. Request a new one from the sign in page.
      </p>
      <button type="button" className="primary-button" onClick={() => router.push("/login")}>Back to sign in</button>
    </div>;
  }

  if (status === "success") {
    return <div style={{ display: "grid", gap: 16 }}>
      <p role="status" style={{ margin: 0, color: "#176b45", fontWeight: 700 }}>Your password has been updated. You can now sign in.</p>
      <button type="button" className="primary-button" onClick={() => router.push("/login")}>Sign in</button>
    </div>;
  }

  const pending = status === "submitting";
  return <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
    <PasswordField label="New password" name="password" autoComplete="new-password" minLength={8} value={password} onChange={setPassword} />
    <PasswordField label="Confirm new password" name="confirmPassword" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={setConfirmPassword} />
    {fieldError && <p role="alert" style={{ margin: 0, color: "#b42318", fontWeight: 700 }}>{fieldError}</p>}
    <button type="submit" className="primary-button" disabled={pending}>{pending ? "Updating password…" : "Update password"}</button>
  </form>;
}
