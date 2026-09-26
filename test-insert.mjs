import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './packages/db/schema.ts';

async function test() {
  const url = "postgresql://postgres.chpkxbzkzuxqsnhyvhzb:Ramakrishna%402005.@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
  const client = postgres(url, { prepare: false, ssl: "require" });
  const db = drizzle(client, { schema });

  try {
    console.log("Testing insert...");
    const [project] = await db.insert(schema.projects).values({
      userId: "a1e3edca-4c39-4a85-b22d-25802365d9fe",
      inputText: "test project",
      title: "Test",
      status: "queued"
    }).returning();
    console.log("INSERT SUCCESS:", project.id);
  } catch (e) {
    console.error("INSERT FAILED:");
    console.error(e.message);
    console.error("CAUSE:", e.cause);
  }

  process.exit(0);
}
test();
