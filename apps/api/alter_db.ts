import { getDb } from "@genvid/db";
import * as dotenv from "dotenv";
import path from "path";
import { sql } from "drizzle-orm";

dotenv.config({ path: path.join(__dirname, "../web/.env.local") });

async function run() {
  const db = getDb();
  console.log("Altering project_status enum...");
  try {
    await db.execute(sql`ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'storyboard'`);
    await db.execute(sql`ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'mixing'`);
    await db.execute(sql`ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'uploading'`);
    console.log("Successfully altered enum.");
  } catch (e: any) {
    console.error("Error altering enum:", e.message);
  }
  process.exit(0);
}

run();
