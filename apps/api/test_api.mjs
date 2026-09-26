import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://chpkxbzkzuxqsnhyvhzb.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNocGt4YnprenV4cXNuaHl2aHpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDA2Njk1NiwiZXhwIjoyMTA1NjQyOTU2fQ.51h8YSx2QX9riuX6UBsmlSjnXezzzTE8V590aLYm96Y";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function createTestUser() {
  const email = "test_user_genvid@example.com";
  const password = "password123";

  console.log("Creating/checking user...");
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  let user = existingUsers.users.find(u => u.email === email);
  
  if (!user) {
    const { data: newUser, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (error) {
      console.error("Error creating user:", error);
      process.exit(1);
    }
    user = newUser.user;
    console.log("Created new user:", user.id);
  } else {
    // Reset password just in case
    await supabase.auth.admin.updateUserById(user.id, { password });
    console.log("Updated existing user:", user.id);
  }

  // Get token
  console.log("Getting token via HTTP...");
  const tokenRes = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: {
      "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNocGt4YnprenV4cXNuaHl2aHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNjY5NTYsImV4cCI6MjEwNTY0Mjk1Nn0.LgPSvT5ZtiKvU103LgFtnJzFBpwp0f_CSt_0ymKKyos",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  
  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    console.error("Error getting token:", tokenData);
    process.exit(1);
  }
  
  console.log("Got token!");
  return tokenData.access_token;
}

const API_BASE = "http://localhost:3001/api/v1";
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  try {
    const token = await createTestUser();

    console.log("=== CREATING PROJECT ===");
    const createRes = await fetch(`${API_BASE}/projects`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputText: "Monsoon Cafe is launching a new cold coffee.",
        durationSec: 60,
        voiceKey: "en-US-energetic",
        styleKey: "cinematic"
      })
    });
    
    const createData = await createRes.json();
    console.log("Create Response:", createData);
    if (!createData.success) throw new Error("Failed to create project");
    const projectId = createData.project.id;
    
    console.log("=== WAITING FOR SCRIPT GENERATION ===");
    let isStoryboard = false;
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      const projRes = await fetch(`${API_BASE}/projects/${projectId}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const projData = await projRes.json();
      console.log(`Status: ${projData.project.status}, Progress: ${projData.project.progress}%`); console.log(JSON.stringify(projData.project.scenes, null, 2));
      if (projData.project.status === "storyboard") {
        isStoryboard = true;
        break;
      }
      if (projData.project.status === "failed") {
        console.error("Failed!", projData.project.errorMessage);
        process.exit(1);
      }
    }
    
    if (!isStoryboard) throw new Error("Timed out waiting for storyboard");
    
    console.log("=== APPROVING SCENES ===");
    const approveRes = await fetch(`${API_BASE}/projects/${projectId}/approve`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` }
    });
    console.log("Approve Response:", await approveRes.json());
    
    console.log("=== WAITING FOR RENDERING ===");
    let isCompleted = false;
    for (let i = 0; i < 60; i++) {
      await sleep(5000);
      const projRes = await fetch(`${API_BASE}/projects/${projectId}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const projData = await projRes.json();
      console.log(`Status: ${projData.project.status}, Progress: ${projData.project.progress}%`); console.log(JSON.stringify(projData.project.scenes, null, 2));
      if (projData.project.status === "completed") {
        isCompleted = true;
        console.log("Final Video URL:", projData.project.outputVideoUrl);
        break;
      }
      if (projData.project.status === "failed") {
        console.error("Failed!", projData.project.errorMessage);
        process.exit(1);
      }
    }
    
    if (!isCompleted) throw new Error("Timed out waiting for rendering");
    console.log("=== TEST PASSED ===");
    
  } catch (err) {
    console.error("Test failed:", err);
  }
}

run();
