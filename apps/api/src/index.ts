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

// ─── Health Check ────────────────────────────────────────────────────────────

app.get("/", (c) => {
  return c.json({
    name: "GenVid API",
    version: "0.1.0",
    status: "running",
    timestamp: new Date().toISOString(),
  });
});

// ─── Routes ──────────────────────────────────────────────────────────────────

app.route("/api/v1/projects", projectRoutes);
app.route("/api/v1/gallery", galleryRoutes);
app.route("/api/v1/render", renderRoutes);

// ─── Start Server ────────────────────────────────────────────────────────────

const port = parseInt(process.env.API_PORT || "3001", 10);

if (!process.env.VERCEL) {
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`🚀 GenVid API running at http://localhost:${info.port}`);
  });
}

export default app;
