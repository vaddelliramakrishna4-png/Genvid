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
import fsSync from "fs";
import { execWithTimeout } from "../utils/exec";

export const renderRoutes = new Hono();

const MAX_GEMINI_RETRIES = 4;
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Phase 1: Generate Script & Initial Media ──────────────────────────────────

export async function executeGenerateScript(projectId: string): Promise<void> {
  console.log(`[GENERATE SCRIPT PIPELINE] Starting for project: ${projectId}`);
  const project = await getProject(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  try {
    // ── Step 1: Generate Script ──────────────────────────────────────────
    await updateProjectStatus(projectId, "generating_script", {
      startedAt: new Date(),
      errorMessage: null,
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
        if (
          msg.includes("503") ||
          msg.includes("504") ||
          msg.includes("502") ||
          msg.includes("429") ||
          msg.includes("500") ||
          msg.includes("busy") ||
          msg.includes("demand")
        ) {
          if (geminiAttempt === MAX_GEMINI_RETRIES) {
            throw new Error(
              "Gemini is currently experiencing very high demand and could not fulfill the request after multiple attempts. Please try again later."
            );
          }
          console.warn(`[GEMINI RETRY] Attempt ${geminiAttempt} failed: ${msg}. Retrying...`);
          await delay(2000 * geminiAttempt + Math.random() * 2000);
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
          mediaUrl = "https://images.pexels.com/photos/196652/pexels-photo-196652.jpeg";
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

    // Transition to storyboard so the user can approve
    await updateProjectStatus(projectId, "storyboard", {
      progress: 40,
      errorMessage: null,
    });

    console.log(`[GENERATE SCRIPT] Completed successfully for ${projectId}. Waiting for approval.`);
  } catch (err: any) {
    console.error("Pipeline script generation error:", err);
    await updateProjectStatus(projectId, "failed", {
      errorMessage: err.message || "Failed to generate script",
    });
    throw err;
  }
}

renderRoutes.post("/generate-script/:projectId", async (c) => {
  const projectId = c.req.param("projectId");

  const project = await getProject(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  // Trigger asynchronously or await if caller expects completion
  try {
    await executeGenerateScript(projectId);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message || "Script generation failed" }, 500);
  }
});

// ─── Audio Duration Helper ───────────────────────────────────────────────────

async function getAudioDuration(audioPath: string): Promise<number> {
  try {
    const ffprobeStatic = require("ffprobe-static");
    const { stdout } = await execWithTimeout(
      `"${ffprobeStatic.path}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`,
      10000
    );
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) || duration <= 0 ? 5 : duration;
  } catch {
    return 5;
  }
}

// ─── Phase 2: Render Media Pipeline (TTS, Align, Composite, Upload) ────────────

export async function executeRenderMedia(projectId: string): Promise<void> {
  console.log(`[RENDER PIPELINE] Starting executeRenderMedia for ${projectId}`);
  const project = await getProject(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found.`);
  }

  try {
    await updateProjectStatus(projectId, "generating_voice", { progress: 45 });

    const outputDir = path.join(process.cwd(), ".run", projectId);
    await fs.mkdir(outputDir, { recursive: true });

    // Fetch approved scenes
    const scenes = await getScenesByProject(projectId);
    if (!scenes || scenes.length === 0) {
      throw new Error("No approved scenes found for this project.");
    }

    if (scenes.every(s => !s.imageUrl)) {
      throw new Error("No valid media inputs provided for scenes. Please regenerate scenes or contact support.");
    }

    // ── Step 3: TTS (Kokoro) ──────────────────────────────────────────────
    const isWindows = process.platform === "win32";
    let pythonExe = process.env.PYTHON_PATH || "";
    if (!pythonExe) {
      const candidates = [
        path.resolve(process.cwd(), "../../.venv", isWindows ? "Scripts/python.exe" : "bin/python"),
        path.resolve(process.cwd(), ".venv", isWindows ? "Scripts/python.exe" : "bin/python"),
        path.resolve(__dirname, "../../../../.venv", isWindows ? "Scripts/python.exe" : "bin/python"),
        "C:\\genvid\\.venv\\Scripts\\python.exe",
        "/app/.venv/bin/python",
        isWindows ? "python.exe" : "python3",
      ];
      for (const cand of candidates) {
        if (cand && fsSync.existsSync(cand)) {
          pythonExe = cand;
          break;
        }
      }
      if (!pythonExe) pythonExe = isWindows ? "python" : "python3";
    }

    let ttsScript = "";
    let alignScript = "";
    try {
      const pkgDir = path.dirname(require.resolve("@genvid/render-workers/package.json"));
      ttsScript = path.join(pkgDir, "tts.py");
      alignScript = path.join(pkgDir, "align.py");
    } catch {
      ttsScript = path.resolve(process.cwd(), "../../packages/render-workers/tts.py");
      alignScript = path.resolve(process.cwd(), "../../packages/render-workers/align.py");
    }

    console.log(`[RENDER PIPELINE] Using python: ${pythonExe}`);
    console.log(`[RENDER PIPELINE] Using TTS script: ${ttsScript}`);

    const audioFiles: string[] = [];
    const sceneDurations: number[] = [];

    // Batch generation for ultra-fast TTS (loads Kokoro model once)
    const ttsManifestPath = path.join(outputDir, "tts_manifest.json");
    const ttsTasks = scenes.map((scene, i) => ({
      text: scene.narration,
      output: path.join(outputDir, `audio_${i}.wav`),
      voice: project.voiceKey || "af_heart",
    }));

    await fs.writeFile(ttsManifestPath, JSON.stringify(ttsTasks, null, 2));

    try {
      console.log(`[TTS BATCH] Synthesizing ${ttsTasks.length} narration tracks in one fast pass...`);
      await execWithTimeout(
        `"${pythonExe}" "${ttsScript}" --batch "${ttsManifestPath.replace(/\\/g, "/")}"`,
        300000,
        { env: { HF_TOKEN: process.env.HF_TOKEN || "" } }
      );
    } catch (batchErr: any) {
      console.warn(`[TTS BATCH WARN] Batch synthesis warning, falling back to individual tracks:`, batchErr.message);
    }

    // Verify and measure audio files with incremental progress updates
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const sceneAudioPath = path.join(outputDir, `audio_${i}.wav`);
      let stats = await fs.stat(sceneAudioPath).catch(() => null);

      if (!stats || stats.size === 0) {
        console.log(`[TTS FALLBACK] Regenerating track ${i + 1}...`);
        await execWithTimeout(
          `"${pythonExe}" "${ttsScript}" "${scene.narration.replace(/"/g, '\\"')}" "${sceneAudioPath.replace(/\\/g, "/")}" "${project.voiceKey || "af_heart"}"`,
          30000,
          { env: { HF_TOKEN: process.env.HF_TOKEN || "" } }
        );
        stats = await fs.stat(sceneAudioPath).catch(() => null);
        if (!stats || stats.size === 0) {
          throw new Error(`Voice generation for scene ${i + 1} produced no audio.`);
        }
      }

      audioFiles.push(sceneAudioPath);
      const dur = await getAudioDuration(sceneAudioPath);
      sceneDurations.push(dur);
      await updateScene(scene.id, { audioUrl: sceneAudioPath, actualDuration: dur });
      
      // Update progress incrementally so the user sees real-time advancement
      const voiceProgress = Math.min(68, Math.round(45 + ((i + 1) / scenes.length) * 23));
      await updateProjectProgress(projectId, voiceProgress);
      console.log(`[TTS] Track ${i + 1}/${scenes.length} ready (${dur.toFixed(2)}s) — Progress ${voiceProgress}%.`);
    }

    const finalAudioPath = path.join(outputDir, "audio.wav");

    if (audioFiles.length === 0) {
      throw new Error("No valid audio files generated.");
    }

    // Concatenate audio files using ffmpeg concat demuxer
    const concatListPath = path.join(outputDir, "concat_audio.txt");
    const concatContent = audioFiles.map(f => `file '${f.replace(/\\/g, "/")}'`).join("\n");
    await fs.writeFile(concatListPath, concatContent);

    try {
      const ffmpegStaticPath = require("ffmpeg-static");
      await execWithTimeout(`"${ffmpegStaticPath}" -f concat -safe 0 -i "${concatListPath.replace(/\\/g, "/")}" -c copy "${finalAudioPath.replace(/\\/g, "/")}" -y`, 30000);
    } catch (ffmpegErr: any) {
      throw new Error("Failed to concatenate audio tracks: " + ffmpegErr.message);
    }

    await createRenderJob({
      projectId,
      step: "tts",
      status: "completed",
      completedAt: new Date(),
    });

    // ── Step 4: Alignment (faster-whisper with instant timed fallback) ──────
    await updateProjectStatus(projectId, "aligning", { progress: 70 });
    const subtitlesOutPath = path.join(outputDir, "subtitles.ass");
    const fullNarration = scenes.map(s => s.narration).join("\n");
    const scriptOutPath = path.join(outputDir, "script.txt");
    await fs.writeFile(scriptOutPath, fullNarration);

    console.log(`[ALIGNMENT] Running aligner on ${finalAudioPath}...`);
    try {
      await execWithTimeout(
        `"${pythonExe}" "${alignScript}" "${finalAudioPath.replace(/\\/g, "/")}" "${scriptOutPath.replace(/\\/g, "/")}" "${subtitlesOutPath.replace(/\\/g, "/")}"`,
        45000 // 45s cap so it never hangs
      );
    } catch (err) {
      console.warn("[ALIGNMENT] Whisper notice, using timed fallback subtitles:", err);
    }

    // If faster-whisper didn't produce subtitles, generate them instantly from scene timing
    const subStats = await fs.stat(subtitlesOutPath).catch(() => null);
    if (!subStats || subStats.size < 50) {
      console.log("[ALIGNMENT] Generating instant timed subtitles from scene narration...");
      let currTime = 0;
      const assLines = [
        "[Script Info]",
        "Title: GenVid Subtitles",
        "ScriptType: v4.00+",
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        "Style: Default,Arial,22,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2.5,1.5,2,20,20,35,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
      ];

      function formatAssTime(sec: number) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = (sec % 60).toFixed(2).padStart(5, "0");
        return `${h}:${String(m).padStart(2, "0")}:${s}`;
      }

      for (let idx = 0; idx < scenes.length; idx++) {
        const dur = sceneDurations[idx] || scenes[idx].targetDuration || 5;
        const startStr = formatAssTime(currTime);
        const endStr = formatAssTime(currTime + dur);
        assLines.push(`Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${scenes[idx].narration}`);
        currTime += dur;
      }

      await fs.writeFile(subtitlesOutPath, assLines.join("\n"), "utf-8");
      console.log("[ALIGNMENT] Fast timed subtitles created successfully.");
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
    const subtitlesExist = fsSync.existsSync(subtitlesOutPath);

    const manifest = {
      projectId,
      audioUrl: finalAudioPath,
      subtitlesUrl: subtitlesExist ? subtitlesOutPath : undefined,
      scenes: scenes.map((s: any, idx: number) => ({
        mediaUrl: s.imageUrl,
        duration: sceneDurations[idx] || s.targetDuration || 5,
      })),
    };

    console.log(`[COMPOSITOR] Starting video composition with ${manifest.scenes.length} scenes...`);
    await composeVideo(manifest, outPath);

    await createRenderJob({
      projectId,
      step: "composition",
      status: "completed",
      completedAt: new Date(),
    });

    // ── Step 6: Supabase Upload ──────────────────────────────────────────
    await updateProjectStatus(projectId, "uploading", { progress: 95 });

    const supabase = getSupabase();
    const fileBuffer = await fs.readFile(outPath);
    const fileName = `${projectId}.mp4`;

    console.log(`[STORAGE] Uploading final video to Supabase as ${fileName}...`);
    const { error: uploadError } = await supabase.storage.from("videos").upload(fileName, fileBuffer, {
      contentType: "video/mp4",
      upsert: true,
    });

    if (uploadError) {
      throw new Error("Failed to upload video to Supabase: " + uploadError.message);
    }

    const { data: publicUrlData } = supabase.storage.from("videos").getPublicUrl(fileName);
    const finalVideoUrl = publicUrlData.publicUrl;

    console.log(`[RENDER PIPELINE] SUCCESS! Final video URL: ${finalVideoUrl}`);

    // ── Done ─────────────────────────────────────────────────────────────
    await updateProjectStatus(projectId, "completed", {
      progress: 100,
      completedAt: new Date(),
      outputVideoUrl: finalVideoUrl,
      errorMessage: null,
    });
  } catch (err: any) {
    console.error(`[RENDER PIPELINE ERROR] Failed for project ${projectId}:`, err);
    await updateProjectStatus(projectId, "failed", {
      errorMessage: err.message || "Unknown error occurred.",
    });
    throw err;
  }
}

renderRoutes.post("/render-media/:projectId", async (c) => {
  const projectId = c.req.param("projectId");

  const project = await getProject(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  // Trigger asynchronously so caller gets immediate response
  executeRenderMedia(projectId).catch(err => {
    console.error(`[RENDER BACKGROUND ERROR] project ${projectId}:`, err);
  });

  return c.json({ success: true, message: "Render media pipeline started" });
});

