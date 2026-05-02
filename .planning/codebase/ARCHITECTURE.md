<!-- refreshed: 2026-05-02 -->
# Architecture

**Analysis Date:** 2026-05-02

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          React Frontend (WKWebView)                          │
│                  apps/desktop/src/pages/  +  src/app/                        │
├──────────────────────┬──────────────────────┬────────────────────────────────┤
│    CatalogStore       │   ScanWorkflow        │      RootLayout / Pages        │
│  (AppProviders ctx)   │  (ScanWorkflowCtx)    │   ProjectsPage, DrivesPage,    │
│  src/app/providers.tsx│  src/app/scanWorkflow │   DriveDetailPage,             │
│                       │  .tsx                 │   ProjectDetailPage            │
└────────────┬──────────┴──────────┬───────────┴────────────────────────────────┘
             │                     │
             ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        App-layer orchestration                               │
│   catalogActions.ts — scan lifecycle (start/cancel/reconcile)               │
│   catalogRepository.ts — singleton repository construction                  │
│   scanCommands.ts — Tauri IPC wrappers for scan & volume commands           │
│   volumeImportCommands.ts — Tauri IPC wrappers for folder enumeration       │
│   tauriSqliteDatabase.ts — lazy SQLite handle loader                        │
└───────────────────────────────────┬────────────────────────────────────────┘
                                    │
             ┌──────────────────────┼───────────────────────────┐
             ▼                      ▼                           ▼
┌────────────────────┐  ┌────────────────────┐   ┌──────────────────────────┐
│   packages/domain  │  │   packages/data    │   │    packages/ui           │
│  Pure TS types +   │  │  LocalCatalogRepo  │   │  AppShell, Icon,         │
│  business logic    │  │  SqliteLocalPers.  │   │  SidebarNav,             │
│  (no I/O)          │  │  SyncAdapter       │   │  TopUtilityBar           │
└────────────────────┘  └──────────┬─────────┘   └──────────────────────────┘
                                   │
             ┌─────────────────────┼──────────────────────┐
             ▼                     ▼                       ▼
┌──────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│  SQLite on disk  │  │  Tauri IPC bridge   │  │  Supabase (remote   │
│  (via vendored   │  │  (@tauri-apps/api)  │  │  sync — optional)   │
│  tauri-plugin-   │  │                     │  │                     │
│  sql, WAL mode)  │  └─────────┬───────────┘  └─────────────────────┘
└──────────────────┘            │
                                ▼
          ┌───────────────────────────────────────────────────────┐
          │               Rust Backend (src-tauri)                 │
          │  lib.rs — Tauri builder, plugin registration           │
          │  scan_engine.rs — threaded directory scan              │
          │  volume_info.rs — diskutil + df wrappers              │
          │  volume_import.rs — folder enumeration (read-only)     │
          └───────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `AppProviders` | Global catalog state, mutation helpers, boot lifecycle | `apps/desktop/src/app/providers.tsx` |
| `ScanWorkflowProvider` | Scan start/cancel/poll state machine, session reconciliation | `apps/desktop/src/app/scanWorkflow.tsx` |
| `RootLayout` | AppShell frame, nav items, global search routing | `apps/desktop/src/app/RootLayout.tsx` |
| `catalogActions.ts` | High-level scan orchestration: calls IPC + writes to repository | `apps/desktop/src/app/catalogActions.ts` |
| `catalogRepository.ts` | Singleton repository construction (Tauri vs in-memory branch) | `apps/desktop/src/app/catalogRepository.ts` |
| `scanCommands.ts` | Raw Tauri IPC wrappers with error normalization | `apps/desktop/src/app/scanCommands.ts` |
| `volumeImportCommands.ts` | Tauri IPC wrappers for folder enumeration | `apps/desktop/src/app/volumeImportCommands.ts` |
| `tauriSqliteDatabase.ts` | Lazy singleton SQLite handle (singleton promise pattern) | `apps/desktop/src/app/tauriSqliteDatabase.ts` |
| `LocalCatalogRepository` | Implements `CatalogRepository` over persistence + sync adapters | `packages/data/src/localCatalogRepository.ts` |
| `SqliteLocalPersistence` | SQLite read/write via tauri-plugin-sql (WAL, max_connections=1) | `packages/data/src/sqliteLocalPersistence.ts` |
| `scan_engine.rs` | Threaded directory walk, folder classification, size calculation | `apps/desktop/src-tauri/src/scan_engine.rs` |
| `volume_info.rs` | macOS-native volume metadata (`diskutil info`, `df -Pk`) | `apps/desktop/src-tauri/src/volume_info.rs` |
| `volume_import.rs` | Single-level folder enumeration for import preview | `apps/desktop/src-tauri/src/volume_import.rs` |
| `packages/domain` | Pure TypeScript types + classifier + smart rename engine | `packages/domain/src/` |
| `packages/ui` | AppShell chrome, Icon, SidebarNav, TopUtilityBar | `packages/ui/src/` |

