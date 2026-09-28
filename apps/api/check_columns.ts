import { getDb } from "@genvid/db";
import * as dotenv from "dotenv";
import path from "path";
import { sql } from "drizzle-orm";

dotenv.config({ path: path.join(__dirname, "../web/.env.local") });

async function run() {
  const db = getDb();
  try {
    const res = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'projects';`);
    console.log("Columns:", res);
  } catch (e: any) {
    console.error("Error:", e);
  }
  process.exit(0);
}

run();
