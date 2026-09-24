import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import * as schema from "./schema";

// ─── Drizzle (direct Postgres) ──────────────────────────────────────────────

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = postgres(databaseUrl, { prepare: false }); // pgbouncer needs prepare: false
  _db = drizzle(client, { schema });
  return _db;
}

export type Database = ReturnType<typeof getDb>;

// ─── Supabase Client (for Auth + Storage) ───────────────────────────────────

let _supabase: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  _supabase = createClient(url, key);
  return _supabase;
}

// ─── Supabase Browser Client (for frontend) ────────────────────────────────

export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase URL and Anon Key are required for browser client");
  }

  return createClient(url, key);
}
