"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseConfig } from "@/lib/supabase/config";

export function createClient() {
  const { url, publishableKey } = requireSupabaseConfig();
  return createBrowserClient(url, publishableKey);
}
