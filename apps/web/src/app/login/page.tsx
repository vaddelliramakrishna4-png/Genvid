"use client";

import { useState } from "react";
import { login, signup } from "./actions";
import { useSearchParams } from "next/navigation";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [isLogin, setIsLogin] = useState(true);

  return (
    <div
      className="animate-fade-in"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 20px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "340px" }}>
        
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "var(--accent-gradient)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              boxShadow: "var(--accent-glow)",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 5V19L19 12L8 5Z" fill="white" />
            </svg>
          </div>
          <h1 className="font-display" style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "8px" }}>
            {isLogin ? "Welcome back" : "Create account"}
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            {isLogin ? "Enter your details to sign in" : "Sign up to start creating videos"}
          </p>
        </div>

        {error && (
          <div style={{ background: "rgba(248, 113, 113, 0.1)", border: "1px solid rgba(248, 113, 113, 0.2)", borderRadius: "var(--radius-sm)", padding: "12px", color: "var(--error)", fontSize: "0.85rem", marginBottom: "24px", textAlign: "center" }}>
            {error}
          </div>
        )}

        <form className="card-dark" style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "24px" }}>
          {!isLogin && (
            <div style={{ background: "var(--bg-input)", padding: "12px 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
              <input
                name="name"
                type="text"
                placeholder="Full Name"
                className="input-flat"
                required
              />
            </div>
          )}
          <div style={{ background: "var(--bg-input)", padding: "12px 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
            <input
              name="email"
              type="email"
              placeholder="Email address"
              className="input-flat"
              required
            />
          </div>
          <div style={{ background: "var(--bg-input)", padding: "12px 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
            <input
              name="password"
              type="password"
              placeholder="Password"
              className="input-flat"
              required
            />
          </div>

          <button
            formAction={isLogin ? login : signup}
            className="btn-primary"
            style={{ marginTop: "8px" }}
          >
            {isLogin ? "Sign In →" : "Sign Up →"}
          </button>
        </form>

        <div style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => setIsLogin(!isLogin)}
            style={{ background: "none", border: "none", color: "var(--accent-violet)", fontWeight: 600, cursor: "pointer" }}
          >
            {isLogin ? "Sign up" : "Sign in"}
          </button>
        </div>

      </div>
    </div>
  );
}
