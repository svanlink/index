import {
  InMemoryLocalPersistence,
  InMemorySyncAdapter,
  LocalCatalogRepository,
  SqliteLocalPersistence,
  SqliteSyncAdapter,
  StorageLocalPersistence,
  StorageSyncAdapter,
  createRemoteSyncAdapter
} from "@drive-project-catalog/data";
import { createTauriSqliteDatabaseLoader } from "./tauriSqliteDatabase";
import { getSupabaseSyncConfig } from "./syncConfig";

const catalogStorageKey = "drive-project-catalog.catalog.v1";
const syncStorageKey = "drive-project-catalog.sync.v1";
const isTauriDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const remoteSyncAdapter = createRemoteSyncAdapter(getSupabaseSyncConfig());
const loadDesktopDatabase = createTauriSqliteDatabaseLoader();

export const repository =
  isTauriDesktop && typeof window !== "undefined" && "localStorage" in window
    ? new LocalCatalogRepository(
        new SqliteLocalPersistence({
          loadDatabase: loadDesktopDatabase,
          seed: { drives: [], projects: [], scans: [], projectScanEvents: [], scanSessions: [] },
          legacyStorage: window.localStorage,
          legacyStorageKey: catalogStorageKey
        }),
        new SqliteSyncAdapter({
          loadDatabase: loadDesktopDatabase,
          remote: remoteSyncAdapter
        })
      )
    : typeof window !== "undefined" && "localStorage" in window
    ? new LocalCatalogRepository(
        new StorageLocalPersistence({
          storage: window.localStorage,
          storageKey: catalogStorageKey,
          seed: { drives: [], projects: [], scans: [], projectScanEvents: [], scanSessions: [] }
        }),
        new StorageSyncAdapter({
          storage: window.localStorage,
          storageKey: syncStorageKey,
          remote: remoteSyncAdapter
        })
      )
    : new LocalCatalogRepository(
        new InMemoryLocalPersistence({ drives: [], projects: [], scans: [], projectScanEvents: [], scanSessions: [] }),
        new InMemorySyncAdapter()
      );
