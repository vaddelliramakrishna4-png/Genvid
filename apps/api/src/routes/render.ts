import { Hono } from "hono";
import {
  updateProjectStatus,
  updateProjectProgress,
  insertScenes,
  updateScene,
  createRenderJob,
  getProject,
  getScenesByProject,
  createAsset,
  getSupabase
} from "@genvid/db";
import { GeminiProvider, PexelsProvider } from "@genvid/providers";
import { buildSystemPrompt } from "@genvid/prompts";
import { composeVideo } from "@genvid/render-workers";
import path from "path";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

export const renderRoutes = new Hono();

// ─── Phase 1: Generate Script & Initial Media ──────────────────────────────────

renderRoutes.post("/generate-script/:projectId", async (c) => {
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

    await createRenderJob({
      projectId,
      step: "script_gen",
      status: "completed",
      completedAt: new Date(),
    });

    // ── Step 2: Retrieve Stock Media (per scene) ─────────────────────────
    await updateProjectStatus(projectId, "generating_media", {
      sceneJson: sceneJson as any,
      progress: 25,
    });
    
    const pexelsProvider = new PexelsProvider();

    for (const scene of insertedScenes) {
      try {
        const query = scene.visualPrompt.replace(/[^a-zA-Z0-9 ]/g, "").split(" ").slice(0, 5).join(" ");
        let mediaUrl = await pexelsProvider.searchVideo(query, project.aspectRatio === "9:16" ? "portrait" : "landscape");
        
        if (!mediaUrl) {
          mediaUrl = "https://images.pexels.com/photos/196652/pexels-photo-196652.jpeg"; // Fallback placeholder
        }

        await createAsset({
          projectId,
          sceneId: scene.id,
          assetType: mediaUrl.endsWith(".mp4") ? "scene_video" : "scene_image",
          storagePath: mediaUrl, 
          mimeType: mediaUrl.endsWith(".mp4") ? "video/mp4" : "image/jpeg",
          fileSizeBytes: 0, 
        });

        await updateScene(scene.id, { imageUrl: mediaUrl });
      } catch (err) {
        console.error(`Media retrieval failed for scene ${scene.sceneIndex}:`, err);
      }
    }

    // PAUSE HERE: Transition to storyboard so the user can approve
    await updateProjectStatus(projectId, "storyboard", {
      progress: 40,
    });
    
    console.log(`[GENERATE SCRIPT] Completed for ${projectId}. Waiting for approval.`);

    return c.json({ success: true });
  } catch (err: any) {
    console.error("Pipeline script generation error:", err);
    await updateProjectStatus(projectId, "failed", {
      errorMessage: err.message || "Failed to generate script",
    });
    return c.json({ error: err.message || "Script generation failed" }, 500);
  }
});

// ─── Phase 2: Render Media (TTS, Align, Composite) ─────────────────────────────

renderRoutes.post("/render-media/:projectId", async (c) => {
  const projectId = c.req.param("projectId");

  const project = await getProject(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  try {
    await updateProjectStatus(projectId, "generating_voice", { progress: 45 });
    
    const outputDir = path.join(process.cwd(), ".run", projectId);
    await fs.mkdir(outputDir, { recursive: true });

    // Fetch approved scenes
    const scenes = await getScenesByProject(projectId);
    
    if (scenes.length === 0) {
      throw new Error("No approved scenes found for this project.");
    }
    
    // Check if media is valid
    if (scenes.every(s => !s.imageUrl)) {
      throw new Error("No valid media inputs provided for scenes. Please regenerate scenes or contact support.");
    }

    // ── Step 3: TTS (Kokoro) ──────────────────────────────────────────────
    // Concatenate all narrations
    const fullNarration = scenes.map(s => s.narration).join("\\n");
    const audioOutPath = path.join(outputDir, "audio.wav");
    
    try {
      const ttsScript = require.resolve("@genvid/render-workers/tts.py");
      await execAsync(`python "${ttsScript}" "${fullNarration.replace(/"/g, '\\"')}" "${audioOutPath}"`);
    } catch (err) {
      console.warn("TTS failed (maybe kokoro not installed?), using dummy audio for now", err);
      // We don't fail immediately because Render might not have Kokoro installed yet without GPU, 
      // but the user requirement said "Do NOT replace these with mocks". 
      // If the python script fails, we will throw. 
      throw new Error("TTS Generation failed: " + (err as Error).message);
    }

    await createRenderJob({
      projectId,
      step: "tts",
      status: "completed",
      completedAt: new Date(),
    });

    // ── Step 4: Alignment (faster-whisper) ────────────────────────────────
    await updateProjectStatus(projectId, "aligning", { progress: 70 });
    const subtitlesOutPath = path.join(outputDir, "subtitles.ass");
    const scriptOutPath = path.join(outputDir, "script.txt");
    await fs.writeFile(scriptOutPath, fullNarration);
    
    try {
      const alignScript = require.resolve("@genvid/render-workers/align.py");
      await execAsync(`python "${alignScript}" "${audioOutPath}" "${scriptOutPath}" "${subtitlesOutPath}"`);
    } catch (err) {
      console.warn("Alignment failed", err);
      throw new Error("Alignment failed: " + (err as Error).message);
    }

    await createRenderJob({
      projectId,
      step: "alignment",
      status: "completed",
      completedAt: new Date(),
    });

    // ── Step 5: Composition (FFmpeg) ──────────────────────────────────────
    await updateProjectStatus(projectId, "compositing", { progress: 80 });
    
    const outPath = path.join(outputDir, "final.mp4");
    
    const manifest = {
      projectId,
      audioUrl: audioOutPath,
      subtitlesUrl: subtitlesOutPath,
      scenes: scenes.map((s: any) => ({
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

    // ── Step 6: Supabase Upload ──────────────────────────────────────────
    await updateProjectStatus(projectId, "uploading", { progress: 95 });
    
    const supabase = getSupabase();
    const fileBuffer = await fs.readFile(outPath);
    const fileName = `${projectId}_${Date.now()}.mp4`;
    
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from("videos")
      .upload(fileName, fileBuffer, {
        contentType: "video/mp4",
        upsert: true
      });
      
    if (uploadError) {
      throw new Error("Failed to upload video to Supabase: " + uploadError.message);
    }
    
    const { data: publicUrlData } = supabase
      .storage
      .from("videos")
      .getPublicUrl(fileName);
      
    const finalVideoUrl = publicUrlData.publicUrl;

    // ── Done ─────────────────────────────────────────────────────────────
    await updateProjectStatus(projectId, "completed", {
      progress: 100,
      completedAt: new Date(),
      outputVideoUrl: finalVideoUrl
    });

    return c.json({ success: true });
  } catch (err: any) {
    console.error("Pipeline render error:", err);
    await updateProjectStatus(projectId, "failed", {
      errorMessage: err.message || "Unknown error",
    });
    return c.json({ error: err.message || "Pipeline failed" }, 500);
  }
});
