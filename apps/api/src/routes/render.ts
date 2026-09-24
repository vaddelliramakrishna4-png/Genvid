import { Hono } from "hono";
import {
  updateProjectStatus,
  updateProjectProgress,
  insertScenes,
  updateScene,
  createRenderJob,
  updateRenderJob,
  createAsset,
  getProject,
  getScenes,
} from "@genvid/db";
import { GeminiProvider, PexelsProvider } from "@genvid/providers";
import { buildSystemPrompt } from "@genvid/prompts";
import { composeVideo } from "@genvid/render-workers";
import path from "path";
import fs from "fs/promises";

export const renderRoutes = new Hono();

/**
 * POST /render/run/:projectId
 * Synchronous pipeline run for development/testing.
 * In production this would be triggered by QStash webhooks.
 */
renderRoutes.post("/run/:projectId", async (c) => {
  const projectId = c.req.param("projectId");

  const project = await getProject(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  try {
    // ── Step 1: Generate Script ──────────────────────────────────────────
    await updateProjectStatus(projectId, "generating_script", {
      startedAt: new Date(),
    });
    await updateProjectProgress(projectId, 10);

    const provider = new GeminiProvider();
    const pexelsProvider = new PexelsProvider();

    const systemPrompt = buildSystemPrompt({
      projectId: project.id,
      mode: project.mode,
      input: project.inputText,
      businessProfileId: project.businessProfileId,
      characterId: project.characterId,
      spec: {
        durationSec: project.durationSec,
        aspectRatio: project.aspectRatio as "9:16",
        styleKey: project.styleKey,
        seed: project.seed,
        voiceKey: project.voiceKey,
        captionPreset: project.captionPreset,
        musicKey: project.musicKey || "",
        language: project.language,
      },
    });

    const sceneJson = await provider.generateScript(
      {
        projectId: project.id,
        mode: project.mode,
        input: project.inputText,
        businessProfileId: project.businessProfileId,
        characterId: project.characterId,
        spec: {
          durationSec: project.durationSec,
          aspectRatio: project.aspectRatio as "9:16",
          styleKey: project.styleKey,
          seed: project.seed,
          voiceKey: project.voiceKey,
          captionPreset: project.captionPreset,
          musicKey: project.musicKey || "",
          language: project.language,
        },
      },
      systemPrompt
    );

    // Save scenes to DB
    const scenesData = sceneJson.scenes.map((scene, idx) => ({
      projectId,
      sceneIndex: idx,
      narration: scene.narration,
      visualPrompt: scene.visual_prompt,
      characterRefs: scene.character_refs,
      targetDuration: scene.target_duration,
      motion: scene.motion || null,
      transitionIn: scene.transition_in || null,
    }));

    const insertedScenes = await insertScenes(scenesData);

    // Save sceneJson to project
    await updateProjectStatus(projectId, "generating_media", {
      sceneJson: sceneJson as any,
      progress: 30,
    });

    await createRenderJob({
      projectId,
      step: "script_gen",
      status: "completed",
      completedAt: new Date(),
    });

    // ── Step 2: Retrieve Stock Media (per scene) ─────────────────────────
    await updateProjectProgress(projectId, 40);

    for (const scene of insertedScenes) {
      try {
        // Extract a simplified query from the detailed visual prompt to feed into Pexels
        // Example: "A close up of a coffee cup..." -> "close up coffee cup"
        const query = scene.visualPrompt.replace(/[^a-zA-Z0-9 ]/g, "").split(" ").slice(0, 5).join(" ");
        
        let mediaUrl = await pexelsProvider.searchVideo(query, project.aspectRatio === "9:16" ? "portrait" : "landscape");
        
        // Fallback: If no video is found, fallback to an image search (you could implement this in PexelsProvider later)
        // For now, if null, we just use a placeholder
        if (!mediaUrl) {
          mediaUrl = "https://images.pexels.com/photos/196652/pexels-photo-196652.jpeg"; // Fallback placeholder
        }

        await createAsset({
          projectId,
          sceneId: scene.id,
          assetType: mediaUrl.endsWith(".mp4") ? "scene_video" : "scene_image",
          storagePath: mediaUrl, // Saving external URL directly for V1
          mimeType: mediaUrl.endsWith(".mp4") ? "video/mp4" : "image/jpeg",
          fileSizeBytes: 0, 
        });

        // Use the imageUrl column in our schema to hold the visual media URL (works for video/image in the MVP)
        await updateScene(scene.id, { imageUrl: mediaUrl });
      } catch (err) {
        console.error(`Media retrieval failed for scene ${scene.sceneIndex}:`, err);
      }
    }

    await updateProjectProgress(projectId, 60);

    // ── Step 3-5: TTS, Alignment, Composition (FFmpeg) ───────────
    await updateProjectStatus(projectId, "generating_voice");
    await updateProjectProgress(projectId, 70);

    await createRenderJob({
      projectId,
      step: "tts",
      status: "completed",
      completedAt: new Date(),
      metadata: { note: "mocked — Kokoro TTS not wired yet" },
    });

    await updateProjectStatus(projectId, "aligning");
    await updateProjectProgress(projectId, 80);

    await createRenderJob({
      projectId,
      step: "alignment",
      status: "completed",
      completedAt: new Date(),
      metadata: { note: "mocked — faster-whisper not wired yet" },
    });

    await updateProjectStatus(projectId, "compositing");
    await updateProjectProgress(projectId, 90);

    const outputDir = path.join(process.cwd(), ".run", projectId);
    await fs.mkdir(outputDir, { recursive: true });
    
    const outPath = path.join(outputDir, "final.mp4");
    
    // Re-fetch scenes from DB to get the updated imageUrls
    const finalScenes = await getScenes(projectId);
    
    const manifest = {
      projectId,
      scenes: finalScenes.map((s: any) => ({
        mediaUrl: s.imageUrl,
        duration: s.targetDuration || 5
      }))
    };

    await composeVideo(manifest, outPath);

    await createRenderJob({
      projectId,
      step: "composition",
      status: "completed",
      completedAt: new Date()
    });

    // ── Done ─────────────────────────────────────────────────────────────
    await updateProjectStatus(projectId, "completed", {
      progress: 100,
      completedAt: new Date(),
      outputVideoUrl: outPath
    });

    const finalProject = await getProject(projectId);
    return c.json({ project: finalProject });
  } catch (err: any) {
    console.error("Pipeline error:", err);
    await updateProjectStatus(projectId, "failed", {
      errorMessage: err.message || "Unknown error",
    });
    return c.json({ error: err.message || "Pipeline failed" }, 500);
  }
});
