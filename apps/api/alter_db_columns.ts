import { getDb } from "@genvid/db";
import * as dotenv from "dotenv";
import path from "path";
import { sql } from "drizzle-orm";

dotenv.config({ path: path.join(__dirname, "../web/.env.local") });

async function run() {
  const db = getDb();
  console.log("Altering projects table...");
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN scheduled_at timestamp with time zone;`);
    console.log("Successfully added scheduled_at");
  } catch (e: any) {
    console.error("Error adding scheduled_at:", e.message || e);
  }
  
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN schedule_status text NOT NULL DEFAULT 'draft';`);
    console.log("Successfully added schedule_status");
  } catch (e: any) {
    console.error("Error adding schedule_status:", e.message || e);
  }
  process.exit(0);
}

run();