## Pattern Overview

**Overall:** Layered monorepo — domain types at the bottom, data/persistence in the middle, app orchestration at the top. Rust backend serves as a thin trusted system layer for filesystem operations; all business logic lives in TypeScript.

**Key Characteristics:**
- Repository pattern: `CatalogRepository` interface backed by `LocalCatalogRepository` with swappable persistence (SQLite in production, InMemory in tests)
- Context-based state: two React contexts (`CatalogStoreContext`, `ScanWorkflowContext`) own all app-level state; pages are presentational consumers
- IPC boundary is explicit: every Tauri command call goes through a wrapper module (`scanCommands.ts`, `volumeImportCommands.ts`) that normalizes errors before they reach the UI
- Read-only filesystem contract enforced in Rust: both `scan_engine.rs` and `volume_import.rs` carry `#![deny(clippy::disallowed_methods)]` to prevent any write operations from the Rust layer
- Polling not events: active scan sessions are polled every 900ms (`POLL_INTERVAL_MS`) via `syncDesktopScanSession`; no websocket or Tauri event stream

## Layers

**Domain Layer:**
- Purpose: Pure TypeScript types and business logic. No I/O, no React, no Tauri.
- Location: `packages/domain/src/`
- Contains: `Project`, `Drive`, `ScanRecord`, `ScanSessionSnapshot` types; `classifyFolderName`, `generateRenameCandidates`, `applyDerivedProjectStates`
- Depends on: nothing (leaf package)
- Used by: `packages/data`, `apps/desktop/src/**`

**Data / Persistence Layer:**
- Purpose: `CatalogRepository` implementation, SQLite adapter, in-memory adapter, sync adapters, selectors, scan ingestion.
- Location: `packages/data/src/`
- Contains: `LocalCatalogRepository`, `SqliteLocalPersistence`, `InMemoryLocalPersistence`, `SqliteSyncAdapter`, `supabaseSyncAdapter`, `scanIngestionService`, `projectListSelectors`, etc.
- Depends on: `packages/domain`
- Used by: `apps/desktop/src/app/`

**App Orchestration Layer:**
- Purpose: Wire repository to Tauri runtime; own scan lifecycle state machine; provide contexts.
- Location: `apps/desktop/src/app/`
- Contains: `providers.tsx`, `scanWorkflow.tsx`, `catalogActions.ts`, `catalogRepository.ts`, `scanCommands.ts`, `volumeImportCommands.ts`, `tauriSqliteDatabase.ts`, router, hooks
- Depends on: `packages/data`, `packages/domain`, `@tauri-apps/api`
- Used by: `apps/desktop/src/pages/`

**UI / Pages Layer:**
- Purpose: Presentational pages consuming contexts; no direct Tauri IPC.
- Location: `apps/desktop/src/pages/`
- Contains: `ProjectsPage`, `DrivesPage`, `DriveDetailPage`, `ProjectDetailPage`, `ImportFoldersDialog`, shared page primitives
- Depends on: `apps/desktop/src/app/` (contexts), `packages/domain`, `packages/data` (selectors), `packages/ui`
- Used by: `RootLayout` via React Router `<Outlet />`

**Shared UI Components:**
- Purpose: Chrome primitives reusable across pages.
- Location: `packages/ui/src/`
- Contains: `AppShell`, `SidebarNav`, `TopUtilityBar`, `Icon`
- Depends on: nothing external (pure React + CSS)
- Used by: `apps/desktop/src/app/RootLayout.tsx`

**Rust Backend:**
- Purpose: Trusted system layer — filesystem reads only. Exposed as Tauri commands over IPC.
- Location: `apps/desktop/src-tauri/src/`
- Contains: `scan_engine.rs` (threaded scan + classification), `volume_info.rs` (diskutil/df), `volume_import.rs` (folder listing), `lib.rs` (builder + command registration)
- Depends on: Tauri 2.x, chrono, serde, log, notify, sha2, vendored tauri-plugin-sql
- Used by: Frontend via `invoke()` calls in `scanCommands.ts` / `volumeImportCommands.ts`

## Data Flow

### Scan Flow (happy path)

