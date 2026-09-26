import pg from 'pg';
const { Client } = pg;
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  // Reset project 1
  await client.query("UPDATE projects SET status = 'generating_voice' WHERE id = '0c9164d3-1473-442b-9978-7a45d22c1864'");
  // Or reset the newly created one!
  const res = await client.query("SELECT id FROM projects WHERE status = 'queued' LIMIT 1");
  if (res.rows.length > 0) {
    console.log("Found queued project:", res.rows[0].id);
  }
  console.log("Reset complete.");
  await client.end();
}
main().catch(console.error);
