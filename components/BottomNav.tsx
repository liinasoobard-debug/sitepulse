"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/attendance", label: "Attendance", icon: "👷" },
  { href: "/crews", label: "Gangs", icon: "👥" },
  { href: "/programme", label: "Programme", icon: "📋" },
  { href: "/timeline", label: "Timeline", icon: "◷" },
  { href: "/reports", label: "Reports", icon: "▤" },
  { href: "/forecast", label: "Forecast", icon: "↗" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {items.map((item) => {
        const isActive = pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`bottom-nav-item ${isActive ? "active" : ""}`}
          >
            <span className="bottom-nav-icon">{item.icon}</span>
            <span className="bottom-nav-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