1. User picks directory → `chooseCatalogScanDirectory()` calls `open()` (Tauri dialog plugin) (`scanCommands.ts:93`)
2. `startCatalogScan()` calls `startDesktopScan()` → `invoke("start_scan", { request })` (`catalogActions.ts:17`, `scanCommands.ts:22`)
3. Rust `start_scan` command validates path, creates `ScanSession`, spawns background thread (`scan_engine.rs:462`)
4. Background thread walks the drive root (depth 1), classifies folder names, optionally spawns per-folder size workers (`scan_engine.rs:566`)
5. Scan session is saved to repository immediately after IPC returns (`catalogActions.ts:27`)
6. `ScanWorkflowProvider` polls every 900ms: calls `syncDesktopScanSession()` → `invoke("get_scan_snapshot")` → `parseScanSessionSnapshot` → `repository.ingestScanSnapshot()` → `refresh()` (`scanWorkflow.tsx:87`)
7. Ingestion in `scanIngestionService.ts` creates/updates `Project` and `ScanRecord` rows from the snapshot
8. Terminal status (completed/cancelled/failed) detected → polling stops

### Volume Import Flow

1. User clicks "Import folders" on DrivesPage
2. `pickVolumeRoot()` opens native picker → returns absolute path (`volumeImportCommands.ts:26`)
3. `enumerateVolumeFolders(path)` → `invoke("enumerate_volume_folders", { path })` → Rust returns sorted `VolumeFolderEntry[]` (`volumeImportCommands.ts:51`)
4. `ImportFoldersDialog` shown with the folder list; user selects entries
5. `repository.importFoldersFromVolume({ driveId, sourcePath, folders })` writes Project rows (dedup by folderPath) (`packages/data/src/localCatalogRepository.ts`)
6. `refresh()` updates all context-held collections

### Startup Reconciliation

1. On mount, `ScanWorkflowProvider` calls `reconcilePersistedScanSessions(repository)` (`scanWorkflow.tsx:192`)
2. Phase 1: persisted sessions with `status="running"` that have no matching live session are flipped to `"interrupted"`
3. Phase 2: live Rust scan sessions are ingested sequentially into the repository
4. Any previously running session that is still live resumes polling

**State Management:**
- All catalog state (projects, drives, scans, scanSessions) lives in `CatalogStoreContext` via `AppProviders` (`providers.tsx`)
- Scan workflow state (activeScanId, draftRootPath, errors) lives in `ScanWorkflowContext`
- No external state library (Zustand, Redux). No TanStack Query. Manual `refresh()` on every mutation.
- URL state: search query (`?q=`), filters (`?category=`, `?folderType=`, `?drive=`) persisted in search params

## Key Abstractions

**`CatalogRepository` (interface):**
- Purpose: Single facade over all read/write operations — projects, drives, scans, sync.
- Location: `packages/data/src/repository.ts`
- Implementations: `LocalCatalogRepository` (production), `MockCatalogRepository` (tests at `packages/data/src/testing/mockCatalogRepository.ts`)

**`LocalPersistenceAdapter` (interface):**
- Purpose: Storage backend behind `LocalCatalogRepository`.
- Location: `packages/data/src/localPersistence.ts`
- Implementations: `SqliteLocalPersistence` (Tauri production), `InMemoryLocalPersistence` (tests/non-Tauri)

**`ScanSession` (Rust struct):**
- Purpose: Thread-safe in-process scan state with atomic finalization guard (H5 invariant).
- Location: `apps/desktop/src-tauri/src/scan_engine.rs:199`
- Key fields: `cancel_requested: AtomicBool`, `finalized: AtomicBool`, `snapshot: Mutex<ScanSnapshot>`, `size_workers: Mutex<Vec<JoinHandle>>`

**`FolderClassification` (Rust enum):**
- Purpose: Classify a drive folder name into `Client`, `PersonalProject`, or `PersonalFolder`.
- Location: `apps/desktop/src-tauri/src/scan_engine.rs:66`
- Used by: `scan_directory()` for every top-level folder encountered

## Entry Points

**Frontend boot:**
- Location: `apps/desktop/src/main.tsx`
- Triggers: WKWebView loads `index.html`; React mounts with `ThemeProvider` + `App`
- Responsibilities: Logging init, MUI theme, render root

**App component:**
- Location: `apps/desktop/src/app/App.tsx`
- Triggers: Rendered by `main.tsx`
- Responsibilities: Compose `ErrorBoundary` > `AppProviders` > `ScanWorkflowProvider` > `RouterProvider`

**Rust entry:**
- Location: `apps/desktop/src-tauri/src/main.rs` → `lib.rs:run()`
- Triggers: macOS app launch
- Responsibilities: Plugin registration (log, dialog, notification, opener, sql), `AppScanState` init, command handler registration

