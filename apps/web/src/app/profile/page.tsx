/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { logout } from "../login/actions";

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const supabase = createClient();

  useEffect(() => {
    async function loadUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
      }
    }
    loadUser();
  }, []);

  if (!user) {
    return <div style={{ padding: "40px", textAlign: "center" }}>Loading...</div>;
  }

  const fullName = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
  const initial = fullName.charAt(0).toUpperCase();

  return (
    <div className="animate-fade-in" style={{ padding: "24px 20px 100px", flex: 1 }}>
      {/* ── Fixed Header ──────────────────────────────────────────────────── */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000, background: "#0A0A0F", padding: "16px 20px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
        <div style={{ maxWidth: "500px", margin: "0 auto" }}>
          <h1 className="font-display" style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>
            Profile
          </h1>
        </div>
      </div>

      {/* Pad content */}
      <div style={{ height: "40px" }}></div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "40px" }}>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: "var(--accent-gradient)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "2rem",
            fontWeight: 700,
            color: "white",
            marginBottom: "16px"
          }}
        >
          {initial}
        </div>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>{fullName}</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>{user.email}</p>
      </div>

      <div className="card-dark" style={{ padding: "16px", marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
          <span style={{ fontWeight: 600 }}>Subscription</span>
          <span style={{ color: "var(--accent-violet)", fontWeight: 600 }}>Free Plan</span>
        </div>
        <div style={{ height: 1, background: "var(--border-subtle)", marginBottom: "16px" }} />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600 }}>Credits Remaining</span>
          <span>50 / 50</span>
        </div>
      </div>

      <button
        onClick={() => logout()}
        className="btn-pill"
        style={{ width: "100%", padding: "16px", background: "rgba(248, 113, 113, 0.1)", color: "var(--error)", border: "1px solid rgba(248, 113, 113, 0.2)" }}
      >
        Sign Out
      </button>
    </div>
  );
}
