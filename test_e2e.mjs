import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  console.log("Starting E2E test...");

  // 1. Log in
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: "test@example.com",
    password: "password123"
  });

  if (authError) {
    console.error("Login failed:", authError);
    return;
  }
  console.log("Logged in:", authData.user.id);
  
  const token = authData.session.access_token;
  
  // 2. Dashboard - verify it works
  console.log("Fetching dashboard...");
  const dashRes = await fetch("http://localhost:3000/api/v1/projects", {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (!dashRes.ok) {
    console.error("Dashboard fetch failed:", await dashRes.text());
    return;
  }
  const dashData = await dashRes.json();
  console.log(`Dashboard returned ${dashData.projects.length} projects.`);

  // 3. Create a project
  console.log("Creating project: Monsoon Cafe is launching a new cold coffee (60s)");
  const createRes = await fetch("http://localhost:3000/api/v1/projects", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      inputText: "Monsoon Cafe is launching a new cold coffee",
      durationSec: 60,
      aspectRatio: "9:16",
      styleKey: "realistic",
      voiceKey: "kokoro-af-bella"
    })
  });
  
  if (!createRes.ok) {
    console.error("Create project failed:", await createRes.text());
    return;
  }
  
  const createData = await createRes.json();
  const projectId = createData.project.id;
  console.log("Project created:", projectId);
  
  // 4. Wait for storyboard
  console.log("Waiting for storyboard state...");
  let project = createData.project;
  while (project.status === "queued" || project.status === "generating_script" || project.status === "generating_media") {
    await new Promise(r => setTimeout(r, 2000));
    const projRes = await fetch(`http://localhost:3000/api/v1/projects/${projectId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const projData = await projRes.json();
    project = projData.project;
    console.log(`Status: ${project.status}...`);
  }
  
  if (project.status !== "storyboard") {
    console.error("Expected storyboard, got:", project.status);
    return;
  }
  console.log("Storyboard is ready with", project.scenes?.length, "scenes.");
  
  // 5. Approve storyboard -> trigger render
  console.log("Approving storyboard...");
  const renderRes = await fetch(`http://localhost:3000/api/v1/projects/${projectId}/render`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` }
  });
  
  if (!renderRes.ok) {
    console.error("Approve failed:", await renderRes.text());
    return;
  }
  console.log("Storyboard approved, rendering started.");
  
  // 6. Wait for final video
  console.log("Waiting for final video (this will take a while)...");
  while (project.status !== "completed" && project.status !== "failed") {
    await new Promise(r => setTimeout(r, 5000));
    const projRes = await fetch(`http://localhost:3000/api/v1/projects/${projectId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const projData = await projRes.json();
    project = projData.project;
    console.log(`Status: ${project.status} (${project.progress}%)`);
  }
  
  if (project.status === "failed") {
    console.error("Generation failed:", project.errorMessage);
    return;
  }
  
  console.log("Video generated successfully!");
  console.log("Output URL:", project.outputVideoUrl);
  
  // Verify HTTP status of outputVideoUrl
  const videoRes = await fetch(project.outputVideoUrl, { method: 'HEAD' });
  if (videoRes.ok) {
    console.log("Output URL is reachable (HTTP " + videoRes.status + ")");
  } else {
    console.error("Output URL is NOT reachable (HTTP " + videoRes.status + ")");
  }
  
  console.log("E2E Test complete!");
}

run().catch(console.error);
