import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseConfig } from "@/lib/supabase/config";

export function createAdminClient() {
  const { url } = requireSupabaseConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) {
    throw new Error("Supabase server secret is not configured.");
  }
  return createSupabaseClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function createAnonymousServerClient() {
  const { url, publishableKey } = requireSupabaseConfig();
  return createSupabaseClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
