import { getDb } from "./client.js";
import { projects } from "./schema.js";
import { eq, desc } from "drizzle-orm";
import dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

async function run() {
  console.log("Testing Drizzle getProjectsByUser...");
  try {
    const db = getDb();
    const userId = "5b3b2f25-c210-4116-9300-cec8b43f27f3";
    const result = await db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.createdAt)).limit(20);
    console.log("Success! Found:", result.length);
  } catch (err) {
    console.error("Drizzle query failed!");
    console.error("Error name:", err.name);
    console.error("Error message:", err.message);
    if (err.stack) console.error("Stack:", err.stack);
  }
  process.exit(0);
}
run();
