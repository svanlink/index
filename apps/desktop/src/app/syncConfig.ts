import type { SupabaseSyncConfig } from "@drive-project-catalog/data";

export interface SyncConfigDiagnostics {
  enabled: boolean;
  code: "ready" | "missing" | "invalid-url" | "invalid-key";
  message: string;
  details: string[];
}

export function getSupabaseSyncConfig(): SupabaseSyncConfig | null {
  return resolveSupabaseSyncConfig(getImportMetaEnv()).config;
}

export function getSupabaseSyncDiagnostics(): SyncConfigDiagnostics {
  return resolveSupabaseSyncConfig(getImportMetaEnv()).diagnostics;
}

export function getRuntimeEnvironmentDiagnostics() {
  const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;

  return {
    isDesktop,
    isOnline,
    message: !isDesktop
      ? "Browser mode supports the free public web release. Desktop scan commands and local SQLite are only available in the Tauri app."
      : isOnline
      ? "Desktop runtime is online and ready for local-first work with optional cloud sync."
      : "Desktop runtime is offline. Local-first work stays available and sync will wait until connectivity returns."
  };
}

export function resolveSupabaseSyncConfig(env: Record<string, string | undefined>): {
  config: SupabaseSyncConfig | null;
  diagnostics: SyncConfigDiagnostics;
} {
  const url = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  const schema = env.VITE_SUPABASE_SCHEMA?.trim();

  if (!url && !anonKey) {
    return {
      config: null,
      diagnostics: {
        enabled: false,
        code: "missing",
        message: "Supabase sync is disabled because no sync environment variables are configured in this build.",
        details: [
          "Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable cloud transport.",
          "The app remains fully usable in local-first mode without these values, including the public web build."
        ]
      }
    };
  }

  if (!url || !isValidUrl(url)) {
    return {
      config: null,
      diagnostics: {
        enabled: false,
        code: "invalid-url",
        message: "Supabase sync is disabled because VITE_SUPABASE_URL is missing or invalid.",
        details: [
          "Expected a full HTTPS Supabase project URL.",
          "Desktop-only features like local SQLite persistence and manual scanning remain available in the Tauri app."
        ]
      }
    };
  }

  if (!anonKey || anonKey.length < 20) {
    return {
      config: null,
      diagnostics: {
        enabled: false,
        code: "invalid-key",
        message: "Supabase sync is disabled because VITE_SUPABASE_ANON_KEY is missing or looks incomplete.",
        details: [
          "Provide the full anon key from the Supabase project settings.",
          "Until then, sync actions will stay disabled while the rest of the app continues to work in local-first mode."
        ]
      }
    };
  }

  return {
    config: {
      url,
      anonKey,
      schema: schema || undefined
    },
    diagnostics: {
      enabled: true,
      code: "ready",
      message: "Supabase sync configuration is valid for this build.",
      details: schema ? [`Using schema: ${schema}`] : ["Using the default public schema."]
    }
  };
}

function getImportMetaEnv() {
  return ((import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }).env ?? {});
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}
