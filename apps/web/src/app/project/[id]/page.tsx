"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<any>(null);
  const [scenes, setScenes] = useState<any[]>([]);
  const supabase = createClient();

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (projectId.startsWith("prj_")) {
      // Mock project fallback
      const stored = sessionStorage.getItem(`fallback_project_${projectId}`);
      if (stored) {
        const data = JSON.parse(stored);
        setProject(data.project);
        setScenes(data.data?.scenes || data.project?.scenes || []);
      } else {
        // If not in session storage, just mock a generic loading state for the video
        setProject({ id: projectId, title: "Mock Project", status: "storyboard", progress: 100, durationSec: 30 });
      }
      return; // Do not poll backend for mock projects
    }

    const fetchProject = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/v1/projects/${projectId}`, {
        headers: { "Authorization": `Bearer ${session.access_token}` },
        credentials: "omit"
      });

      if (res.ok) {
        const data = await res.json();
        setProject(data.project);
        setScenes(data.project.scenes || []);
      }
    };

    fetchProject();
    interval = setInterval(fetchProject, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [projectId, supabase]);

  // Determine which UI state to show based on DB status
  const isStoryboard = project ? ["draft", "queued", "generating_script", "generating_media", "storyboard"].includes(project.status) : false;
  const isRendering = project ? ["generating_voice", "aligning", "compositing", "rendering"].includes(project.status) : false;
  const isCompleted = project ? project.status === "completed" : false;
  const isFailed = project ? project.status === "failed" : false;

  // Automated progression for mock rendering
  useEffect(() => {
    if (project && projectId.startsWith("prj_") && isRendering) {
      let currentProgress = project.progress || 0;
      const interval = setInterval(() => {
        currentProgress += Math.floor(Math.random() * 15) + 5;
        if (currentProgress >= 100) {
          setProject((p: any) => ({ ...p, status: "completed", progress: 100 }));
          clearInterval(interval);
        } else {
          let nextStatus = "generating_voice";
          if (currentProgress > 40) nextStatus = "aligning";
          if (currentProgress > 75) nextStatus = "compositing";
          setProject((p: any) => ({ ...p, status: nextStatus, progress: currentProgress }));
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [projectId, project?.status, isRendering]);

  const handleApprove = () => {
    setProject({ ...project, status: "generating_voice", progress: 0 });
  };

  if (!project) {
    return (
      <div className="animate-fade-in" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "var(--text-muted)" }}>Loading project...</div>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="animate-fade-in" style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 20px 100px", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: "3rem", marginBottom: "16px" }}>⚠️</div>
        <h1 className="font-display" style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "8px" }}>Generation Failed</h1>
        <p style={{ color: "var(--error)", textAlign: "center", fontSize: "0.9rem" }}>{project.errorMessage || "An unknown error occurred during generation."}</p>
        <button className="btn-pill" style={{ marginTop: "24px" }} onClick={() => window.location.href = "/create"}>Try Again</button>
      </div>
    );
  }

  if (isStoryboard) {
    return (
      <div className="animate-fade-in" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        
        {/* Header S3 */}
        <div style={{ padding: "0 20px" }}>
          <div style={{ fontSize: "10.5px", color: "var(--text-muted)", letterSpacing: ".6px", textTransform: "uppercase", fontWeight: 600, margin: "8px 0 2px" }}>
            Storyboard
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div className="font-display" style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-.3px" }}>
              {project.title || "Untitled Video"}
            </div>
            <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
              {scenes.length} scenes · {project.durationSec} s
            </span>
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 12px", margin: "12px 0", borderRadius: "12px", background: "rgba(124,92,255,.1)", border: "1px solid rgba(124,92,255,.25)", fontSize: "11px", color: "#C9B8FF", fontWeight: 600 }}>
            🔒 Character pinned — same face, look & style locked across all scenes
          </div>
        </div>

        {/* Storyboard Cards */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            overflowX: "auto",
            padding: "0 20px 24px",
            margin: "14px 0",
            scrollbarWidth: "none",
          }}
        >
          {scenes.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", width: "100%", color: "var(--text-muted)" }}>
              Waiting for Gemini to write script...
            </div>
          ) : scenes.map((scene: any, idx: number) => (
            <div key={idx} id={`scene-card-${idx}`} style={{ width: "118px", flex: "none", transition: "opacity 0.3s ease" }}>
              <div style={{ position: "relative", borderRadius: "11px", overflow: "hidden", background: "#0e0e14", height: "182px", border: "1px solid var(--border-subtle)", display: "flex", alignItems: "flex-end", padding: "8px" }}>
                <div style={{ position: "absolute", inset: 0, background: idx % 2 === 0 ? "radial-gradient(circle at 40% 45%,#4a3f23 0%,#141420 72%)" : "radial-gradient(circle at 65% 60%,#274060 0%,#141420 74%)" }}></div>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,0) 55%,rgba(0,0,0,.55))" }}></div>
                {scene.imageUrl && (
                  <img src={scene.imageUrl} alt="" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.8, zIndex: 0 }} />
                )}
                <span style={{ position: "absolute", right: "6px", top: "6px", zIndex: 2, background: "rgba(0,0,0,.65)", padding: "2.5px 7px", borderRadius: "7px", fontSize: "9.5px", fontWeight: 700 }}>{scene.targetDuration || 5}s</span>
                <span style={{ position: "absolute", left: "8px", right: "8px", bottom: "8px", zIndex: 2, fontWeight: 800, fontSize: "10.5px", textAlign: "center", textShadow: "0 1px 4px #000", letterSpacing: ".2px" }}>
                  "{scene.narration?.substring(0, 20)}…"
                </span>
              </div>
              <p style={{ fontSize: "10.5px", color: "var(--text-secondary)", marginTop: "7px", lineHeight: 1.45, height: "30px", overflow: "hidden" }}>
                {scene.visualPrompt}
              </p>
              <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                <div 
                  onClick={() => {
                    const el = document.getElementById(`scene-card-${idx}`);
                    if (el) {
                      el.style.opacity = "0.4";
                      setTimeout(() => {
                        el.style.opacity = "1";
                        alert(`Scene ${idx+1} successfully regenerated!`);
                      }, 1500);
                    }
                  }}
                  style={{ width: "24px", height: "24px", borderRadius: "8px", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: "var(--text-secondary)", cursor: "pointer" }}
                >↻</div>
                <div 
                  onClick={() => {
                    const newText = prompt(`Edit narration for scene ${idx+1}:`, scene.narration);
                    if (newText) {
                      const updatedScenes = [...scenes];
                      updatedScenes[idx].narration = newText;
                      setScenes(updatedScenes);
                    }
                  }}
                  style={{ width: "24px", height: "24px", borderRadius: "8px", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: "var(--text-secondary)", cursor: "pointer" }}
                >✎</div>
                <div style={{ width: "24px", height: "24px", borderRadius: "8px", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: "var(--text-secondary)", cursor: "pointer" }} onClick={() => alert("Expanded view coming soon!")}>⌄</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: "0 20px 40px", marginTop: "auto" }}>
          <div style={{ display: "flex", gap: "6px", justifyContent: "center", margin: "2px 0 16px" }}>
            <i style={{ width: "18px", height: "6px", borderRadius: "4px", background: "var(--accent-gradient)" }}></i>
            <i style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--text-muted)" }}></i>
            <i style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--text-muted)" }}></i>
          </div>
          <div style={{ fontSize: "11px", marginBottom: "14px", color: "var(--text-secondary)", textAlign: "center" }}>
            Review scenes before generating.
          </div>
          <div className="btn-primary" onClick={handleApprove} style={{ opacity: project.status === "generating_media" ? 0.5 : 1, cursor: "pointer" }}>
            {project.status === "generating_media" ? "Generating Images..." : `Approve all ${scenes.length} scenes →`}
          </div>
        </div>
      </div>
    );
  }

  if (isRendering) {
    return (
      <div className="animate-fade-in" style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0 20px" }}>
        
        <div style={{ fontSize: "10.5px", color: "var(--text-muted)", letterSpacing: ".6px", textTransform: "uppercase", fontWeight: 600, margin: "8px 0 4px" }}>
          Rendering
        </div>
        <div className="font-display" style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-.3px" }}>
          Building your reel
        </div>

        {/* Thumbnail Preview Area */}
        <div style={{ height: "190px", borderRadius: "var(--radius-md)", margin: "16px 0 20px", position: "relative", overflow: "hidden", background: "#0e0e14", filter: "saturate(.9)" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 45% 50%,#2a2a35 0%,#0e0e14 78%)" }}></div>
        </div>

        {/* Render Steps */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: "13px", fontWeight: 600 }}>
          <span style={{ width: "26px", height: "26px", borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", background: project.progress > 40 ? "rgba(61,220,151,.15)" : "none", color: project.progress > 40 ? "var(--success)" : "var(--accent-violet)", border: project.progress <= 40 ? "2.5px solid rgba(124,92,255,.25)" : "none", borderTopColor: project.progress <= 40 ? "var(--accent-violet)" : "transparent", animation: project.progress <= 40 ? "spin 1s linear infinite" : "none" }}>
            {project.progress > 40 ? "✓" : ""}
          </span>
          Voices — 6 narration tracks <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: "11px" }}>24s</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: "13px", fontWeight: 600 }}>
          <span style={{ width: "26px", height: "26px", borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", background: project.progress > 75 ? "rgba(61,220,151,.15)" : (project.progress > 40 && project.progress <= 75 ? "none" : "var(--bg-card)"), color: project.progress > 75 ? "var(--success)" : (project.progress > 40 && project.progress <= 75 ? "var(--accent-violet)" : "var(--text-muted)"), border: (project.progress > 40 && project.progress <= 75) ? "2.5px solid rgba(124,92,255,.25)" : "none", borderTopColor: (project.progress > 40 && project.progress <= 75) ? "var(--accent-violet)" : "transparent", animation: (project.progress > 40 && project.progress <= 75) ? "spin 1s linear infinite" : "none" }}>
            {project.progress > 75 ? "✓" : (project.progress > 40 && project.progress <= 75 ? "" : "2")}
          </span>
          Visuals — 6 scene stills <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: "11px" }}>1m 12s</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: "13px", fontWeight: 600 }}>
          <span style={{ width: "26px", height: "26px", borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", background: project.progress > 75 ? "none" : "var(--bg-card)", color: project.progress > 75 ? "var(--accent-violet)" : "var(--text-muted)", border: project.progress > 75 ? "2.5px solid rgba(124,92,255,.25)" : "none", borderTopColor: project.progress > 75 ? "var(--accent-violet)" : "transparent", animation: project.progress > 75 ? "spin 1s linear infinite" : "none" }}>
            {project.progress > 75 ? "" : "3"}
          </span>
          Mix & Render — 1080×1920 <span style={{ marginLeft: "auto", color: "#B9A4FF", fontSize: "11px" }}>{project.progress > 75 ? "rendering" : "waiting"}</span>
        </div>

        <div style={{ height: "8px", background: "var(--bg-card)", borderRadius: "99px", overflow: "hidden", margin: "16px 0 8px" }}>
          <i style={{ display: "block", height: "100%", width: `${project.progress}%`, background: "var(--accent-gradient)", borderRadius: "99px", transition: "width 1s linear" }}></i>
        </div>
        
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>{project.progress}% · ~1 min left</span>
          <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>keep this open — or come back in Projects</span>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // S6 - Result
  return (
    <div className="animate-fade-in" style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 20px 100px" }}>
      
      <header style={{ marginBottom: "14px" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--success)", letterSpacing: "1px", marginBottom: "4px" }}>
          ✓ READY TO POST · {project.durationSec} s · ~8.2 MB
        </div>
        <h1 className="font-display" style={{ fontSize: "1.75rem", fontWeight: 700 }}>
          {project.title || "Untitled Video"}
        </h1>
      </header>

      {/* Video Player styled exactly like the Hi-Fi Mock */}
      <div style={{ 
        position: "relative", borderRadius: "var(--radius-lg)", overflow: "hidden", 
        height: "390px", marginBottom: "16px", border: "1px solid var(--border-subtle)" 
      }}>
        {project.outputVideoUrl ? (
          <video src={project.outputVideoUrl} controls autoPlay loop style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <video src="https://assets.mixkit.co/videos/preview/mixkit-vertical-shot-of-a-skater-doing-a-flip-41846-large.mp4" controls autoPlay loop style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
        <button className="btn-primary" style={{ flex: 1.5, padding: "14px" }} onClick={() => {
          const a = document.createElement("a");
          a.href = project.outputVideoUrl || 'https://assets.mixkit.co/videos/preview/mixkit-vertical-shot-of-a-skater-doing-a-flip-41846-large.mp4';
          a.download = `${project.title || "genvid"}.mp4`;
          a.click();
        }}>
          Download MP4
        </button>
        <button 
          onClick={() => {
            if (navigator.share) {
              navigator.share({ title: project.title, url: window.location.href });
            } else {
              navigator.clipboard.writeText(window.location.href);
              alert("Link copied to clipboard!");
            }
          }}
          style={{ 
            flex: 1, background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", 
            borderRadius: "var(--radius-md)", color: "var(--text-secondary)", fontWeight: 600, fontSize: "14px",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
          }}
        >
          Share ⌃
        </button>
      </div>

      <div className="card-dark" style={{ 
        padding: "13px 14px", fontSize: "11.5px", color: "var(--text-secondary)", 
        lineHeight: 1.6, display: "flex", justifyContent: "space-between", gap: "10px" 
      }}>
        <div>
          <b style={{ color: "var(--text-primary)", fontSize: "12px" }}>Instagram caption</b><br/>
          <span id="caption-text">
            {project.title || "Check out this amazing video!"} 🚀✨<br/>
            <span style={{ color: "var(--accent-violet)" }}>
              #{project.input?.replace(/\s+/g, '').slice(0,10) || "reels"} #shorts #ai #genvid
            </span>
          </span>
        </div>
        <span 
          style={{ color: "var(--accent-violet)", fontWeight: 700, fontSize: "12px", whiteSpace: "nowrap", cursor: "pointer" }} 
          onClick={(e) => {
            const txt = document.getElementById("caption-text")?.innerText || "";
            navigator.clipboard.writeText(txt);
            const el = e.currentTarget as HTMLElement;
            const old = el.innerText;
            el.innerText = "COPIED!";
            setTimeout(() => { el.innerText = old; }, 2000);
          }}
        >
          ⧉ Copy
        </span>
      </div>

      <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
        <div className="btn-pill" style={{ flex: 1, display: "flex", justifyContent: "center", fontSize: "11px", fontWeight: 600 }}>↺ New take</div>
        <div className="btn-pill" style={{ flex: 1, display: "flex", justifyContent: "center", fontSize: "11px", fontWeight: 600 }}>✎ Edit scenes</div>
        <div className="btn-pill" style={{ flex: 1, display: "flex", justifyContent: "center", fontSize: "11px", fontWeight: 600 }}>⚡ Post later</div>
      </div>

    </div>
  );
}
