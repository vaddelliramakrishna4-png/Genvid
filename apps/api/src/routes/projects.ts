import { Hono } from "hono";
import {
  createProject,
  getProject,
  getProjectsByUser,
  updateProjectStatus,
} from "@genvid/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth";

export const projectRoutes = new Hono<AuthEnv>();

// All project routes require auth
projectRoutes.use("*", authMiddleware);

// ─── POST /projects — Create a new video project ────────────────────────────

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

    // Check GEMINI_API_KEY as requested
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
      // Fallback if DB is not configured or throws
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

    // Trigger the real pipeline asynchronously in the background
    // We do NOT await it here, so we can return the response to the user immediately.
    import("@genvid/pipeline").then(({ executePipelineForProject }) => {
      console.log(`[GENVID] Dispatching background pipeline for project ${project.id}`);
      executePipelineForProject(project.id).catch(err => {
        console.error(`[GENVID ERROR] Pipeline failed for project ${project.id}:`, err);
      });
    }).catch(err => console.error("Failed to load pipeline module:", err));

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
