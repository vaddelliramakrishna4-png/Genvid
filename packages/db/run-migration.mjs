import postgres from "postgres";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("No DATABASE_URL");

const sql = postgres(url, { prepare: false, ssl: "require" });

async function run() {
  const file = fs.readFileSync("drizzle/0000_safe_proudstar.sql", "utf-8");
  const statements = file.split("--> statement-breakpoint");
  
  for (let stmt of statements) {
    stmt = stmt.trim();
    if (!stmt) continue;
    try {
      console.log("Executing:", stmt.slice(0, 50) + "...");
      await sql.unsafe(stmt);
      console.log("Success.");
    } catch (e) {
      if (e.message.includes("already exists") || e.message.includes("could not create unique index")) {
        console.log("Skipped (already exists or conflict).");
      } else {
        console.error("Error executing statement:", e.message);
      }
    }
  }
  await sql.end();
}

run();
