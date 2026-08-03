const placeholderValues = new Set([
  "your_project_url",
  "your_publishable_key",
]);

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  return { url, publishableKey };
}

export function isSupabaseConfigured(): boolean {
  const { url, publishableKey } = getSupabaseConfig();
  return /^https:\/\/.+\.supabase\.co$/.test(url) &&
    publishableKey.length > 20 &&
    !placeholderValues.has(url) &&
    !placeholderValues.has(publishableKey);
}

export function requireSupabaseConfig() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Add the project URL and publishable key to the environment."
    );
  }
  return getSupabaseConfig();
}
