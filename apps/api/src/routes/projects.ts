import { Hono } from "hono";
import {
  createProject,
  getProject,
  getProjectsByUser,
  updateProjectStatus,
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
    } = body;

    if (!inputText) {
      return c.json({ success: false, error: "inputText is required" }, 400);
    }

    if (!process.env.GEMINI_API_KEY) {
      return c.json({ success: false, error: "GEMINI_API_KEY is not defined in environment variables" }, 400);
    }

    let project;
    try {
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
      });
    } catch (dbError: any) {
      console.error("DB Error while creating project:", dbError);
      project = {
        id: "prj_" + Date.now(),
        userId,
        inputText,
        title: title || inputText.slice(0, 80),
        mode,
        durationSec,
        status: "queued",
      };
    }

    console.log(`[CREATE] Project created: ${project.id}`);
    
    // Trigger the real pipeline asynchronously in the background using Vercel's waitUntil
    // This allows the response to return quickly without 504 timeouts.
    try {
      waitUntil(
        (async () => {
          console.log(`[GENERATION] Starting pipeline: ${project.id}`);
          try {
            await generateStoryboardForProject(project.id);
          } catch (err: any) {
            console.error(`[GENVID ERROR] Pipeline failed for project ${project.id}:`, err);
            await updateProjectStatus(project.id, "failed", { errorMessage: err.message || String(err) });
          }
        })()
      );
    } catch (e) {
      // Fallback for local environments where waitUntil might fail
      setTimeout(() => {
        generateStoryboardForProject(project.id).catch(err => {
          console.error(`[GENVID ERROR] Pipeline failed for project ${project.id}:`, err);
          updateProjectStatus(project.id, "failed", { errorMessage: err.message || String(err) });
        });
      }, 0);
    }

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
    const mediaUrl = await pexelsProvider.searchVideo(query + " 4k", project.aspectRatio === "9:16" ? "portrait" : "landscape", sceneToUpdate.targetDuration || 5);
    
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

  // Update status to starting render
  await updateProjectStatus(projectId, "generating_voice", { progress: 45 });

  try {
    waitUntil(
      (async () => {
        console.log(`[RENDER] Starting render for approved project: ${project.id}`);
        try {
          await renderVideoForProject(project.id);
        } catch (err: any) {
          console.error(`[GENVID ERROR] Render failed for project ${project.id}:`, err);
          await updateProjectStatus(project.id, "failed", { errorMessage: err.message || String(err) });
        }
      })()
    );
  } catch (e) {
    setTimeout(() => {
      renderVideoForProject(project.id).catch(err => {
        console.error(`[GENVID ERROR] Render failed for project ${project.id}:`, err);
        updateProjectStatus(project.id, "failed", { errorMessage: err.message || String(err) });
      });
    }, 0);
  }

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

  // If still processing, cancel; otherwise mark as cancelled
  const updated = await updateProjectStatus(projectId, "cancelled");

  return c.json({ project: updated });
});
