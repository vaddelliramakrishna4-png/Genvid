import { executePipelineForProject } from "@genvid/pipeline";
import { createProject } from "@genvid/db";
import path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../web/.env.local") });

async function main() {
  const idea = process.argv.slice(2).join(" ") || "A cat slowly turns to find a cucumber behind it...";
  console.log(`Starting M0 render for: "${idea}"`);
  const DUMMY_USER_ID = "5b3b2f25-c210-4116-9300-cec8b43f27f3";
  try {
    const project = await createProject({
      userId: DUMMY_USER_ID,
      title: idea.slice(0, 80),
      mode: "idea",
      inputText: idea,
      durationSec: 30,
      aspectRatio: "9:16",
      styleKey: "cinematic",
      seed: 42,
      voiceKey: "en-IN-calm-male",
      captionPreset: "bold-pop",
      language: "en-IN",
      status: "queued",
      queuedAt: new Date(),
    });

    const outPath = await executePipelineForProject(project.id);
    console.log(`Render completed! MP4 output at: ${outPath}`);
  } catch (err) {
    console.error("Pipeline failed:", err);
  }
}

main();
