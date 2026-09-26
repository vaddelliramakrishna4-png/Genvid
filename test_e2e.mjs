import fetch from "node-fetch";

const API_BASE = "https://genvid.onrender.com/api/v1";
// Alternatively, test against localhost if running locally

async function getSupabaseToken() {
  const url = process.env.SUPABASE_URL + "/auth/v1/token?grant_type=password";
  const body = JSON.stringify({
    email: process.env.TEST_EMAIL,
    password: process.env.TEST_PASSWORD
  });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": process.env.SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    },
    body
  });
  const data = await res.json();
  return data.access_token;
}

async function run() {
  console.log("=== STARTING E2E RUN ===");
  // I need to use the token to hit API_BASE/projects
}

run();
