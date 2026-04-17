import {
  InMemoryLocalPersistence,
  InMemorySyncAdapter,
  LocalCatalogRepository,
  SqliteLocalPersistence,
  SqliteSyncAdapter,
  createRemoteSyncAdapter
} from "@drive-project-catalog/data";
import { createTauriSqliteDatabaseLoader } from "./tauriSqliteDatabase";
import { getSupabaseSyncConfig } from "./syncConfig";

const isTauriDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const remoteSyncAdapter = createRemoteSyncAdapter(getSupabaseSyncConfig());
const loadDesktopDatabase = createTauriSqliteDatabaseLoader();

// INVARIANTS §8 — macOS-first scope. The Tauri branch is the only path the
// user ever runs in practice (shipped desktop app + `pnpm dev`). The
// InMemory fallback covers headless test runs and the rare dev scenario
// where the Tauri runtime is not available (e.g. Vitest smoke tests of
// pages that only exercise the repository API surface).
export const repository =
  isTauriDesktop
    ? new LocalCatalogRepository(
        new SqliteLocalPersistence({
          loadDatabase: loadDesktopDatabase,
          seed: { drives: [], projects: [], scans: [], projectScanEvents: [], scanSessions: [] }
        }),
        new SqliteSyncAdapter({
          loadDatabase: loadDesktopDatabase,
          remote: remoteSyncAdapter
        })
      )
    : new LocalCatalogRepository(
        new InMemoryLocalPersistence({ drives: [], projects: [], scans: [], projectScanEvents: [], scanSessions: [] }),
        new InMemorySyncAdapter()
      );
