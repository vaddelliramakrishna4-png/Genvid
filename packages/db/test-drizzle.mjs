import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

import { getDb } from "./client.js";
import { projects } from "./schema.js";
import { eq } from "drizzle-orm";

async function test() {
  const db = getDb();
  console.log("DB initialized");
  try {
    const res = await db.select().from(projects).where(eq(projects.userId, "a1e3edca-4c39-4a85-b22d-25802365d9fe")).limit(20);
    console.log("SUCCESS:", res.length, "projects");
  } catch (err) {
    console.error("ERROR:");
    console.error(err);
  }
}

test();
