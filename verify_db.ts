import { db } from "./packages/db/dist/index.js";
import { projects } from "./packages/db/dist/schema.js";

async function verify() {
  const allProjects = await db.select().from(projects);
  console.log("Projects in DB:");
  allProjects.forEach(p => {
    console.log(`- [${p.id}] ${p.name}`);
    console.log(`  Output Video URL: ${p.outputVideoUrl}`);
    console.log(`  Status: ${p.status}`);
  });
  process.exit(0);
}
verify().catch(console.error);
