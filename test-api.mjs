import dotenv from "dotenv";
dotenv.config();

async function run() {
  const token = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token) throw new Error("No service role key");

  console.log("Fetching /api/v1/projects...");
  const res = await fetch("https://genvid.onrender.com/api/v1/projects", {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });

  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Data:", data);
}
run();
