/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function CreatePage() {
  const router = useRouter();
  const [tab, setTab] = useState("idea");
  const [style, setStyle] = useState("Cinematic");
  const [idea, setIdea] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabase = createClient();

  const [duration, setDuration] = useState(0);
  const durations = ["15 s", "30 s", "60 s"];

  const [character, setCharacter] = useState(0);
  const characters = ["🔒 Mustard Raincoat", "🔒 Chef Marco", "🔒 Gym Trainer"];

  const [business, setBusiness] = useState(0);
  const businesses = ["Monsoon Cafe · Pune", "Urban Yoga · NYC", "None"];

  const [voice, setVoice] = useState(0);
  const voices = ["Indian English · calm ⏵", "US English · energetic ⏵", "UK English · pro ⏵"];

  const [submitStage, setSubmitStage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCreate = async () => {
    if (isSubmitting) return;
    const finalIdea = idea.trim();
    if (!finalIdea) {
      alert("Please enter an idea or script for your video.");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    setSubmitStage("Crafting your video concept...");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setErrorMessage("Your session has expired. Please log in again.");
        setIsSubmitting(false);
        return;
      }
      
      const durationValues = [15, 30, 60];
      const voiceKeys = ["en-IN-calm-male", "en-US-energetic", "en-GB-pro"];
      
      const combinedIdea = `${finalIdea}\n\nContext:\n- Business: ${businesses[business]}\n- Character: ${characters[character]}`;
      
      const payload: any = {
        inputText: combinedIdea,
        styleKey: style.toLowerCase(),
        mode: tab === "idea" ? "idea" : "verbatim_script",
        durationSec: durationValues[duration] || 30,
        aspectRatio: "9:16",
        voiceKey: voiceKeys[voice] || "en-IN-calm-male"
      };

      // Helper to poll for newly created project in case backend received request
      // but Vercel proxy rewrite timed out (502 ROUTER_EXTERNAL_TARGET_ERROR)
      const checkForCreatedProject = async (retries = 6, delayMs = 2500): Promise<string | null> => {
        for (let i = 0; i < retries; i++) {
          try {
            const pollRes = await fetch(`/api/v1/projects?limit=5&t=${Date.now()}`, {
              headers: {
                "Authorization": `Bearer ${session.access_token}`,
                "Cache-Control": "no-cache"
              },
              credentials: "same-origin"
            });
            if (pollRes.ok) {
              const pollData = await pollRes.json();
              const recent = pollData.projects?.find((p: any) => {
                const createdTime = new Date(p.createdAt || p.created_at || Date.now()).getTime();
                const isRecent = (Date.now() - createdTime) < 180000; // Within last 3 minutes
                const matchesText = p.inputText?.includes(finalIdea.slice(0, 30)) || p.title?.includes(finalIdea.slice(0, 30));
                return isRecent && matchesText;
              });
              if (recent?.id) return recent.id;
            }
          } catch (e) {
            console.warn("Polling recent projects attempt failed:", e);
          }
          if (i < retries - 1) {
            await new Promise((r) => setTimeout(r, delayMs));
          }
        }
        return null;
      };

      // Attempt to send project creation request with auto-retry
      let projectId: string | null = null;
      let lastError = "";

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          if (attempt === 1) {
            setSubmitStage("Connecting to AI engine...");
          } else {
            setSubmitStage("Engine waking up, finalizing scenes (attempt 2/2)...");
          }

          const res = await fetch(`/api/v1/projects`, {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}`
            },
            body: JSON.stringify(payload)
          });

          const resText = await res.text();
          let data: any = null;
          try {
            data = JSON.parse(resText);
          } catch {
            data = { error: resText || res.statusText };
          }

          if (res.ok && data?.success) {
            projectId = data.project?.id || data.projectId;
            if (projectId?.startsWith("prj_")) {
              sessionStorage.setItem(`fallback_project_${projectId}`, JSON.stringify(data));
            }
            break;
          } else {
            lastError = data?.error || res.statusText || "Server error";
            console.warn(`[CREATE ATTEMPT ${attempt} FAILED]:`, lastError);

            // If it's a Vercel proxy error (502 / ROUTER_EXTERNAL_TARGET_ERROR / 504),
            // check if the project actually got saved in the database!
            setSubmitStage("Checking generated storyboard...");
            const detectedId = await checkForCreatedProject(4, 2500);
            if (detectedId) {
              projectId = detectedId;
              break;
            }
          }
        } catch (fetchErr: any) {
          console.warn(`[CREATE ATTEMPT ${attempt} NETWORK ERROR]:`, fetchErr);
          lastError = fetchErr.message || String(fetchErr);
          setSubmitStage("Checking server connection...");
          const detectedId = await checkForCreatedProject(4, 2500);
          if (detectedId) {
            projectId = detectedId;
            break;
          }
        }

        if (attempt < 2 && !projectId) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      if (projectId) {
        setSubmitStage("Storyboard ready! Loading project...");
        router.push(`/project/${projectId}`);
        return;
      }

      // Final check before showing error
      setSubmitStage("Checking recent submissions...");
      const finalCheckId = await checkForCreatedProject(3, 2000);
      if (finalCheckId) {
        router.push(`/project/${finalCheckId}`);
        return;
      }

      // If truly failed, show friendly in-page error message
      setErrorMessage(
        `Server was slow to respond (${lastError.slice(0, 80)}). Your idea is preserved above. Please click below to try again.`
      );
    } catch (err: unknown) {
      console.error("Creation error:", err);
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
      setSubmitStage("");
    }
  };
  
  return (
    <div className="animate-fade-in" style={{ padding: "0 20px 100px", flex: 1 }}>
      
      {/* ── Fixed Header ──────────────────────────────────────────────────── */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000, background: "#0A0A0F", padding: "16px 20px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
        <div style={{ maxWidth: "500px", margin: "0 auto", display: "flex", alignItems: "center", gap: "12px" }}>
          <div onClick={() => router.push("/dashboard")} style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "50%", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
            <span style={{ fontSize: "16px" }}>←</span>
          </div>
          <div>
            <div style={{ fontSize: "10.5px", color: "var(--text-muted)", letterSpacing: ".6px", textTransform: "uppercase", fontWeight: 600, margin: "2px 0 2px" }}>
              New video
            </div>
            <div className="font-display" style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-.3px" }}>
              What should it say?
            </div>
          </div>
        </div>
      </div>
      
      {/* Pad content */}
      <div style={{ height: "64px" }}></div>

      {/* ── Tabs (Segmented Control) ───────────────────────────────────────── */}
      <div style={{ display: "flex", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "3px", margin: "14px 0" }}>
        <div 
          onClick={() => setTab("idea")}
          style={{ flex: 1, textAlign: "center", fontSize: "12px", fontWeight: 700, padding: "9px", borderRadius: "9px", cursor: "pointer", 
                   ...(tab === "idea" ? { background: "var(--bg-card)", color: "var(--text-primary)", boxShadow: "0 2px 8px rgba(0,0,0,.35)" } : { color: "var(--text-muted)" }) }}
        >
          One idea
        </div>
        <div 
          onClick={() => setTab("script")}
          style={{ flex: 1, textAlign: "center", fontSize: "12px", fontWeight: 700, padding: "9px", borderRadius: "9px", cursor: "pointer", 
                   ...(tab === "script" ? { background: "var(--bg-card)", color: "var(--text-primary)", boxShadow: "0 2px 8px rgba(0,0,0,.35)" } : { color: "var(--text-muted)" }) }}
        >
          Paste script (verbatim)
        </div>
      </div>

      {/* ── Input ──────────────────────────────────────────────────────────── */}
      <div className="card-dark" style={{ padding: "16px", margin: "4px 0 18px", fontSize: "13.5px", lineHeight: 1.65, color: "var(--text-primary)" }}>
        <textarea
          className="input-flat"
          rows={3}
          placeholder="Give your idea..."
          style={{ resize: "none", width: "100%", outline: "none", background: "transparent", border: "none", color: "var(--text-primary)", fontFamily: "inherit" }}
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
        />
      </div>

      {/* ── Look & Feel ────────────────────────────────────────────────────── */}
      <div style={{ fontSize: "10.5px", color: "var(--text-muted)", letterSpacing: ".6px", textTransform: "uppercase", fontWeight: 600, marginBottom: "8px" }}>
        Look & feel
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", margin: "4px 0 18px" }}>
        {["Cinematic", "3D Pop", "Documentary", "Anime"].map(s => (
          <span
            key={s}
            onClick={() => setStyle(s)}
            style={{
              display: "inline-flex", alignItems: "center", gap: "5px", padding: "7px 12px", borderRadius: "99px",
              fontSize: "11.5px", fontWeight: 600, cursor: "pointer",
              ...(style === s 
                ? { borderColor: "transparent", background: "rgba(124,92,255,.16)", color: "#C9B8FF", border: "1px solid transparent" } 
                : { border: "1px solid var(--border-subtle)", color: "var(--text-secondary)", background: "var(--bg-surface)" })
            }}
          >
            {s}
          </span>
        ))}
      </div>

      {/* ── Configuration List ───────────────────────────────────────────── */}
      <label className="card-dark" style={{ border: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 14px", marginBottom: "9px", fontSize: "12.5px", cursor: "pointer" }}>
        <b style={{ fontWeight: 600 }}>Duration</b>
        <select 
          value={duration} 
          onChange={e => setDuration(parseInt(e.target.value))}
          style={{ background: "transparent", color: "var(--text-primary)", border: "none", outline: "none", fontWeight: 600, fontSize: "12px", cursor: "pointer", textAlign: "right" }}
        >
          {durations.map((d, i) => <option key={i} value={i} style={{ background: "var(--bg-card)" }}>{d}</option>)}
        </select>
      </label>

      <label className="card-dark" style={{ border: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 14px", marginBottom: "9px", fontSize: "12.5px", cursor: "pointer" }}>
        <b style={{ fontWeight: 600 }}>Character</b>
        <select 
          value={character} 
          onChange={e => setCharacter(parseInt(e.target.value))}
          style={{ background: "transparent", color: "var(--text-primary)", border: "none", outline: "none", fontWeight: 600, fontSize: "12px", cursor: "pointer", textAlign: "right" }}
        >
          {characters.map((c, i) => <option key={i} value={i} style={{ background: "var(--bg-card)" }}>{c}</option>)}
        </select>
      </label>

      <label className="card-dark" style={{ border: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 14px", marginBottom: "9px", fontSize: "12.5px", cursor: "pointer" }}>
        <b style={{ fontWeight: 600 }}>Business</b>
        <select 
          value={business} 
          onChange={e => setBusiness(parseInt(e.target.value))}
          style={{ background: "transparent", color: "var(--text-primary)", border: "none", outline: "none", fontWeight: 600, fontSize: "12px", cursor: "pointer", textAlign: "right" }}
        >
          {businesses.map((b, i) => <option key={i} value={i} style={{ background: "var(--bg-card)" }}>{b}</option>)}
        </select>
      </label>

      <label className="card-dark" style={{ border: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 14px", marginBottom: "22px", fontSize: "12.5px", cursor: "pointer" }}>
        <b style={{ fontWeight: 600 }}>Voice</b>
        <select 
          value={voice} 
          onChange={e => setVoice(parseInt(e.target.value))}
          style={{ background: "transparent", color: "var(--text-primary)", border: "none", outline: "none", fontWeight: 600, fontSize: "12px", cursor: "pointer", textAlign: "right" }}
        >
          {voices.map((v, i) => <option key={i} value={i} style={{ background: "var(--bg-card)" }}>{v}</option>)}
        </select>
      </label>

      {/* ── Error Message ────────────────────────────────────────────────── */}
      {errorMessage && (
        <div style={{
          background: "rgba(239, 68, 68, 0.12)",
          border: "1px solid rgba(239, 68, 68, 0.35)",
          borderRadius: "12px",
          padding: "12px 16px",
          marginBottom: "16px",
          fontSize: "12px",
          color: "#fca5a5",
          lineHeight: 1.5,
          display: "flex",
          alignItems: "flex-start",
          gap: "10px"
        }}>
          <span style={{ fontSize: "16px" }}>⚠️</span>
          <div style={{ flex: 1 }}>{errorMessage}</div>
        </div>
      )}

      {/* ── Action Button ─────────────────────────────────────────────────── */}
      <div 
        className="btn-primary" 
        onClick={handleCreate}
        style={{ 
          opacity: isSubmitting ? 0.75 : 1, 
          cursor: isSubmitting ? "not-allowed" : "pointer", 
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px"
        }}
      >
        {isSubmitting && (
          <div style={{
            width: "16px",
            height: "16px",
            borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.3)",
            borderTopColor: "#fff",
            animation: "spin 0.8s linear infinite"
          }} />
        )}
        <span>{isSubmitting ? (submitStage || "Creating...") : "Create Video →"}</span>
      </div>
      <p style={{ textAlign: "center", marginTop: "12px", fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
        ≈ 2–4 min · storyboard review before anything renders
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

    </div>
  );
}
