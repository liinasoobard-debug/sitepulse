"use client";

import { usePathname } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import DateSelector from "@/components/DateSelector";
import ProjectSelector from "@/components/ProjectSelector";
import SharedDataSync from "@/components/SharedDataSync";

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  const usesSiteDate = ["/daily-plan", "/attendance", "/crews", "/timeline"].some((route) => pathname.startsWith(route));
  if (isLogin) return children;
  return <SharedDataSync>
    <header className="sitepulse-app-header">
      <a className="sitepulse-brand" href="/dashboard">SitePulse</a>
      <span>Construction production control</span>
    </header>
    <BottomNav />
    <div className="context-controls"><ProjectSelector />{usesSiteDate && <DateSelector />}</div>
    <div className="sitepulse-page-content">{children}</div>
  </SharedDataSync>;
}
