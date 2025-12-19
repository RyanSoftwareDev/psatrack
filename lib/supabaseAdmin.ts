// lib/supabaseAdmin.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null = null;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is missing`);
  return v;
}

/**
 * Server-side only.
 * Uses SERVICE ROLE KEY. Do NOT import this into client components.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (admin) return admin;

  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "";

  if (!url) {
    throw new Error("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is missing");
  }

  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return admin;
}
