export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  const isConfigured =
    url.startsWith("https://") &&
    !url.includes("your-project-id") &&
    anonKey.length > 20 &&
    !anonKey.includes("your-anon-public-key");

  return { url, anonKey, isConfigured };
}
