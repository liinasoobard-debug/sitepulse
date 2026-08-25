"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import BottomNav from "@/components/BottomNav";
import ProjectSelector from "@/components/ProjectSelector";
import SharedDataSync from "@/components/SharedDataSync";
import { createClient } from "@/lib/supabase/client";

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  useEffect(() => { let active = true; void createClient().auth.getUser().then(({ data }) => { if (active) setAuthenticated(Boolean(data.user)); }); return () => { active = false; }; }, []);
  const isLogin = pathname === "/login" || pathname === "/signin";
  if (isLogin) return children;
  if (authenticated === null) return <main className="app-shell"><p>Opening SitePulse…</p></main>;
  const shell = <>
    <header className="sitepulse-app-header">
      <a className="sitepulse-brand" href="/dashboard">SitePulse</a>
      <span>{authenticated ? "Programme and labour control" : "Public review · sandbox data"}</span>
    </header>
    <BottomNav />
    {authenticated ? <div className="context-controls"><ProjectSelector /></div> : <div className="v2-demo-banner">Public review mode — changes stay in this browser and never affect the live project. <a href="/login">Sign in</a></div>}
    <div className="sitepulse-page-content">{children}</div>
  </>;
  return authenticated ? <SharedDataSync>{shell}</SharedDataSync> : shell;
}
