import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

import dotenv from "dotenv";
dotenv.config({ path: path.join(__dirname, "../web/.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase config");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
// const API_BASE = "https://genvid-api.vercel.app";
const API_BASE = "http://localhost:3001";

async function runTest() {
  console.log("1. Setting up test user...");
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = "testPassword123!";
  
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true
  });
  
  if (authError) {
    console.error("Failed to create test user:", authError);
    return;
  }
  
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  
  if (signInError || !signInData.session) {
    console.error("Failed to sign in:", signInError);
    return;
  }
  
  const token = signInData.session.access_token;
  console.log("Authenticated successfully. Token acquired.");
  
  console.log("2. POST /api/v1/projects (Creating Project)");
  const createRes = await fetch(`${API_BASE}/api/v1/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      inputText: "Monsoon Cafe is launching a new cold coffee.",
      durationSec: 60,
      aspectRatio: "9:16",
      styleKey: "cinematic",
      voiceKey: "en-IN-calm-male",
      captionPreset: "bold-pop"
    })
  });
  
  const createData = await createRes.json();
  console.log("Create Response Status:", createRes.status);
  console.log("Create Response Body:", createData);
  
  if (!createData.project || !createData.project.id) {
    console.error("Failed to create project");
    return;
  }
  
  const projectId = createData.project.id;
  
  console.log("3. Polling for Storyboard completion...");
  let isReady = false;
  let scenes = [];
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const pollRes = await fetch(`${API_BASE}/api/v1/projects/${projectId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const pollData = await pollRes.json();
    console.log(`Poll ${i+1}: status=${pollData.project.status}`);
    
    if (pollData.project.status === "storyboard" || pollData.project.status === "review_ready") {
      isReady = true;
      console.log("Storyboard is ready!");
      
      // Fetch scenes directly from DB to simulate UI
      const { data: scenesData } = await supabase.from("scenes").select("*").eq("project_id", projectId);
      scenes = scenesData;
      console.log("Scenes found:", scenes?.length);
      break;
    }
  }
  
  if (!isReady) {
    console.error("Storyboard generation timed out or failed on Vercel API!");
    return;
  }
  
  console.log("4. POST /api/v1/projects/:id/approve (Starting Render)");
  const approveRes = await fetch(`${API_BASE}/api/v1/projects/${projectId}/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ scenes })
  });
  
  console.log("Approve Response Status:", approveRes.status);
  
  console.log("5. Polling for Video completion...");
  let videoReady = false;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const pollRes = await fetch(`${API_BASE}/api/v1/projects/${projectId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const pollData = await pollRes.json();
    console.log(`Poll ${i+1}: status=${pollData.project.status}, progress=${pollData.project.progress}`);
    
    if (pollData.project.status === "completed") {
      videoReady = true;
      console.log("Video rendering completed!");
      console.log("Final Video URL:", pollData.project.outputVideoUrl);
      break;
    } else if (pollData.project.status === "failed") {
      console.error("Video rendering FAILED on Vercel!");
      break;
    }
  }
  
  if (!videoReady) {
    console.error("Video rendering timed out or failed!");
  }
}

runTest().catch(console.error);
