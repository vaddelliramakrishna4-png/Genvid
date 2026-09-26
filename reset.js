import { getDb, updateProjectStatus } from '@genvid/db';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const db = getDb();
  
  console.log("Resetting project...");
  // Reset the failed project from the logs to generating_voice
  await updateProjectStatus("0c9164d3-1473-442b-9978-7a45d22c1864", "generating_voice", { progress: 45 });
  console.log("Reset complete.");
}
main();
