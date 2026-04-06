import { describe, expect, it } from "vitest";
import { resolveSupabaseSyncConfig } from "./syncConfig";

describe("syncConfig", () => {
  it("reports missing config clearly", () => {
    const result = resolveSupabaseSyncConfig({});

    expect(result.config).toBeNull();
    expect(result.diagnostics.code).toBe("missing");
  });

  it("treats placeholder config as disabled instead of broken", () => {
    const result = resolveSupabaseSyncConfig({
      VITE_SUPABASE_URL: "https://your-project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "your-supabase-anon-key"
    });

    expect(result.config).toBeNull();
    expect(result.diagnostics.code).toBe("missing");
    expect(result.diagnostics.message).toContain("placeholder");
  });

  it("rejects invalid urls", () => {
    const result = resolveSupabaseSyncConfig({
      VITE_SUPABASE_URL: "not-a-url",
      VITE_SUPABASE_ANON_KEY: "this-key-is-long-enough-to-look-valid"
    });

    expect(result.config).toBeNull();
    expect(result.diagnostics.code).toBe("invalid-url");
  });

  it("accepts valid config", () => {
    const result = resolveSupabaseSyncConfig({
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "this-key-is-long-enough-to-look-valid",
      VITE_SUPABASE_SCHEMA: "catalog"
    });

    expect(result.config).toEqual({
      url: "https://example.supabase.co",
      anonKey: "this-key-is-long-enough-to-look-valid",
      schema: "catalog"
    });
    expect(result.diagnostics.code).toBe("ready");
  });
});
