import { Hono } from "hono";
import {
  createProject,
  getProject,
  getProjectsByUser,
  updateProjectStatus,
  updateProject,
  deleteProject,
  updateScene,
} from "@genvid/db";
import { generateStoryboardForProject, renderVideoForProject } from "@genvid/pipeline";
import { authMiddleware, type AuthEnv } from "../middleware/auth";

export const projectRoutes = new Hono<AuthEnv>();

// All project routes require auth
projectRoutes.use("*", authMiddleware);

// ─── POST /projects — Create a new video project ────────────────────────────

import { waitUntil } from "@vercel/functions";

projectRoutes.post("/", async (c) => {
  try {
    const userId = c.get("userId");
    const body = await c.req.json();
    console.log("Create Project Request Body:", body);

    const {
      inputText,
      title,
      mode = "idea",
      durationSec = 30,
      aspectRatio = "9:16",
      styleKey = "cinematic",
      voiceKey = "en-IN-calm-male",
      captionPreset = "bold-pop",
      musicKey,
      language = "en-IN",
      businessProfileId,
      characterId,
      seed = Math.floor(Math.random() * 2147483647), // Generate safe integer seed
    } = body;

    if (!inputText) {
      return c.json({ success: false, error: "inputText is required" }, 400);
    }

    if (!process.env.GEMINI_API_KEY) {
      return c.json({ success: false, error: "GEMINI_API_KEY is not defined in environment variables" }, 400);
    }

    let project;
    project = await createProject({
      userId,
      inputText,
      title: title || inputText.slice(0, 80),
      mode,
      durationSec,
      aspectRatio,
      styleKey,
      voiceKey,
      captionPreset,
      musicKey,
      language,
      businessProfileId: businessProfileId || null,
      characterId: characterId || null,
      status: "queued",
      queuedAt: new Date(),
      seed,
    });

    console.log(`[CREATE] Project created and queued: ${project.id}`);
    
    return c.json({ success: true, project }, 201);
  } catch (err: any) {
    console.error("Route Error:", err);
    return c.json({ 
      success: false, 
      error: err instanceof Error ? err.message : String(err) 
    }, 500);
  }
});

// ─── GET /projects — List user's projects ────────────────────────────────────

projectRoutes.get("", async (c) => {
  const userId = c.get("userId");
  const limit = parseInt(c.req.query("limit") || "20", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  const userProjects = await getProjectsByUser(userId, limit, offset);
  return c.json({ projects: userProjects });
});

projectRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const limit = parseInt(c.req.query("limit") || "20", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  const userProjects = await getProjectsByUser(userId, limit, offset);

  return c.json({ projects: userProjects });
});

// ─── GET /projects/:id — Get a single project with details ───────────────────

projectRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");

  const project = await getProject(projectId);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  if (project.userId !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  return c.json({ project });
});

// ─── POST /projects/:id/scenes/:sceneId/regenerate — Regenerate a scene ─────

