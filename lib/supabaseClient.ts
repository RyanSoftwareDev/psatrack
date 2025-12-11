// lib/supabaseClient.ts
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase env vars are missing. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
  );
}

/**
 * Singleton client – safe for client-side usage.
 */
export const supabase = createSupabaseClient(
  supabaseUrl,
  supabaseAnonKey
);

/**
 * Factory – use this in server-side code (API routes, etc.)
 */
export function createClient() {
  return createSupabaseClient(supabaseUrl, supabaseAnonKey);
}
