import * as dotenv from "dotenv";
import path from "path";
import { getDb, createProject, insertScenes } from "@genvid/db";
import { generateStoryboardForProject, renderVideoForProject } from "@genvid/pipeline";

dotenv.config({ path: path.join(__dirname, "../web/.env.local") });

async function run() {
  try {
    const db = getDb();
    
    // Find the test user
    const user = await db.query.profiles.findFirst();
    if (!user) throw new Error("No user found in DB");
    console.log("Using user:", user.email);

    console.log("1. Creating Project via DB...");
    const project = await createProject({
      userId: user.id,
      inputText: "Monsoon Cafe is launching a new cold coffee",
      durationSec: 60,
      aspectRatio: "9:16",
      styleKey: "cinematic",
      seed: 42,
      voiceKey: "en-IN-calm-male",
      captionPreset: "bold-pop",
      status: "queued"
    });
    
    console.log("Project created:", project.id);
    console.log("2. Generating Storyboard...");
    await generateStoryboardForProject(project.id);
    
    console.log("3. Rendering Video...");
    const finalUrl = await renderVideoForProject(project.id);
    
    console.log("===================================");
    console.log("SUCCESS!");
    console.log("Final Video URL:", finalUrl);
    console.log("===================================");
  } catch (err: any) {
    console.error("Pipeline failed:", err);
  }
}

run();
