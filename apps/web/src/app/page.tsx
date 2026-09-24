"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SplashPage() {
  const router = useRouter();

  useEffect(() => {
    // In a real app, check auth state here. For now, just simulate a splash delay.
    const timer = setTimeout(() => {
      router.push("/dashboard");
    }, 2000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div
      className="animate-fade-in"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", width: "340px", height: "340px", left: "50%", top: "42%", transform: "translate(-50%,-50%)", background: "radial-gradient(circle,rgba(124,92,255,.22),transparent 65%)", borderRadius: "50%" }}></div>
      <div style={{ textAlign: "center", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Play Icon Logo */}
        <div
          style={{
            width: "78px",
            height: "78px",
            borderRadius: "26px",
            background: "var(--accent-gradient)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 16px 44px rgba(124,92,255,.5)",
            position: "relative",
          }}
        >
          {/* Sparkle decoration (exact clip-path from mock) */}
          <div style={{ 
            position: "absolute", top: "-14px", right: "-12px", width: "16px", height: "16px", 
            background: "var(--accent-coral)", 
            clipPath: "polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%)" 
          }}></div>
          <svg width="30" height="34" viewBox="0 0 30 34"><path d="M2 2l26 15L2 32z" fill="#0A0A0F"/></svg>
        </div>

        <div className="font-display" style={{ fontSize: "34px", fontWeight: 700, marginTop: "26px", letterSpacing: "-.5px" }}>
          GenVid
        </div>
        <div style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "10px", position: "relative" }}>
          One sentence in. A ready-to-post reel out.
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "36px",
          fontSize: "11px",
          color: "var(--text-muted)",
          letterSpacing: "2px",
          textTransform: "uppercase",
        }}
      >
        BY SWANIKI
      </div>
    </div>
  );
}
