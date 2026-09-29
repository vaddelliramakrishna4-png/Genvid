import { getDb, projects, renderJobs, scenes } from "@genvid/db";
import { eq } from "drizzle-orm";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

async function checkProject() {
  const db = getDb();
  const projectId = "3ad6a3dd-d83c-47e6-b68a-9bfea6736c0c";

  try {
    const project = await db.select().from(projects).where(eq(projects.id, projectId));
    console.log("Project Data:", JSON.stringify(project, null, 2));

    const jobs = await db.select().from(renderJobs).where(eq(renderJobs.projectId, projectId));
    console.log("\nRender Jobs:", JSON.stringify(jobs, null, 2));
    
    const scns = await db.select().from(scenes).where(eq(scenes.projectId, projectId));
    console.log("\nScenes Count:", scns.length);
    
  } catch (e) {
    console.error("Failed to query DB:", e);
  }
  process.exit(0);
}

checkProject();
