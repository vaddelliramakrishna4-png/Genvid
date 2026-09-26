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

  const handleCreate = async () => {
    if (isSubmitting) return;
    const finalIdea = idea.trim() || "A cat slowly turns to find a cucumber behind it, eyes widening...";
    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const durationValues = [15, 30, 60];
      const voiceKeys = ["en-IN-calm-male", "en-US-energetic", "en-GB-pro"];
      
      const payload: any = {
        inputText: finalIdea,
        styleKey: style.toLowerCase(),
        mode: tab === "idea" ? "idea" : "verbatim_script",
        durationSec: durationValues[duration] || 15,
        voiceKey: voiceKeys[voice] || "en-IN-calm-male"
      };

      // Removed mock_biz and mock_char injection because they are not valid UUIDs 
      // and do not exist in the database, causing Postgres to crash on insert.
      // if (business !== 2) { payload.businessProfileId = `mock_biz_${business}`; }
      // if (character !== 2) { payload.characterId = `mock_char_${character}`; }

      const res = await fetch(`/api/v1/projects`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
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
        const pid = data.project?.id || data.projectId;
        if (pid?.startsWith("prj_")) {
          sessionStorage.setItem(`fallback_project_${pid}`, JSON.stringify(data));
        }
        router.push(`/project/${pid}`);
      } else {
        console.error("API Error details:", data);
        alert(`Creation failed: ${data?.error || res.statusText || 'Unknown server error'}`);
      }
    } catch (err: unknown) {
      console.error("Network/Fetch error:", err);
      alert(`Failed to create project: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="animate-fade-in" style={{ padding: "0 20px 100px", flex: 1 }}>
      
      {/* ── Fixed Header ──────────────────────────────────────────────────── */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000, background: "#0A0A0F", padding: "16px 20px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
        <div style={{ maxWidth: "500px", margin: "0 auto" }}>
          <div style={{ fontSize: "10.5px", color: "var(--text-muted)", letterSpacing: ".6px", textTransform: "uppercase", fontWeight: 600, margin: "10px 0 4px" }}>
            New video
          </div>
          <div className="font-display" style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-.3px" }}>
            What should it say?
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
          placeholder="A cat slowly turns to find a cucumber behind it, eyes widening..."
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

      {/* ── Action Button ─────────────────────────────────────────────────── */}
      <div 
        className="btn-primary" 
        onClick={handleCreate}
        style={{ opacity: isSubmitting ? 0.5 : 1, cursor: isSubmitting ? "not-allowed" : "pointer", textAlign: "center" }}
      >
        {isSubmitting ? "Creating..." : "Create Video →"}
      </div>
      <p style={{ textAlign: "center", marginTop: "12px", fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
        ≈ 2–4 min · storyboard review before anything renders
      </p>

    </div>
  );
}