projectRoutes.post("/:id/scenes/:sceneId/regenerate", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");
  const sceneId = c.req.param("sceneId");

  const project = await getProject(projectId);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  if (project.userId !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  try {
    const { getScenesByProject, updateScene } = await import("@genvid/db");
    const scenes = await getScenesByProject(projectId);
    const sceneToUpdate = scenes.find(s => s.id === sceneId);
    if (!sceneToUpdate) {
      return c.json({ error: "Scene not found" }, 404);
    }

    // Call Pexels again to get a different visual
    const { PexelsProvider } = await import("@genvid/providers");
    const pexelsProvider = new PexelsProvider();
    
    // Slight variation in query or fetch logic to get a new result
    const query = sceneToUpdate.visualPrompt.replace(/[^a-zA-Z0-9 ]/g, "").split(" ").slice(0, 5).join(" ");
    const randomPage = Math.floor(Math.random() * 5) + 1;
    const mediaUrl = await pexelsProvider.searchVideo(query + " 4k", project.aspectRatio === "9:16" ? "portrait" : "landscape", sceneToUpdate.targetDuration || 5, randomPage);
    
    if (mediaUrl) {
      await updateScene(sceneToUpdate.id, { imageUrl: mediaUrl });
      sceneToUpdate.imageUrl = mediaUrl;
    }
    
    return c.json({ success: true, scene: sceneToUpdate });
  } catch (err: any) {
    console.error("Regeneration failed:", err);
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /projects/:id/approve — Approve storyboard and render ──────────────

projectRoutes.post("/:id/approve", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");

  const project = await getProject(projectId);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  if (project.userId !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // Handle scene updates and filtering
  try {
    const body = await c.req.json();
    if (body.scenes && Array.isArray(body.scenes)) {
      const approvedIds = new Set(body.scenes.map((s: any) => s.id));
      
      const { getScenesByProject, updateScene, getDb, scenes } = await import("@genvid/db");
      const { eq, and, notInArray } = await import("drizzle-orm");
      
      // Update approved scenes
      for (const scene of body.scenes) {
        if (scene.id) {
          await updateScene(scene.id, { narration: scene.narration, targetDuration: scene.targetDuration });
        }
      }
      
      // Delete unapproved scenes
      const db: any = getDb();
      const sc: any = scenes;
      if (approvedIds.size > 0) {
        await db.delete(sc).where(
          and(
            eq(sc.projectId, projectId),
            notInArray(sc.id, Array.from(approvedIds) as string[])
          )
        );
      } else {
        // if for some reason empty, delete all
        await db.delete(sc).where(eq(sc.projectId, projectId));
      }
    }
  } catch (e) {
    // Ignore JSON parsing errors if body is empty
    console.error("Error processing approved scenes:", e);
  }

  // Update status to signal worker to start rendering
  await updateProjectStatus(projectId, "generating_voice", { progress: 45 });
  console.log(`[APPROVE] Project ${projectId} approved and queued for render`);

  return c.json({ success: true });
});

// ─── DELETE /projects/:id — Cancel or delete a project ───────────────────────

projectRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");

  const project = await getProject(projectId);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  if (project.userId !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
    
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const bucketName = "videos";
      const fileName = `${projectId}/output.mp4`;
      
      // Attempt to delete if outputVideoUrl exists
      if (project.outputVideoUrl) {
        const { error } = await supabase.storage.from(bucketName).remove([fileName]);
        if (error) console.error("Storage delete error:", error);
      }
      if (project.thumbnailUrl) {
        const thumbName = `${projectId}/thumbnail.jpg`;
        await supabase.storage.from(bucketName).remove([thumbName]);
      }
    }
  } catch (err) {
    console.error("Failed to clean up storage:", err);
  }

  // Delete project from DB
  await deleteProject(projectId);

  return c.json({ success: true });
});

// ─── PUT /projects/:id — Edit a project ──────────────────────────────────────

projectRoutes.put("/:id", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");

  const project = await getProject(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);
  if (project.userId !== userId) return c.json({ error: "Forbidden" }, 403);

  const body = await c.req.json();
  
  try {
    const updated = await updateProject(projectId, body);
    return c.json({ success: true, project: updated });
  } catch (err: any) {
    console.error("Edit failed:", err);
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /projects/:id/schedule — Schedule a project ────────────────────────

projectRoutes.post("/:id/schedule", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");

  const project = await getProject(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);
  if (project.userId !== userId) return c.json({ error: "Forbidden" }, 403);

  const body = await c.req.json();
  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  const scheduleStatus = body.scheduledAt ? "scheduled" : "draft";

  try {
    const updated = await updateProject(projectId, { scheduledAt, scheduleStatus });
    return c.json({ success: true, project: updated });
  } catch (err: any) {
    console.error("Schedule failed:", err);
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /projects/:id/regenerate — Regenerate whole project ────────────────

projectRoutes.post("/:id/regenerate", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");

  const project = await getProject(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);
  if (project.userId !== userId) return c.json({ error: "Forbidden" }, 403);

  // We set status to queued. The worker will pick it up and overwrite scenes but KEEP old video in storage until new one succeeds (the pipeline handles this if we don't delete old storage).
  // Wait, if worker generates a new video it overwrites the same file in storage `output.mp4`.
  // To keep the old video, the pipeline should probably generate a new version or we just overwrite it safely.
  // The requirement says "Do not delete current video before the new take succeeds".
  // Our pipeline uploads ONLY at the end. So if it fails mid-way, the old `output.mp4` in storage is never touched.
  
  try {
    const updated = await updateProjectStatus(projectId, "queued", { progress: 0, errorMessage: null });
    return c.json({ success: true, project: updated });
  } catch (err: any) {
    console.error("Regenerate failed:", err);
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /projects/:id/render — Trigger render from edited scenes ───────────

projectRoutes.post("/:id/render", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");

  const project = await getProject(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);
  if (project.userId !== userId) return c.json({ error: "Forbidden" }, 403);

  // Set status directly to generating_voice
  try {
    const updated = await updateProjectStatus(projectId, "generating_voice", { progress: 45, errorMessage: null });
    return c.json({ success: true, project: updated });
  } catch (err: any) {
    console.error("Render failed:", err);
    return c.json({ error: err.message }, 500);
  }
});
