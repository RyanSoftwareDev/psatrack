// lib/supabaseClient.ts
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseAnonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);
export function createClient() {
  return createSupabaseClient(supabaseUrl, supabaseAnonKey);
}