**Router:**
- Location: `apps/desktop/src/app/router.tsx`
- Routes: `/` → redirect to `/projects`; `/projects`, `/projects/:projectId`, `/drives`, `/drives/:driveId`

## Architectural Constraints

- **Threading (Rust):** Single main thread for Tauri event loop. Scan engine spawns one `std::thread` per scan plus one per top-level folder for size calculation. `AppScanState` uses `Mutex<HashMap>` for session registry; `ScanSession` uses `AtomicBool` + `Mutex<ScanSnapshot>` for safe concurrent access.
- **SQLite single-writer:** The vendored `tauri-plugin-sql` (`vendor/tauri-plugin-sql/`) sets `max_connections=1` and enables WAL + `busy_timeout` to prevent `SQLITE_BUSY` errors from concurrent scan ingestion. Do NOT replace with the upstream crate without reapplying this patch.
- **Scan depth:** `MAX_SCAN_DEPTH = 1` (line 46 of `scan_engine.rs`). Scanner only ever reads the immediate children of the root path. Nothing below depth 1 is walked as projects.
- **Filesystem read-only invariant:** Rust modules `scan_engine.rs` and `volume_import.rs` carry `#![deny(clippy::disallowed_methods)]` (non-test code). They may never rename, move, write, or delete files. `.clippy.toml` at crate root enforces specific `std::fs` write methods as disallowed.
- **Global state (Rust):** `AppScanState` is registered as a Tauri managed state singleton (`lib.rs:47`). It is the only global mutable state in the Rust layer.
- **Global state (TS):** `repository` in `catalogRepository.ts` is a module-level singleton constructed once at import time. It is not recreated on re-renders.
- **No circular imports:** `packages/domain` → (nothing); `packages/data` → `packages/domain`; `packages/ui` → (nothing); `apps/desktop` → all packages.

## Anti-Patterns

### Polling instead of Tauri events

**What happens:** `ScanWorkflowProvider` polls `get_scan_snapshot` every 900ms (`scanWorkflow.tsx:106`) rather than receiving push events from Rust.
**Why it's wrong here:** Adds ~1s of latency on scan completion; keeps the IPC channel busy during long scans; the Tauri event system (`emit`/`listen`) is the designed mechanism for progress reporting.
**Do this instead:** Emit a `scan-progress` event from the Rust scan thread; listen with `@tauri-apps/api/event listen()` in `ScanWorkflowProvider`.

### Mutation-then-manual-refresh pattern

**What happens:** Every mutating operation in `AppProviders` calls `runMutation()` which invokes `refresh()` after every operation (`providers.tsx:120`). `refresh()` fetches all four collections unconditionally.
**Why it's wrong here:** Fetches all projects, drives, scans, and scan sessions on every single mutation regardless of what changed — O(n) I/O for O(1) writes.
**Do this instead:** Use a data-fetching library (TanStack Query) with per-entity cache invalidation, or make `refresh()` scope-aware so only affected collections reload.

## Error Handling

**Strategy:** Errors are caught at layer boundaries and either surfaced as string messages in context state (`lastError` in `ScanWorkflowContext`, `feedback` state in pages) or displayed as full-screen failure panels (`FullScreenErrorPanel` on startup, `ErrorBoundary` for uncaught renders).

**Patterns:**
- Rust commands return `Result<T, String>` — the error string is a user-facing message already normalized in Rust. The TypeScript layer wraps it in `Error` and normalizes further in `normalizeScanCommandError()` (`scanCommands.ts:108`) and `normalizeEnumerateError()` (`volumeImportCommands.ts:63`).
- Repository errors surface as thrown `Error` instances; `AppProviders.bootCatalog` catches and renders `StartupFailureScreen`.
- `ErrorBoundary` (`src/app/ErrorBoundary.tsx`) catches unexpected React render errors and shows `FullScreenErrorPanel`.

## Cross-Cutting Concerns

**Logging:** `tauri-plugin-log` writes to stdout + `~/Library/Logs/Catalog/Catalog.log`. Frontend calls `initializeAppLogging()` (`src/app/appLogging.ts`) which routes `console.*` calls to the Tauri log sink. Rust uses the `log` crate.
**Validation:** User inputs validated in TypeScript (`catalogValidation.ts`) before hitting the repository. Rust validates path existence/type before starting a scan.
**Authentication:** None. SQLite database is local; Supabase sync (when configured) uses env-based credentials via `syncConfig.ts`.

---

*Architecture analysis: 2026-05-02*
