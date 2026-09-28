import postgres from "postgres";

async function run() {
  const directUrl = "postgresql://postgres:Ramakrishna@2005.@aws-0-ap-south-1.pooler.supabase.com:5432/postgres";
  // actually, let's try just the direct db. URL:
  const url2 = "postgresql://postgres:Ramakrishna@2005.@db.chpkxbzkzuxqsnhyvhzb.supabase.co:5432/postgres";
  
  const sql = postgres(url2);
  
  try {
    const res = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'projects';`;
    console.log("Columns:", res.map(r => r.column_name));
    
    // Add columns directly since we are here
    console.log("Adding columns directly...");
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone;`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS schedule_status text NOT NULL DEFAULT 'draft';`;
    console.log("Columns added successfully!");
    
  } catch (e: any) {
    console.error("Error:", e);
  } finally {
    await sql.end();
  }
}

run();
