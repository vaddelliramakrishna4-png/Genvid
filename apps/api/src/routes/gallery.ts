import { Hono } from "hono";
import {
  publishToGallery,
  getPublicGallery,
  getUserGallery,
  getProject,
} from "@genvid/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth";

export const galleryRoutes = new Hono<AuthEnv>();

// ─── GET /gallery/public — Browse public gallery (no auth required) ──────────

galleryRoutes.get("/public", async (c) => {
  const limit = parseInt(c.req.query("limit") || "20", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  const items = await getPublicGallery(limit, offset);
  return c.json({ gallery: items });
});

// All routes below require auth
galleryRoutes.use("*", authMiddleware);

// ─── GET /gallery — User's own gallery ───────────────────────────────────────

galleryRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const items = await getUserGallery(userId);
  return c.json({ gallery: items });
});

// ─── POST /gallery — Publish a completed project to gallery ──────────────────

galleryRoutes.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const { projectId, title, description, isPublic = false } = body;

  if (!projectId) {
    return c.json({ error: "projectId is required" }, 400);
  }

  // Verify project belongs to user and is completed
  const project = await getProject(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }
  if (project.userId !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }
  if (project.status !== "completed") {
    return c.json({ error: "Project must be completed before publishing" }, 400);
  }

  const item = await publishToGallery({
    userId,
    projectId,
    title: title || project.title,
    description,
    isPublic,
    publishedAt: new Date(),
  });

  return c.json({ gallery: item }, 201);
});
