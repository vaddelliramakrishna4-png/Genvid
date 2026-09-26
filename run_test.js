import { getDb, createProject } from '@genvid/db';
import { projects } from '@genvid/db/schema';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const db = getDb();
  
  console.log("Creating project...");
  // Simulate user UUID
  const userId = "5b3b2f25-c210-4116-9300-cec8b43f27f3"; 
  
  const project = await createProject({
    userId,
    title: "End-to-End Test Video",
    inputText: "Monsoon Cafe is launching a new cold coffee.",
    mode: "auto",
    durationSec: 15,
    aspectRatio: "9:16",
    status: "queued"
  });
  
  console.log("Project created with ID:", project.id);
  console.log("Worker should pick this up and generate storyboard!");
}
main();
