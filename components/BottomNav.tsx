"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Overview", icon: "◫" },
  { href: "/programme", label: "Programme", icon: "▤" },
  { href: "/daily-update", label: "Daily Update", icon: "+" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const links = (mobile: boolean) => items.map((item) => <Link key={item.href} href={item.href} className={`${mobile ? "mobile-nav-item" : "primary-nav-item"} ${pathname.startsWith(item.href) ? "active" : ""}`}><span className="bottom-nav-icon" aria-hidden="true">{item.icon}</span><span className="bottom-nav-label">{item.label}</span></Link>);
  return <><nav className="primary-nav" aria-label="Main navigation">{links(false)}</nav><nav className="mobile-nav" aria-label="Mobile navigation">{links(true)}</nav></>;
}
