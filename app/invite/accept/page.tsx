"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import PasswordField from "@/components/PasswordField";
import { createClient } from "@/lib/supabase/client";
import { cacheAccessibleProject, setActiveProject } from "@/lib/storage";

export default function AcceptInvitePage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const inviteToken = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(inviteToken);
    const supabase = createClient();
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) {
        setUser(data.user);
        setChecking(false);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user ?? null);
        setChecking(false);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const needsPassword = user?.user_metadata?.sitepulse_invited_new === true;

  async function acceptInvitation() {
    if (!token) {
      setError("This invitation link is invalid.");
      return;
    }
    if (needsPassword && (password.length < 8 || password !== confirmPassword)) {
      setError(password.length < 8 ? "Use at least 8 characters for your password." : "Passwords do not match.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (needsPassword) {
        const { error: passwordError } = await createClient().auth.updateUser({
          password,
          data: { sitepulse_invited_new: false },
        });
        if (passwordError) throw passwordError;
      }

      const response = await fetch("/api/project-invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json() as {
        error?: string;
        projectId?: string;
        projectName?: string;
        projectCode?: string;
        projectLocation?: string;
      };
      if (!response.ok || !result.projectId || !result.projectName) {
        throw new Error(result.error ?? "This invitation could not be accepted.");
      }

      cacheAccessibleProject({
        id: result.projectId,
        name: result.projectName,
        code: result.projectCode ?? "",
        location: result.projectLocation ?? "",
        createdAt: new Date().toISOString(),
      });
      setActiveProject(result.projectId);
      window.location.assign("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This invitation could not be accepted.");
      setBusy(false);
    }
  }

  const returnPath = `/invite/accept${token ? `?token=${encodeURIComponent(token)}` : ""}`;

  return (
    <main className="app-shell">
      <section className="launcher-card" style={{ alignSelf: "center" }}>
        <div className="brand-row"><div className="brand-mark">SP</div><div><p className="eyebrow">SitePulse</p><h1>Project invitation</h1></div></div>
        {checking ? <p>Checking your invitation…</p> : !user ? (
          <>
            <p>Sign in with the email address that received this invitation.</p>
            <Link className="primary-button" href={`/login?next=${encodeURIComponent(returnPath)}`}>Sign in to continue</Link>
          </>
        ) : (
          <>
            <p>Signed in as <strong>{user.email}</strong>.</p>
            {needsPassword && (
              <div style={{ display: "grid", gap: 12 }}>
                <p style={{ margin: 0 }}>Set a password for your new SitePulse account.</p>
                <PasswordField label="Password" name="password" value={password} minLength={8} autoComplete="new-password" onChange={setPassword} />
                <PasswordField label="Confirm password" name="confirmPassword" value={confirmPassword} minLength={8} autoComplete="new-password" onChange={setConfirmPassword} />
              </div>
            )}
            {error && <p role="alert" style={{ color: "#b42318", fontWeight: 700 }}>{error}</p>}
            <button type="button" className="primary-button" disabled={busy} onClick={() => void acceptInvitation()}>
              {busy ? "Accepting…" : needsPassword ? "Set password and accept invitation" : "Accept invitation"}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
