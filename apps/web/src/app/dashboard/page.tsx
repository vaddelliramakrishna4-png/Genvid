"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [userName, setUserName] = useState("User");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [greeting, setGreeting] = useState("Good evening");
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    function updateGreeting() {
      const formatter = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
      const hour = parseInt(formatter.format(new Date()), 10);
      
      let newGreeting = "Good evening";
      if (hour >= 5 && hour < 12) newGreeting = "Good morning";
      else if (hour >= 12 && hour < 17) newGreeting = "Good afternoon";
      else if (hour >= 17 && hour < 21) newGreeting = "Good evening";
      else newGreeting = "Good night";
      
      setGreeting(newGreeting);
    }
    
    updateGreeting();
    const interval = setInterval(updateGreeting, 30000); // every 30s

    async function loadData() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setUserName(session.user.user_metadata.full_name || session.user.email?.split("@")[0] || "User");
          setAvatarUrl(session.user.user_metadata.avatar_url || null);
          
          // Fetch projects from API
          const res = await fetch(`/api/v1/projects`, {
            headers: {
              "Authorization": `Bearer ${session.access_token}`
            }
          });
          
          if (res.ok) {
            const data = await res.json();
            setProjects(data.projects);
          }
        }
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
    return () => clearInterval(interval);
  }, []);

  const series = [
    { id: 1, title: "My First Series", subtitle: "Getting started", color: "linear-gradient(180deg, #4C1D95 0%, #1E1B4B 100%)" },
  ];

  const getStatusColor = (status: string) => {
    if (status === "completed") return "var(--success)";
    if (status === "failed") return "var(--error)";
    return "var(--accent-violet)";
  };

  const getStatusBg = (status: string) => {
    if (status === "completed") return "rgba(52, 211, 153, 0.15)";
    if (status === "failed") return "rgba(248, 113, 113, 0.15)";
    return "rgba(167, 139, 250, 0.15)";
  };

  return (
    <div className="animate-fade-in" style={{ padding: "0 20px 20px", flex: 1, display: "flex", flexDirection: "column" }}>
      
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "12px 0 18px" }}>
        <div>
          <div style={{ fontSize: "10.5px", color: "var(--text-muted)", letterSpacing: ".6px", textTransform: "uppercase", fontWeight: 600, marginBottom: "4px" }}>
            Projects
          </div>
          <div className="font-display" style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-.3px" }}>
            {greeting}, {userName.split(" ")[0]}
          </div>
        </div>
        <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: "var(--accent-gradient)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 800, color: "#0A0A0F", overflow: "hidden" }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            userName.charAt(0).toUpperCase()
          )}
        </div>
      </div>

      {/* ── Your Series ────────────────────────────────────────────────────── */}
      <div style={{ fontSize: "10.5px", color: "var(--text-muted)", letterSpacing: ".6px", textTransform: "uppercase", fontWeight: 600, marginBottom: "2px" }}>
        Your series
      </div>
      
      <div style={{ display: "flex", gap: "12px", overflowX: "auto", margin: "12px 0 22px", scrollbarWidth: "none", marginRight: "-20px", paddingRight: "20px" }}>
        {/* Mocking the dynamic series from the HTML */}
        <div style={{ width: "96px", flex: "none" }}>
          <div style={{ height: "148px", borderRadius: "var(--radius-md)", background: "radial-gradient(circle at 30% 25%,#3a2d6d,#0e0e14 70%)" }}></div>
          <p style={{ fontSize: "11px", fontWeight: 600, marginTop: "8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Monsoon Cafe</p>
          <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>4 episodes · locked style</span>
        </div>
        <div style={{ width: "96px", flex: "none" }}>
          <div style={{ height: "148px", borderRadius: "var(--radius-md)", background: "radial-gradient(circle at 70% 30%,#5c2740,#0e0e14 70%)" }}></div>
          <p style={{ fontSize: "11px", fontWeight: 600, marginTop: "8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Garage Stories</p>
          <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>11 episodes · pinned host</span>
        </div>
        <div style={{ width: "96px", flex: "none" }}>
          <div style={{ height: "148px", borderRadius: "var(--radius-md)", background: "radial-gradient(circle at 50% 70%,#1f3a5c,#0e0e14 70%)", display: "flex", alignItems: "center", justifyContent: "center" }}></div>
          <p style={{ fontSize: "11px", fontWeight: 600, marginTop: "8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>New series…</p>
          <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>+</span>
        </div>
      </div>

      {/* ── Recent ─────────────────────────────────────────────────────────── */}
      <div style={{ fontSize: "10.5px", color: "var(--text-muted)", letterSpacing: ".6px", textTransform: "uppercase", fontWeight: 600, marginBottom: "8px" }}>
        Recent
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="card-dark" style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🎬</div>
          <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>No videos yet</div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Tap + to create your first reel</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {projects.map((item, idx) => (
            <div
              key={item.id}
              onClick={() => router.push(`/project/${item.id}`)}
              className="card-dark"
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "center",
                padding: "12px",
                marginBottom: "10px",
                cursor: "pointer",
                border: "1px solid var(--border-subtle)"
              }}
            >
              <div
                style={{
                  width: "52px",
                  height: "72px",
                  flex: "none",
                  borderRadius: "var(--radius-sm)",
                  background: idx % 2 === 0 ? "linear-gradient(160deg,#4b2f72 10%,#141420 75%)" : "linear-gradient(140deg,#274060 0%,#141420 80%)",
                  overflow: "hidden"
                }}
              >
                {item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.8 }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: "13px", display: "block", marginBottom: "3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.title || "Untitled Project"}
                </b>
                <span style={{ color: "var(--text-secondary)", fontSize: "12.5px", lineHeight: 1.5, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.styleKey} · {item.durationSec} s
                </span>
              </div>
              
              {/* Status Pill */}
              <span
                style={{
                  padding: "4px 9px",
                  borderRadius: "99px",
                  fontSize: "9.5px",
                  fontWeight: 700,
                  letterSpacing: ".4px",
                  background: item.status === "completed" ? "rgba(61,220,151,.14)" : item.status === "failed" ? "rgba(248, 113, 113, 0.15)" : "rgba(124,92,255,.16)",
                  color: item.status === "completed" ? "var(--success)" : item.status === "failed" ? "var(--error)" : "#B9A4FF",
                  textTransform: "uppercase"
                }}
              >
                {item.status === "completed" ? "READY" : item.status === "failed" ? "ERROR" : item.status === "storyboard" ? "DRAFT" : "RENDER"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── FAB ────────────────────────────────────────────────────────────── */}
      <div style={{ position: "fixed", bottom: "calc(88px + var(--safe-area-bottom))", width: "100%", maxWidth: "430px", pointerEvents: "none", zIndex: 40, right: "auto", left: "auto" }}>
        <div 
          onClick={() => router.push("/create")}
          style={{
            float: "right", marginRight: "20px", width: "54px", height: "54px", 
            borderRadius: "18px", background: "var(--accent-gradient)", display: "flex", 
            alignItems: "center", justifyContent: "center", fontSize: "26px", fontWeight: 300, 
            color: "#fff", boxShadow: "0 12px 30px rgba(255,107,138,.4)", cursor: "pointer", pointerEvents: "auto"
          }}
        >
          +
        </div>
      </div>
    </div>
  );
}
