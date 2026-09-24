export default function GalleryPage() {
  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "48px 24px" }}>
      {/* Header */}
      <div className="animate-fade-in-up" style={{ marginBottom: "48px", textAlign: "center" }}>
        <h1 style={{ fontSize: "2.2rem", fontWeight: 800, marginBottom: "8px" }}>
          Public <span className="gradient-text">Gallery</span>
        </h1>
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
