import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

const url = process.env.DATABASE_URL;
const sql = postgres(url, { ssl: "require", prepare: false });

async function run() {
  const result = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'projects'`;
  console.log(result.map(r => r.column_name));
  await sql.end();
}

run().catch(console.error);
