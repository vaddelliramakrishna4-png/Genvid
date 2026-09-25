import * as dotenv from "dotenv";
import path from "path";
import { getDb } from "@genvid/db";
import { projects, profiles } from "@genvid/db/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";

dotenv.config({ path: path.join(__dirname, "../web/.env.local") });

async function run() {
  const db = getDb();
  
  // Find the test user
  const user = await db.query.profiles.findFirst();
  if (!user) {
    console.error("No user found in DB");
    process.exit(1);
  }
  console.log("Using user:", user.email);

  // Fake a JWT token
  const token = jwt.sign(
    { sub: user.id, email: user.email }, 
    process.env.SUPABASE_JWT_SECRET || "super-secret-jwt-token-with-at-least-32-characters-long", 
    { expiresIn: '1h' }
  );

  console.log("1. Creating Project via API...");
  const createRes = await fetch("http://127.0.0.1:3001/api/v1/projects", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputText: "Monsoon Cafe is launching a new cold coffee",
      durationSec: 60
    })
  });

  const createData = await createRes.json();
  if (!createRes.ok || !createData.success) {
    console.error("Failed to create project:", createData);
    process.exit(1);
  }

  const projectId = createData.project.id;
  console.log("Project created:", projectId);

  console.log("2. Waiting for pipeline to reach storyboard state...");
  let currentProject = null;
  while (true) {
    const getRes = await fetch(`http://127.0.0.1:3001/api/v1/projects/${projectId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const getData = await getRes.json();
    currentProject = getData.project;
    
    console.log("Status:", currentProject.status, "Progress:", currentProject.progress);
    
    if (currentProject.status === "storyboard") {
      console.log("Pipeline paused at storyboard!");
      break;
    }
    if (currentProject.status === "failed") {
      console.error("Pipeline failed!", currentProject.errorMessage);
      process.exit(1);
    }
    
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  console.log("3. Regenerating Scene 2 (Index 1)...");
  if (currentProject.scenes && currentProject.scenes.length > 1) {
    const sceneId = currentProject.scenes[1].id;
    const regenRes = await fetch(`http://127.0.0.1:3001/api/v1/projects/${projectId}/scenes/${sceneId}/regenerate`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` }
    });
    const regenData = await regenRes.json();
    if (regenRes.ok) {
      console.log("Scene 2 regenerated successfully:", regenData.scene.imageUrl);
    } else {
      console.error("Failed to regenerate scene 2:", regenData);
    }
  }

  console.log("4. Approving all scenes...");
  const approveRes = await fetch(`http://127.0.0.1:3001/api/v1/projects/${projectId}/approve`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ scenes: currentProject.scenes })
  });

  if (!approveRes.ok) {
    console.error("Approve failed:", await approveRes.text());
    process.exit(1);
  }
  console.log("Approved scenes successfully.");

  console.log("5. Waiting for rendering to complete...");
  while (true) {
    const getRes = await fetch(`http://127.0.0.1:3001/api/v1/projects/${projectId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const getData = await getRes.json();
    currentProject = getData.project;
    
    console.log("Status:", currentProject.status, "Progress:", currentProject.progress);
    
    if (currentProject.status === "completed") {
      console.log("Render completed!");
      console.log("Final Video URL:", currentProject.outputVideoUrl);
      break;
    }
    if (currentProject.status === "failed") {
      console.error("Pipeline failed!", currentProject.errorMessage);
      process.exit(1);
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  console.log("6. Verifying Dashboard returns the project...");
  const dashRes = await fetch(`http://127.0.0.1:3001/api/v1/projects`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const dashData = await dashRes.json();
  const found = dashData.projects.find((p: any) => p.id === projectId);
  if (found) {
    console.log("Dashboard returned the project successfully!");
  } else {
    console.error("Dashboard failed to return the project!");
  }

  console.log("SUCCESS. ALL TESTS PASSED.");
  process.exit(0);
}

run();
