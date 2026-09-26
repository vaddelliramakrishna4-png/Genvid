export default function GalleryPage() {
  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "48px 24px" }}>
      {/* ── Fixed Header ──────────────────────────────────────────────────── */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000, background: "#0A0A0F", padding: "16px 24px", borderBottom: "1px solid var(--border-subtle)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0 }}>
            Public <span className="gradient-text">Gallery</span>
          </h1>
        </div>
      </div>

      {/* Pad content */}
      <div style={{ height: "40px" }}></div>
      
      <div className="animate-fade-in-up" style={{ textAlign: "center", marginBottom: "48px" }}>
        <p style={{ color: "var(--text-secondary)", maxWidth: "480px", margin: "0 auto" }}>
          Explore videos created by the GenVid community. Get inspired and create your own.
        </p>
      </div>

      {/* Empty State */}
      <div
        className="glass-card animate-fade-in-up animate-delay-1"
        style={{ padding: "80px 40px", textAlign: "center" }}
      >
        <div style={{ fontSize: "4rem", marginBottom: "16px" }}>🌟</div>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "8px" }}>
          Gallery Coming Soon
        </h2>
        <p
          style={{
            color: "var(--text-secondary)",
            maxWidth: "400px",
            margin: "0 auto 24px",
            lineHeight: 1.6,
          }}
        >
          Once users start publishing their videos, they&apos;ll appear here for everyone
          to explore and get inspired by.
        </p>
        <a href="/create" className="btn-primary">
          ✨ Be the First Creator
        </a>
      </div>
    </div>
  );
}
