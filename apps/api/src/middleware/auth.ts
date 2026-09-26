import { Hono } from "hono";
import { getSupabase } from "@genvid/db";
import type { Context, Next } from "hono";

export type AuthEnv = {
  Variables: {
    userId: string;
    userEmail: string;
  };
};

/**
 * Middleware: Validates Supabase JWT from Authorization header
 * and attaches userId to the Hono context.
 */
export async function authMiddleware(c: Context<AuthEnv>, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.replace("Bearer ", "");
  const supabase = getSupabase();

  const {
    data: { user },
    error,
  } = await (supabase.auth as any).getUser(token);

  if (error || !user) {
    console.error("Auth Middleware Error:", error);
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  c.set("userId", user.id);
  c.set("userEmail", user.email || "");

  await next();
}
