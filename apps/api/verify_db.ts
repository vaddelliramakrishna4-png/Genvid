import { getDb, projects } from "@genvid/db";
import * as dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../web/.env.local") });
async function verify() {
  const db = getDb();
  const allProjects = await db.select().from(projects);
  console.log("Projects in DB:");
  allProjects.forEach(p => {
    console.log(`- [${p.id}] ${p.title ?? "(untitled)"} (User: ${p.userId})`);
    console.log(`  Output Video URL: ${p.outputVideoUrl}`);
    console.log(`  Status: ${p.status}`);
  });
  process.exit(0);
}
verify().catch(console.error);
