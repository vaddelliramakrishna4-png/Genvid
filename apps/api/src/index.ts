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

// ─── Process Error Handling ──────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
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

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "genvid-api"
  });
});

// ─── Routes ──────────────────────────────────────────────────────────────────

app.route("/api/v1/projects", projectRoutes);
app.route("/api/v1/gallery", galleryRoutes);
app.route("/api/v1/render", renderRoutes);

// ─── Start Server ────────────────────────────────────────────────────────────

const port = parseInt(process.env.PORT || process.env.API_PORT || "3001", 10);

if (!process.env.VERCEL) {
  serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
    console.log(`🚀 GenVid API running at http://0.0.0.0:${info.port}`);
  });
}

export default app;
