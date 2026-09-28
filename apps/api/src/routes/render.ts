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
import { execWithTimeout } from "../utils/exec";

export const renderRoutes = new Hono();

const MAX_GEMINI_RETRIES = 4;
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

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

    let sceneJson = null;
    let geminiAttempt = 0;
    while (geminiAttempt < MAX_GEMINI_RETRIES && !sceneJson) {
        geminiAttempt++;
        try {
            sceneJson = await provider.generateScript(
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
        } catch (err: any) {
            const msg = err.message || "";
            if (msg.includes("503") || msg.includes("504") || msg.includes("502") || msg.includes("429") || msg.includes("500") || msg.includes("busy") || msg.includes("demand")) {
                if (geminiAttempt === MAX_GEMINI_RETRIES) {
                    throw new Error("Gemini is currently experiencing very high demand and could not fulfill the request after multiple attempts. Please try again later.");
                }
                console.warn(`[GEMINI RETRY] Attempt ${geminiAttempt} failed: ${msg}. Retrying...`);
                await delay(2000 * geminiAttempt + Math.random() * 2000); // Exponential backoff with jitter
            } else {
                throw err;
            }
        }
    }

    if (!sceneJson) {
        throw new Error("Failed to generate script from Gemini.");
    }

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
    let ttsScript = "";
    let alignScript = "";
    try {
      ttsScript = require.resolve("@genvid/render-workers/tts.py");
      alignScript = require.resolve("@genvid/render-workers/align.py");
    } catch {
      ttsScript = path.resolve(process.cwd(), "../../packages/render-workers/tts.py");
      alignScript = path.resolve(process.cwd(), "../../packages/render-workers/align.py");
    }

    const audioFiles: string[] = [];
    
    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const sceneAudioPath = path.join(outputDir, `audio_${i}.wav`);
        const maxRetries = 3;
        let attempt = 0;
        let success = false;
        
        while (attempt < maxRetries && !success) {
            attempt++;
            try {
                // Timeout of 90 seconds per track
                const { stdout, stderr } = await execWithTimeout(`python "${ttsScript}" "${scene.narration.replace(/"/g, '\\"')}" "${sceneAudioPath}"`, 90000);
                
                // Validate output file
                const stats = await fs.stat(sceneAudioPath).catch(() => null);
                if (!stats || stats.size === 0) {
                    throw new Error("Generated audio file is missing or empty.");
                }
                success = true;
                audioFiles.push(sceneAudioPath);
                console.log(`[TTS] Track ${i+1} completed successfully.`);
            } catch (err: any) {
                console.warn(`[TTS RETRY] Scene ${i} attempt ${attempt}/${maxRetries} failed:`, err.message);
                if (attempt === maxRetries) {
                    throw new Error(`Voice generation for scene ${i + 1} took too long or failed. We're retrying automatically but this time it failed. Please try again.`);
                }
                await delay(2000 * attempt + Math.random() * 2000);
            }
        }
    }

    const finalAudioPath = path.join(outputDir, "audio.wav");
    
    if (audioFiles.length > 0) {
        // Concatenate audio files using ffmpeg
        const concatListPath = path.join(outputDir, "concat_audio.txt");
        const concatContent = audioFiles.map(f => `file '${f}'`).join("\\n");
        await fs.writeFile(concatListPath, concatContent);
        
        try {
            await execWithTimeout(`ffmpeg -f concat -safe 0 -i "${concatListPath}" -c copy "${finalAudioPath}" -y`, 30000);
        } catch (ffmpegErr: any) {
            throw new Error("Failed to concatenate audio tracks: " + ffmpegErr.message);
        }
    } else {
        throw new Error("No valid audio files generated.");
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
    const fullNarration = scenes.map(s => s.narration).join("\\n");
    const scriptOutPath = path.join(outputDir, "script.txt");
    await fs.writeFile(scriptOutPath, fullNarration);
    
    try {
      await execWithTimeout(`python "${alignScript}" "${finalAudioPath}" "${scriptOutPath}" "${subtitlesOutPath}"`, 120000);
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
      audioUrl: finalAudioPath,
      subtitlesUrl: subtitlesOutPath,
      scenes: scenes.map((s: any) => ({
        mediaUrl: s.imageUrl,
        duration: s.targetDuration || 5
      }))
    };

    // Ensure composition itself doesn't hang indefinitely (wrapper has timeout inside maybe, or just rely on global)
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
      errorMessage: err.message || "Unknown error occurred.",
    });
    return c.json({ error: err.message || "Pipeline failed" }, 500);
  }
});
