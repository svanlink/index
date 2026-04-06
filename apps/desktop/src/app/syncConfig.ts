import type { SupabaseSyncConfig } from "@drive-project-catalog/data";

export function getSupabaseSyncConfig(): SupabaseSyncConfig | null {
  const env = (import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }).env ?? {};
  const url = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  const schema = env.VITE_SUPABASE_SCHEMA?.trim();

  if (!url || !anonKey) {
    return null;
  }

  return {
    url,
    anonKey,
    schema: schema || undefined
  };
}
