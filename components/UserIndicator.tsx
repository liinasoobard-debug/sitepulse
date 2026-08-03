"use client";

import { useEffect, useState } from "react";
import { logout } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function UserIndicator() {
  const [email, setEmail] = useState("");
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    let active = true;
    supabase.auth.getUser().then(({ data }) => { if (active) setEmail(data.user?.email ?? "Signed in"); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setEmail(session?.user.email ?? ""));
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  if (!email) return null;
  return <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><span style={{ fontSize: 13, color: "#4a5560" }}>{email}</span><form action={logout}><button type="submit" className="secondary-button">Log out</button></form></div>;
}
