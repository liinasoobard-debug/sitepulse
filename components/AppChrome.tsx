"use client";

import { usePathname } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import DateSelector from "@/components/DateSelector";
import ProjectSelector from "@/components/ProjectSelector";
import SharedDataSync from "@/components/SharedDataSync";

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const isLogin = usePathname() === "/login";
  if (isLogin) return children;
  return <SharedDataSync><div className="context-controls"><ProjectSelector /><DateSelector /></div>{children}<BottomNav /></SharedDataSync>;
}
