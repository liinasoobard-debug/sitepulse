"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export const sitepulseNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/attendance", label: "Attendance", icon: "👷" },
  { href: "/crews", label: "Gangs", icon: "👥" },
  { href: "/programme", label: "Programme", icon: "📋" },
  { href: "/readiness", label: "Readiness", icon: "✓" },
  { href: "/daily-plan", label: "Today / Daily Plan", icon: "☀" },
  { href: "/timeline", label: "Timeline", icon: "◷" },
  { href: "/evidence", label: "Evidence", icon: "▨" },
  { href: "/reports", label: "Reports", icon: "▤" },
  { href: "/forecast", label: "Forecast", icon: "↗" },
  { href: "/materials", label: "Materials", icon: "▧" },
  { href: "/constraints", label: "Constraints", icon: "⚠" },
  { href: "/plant", label: "Plant", icon: "▣" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];
const items = sitepulseNavItems;

export default function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const mobileItems = items.filter((item) => ["/daily-plan", "/attendance", "/timeline"].includes(item.href));

  const link = (item: typeof items[number], mobile = false) => {
    const isActive = pathname.startsWith(item.href);
    return <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)} className={`${mobile ? "mobile-nav-item" : "primary-nav-item"} ${isActive ? "active" : ""}`}>
      <span className="bottom-nav-icon" aria-hidden="true">{item.icon}</span>
      <span className="bottom-nav-label">{item.label}</span>
    </Link>;
  };

  return (
    <>
      <nav className="primary-nav" aria-label="Main navigation">{items.map((item) => link(item))}</nav>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {mobileItems.map((item) => link(item, true))}
        <button type="button" className={`mobile-nav-item ${moreOpen ? "active" : ""}`} onClick={() => setMoreOpen((current) => !current)} aria-expanded={moreOpen}>
          <span className="bottom-nav-icon" aria-hidden="true">•••</span><span className="bottom-nav-label">More</span>
        </button>
      </nav>
      {moreOpen && <div className="mobile-nav-backdrop" onClick={() => setMoreOpen(false)}>
        <section className="mobile-nav-sheet" aria-label="All SitePulse pages" onClick={(event) => event.stopPropagation()}>
          <header><strong>SitePulse</strong><button type="button" onClick={() => setMoreOpen(false)} aria-label="Close navigation">×</button></header>
          <div>{items.map((item) => link(item))}</div>
        </section>
      </div>}
    </>
  );
}
