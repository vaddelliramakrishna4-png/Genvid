import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(process.cwd(), "../../.env") });

import { getDb, updateProjectStatus } from "@genvid/db";
import { projects } from "@genvid/db/schema";
import { eq, or } from "drizzle-orm";
import { generateStoryboardForProject, renderVideoForProject } from "@genvid/pipeline";

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processQueue() {
  const db = getDb();
  console.log("[WORKER] Started polling for jobs...");
  
  while (true) {
    try {
      const pendingProjects = await db
        .select()
        .from(projects)
        .where(
          or(
            eq(projects.status, "queued"),
            eq(projects.status, "generating_voice")
          )
        )
        .limit(1);

      if (pendingProjects.length > 0) {
        const project = pendingProjects[0];
        console.log(`[WORKER] Found project ${project.id} with status ${project.status}`);

        try {
          if (project.status === "queued") {
            // Need to generate storyboard
            console.log(`[WORKER] Generating storyboard for ${project.id}...`);
            await generateStoryboardForProject(project.id);
          } else if (project.status === "generating_voice") {
            // Need to render video
            console.log(`[WORKER] Rendering video for ${project.id}...`);
            await renderVideoForProject(project.id);
          }
        } catch (err: any) {
          console.error(`[WORKER ERROR] Project ${project.id} failed:`, err);
          await updateProjectStatus(project.id, "failed", { errorMessage: err.message || String(err) });
        }
      }
    } catch (dbErr) {
      console.error("[WORKER] DB polling error:", dbErr);
    }
    
    // Poll every 3 seconds
    await sleep(3000);
  }
}

processQueue().catch(console.error);
