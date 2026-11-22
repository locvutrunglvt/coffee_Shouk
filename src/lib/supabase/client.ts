import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

export function createClient() {
  const { url, anonKey, isConfigured } = getSupabaseEnv();
  if (!isConfigured) {
    throw new Error("Supabase environment variables are not configured.");
  }
  return createBrowserClient(url, anonKey);
}
