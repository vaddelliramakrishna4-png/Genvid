import { GeminiProvider } from "@genvid/providers";
import { buildSystemPrompt } from "@genvid/prompts";
import {
  createProject,
  insertScenes,
  updateProjectStatus,
  updateProjectProgress,
  createRenderJob,
  createAsset,
  updateScene,
  getProject,
} from "@genvid/db";
import fs from "fs/promises";
import path from "path";

export async function generateStoryboardForProject(projectId: string): Promise<void> {
  const baseDir = process.env.VERCEL ? "/tmp" : process.cwd();
  const outputDir = path.join(baseDir, ".run", projectId);
  await fs.mkdir(outputDir, { recursive: true });

  const project = await getProject(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const provider = new GeminiProvider();

  console.log(`[GEMINI] Generating scenes...`);
  await updateProjectStatus(projectId, "generating_script", { startedAt: new Date() });
  await updateProjectProgress(projectId, 10);

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

  // Normalize target durations so they sum EXACTLY to project.durationSec
  const totalTarget = sceneJson.scenes.reduce((acc: number, s: any) => acc + (s.target_duration || 5), 0);
  if (totalTarget !== project.durationSec && sceneJson.scenes.length > 0) {
    const ratio = project.durationSec / totalTarget;
    sceneJson.scenes.forEach((s: any) => {
      s.target_duration = Number(((s.target_duration || 5) * ratio).toFixed(2));
    });
    // Adjust last scene for rounding differences
    const newTotal = sceneJson.scenes.reduce((acc: number, s: any) => acc + s.target_duration, 0);
    const diff = Number((project.durationSec - newTotal).toFixed(2));
    if (diff !== 0) {
      sceneJson.scenes[sceneJson.scenes.length - 1].target_duration = Number((sceneJson.scenes[sceneJson.scenes.length - 1].target_duration + diff).toFixed(2));
    }
  }

  await fs.writeFile(
    path.join(outputDir, "scenes.json"),
    JSON.stringify(sceneJson, null, 2)
  );
  console.log("Scenes generated:", sceneJson.scenes.length);

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

  await updateProjectStatus(projectId, "generating_media", {
    sceneJson: sceneJson as any,
    progress: 30,
  });
  await createRenderJob({ projectId, step: "script_gen", status: "completed", completedAt: new Date() });

  console.log(`[PEXELS] Fetching scene videos...`);
  await updateProjectProgress(projectId, 40);

  const { PexelsProvider } = await import("@genvid/providers");
  const pexelsProvider = new PexelsProvider();

  for (const scene of insertedScenes) {
    try {
      console.log(`Searching Pexels for scene ${scene.sceneIndex}...`);
      
      const query = scene.visualPrompt.replace(/[^a-zA-Z0-9 ]/g, "").split(" ").slice(0, 5).join(" ");
      let mediaUrl = await pexelsProvider.searchVideo(query, project.aspectRatio === "9:16" ? "portrait" : "landscape", scene.targetDuration || 5);
      
      if (!mediaUrl) {
        console.warn(`[PEXELS] No media found for query: ${query}. Using fallback.`);
        mediaUrl = "https://images.pexels.com/photos/196652/pexels-photo-196652.jpeg";
      }

      await createAsset({
        projectId,
        sceneId: scene.id,
        assetType: "scene_image", // MVP treats all scene visuals as scene_image in the enum
        storagePath: mediaUrl,
        mimeType: mediaUrl.endsWith(".mp4") ? "video/mp4" : "image/jpeg",
        fileSizeBytes: 0,
      });
      await updateScene(scene.id, { imageUrl: mediaUrl });
    } catch (err: any) {
      console.error(`Media fetch failed for scene ${scene.sceneIndex}:`, err.message);
    }
  }
  
  await updateProjectStatus(projectId, "storyboard", { progress: 40 });
  console.log(`[STORYBOARD] Ready for user approval: ${projectId}`);
}

export async function renderVideoForProject(projectId: string): Promise<string> {
  const baseDir = process.env.VERCEL ? "/tmp" : process.cwd();
  const outputDir = path.join(baseDir, ".run", projectId);
  await fs.mkdir(outputDir, { recursive: true });

  const project = await getProject(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const { getScenesByProject } = await import("@genvid/db");
  const insertedScenes = await getScenesByProject(projectId);
  
  const audioOutPath = path.join(outputDir, "narration.wav");
  const fullNarration = insertedScenes.map(s => s.narration).join(" ");
  
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    
    // Create a text file with the full narration
    const scriptPath = path.join(outputDir, "script.txt");
    await fs.writeFile(scriptPath, fullNarration);
    
    // Use system python in production, or local venv in dev
    const pythonExe = process.env.VERCEL ? "python3" : path.join(process.cwd(), "..", "..", ".venv", "Scripts", "python.exe");

    // Run TTS
    // Use dynamic resolution to find the scripts from the render-workers package
    // (We also force Vercel NFT to trace these files by doing a static require.resolve)
    try { require.resolve("@genvid/render-workers/tts.py"); } catch(e) {}
    try { require.resolve("@genvid/render-workers/align.py"); } catch(e) {}
    
    const renderWorkersPkg = require.resolve("@genvid/render-workers/package.json");
    const renderWorkersDir = path.dirname(renderWorkersPkg);
    
    const ttsScript = path.join(renderWorkersDir, "tts.py");
    await execAsync(`"${pythonExe}" "${ttsScript}" "${fullNarration}" "${audioOutPath}"`);
    console.log("Voice generated at:", audioOutPath);
    await createRenderJob({ projectId, step: "tts", status: "completed", completedAt: new Date() });

    console.log(`[WHISPER] Generating captions...`);
    await updateProjectStatus(projectId, "aligning", { progress: 80 });
    
    // Run Alignment
    const subtitlesPath = path.join(outputDir, "subtitles.ass");
    const alignScript = path.join(renderWorkersDir, "align.py");
    await execAsync(`"${pythonExe}" "${alignScript}" "${audioOutPath}" "${scriptPath}" "${subtitlesPath}"`);
    console.log("Subtitles generated at:", subtitlesPath);
    await createRenderJob({ projectId, step: "alignment", status: "completed", completedAt: new Date() });
  } catch (err: any) {
    console.error("Voice/Alignment failed:", err.message);
    throw err;
  }

  console.log(`[FFMPEG] Rendering MP4...`);
  await updateProjectStatus(projectId, "compositing", { progress: 90 });
  
  const outPath = path.join(outputDir, "output.mp4");
  
  // Actually run FFmpeg via compositor
  const { composeVideo } = await import("@genvid/render-workers");
  
  const finalScenes = await getScenesByProject(projectId);
  
  const manifest = {
    projectId,
    audioUrl: audioOutPath,
    subtitlesUrl: path.join(outputDir, "subtitles.ass"),
    scenes: finalScenes.map((s: any) => ({
      mediaUrl: s.imageUrl,
      duration: s.targetDuration || 5
    }))
  };

  try {
    await composeVideo(manifest, outPath);

    // DURATION VALIDATION (Requirement 14)
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    const ffprobePath = (await import("ffprobe-static")).default.path;
    const { stdout } = await execAsync(`"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outPath}"`);
    const actualDuration = parseFloat(stdout.trim());
    console.log(`Requested duration: ${project.durationSec}s`);
    console.log(`Actual duration: ${actualDuration.toFixed(1)}s`);
    
    if (Math.abs(actualDuration - project.durationSec) > 1.5) {
      throw new Error(`Final video duration validation failed. Requested: ${project.durationSec}s, Rendered: ${actualDuration.toFixed(1)}s`);
    }

    console.log(`[STORAGE] Uploading MP4...`);
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase credentials for upload");
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const bucketName = "videos";
    
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.find((b: any) => b.name === bucketName)) {
      await supabase.storage.createBucket(bucketName, { public: true });
    }

    const videoBuffer = await fs.readFile(outPath);
    const fileName = `${projectId}/${path.basename(outPath)}`;
    const { data, error } = await supabase.storage.from(bucketName).upload(fileName, videoBuffer, {
      contentType: "video/mp4",
      upsert: true
    });

    if (error) {
      throw new Error(`Failed to upload to Supabase: ${error.message}`);
    }

    const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);
    const publicUrl = publicUrlData.publicUrl;
    console.log(`[STORAGE] Uploaded to: ${publicUrl}`);
    
    // VERIFY THE UPLOAD AS REQUESTED
    console.log(`[STORAGE] Verifying public URL...`);
    const checkRes = await fetch(publicUrl, { method: "HEAD" });
    if (!checkRes.ok || checkRes.headers.get("content-type") !== "video/mp4") {
      throw new Error(`Public URL verification failed. Status: ${checkRes.status}, Content-Type: ${checkRes.headers.get("content-type")}`);
    }
    console.log(`[STORAGE] Verification successful.`);

    await createRenderJob({ projectId, step: "composition", status: "completed", completedAt: new Date() });
    
    console.log(`[DATABASE] Saving outputVideoUrl...`);
    await updateProjectStatus(projectId, "completed", { progress: 100, completedAt: new Date(), outputVideoUrl: publicUrl });
    
    console.log(`[COMPLETE] Video generation completed: ${projectId}`);
    return publicUrl;
  } catch (err: any) {
    console.error(`[GENVID ERROR] Compositor failed:`, err.message);
    await updateProjectStatus(projectId, "failed", { errorMessage: err.message });
    throw err;
  }
}
