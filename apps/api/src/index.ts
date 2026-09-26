import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import * as dotenv from "dotenv";
import path from "path";

if (!process.env.VERCEL) {
  try {
    dotenv.config({ path: path.resolve(__dirname, "../../web/.env.local") });
  } catch (e) {
    console.warn("Could not load dotenv:", e);
  }
}

import { projectRoutes } from "./routes/projects";
import { galleryRoutes } from "./routes/gallery";
import { renderRoutes } from "./routes/render";

const app = new Hono();

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*",
  })
);

// ─── Global Error Handler ────────────────────────────────────────────────────

app.onError((err, c) => {
  console.error("[UNHANDLED ERROR]", err.message, err.stack);
  return c.json({ error: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }, 500);
});

// ─── Health Check ────────────────────────────────────────────────────────────

app.get("/", (c) => {
  return c.json({
    name: "GenVid API",
    version: "0.1.0",
    status: "running",
    timestamp: new Date().toISOString(),
  });
});

// ─── Database Health Check ───────────────────────────────────────────────────

app.get("/health", async (c) => {
  const checks: Record<string, string> = {};
  
  // Check env vars exist (never expose values)
  checks.DATABASE_URL = process.env.DATABASE_URL ? "SET" : "MISSING";
  checks.SUPABASE_URL = process.env.SUPABASE_URL ? "SET" : "MISSING";
  checks.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ? "SET" : "MISSING";
  checks.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ? "SET" : "MISSING";
  checks.GEMINI_API_KEY = process.env.GEMINI_API_KEY ? "SET" : "MISSING";
  checks.PEXELS_API_KEY = process.env.PEXELS_API_KEY ? "SET" : "MISSING";
  checks.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ? "SET" : "MISSING";
  checks.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "SET" : "MISSING";
  
  // Parse DB URL safely
  let dbUrlParsed = null;
  try {
    if (process.env.DATABASE_URL) {
      const url = new URL(process.env.DATABASE_URL);
      dbUrlParsed = {
        protocol: url.protocol,
        host: url.hostname,
        port: url.port,
        username: url.username,
        hasPassword: !!url.password,
        pathname: url.pathname
      };
    }
  } catch (e) {
    dbUrlParsed = "invalid-url-format";
  }

  // Test database connection
  let dbStatus = "UNTESTED";
  let dbError = null;
  try {
    const { getDb } = await import("@genvid/db");
    const db = getDb();
    const result = await db.execute(require("drizzle-orm").sql`SELECT 1 as ok`);
    dbStatus = "CONNECTED";
  } catch (e: any) {
    dbStatus = "FAILED";
    dbError = e.message;
    if (e.cause) dbError += " | CAUSE: " + e.cause.message;
    if (e.code) dbError += " | CODE: " + e.code;
    if (e.detail) dbError += " | DETAIL: " + e.detail;
    if (e.hint) dbError += " | HINT: " + e.hint;
  }
  
  // Test Supabase client
  let supabaseStatus = "UNTESTED";
  let supabaseError = null;
  try {
    const { getSupabase } = await import("@genvid/db");
    const supabase = getSupabase();
    supabaseStatus = "INITIALIZED";
  } catch (e: any) {
    supabaseStatus = "FAILED";
    supabaseError = e.message;
  }
  
  return c.json({
    status: dbStatus === "CONNECTED" ? "healthy" : "unhealthy",
    env: checks,
    dbUrlInfo: dbUrlParsed,
    database: { status: dbStatus, error: dbError },
    supabase: { status: supabaseStatus, error: supabaseError },
    node: process.version,
    timestamp: new Date().toISOString(),
  });
});

app.get("/test-db", async (c) => {
  try {
    const { getProjectsByUser, createProject } = await import("@genvid/db");
    const testProject = await createProject({
      userId: "a1e3edca-4c39-4a85-b22d-25802365d9fe",
      inputText: "test project",
      title: "Test",
      status: "queued"
    });
    const projects = await getProjectsByUser("a1e3edca-4c39-4a85-b22d-25802365d9fe", 20, 0);
    return c.json({ success: true, testProject, projects });
  } catch (e: any) {
    return c.json({ success: false, error: e.message, stack: e.stack, cause: e.cause?.message || e.cause, code: e.code }, 500);
  }
});

// ─── Routes ──────────────────────────────────────────────────────────────────

app.route("/api/v1/projects", projectRoutes);
app.route("/api/v1/gallery", galleryRoutes);
app.route("/api/v1/render", renderRoutes);

// ─── Start Server ────────────────────────────────────────────────────────────

const port = parseInt(process.env.PORT || process.env.API_PORT || "3001", 10);

if (!process.env.VERCEL) {
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`🚀 GenVid API running at http://localhost:${info.port}`);
  });
}

export default app;
