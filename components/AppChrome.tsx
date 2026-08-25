"use client";

import { usePathname } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import ProjectSelector from "@/components/ProjectSelector";
import SharedDataSync from "@/components/SharedDataSync";

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login" || pathname === "/signin";
  if (isLogin) return children;
  return <SharedDataSync>
    <header className="sitepulse-app-header">
      <a className="sitepulse-brand" href="/dashboard">SitePulse</a>
      <span>Programme and labour control</span>
    </header>
    <BottomNav />
    <div className="context-controls"><ProjectSelector /></div>
    <div className="sitepulse-page-content">{children}</div>
  </SharedDataSync>;
}
