/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<any>(null);
  const [scenes, setScenes] = useState<any[]>([]);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const searchParams = useSearchParams();
  const router = useRouter();
  const isEditing = searchParams?.get("edit") === "true";
  const [editTitle, setEditTitle] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const supabase = createClient();

  useEffect(() => {


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

      const res = await fetch(`/api/v1/projects/${projectId}?t=${Date.now()}`, {
        headers: { 
          "Authorization": `Bearer ${session.access_token}`,
          "Cache-Control": "no-cache"
        },
        credentials: "omit"
      });

      if (res.ok) {
        const data = await res.json();
        if (data.project) {
          setProject(data.project);
          if (!editTitle && isEditing) setEditTitle(data.project.title || "");
          setScenes(data.project.scenes || []);
          if (selectedIndexes.size === 0 && data.project.scenes?.length > 0) {
            setSelectedIndexes(new Set(data.project.scenes.map((_: any, i: number) => i)));
          }
        }
      }
    };

    fetchProject();
    const interval = setInterval(fetchProject, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [projectId, supabase]);

  // Determine which UI state to show based on DB status
  const isStoryboard = project ? ["draft", "queued", "generating_script", "generating_media", "storyboard"].includes(project.status) : false;
  const isRendering = project ? ["generating_voice", "aligning", "compositing", "rendering", "uploading"].includes(project.status) : false;
  const isCompleted = project ? project.status === "completed" : false;
  const isFailed = project ? project.status === "failed" : false;

  // Removed fake automatic progression since the backend handles it via polling

  const handleApprove = async () => {
    if (selectedIndexes.size === 0) return;
    
    // Optimistic update
    setProject({ ...project, status: "generating_voice", progress: 45 });
    
    const approvedScenes = scenes.filter((_, idx) => selectedIndexes.has(idx));
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      await fetch(`/api/v1/projects/${projectId}/approve`, {
        method: "POST",
        headers: { 
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ scenes: approvedScenes }),
        credentials: "omit"
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleNewTake = async () => {
    // Regenerate whole project by setting to queued
    setProject({ ...project, status: "queued", progress: 0 });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`/api/v1/projects/${projectId}/regenerate`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${session.access_token}` },
    });
  };

  const handleEditScenes = async () => {
    // Reopen storyboard
    setProject({ ...project, status: "storyboard" });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`/api/v1/projects/${projectId}`, {
      method: "PUT",
      headers: { "Authorization": `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "storyboard" })
    });
  };

  const handlePostLater = async () => {
    if (!scheduleDate) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    
    const res = await fetch(`/api/v1/projects/${projectId}/schedule`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledAt: scheduleDate })
    });
    
    if (res.ok) {
      const data = await res.json();
      setProject(data.project);
      setShowScheduleModal(false);
    }
  };

  const handleSaveEdit = async () => {
    setIsSavingEdit(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const res = await fetch(`/api/v1/projects/${projectId}`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle })
      });
      if (res.ok) {
        setProject({ ...project, title: editTitle });
        router.push(`/project/${projectId}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingEdit(false);
    }
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
    if (project.status === "generating_script" || project.status === "generating_media" || project.status === "queued" || project.status === "draft") {
      return (
        <div className="animate-fade-in" style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0 20px", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", border: "3px solid rgba(124,92,255,.25)", borderTopColor: "var(--accent-violet)", animation: "spin 1s linear infinite", marginBottom: "20px" }}></div>
          <div className="font-display" style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-.3px", marginBottom: "8px" }}>
            {project.status === "generating_media" ? "Finding visual footage..." : "Analyzing your idea & writing script..."}
          </div>
          <div style={{ color: "var(--text-secondary)", fontSize: "12px", maxWidth: "250px" }}>
            Drafting the perfect scenes for your video. This usually takes 15-20 seconds.
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }

    const totalDuration = scenes.reduce((acc, s) => acc + (s.targetDuration || 5), 0);

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
              {scenes.length} scenes · {totalDuration.toFixed(1)}s
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
            flexDirection: "column",
            gap: "16px",
            overflowY: "auto",
            padding: "0 20px 24px",
            margin: "14px 0",
          }}
        >
          {scenes.map((scene: any, idx: number) => {
            const isVideo = scene.imageUrl?.includes(".mp4");
            const isSelected = selectedIndexes.has(idx);
            
            return (
            <div key={idx} id={`scene-card-${idx}`} style={{ display: "flex", gap: "12px", transition: "opacity 0.3s ease", background: "var(--bg-card)", padding: "12px", borderRadius: "12px", border: "1px solid var(--border-subtle)", opacity: isSelected ? 1 : 0.5 }}>
              
              {/* Left: Video Preview */}
              <div style={{ position: "relative", borderRadius: "8px", overflow: "hidden", background: "#0e0e14", width: "90px", height: "140px", flex: "none", border: "1px solid var(--border-subtle)" }}>
                {isVideo ? (
                  <video src={scene.imageUrl} controls={false} autoPlay loop muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.85 }} />
                ) : scene.imageUrl ? (
                  <img src={scene.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.85 }} />
                ) : null}
                <span style={{ position: "absolute", left: "6px", top: "6px", zIndex: 2, background: "rgba(0,0,0,.65)", padding: "2.5px 6px", borderRadius: "5px", fontSize: "9px", fontWeight: 700 }}>{scene.targetDuration || 5}s</span>
              </div>
              
              {/* Right: Details & Actions */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: "10px", color: "var(--accent-violet)", fontWeight: 700, marginBottom: "4px" }}>SCENE {idx + 1}</div>
                <div style={{ fontSize: "11.5px", fontWeight: 600, lineHeight: 1.4, marginBottom: "6px" }}>
                  "{scene.narration}"
                </div>
                <div style={{ fontSize: "10px", color: "var(--text-secondary)", lineHeight: 1.4, marginBottom: "auto" }}>
                  <span style={{opacity: 0.6}}>Visual:</span> {scene.visualPrompt}
                </div>
                
                <div style={{ display: "flex", gap: "6px", marginTop: "12px" }}>
                  <div 
                    onClick={async () => {
                      const el = document.getElementById(`scene-card-${idx}`);
                      if (el) el.style.opacity = "0.4";
                      try {
                        const { data: { session } } = await supabase.auth.getSession();
                        const res = await fetch(`/api/v1/projects/${projectId}/scenes/${scene.id}/regenerate`, {
                          method: "POST",
                          headers: { "Authorization": `Bearer ${session?.access_token}` }
                        });
                        if (res.ok) {
                          const data = await res.json();
                          const updatedScenes = [...scenes];
                          updatedScenes[idx] = data.scene;
                          setScenes(updatedScenes);
                        }
                      } finally {
                        if (el) el.style.opacity = "1";
                      }
                    }}
                    style={{ padding: "6px 12px", borderRadius: "6px", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", fontSize: "10px", fontWeight: 600, color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                  >↻ Regenerate</div>
                  <div 
                    onClick={() => {
                      const newText = prompt(`Edit narration for scene ${idx+1}:`, scene.narration);
                      if (newText) {
                        const updatedScenes = [...scenes];
                        updatedScenes[idx].narration = newText;
                        setScenes(updatedScenes);
                      }
                    }}
                    style={{ padding: "6px 12px", borderRadius: "6px", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", fontSize: "10px", fontWeight: 600, color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                  >✎ Edit Text</div>
                </div>
              </div>
              
              {/* Selection */}
              <div style={{ display: "flex", alignItems: "flex-start", paddingTop: "4px" }}>
                <input 
                  type="checkbox" 
                  checked={isSelected}
                  onChange={(e) => {
                    const newSet = new Set(selectedIndexes);
                    if (e.target.checked) newSet.add(idx);
                    else newSet.delete(idx);
                    setSelectedIndexes(newSet);
                  }}
                  style={{ width: "16px", height: "16px", accentColor: "var(--accent-violet)", cursor: "pointer" }} 
                />
              </div>
              
            </div>
          )})}
        </div>

        <div style={{ padding: "0 20px 40px", marginTop: "auto" }}>
          <div style={{ fontSize: "11px", marginBottom: "14px", color: "var(--text-secondary)", textAlign: "center" }}>
            Review your scenes. You can regenerate or edit individual scenes.
          </div>
          <div className="btn-primary" onClick={handleApprove} style={{ cursor: "pointer", opacity: selectedIndexes.size === 0 ? 0.5 : 1 }}>
            Approve {selectedIndexes.size} selected scenes →
          </div>
        </div>
      </div>
    );
  }

  if (isRendering) {
    const steps = [
      { id: "generating_voice", label: "Generating voice", activeAt: 45, completeAt: 70 },
      { id: "aligning", label: "Creating captions", activeAt: 70, completeAt: 80 },
      { id: "compositing", label: "Rendering video", activeAt: 80, completeAt: 90 },
      { id: "uploading", label: "Uploading video", activeAt: 90, completeAt: 100 },
    ];
    
    const currentProgress = project.progress || 45;
    
    return (
      <div className="animate-fade-in" style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0 20px" }}>
        
        <div style={{ fontSize: "10.5px", color: "var(--text-muted)", letterSpacing: ".6px", textTransform: "uppercase", fontWeight: 600, margin: "8px 0 4px" }}>
          Generating
        </div>
        <div className="font-display" style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-.3px" }}>
          Building your reel
        </div>

        {/* Thumbnail Preview Area */}
        <div style={{ height: "190px", borderRadius: "var(--radius-md)", margin: "16px 0 20px", position: "relative", overflow: "hidden", background: "#0e0e14", filter: "saturate(.9)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 45% 50%,#2a2a35 0%,#0e0e14 78%)" }}></div>
          {scenes.length > 0 && scenes[0].imageUrl && (
            scenes[0].imageUrl.includes(".mp4") ? 
              <video src={scenes[0].imageUrl} autoPlay loop muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.5, position: "absolute", inset: 0 }} /> :
              <img src={scenes[0].imageUrl} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.5, position: "absolute", inset: 0 }} />
          )}
          <div style={{ zIndex: 10, fontSize: "12px", color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>
             {scenes.length > 0 ? `${scenes.length} scenes approved` : "Rendering..."}
          </div>
        </div>

        {/* Completed Steps */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: "13px", fontWeight: 600 }}>
          <span style={{ width: "26px", height: "26px", borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", background: "rgba(61,220,151,.15)", color: "var(--success)" }}>✓</span>
          Storyboard approved
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: "13px", fontWeight: 600 }}>
          <span style={{ width: "26px", height: "26px", borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", background: "rgba(61,220,151,.15)", color: "var(--success)" }}>✓</span>
          Visuals — {scenes.length} scene videos
        </div>

        {/* Pending Steps */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {steps.map((step, index) => {
            const isCompleted = currentProgress >= step.completeAt;
            const isActive = currentProgress >= step.activeAt && currentProgress < step.completeAt;
            const isPending = currentProgress < step.activeAt;
            
            return (
              <div key={step.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: "13px", fontWeight: 600, opacity: isPending ? 0.4 : 1 }}>
                <span style={{ 
                  width: "26px", height: "26px", borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", 
                  background: isCompleted ? "rgba(61,220,151,.15)" : isActive ? "none" : "var(--bg-card)", 
                  color: isCompleted ? "var(--success)" : isActive ? "var(--accent-violet)" : "var(--text-muted)", 
                  border: isActive ? "2.5px solid rgba(124,92,255,.25)" : "none", 
                  borderTopColor: isActive ? "var(--accent-violet)" : "transparent", 
                  animation: isActive ? "spin 1s linear infinite" : "none" 
                }}>
                  {isCompleted ? "✓" : (isActive ? "" : (index + 3))}
                </span>
                {step.label} {step.id === "generating_voice" && !isPending && `— ${scenes.length} narration tracks`}
              </div>
            );
          })}
        </div>

        <div style={{ height: "8px", background: "var(--bg-card)", borderRadius: "99px", overflow: "hidden", margin: "16px 0 8px" }}>
          <i style={{ display: "block", height: "100%", width: `${currentProgress}%`, background: "var(--accent-gradient)", borderRadius: "99px", transition: "width 1s linear" }}></i>
        </div>
        
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>{currentProgress}%</span>
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
        <div style={{ fontSize: "10px", fontWeight: 700, color: project.scheduleStatus === 'scheduled' ? 'var(--accent-violet)' : "var(--success)", letterSpacing: "1px", marginBottom: "4px" }}>
          {project.scheduleStatus === 'scheduled' ? `✓ SCHEDULED FOR ${new Date(project.scheduledAt).toLocaleString()}` : "✓ READY TO POST"} · {project.durationSec} s · ~8.2 MB
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
        <div className="btn-pill" style={{ flex: 1, display: "flex", justifyContent: "center", fontSize: "11px", fontWeight: 600, cursor: "pointer" }} onClick={handleNewTake}>↺ New take</div>
        <div className="btn-pill" style={{ flex: 1, display: "flex", justifyContent: "center", fontSize: "11px", fontWeight: 600, cursor: "pointer" }} onClick={handleEditScenes}>✎ Edit scenes</div>
        <div className="btn-pill" style={{ flex: 1, display: "flex", justifyContent: "center", fontSize: "11px", fontWeight: 600, cursor: "pointer" }} onClick={() => setShowScheduleModal(true)}>⚡ Post later</div>
      </div>

      {showScheduleModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="card-dark" style={{ width: "100%", maxWidth: "340px", padding: "24px", borderRadius: "16px", border: "1px solid var(--border-subtle)" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "12px", color: "var(--text-primary)" }}>Schedule Post</h3>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "16px" }}>Select a date and time to post this video automatically.</p>
            
            <input 
              type="datetime-local" 
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              style={{ width: "100%", padding: "12px", borderRadius: "8px", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", marginBottom: "20px" }}
            />
            
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button 
                onClick={() => setShowScheduleModal(false)}
                style={{ padding: "10px 16px", borderRadius: "8px", background: "transparent", color: "var(--text-primary)", fontSize: "14px", fontWeight: 600, border: "none", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button 
                onClick={handlePostLater}
                disabled={!scheduleDate}
                style={{ padding: "10px 16px", borderRadius: "8px", background: "var(--accent-gradient)", color: "#fff", fontSize: "14px", fontWeight: 600, border: "none", cursor: "pointer", opacity: scheduleDate ? 1 : 0.5 }}
              >
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditing && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="card-dark" style={{ width: "100%", maxWidth: "340px", padding: "24px", borderRadius: "16px", border: "1px solid var(--border-subtle)" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "12px", color: "var(--text-primary)" }}>Edit Project</h3>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px", display: "block" }}>Project Title</label>
              <input 
                type="text" 
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                style={{ width: "100%", padding: "12px", borderRadius: "8px", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
              />
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button 
                onClick={() => router.push(`/project/${projectId}`)}
                style={{ padding: "10px 16px", borderRadius: "8px", background: "transparent", color: "var(--text-primary)", fontSize: "14px", fontWeight: 600, border: "none", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                style={{ padding: "10px 16px", borderRadius: "8px", background: "var(--accent-gradient)", color: "#fff", fontSize: "14px", fontWeight: 600, border: "none", cursor: "pointer" }}
              >
                {isSavingEdit ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
