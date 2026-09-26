"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { FolderOpen, Clapperboard, Users, CircleUserRound } from "lucide-react";

export default function BottomNav() {
  const pathname = usePathname();

  if (pathname !== "/dashboard" && pathname !== "/") {
    return null;
  }

  return (
    <nav
      style={{
        width: "100%",
        maxWidth: "500px", // max width for desktop reading mobile views nicely, or leave 100%
        background: "rgba(13,13,19,.92)",
        backdropFilter: "blur(14px)",
        borderTop: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-around",
        paddingTop: "10px",
        paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
      }}
    >
      <NavItem href="/dashboard" label="Projects" active={pathname?.startsWith("/dashboard")} icon={<FolderOpen size={22} />} />
      <NavItem href="/create" label="Studio" active={pathname?.startsWith("/create")} icon={<Clapperboard size={22} />} />
      <NavItem href="/gallery" label="Characters" active={pathname?.startsWith("/gallery")} icon={<Users size={22} />} />
      <NavItem href="/profile" label="Profile" active={pathname?.startsWith("/profile")} icon={<CircleUserRound size={22} />} />
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
        fontSize: "10px",
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
