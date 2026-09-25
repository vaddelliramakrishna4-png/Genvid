import { createProject } from "@genvid/db";
import { executePipelineForProject } from "@genvid/pipeline";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config({ path: path.join(__dirname, "../../../apps/web/.env.local") });

async function run() {
  console.log("Setting up DB project...");
  const project = await createProject({
    userId: "00000000-0000-0000-0000-000000000000", // bypass auth by writing directly to db
    inputText: "Monsoon Cafe is launching a new cold coffee.",
    title: "Monsoon Cafe Cold Coffee",
    mode: "idea",
    durationSec: 15, // short for test
    aspectRatio: "9:16",
    styleKey: "cinematic",
    voiceKey: "en-US-calm-female",
    captionPreset: "bold-pop",
    language: "en-US",
    status: "queued",
    queuedAt: new Date(),
  });

  console.log("Project created:", project.id);
  
  try {
    const url = await executePipelineForProject(project.id);
    console.log("SUCCESS! Video available at:", url);
  } catch (err: any) {
    console.error("FAIL:", err.message);
    console.error(err);
  }
}

run().catch(console.error);
