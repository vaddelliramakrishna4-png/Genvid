import { execWithTimeout } from "./src/utils/exec";
import path from "path";
import fs from "fs/promises";
import { composeVideo } from "@genvid/render-workers";
import { PexelsProvider } from "@genvid/providers";
import dotenv from "dotenv";

dotenv.config({ path: "../web/.env.local" });

async function runLocalPipelineTest() {
  console.log("🚀 Starting Local Pipeline Mock Test...");

  const outputDir = path.join(process.cwd(), ".run", "mock-project");
  await fs.mkdir(outputDir, { recursive: true });

  const scenes = [
    { narration: "The red planet has always captivated human imagination.", targetDuration: 5 },
    { narration: "With new technology, our journey to Mars is finally becoming a reality.", targetDuration: 5 }
  ];

  console.log("-> 1. Fetching Mock Video Media (Pexels)...");
  const pexels = new PexelsProvider();
  let media1 = await pexels.searchVideo("mars planet space", "portrait");
  let media2 = await pexels.searchVideo("rocket launch space", "portrait");
  
  if (!media1) media1 = "https://images.pexels.com/photos/196652/pexels-photo-196652.jpeg";
  if (!media2) media2 = "https://images.pexels.com/photos/196652/pexels-photo-196652.jpeg";
  
  const scenesWithMedia = [
    { ...scenes[0], imageUrl: media1 },
    { ...scenes[1], imageUrl: media2 }
  ];

  console.log("-> 2. Testing TTS Worker (Kokoro)...");
  const ttsScript = path.resolve(process.cwd(), "../../packages/render-workers/tts.py");
  const alignScript = path.resolve(process.cwd(), "../../packages/render-workers/align.py");

  const audioFiles: string[] = [];
  for (let i = 0; i < scenesWithMedia.length; i++) {
    const scene = scenesWithMedia[i];
    const audioPath = path.join(outputDir, `audio_${i}.wav`);
    
    console.log(`Generating TTS for scene ${i+1}...`);
    try {
      await execWithTimeout(`python "${ttsScript}" "${scene.narration}" "${audioPath}"`, 60000);
      const stat = await fs.stat(audioPath);
      if (stat.size === 0) throw new Error("File empty");
      audioFiles.push(audioPath);
      console.log(`✅ TTS Scene ${i+1} Success! Size: ${stat.size} bytes`);
    } catch (e: any) {
      console.error(`❌ TTS failed: ${e.message}`);
      return;
    }
  }

  console.log("-> 3. Concatenating Audio...");
  const concatListPath = path.join(outputDir, "concat_audio.txt");
  const concatContent = audioFiles.map(f => `file '${f}'`).join("\n");
  await fs.writeFile(concatListPath, concatContent);
  const finalAudioPath = path.join(outputDir, "audio.wav");
  await execWithTimeout(`ffmpeg -f concat -safe 0 -i "${concatListPath}" -c copy "${finalAudioPath}" -y`, 30000);
  console.log(`✅ Audio merged.`);

  console.log("-> 4. Generating Captions (Faster-Whisper)...");
  const subtitlesOutPath = path.join(outputDir, "subtitles.ass");
  const scriptOutPath = path.join(outputDir, "script.txt");
  const fullNarration = scenesWithMedia.map(s => s.narration).join("\n");
  await fs.writeFile(scriptOutPath, fullNarration);
  
  try {
    await execWithTimeout(`python "${alignScript}" "${finalAudioPath}" "${scriptOutPath}" "${subtitlesOutPath}"`, 60000);
    console.log("✅ Captions generated successfully!");
  } catch (e: any) {
    console.error(`❌ Captions failed: ${e.message}`);
    return;
  }

  console.log("-> 5. Rendering Video (FFmpeg)...");
  const outPath = path.join(outputDir, "final.mp4");
  const manifest = {
    projectId: "mock-project",
    audioUrl: finalAudioPath,
    subtitlesUrl: subtitlesOutPath,
    scenes: scenesWithMedia.map(s => ({ mediaUrl: s.imageUrl, duration: s.targetDuration }))
  };

  try {
    const resultPath = await composeVideo(manifest, outPath);
    const stat = await fs.stat(resultPath);
    console.log(`✅ Video Rendered Successfully! Path: ${resultPath}, Size: ${stat.size} bytes`);
  } catch (e: any) {
    console.error(`❌ Video rendering failed: ${e.message}`);
    return;
  }

  console.log("🎉 ALL PIPELINE TESTS PASSED LOCAL VERIFICATION!");
}

runLocalPipelineTest().catch(console.error);
