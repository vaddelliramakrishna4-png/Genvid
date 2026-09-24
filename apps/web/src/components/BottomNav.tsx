"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

export default function BottomNav() {
  const pathname = usePathname();

  if (pathname === "/login" || pathname === "/signup" || pathname === "/") {
    return null;
  }

  return (
    <nav
      style={{
        width: "100%",
        height: "calc(68px + var(--safe-area-bottom))",
        background: "rgba(13,13,19,.92)",
        backdropFilter: "blur(14px)",
        borderTop: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-around",
        paddingTop: "10px",
        paddingBottom: "calc(18px + var(--safe-area-bottom))",
        zIndex: 50,
        flexShrink: 0
      }}
    >
      <NavItem href="/dashboard" label="Projects" active={pathname?.startsWith("/dashboard")} icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>
      } />
      <NavItem href="/create" label="Studio" active={pathname?.startsWith("/create")} icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16l5-5 4 4 7-8"/><path d="M20 7v5h-5"/></svg>
      } />
      <NavItem href="/gallery" label="Characters" active={pathname?.startsWith("/gallery")} icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>
      } />
      <NavItem href="/profile" label="Profile" active={pathname?.startsWith("/profile")} icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
      } />
    </nav>
  );
}

function NavItem({ href, icon, label, active = false }: { href: string; icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textDecoration: "none",
        color: active ? "var(--text-primary)" : "var(--text-muted)",
        fontSize: "9.5px",
        fontWeight: 600,
        letterSpacing: "0.3px"
      }}
    >
      <span style={{ display: "block", marginBottom: "4px" }}>
        {icon}
      </span>
      {label}
    </Link>
  );
}
