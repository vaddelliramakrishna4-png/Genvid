import { GeminiProvider, PexelsProvider } from "@genvid/providers";
import { buildSystemPrompt } from "@genvid/prompts";
import { composeVideo } from "../../render-workers/compositor";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../../.env") });

async function testPipeline() {
  console.log("[GENVID] Starting generation test...");
  
  const projectId = "prj_test_" + Date.now();
  const outputDir = path.join(__dirname, "../../../.run", projectId);
  await fs.mkdir(outputDir, { recursive: true });

  const input = "Monsoon Cafe is launching a new cold coffee";
  const spec = {
    durationSec: 30,
    aspectRatio: "9:16",
    styleKey: "cinematic",
    seed: 42,
    voiceKey: "en-IN-calm-male",
    captionPreset: "bold-pop",
    musicKey: "",
    language: "en-IN",
  };

  try {
    console.log("[GENVID] 1. Gemini request started");
    const provider = new GeminiProvider();
    const systemPrompt = buildSystemPrompt({
      projectId,
      mode: "idea",
      input,
      businessProfileId: null,
      characterId: null,
      spec: spec as any,
    });

    let sceneJson: any;
    try {
      sceneJson = await provider.generateScript(
        {
          projectId,
          mode: "idea",
          input,
          businessProfileId: null,
          characterId: null,
          spec: spec as any,
        },
        systemPrompt
      );
    } catch (geminiErr: any) {
      console.log("[GENVID] Gemini failed, using mock JSON to test the rest of the pipeline.", geminiErr.message);
      sceneJson = {
        title: "Monsoon Cafe Cold Coffee",
        scenes: [
          {
            id: 1,
            narration: "Beat the heat with our new cold coffee.",
            visual_prompt: "Close up of iced coffee glass with condensation",
            target_duration: 3
          },
          {
            id: 2,
            narration: "Available now at Monsoon Cafe.",
            visual_prompt: "Cozy cafe exterior with people drinking coffee",
            target_duration: 3
          }
        ]
      };
    }
    console.log("[GENVID] Gemini response received");
    console.log("[GENVID] Scenes created:", sceneJson.scenes.length);

    console.log("[GENVID] 2. Pexels search started");
    const pexelsProvider = new PexelsProvider();
    const scenesToRender: any[] = [];

    for (let i = 0; i < sceneJson.scenes.length; i++) {
      const scene = sceneJson.scenes[i];
      const query = scene.visual_prompt.replace(/[^a-zA-Z0-9 ]/g, "").split(" ").slice(0, 4).join(" ");
      console.log(`[GENVID] Pexels searching for: "${query}"`);
      
      let mediaUrl = await pexelsProvider.searchVideo(query, "portrait");
      if (!mediaUrl) {
        console.log(`[GENVID] No video found for scene ${i}, using fallback`);
        mediaUrl = "https://images.pexels.com/photos/196652/pexels-photo-196652.jpeg";
      }
      
      scenesToRender.push({
        mediaUrl,
        duration: scene.target_duration
      });
    }
    console.log("[GENVID] Pexels asset selection complete");

    console.log("[GENVID] 3. Voice generation started");
    console.log("[GENVID ERROR] Voice provider is completely mocked/missing in codebase.");
    
    console.log("[GENVID] 4. FFmpeg started");
    const outPath = path.join(outputDir, "final.mp4");
    
    await composeVideo({ projectId, scenes: scenesToRender }, outPath);
    console.log("[GENVID] MP4 created:", outPath);
    console.log("[GENVID] Generation completed");

  } catch (err: any) {
    console.error("[GENVID ERROR]", err.message);
  }
}

testPipeline();
