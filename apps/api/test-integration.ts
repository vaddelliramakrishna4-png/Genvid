import "dotenv/config";
import { createProject, getProject, getProjectsByUser, updateProjectStatus } from "@genvid/db";

async function runEndToEnd() {
  console.log("🚀 Starting E2E Integration Test...");

  // 1. Create Project
  const userId = "c12489de-d933-4f9e-a0e2-63ab70e7e172"; // Fake or real user ID for test
  console.log("-> Creating Project...");
  const project = await createProject({
    userId,
    inputText: "A short 30-second documentary about space exploration and the future of Mars.",
    title: "Mars Future E2E Test",
    mode: "idea",
    durationSec: 30,
    aspectRatio: "9:16",
    styleKey: "cinematic",
    voiceKey: "en-IN-calm-male",
    captionPreset: "bold-pop",
    language: "en-IN",
    status: "queued",
    queuedAt: new Date(),
    seed: 12345
  });

  console.log(`✅ Project Created: ${project.id}`);

  // 2. Trigger generate-script manually to simulate the background job triggered by the API
  console.log("-> Triggering generate-script...");
  const res1 = await fetch(`http://127.0.0.1:3001/api/v1/render/generate-script/${project.id}`, { method: "POST" });
  console.log("generate-script status:", res1.status);
  
  if (!res1.ok) {
      console.error(await res1.text());
      return;
  }

  // Poll for storyboard status
  let proj = await getProject(project.id);
  while (proj?.status !== "storyboard" && proj?.status !== "failed") {
      console.log(`Polling status: ${proj?.status}...`);
      await new Promise(r => setTimeout(r, 2000));
      proj = await getProject(project.id);
  }

  if (proj?.status === "failed") {
      console.error("❌ Pipeline failed during generate-script:", proj.errorMessage);
      return;
  }
  
  console.log("✅ Script & Media generated. Storyboard ready.");

  // 3. Approve Storyboard & Trigger render-media
  console.log("-> Approving Storyboard...");
  const scenesRes = await fetch(`http://127.0.0.1:3001/api/v1/projects/${project.id}`);
  // (We'll just trigger render-media directly for testing purposes instead of simulating the frontend /approve route which deletes scenes)
  
  console.log("-> Triggering render-media...");
  const res2 = await fetch(`http://127.0.0.1:3001/api/v1/render/render-media/${project.id}`, { method: "POST" });
  console.log("render-media status:", res2.status);
  
  if (!res2.ok) {
      console.error(await res2.text());
      return;
  }

  // 4. Poll until completion
  proj = await getProject(project.id);
  while (proj?.status !== "completed" && proj?.status !== "failed") {
      console.log(`Polling render status: ${proj?.status} (${proj?.progress}%)`);
      await new Promise(r => setTimeout(r, 5000));
      proj = await getProject(project.id);
  }

  if (proj?.status === "failed") {
      console.error("❌ Pipeline failed during render-media:", proj.errorMessage);
      return;
  }

  console.log(`✅ Video completely generated and uploaded: ${proj?.outputVideoUrl}`);
}

runEndToEnd().catch(console.error);
