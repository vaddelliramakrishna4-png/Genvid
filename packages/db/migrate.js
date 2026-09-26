import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });
const { Client } = pg;

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;");
  await client.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS schedule_status TEXT NOT NULL DEFAULT 'draft';");
  console.log("Success");
  await client.end();
}
run();
