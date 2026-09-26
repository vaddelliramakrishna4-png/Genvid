import { createClient } from "@supabase/supabase-js";
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function run() {
  console.log("Starting E2E test...");

  // 1. Get a user via admin
  const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
  if (usersError || usersData.users.length === 0) {
    console.error("No users found:", usersError);
    return;
  }
  const user = usersData.users[0];
  console.log("Using user:", user.email);

  // Reset password to login with anon key and confirm email
  const password = "password12345";
  await supabaseAdmin.auth.admin.updateUserById(user.id, { password, email_confirm: true });

  const res = await supabase.auth.signInWithPassword({ email: user.email, password });
  if (res.error) {
    console.error("Login failed:", res.error);
    return;
  }
  
  console.log("Logged in:", res.data.user.id);
  const token = res.data.session.access_token;
  
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
