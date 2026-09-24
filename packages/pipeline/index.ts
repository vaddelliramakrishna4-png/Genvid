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

/**
 * Runs the M0 Pipeline synchronously and persists to the database.
 * Requires a dummy user ID if no real auth is available in the CLI context.
 */
export async function executePipelineForProject(projectId: string): Promise<string> {
  const outputDir = path.join(process.cwd(), ".run", projectId);
  await fs.mkdir(outputDir, { recursive: true });

  const project = await getProject(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const provider = new GeminiProvider();

  console.log(`1. Generating Content (Scenes) for ${projectId}...`);
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

  console.log("2. Routing Media (Video Retrieval from Pexels)...");
  await updateProjectProgress(projectId, 40);

  const { PexelsProvider } = await import("@genvid/providers");
  const pexelsProvider = new PexelsProvider();

  for (const scene of insertedScenes) {
    try {
      console.log(`Searching Pexels for scene ${scene.sceneIndex}...`);
      
      const query = scene.visualPrompt.replace(/[^a-zA-Z0-9 ]/g, "").split(" ").slice(0, 5).join(" ");
      let mediaUrl = await pexelsProvider.searchVideo(query, project.aspectRatio === "9:16" ? "portrait" : "landscape");
      
      if (!mediaUrl) {
        throw new Error(`[PEXELS] No media found for query: ${query}`);
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

  console.log("3. Voice generation...");
  await updateProjectStatus(projectId, "generating_voice", { progress: 70 });
  
  const audioOutPath = path.join(outputDir, "narration.wav");
  const fullNarration = insertedScenes.map(s => s.narration).join(" ");
  
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    
    // Create a text file with the full narration
    const scriptPath = path.join(outputDir, "script.txt");
    await fs.writeFile(scriptPath, fullNarration);
    
    // Use the dedicated venv Python executable
    const pythonExe = "C:\\\\genvid\\\\.venv\\\\Scripts\\\\python.exe";

    // Run TTS
    const ttsScript = path.join(__dirname, "../../render-workers/tts.py");
    await execAsync(`"${pythonExe}" "${ttsScript}" "${fullNarration}" "${audioOutPath}"`);
    console.log("Voice generated at:", audioOutPath);
    await createRenderJob({ projectId, step: "tts", status: "completed", completedAt: new Date() });

    console.log("4. Alignment...");
    await updateProjectStatus(projectId, "aligning", { progress: 80 });
    
    // Run Alignment
    const subtitlesPath = path.join(outputDir, "subtitles.ass");
    const alignScript = path.join(__dirname, "../../render-workers/align.py");
    await execAsync(`"${pythonExe}" "${alignScript}" "${audioOutPath}" "${scriptPath}" "${subtitlesPath}"`);
    console.log("Subtitles generated at:", subtitlesPath);
    await createRenderJob({ projectId, step: "alignment", status: "completed", completedAt: new Date() });
  } catch (err: any) {
    console.error("Voice/Alignment failed:", err.message);
    throw err;
  }

  console.log("5. Compositor (FFmpeg)...");
  await updateProjectStatus(projectId, "compositing", { progress: 90 });
  
  const outPath = path.join(outputDir, "output.mp4");
  
  // Actually run FFmpeg via compositor
  const { composeVideo } = await import("@genvid/render-workers");
  
  // Extract media URLs that were just fetched
  const scenesToRender = insertedScenes.map(s => {
    // Look up the URL (we saved it as imageUrl in DB)
    return {
      mediaUrl: s.imageUrl || "", // The real implementation would load from DB, but we know it's in the DB because we just saved it. Wait, in pipeline/index.ts we saved it to `storagePath`.
      duration: s.targetDuration || 5
    };
  });

  const { getScenesByProject } = await import("@genvid/db");
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

    console.log(`[GENVID] Uploading video to Supabase Storage...`);
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase credentials for upload");
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const bucketName = "videos";
    
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.find(b => b.name === bucketName)) {
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
    console.log(`[GENVID] Uploaded to: ${publicUrl}`);

    await createRenderJob({ projectId, step: "composition", status: "completed", completedAt: new Date() });
    await updateProjectStatus(projectId, "completed", { progress: 100, completedAt: new Date(), outputVideoUrl: publicUrl });
    console.log(`[GENVID] Generation completed`);
    return publicUrl;
  } catch (err: any) {
    console.error(`[GENVID ERROR] Compositor failed:`, err.message);
    await updateProjectStatus(projectId, "failed", { errorMessage: err.message });
    throw err;
  }
}
