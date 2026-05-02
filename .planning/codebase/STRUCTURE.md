# Codebase Structure

**Analysis Date:** 2026-05-02

## Directory Layout

```
Catalog/                           # Repo root — pnpm monorepo
├── apps/
│   └── desktop/                   # Main Tauri application
│       ├── src/                   # React/TypeScript frontend
│       │   ├── main.tsx           # React entry point
│       │   ├── app/               # App-level orchestration (contexts, actions, IPC, hooks)
│       │   ├── pages/             # Route-level page components
│       │   ├── styles/            # Global CSS design tokens
│       │   └── test/              # Vitest setup file
│       ├── src-tauri/             # Rust backend
│       │   ├── src/               # Rust source modules
│       │   ├── tauri.conf.json    # Tauri app config (window, plugins, bundle)
│       │   ├── Cargo.toml         # Rust dependencies
│       │   ├── capabilities/      # Tauri v2 permission declarations
│       │   ├── icons/             # App icons (macOS icns, Win ico, etc.)
│       │   └── vendor/            # Locally patched crates
│       │       └── tauri-plugin-sql/  # Patched: max_connections=1, WAL mode
│       ├── public/                # Static assets served by Vite
│       └── dist/                  # Vite build output (gitignored)
├── packages/
│   ├── domain/                    # Pure TypeScript types + business logic
│   │   └── src/
│   ├── data/                      # Repository, persistence, sync, selectors
│   │   └── src/
│   │       └── testing/           # MockCatalogRepository + mock data factories
│   └── ui/                        # Shared UI chrome components
│       └── src/
├── docs/                          # Design docs, superpowers specs/plans
├── scripts/                       # Utility scripts
├── package.json                   # Root package.json (pnpm workspace)
├── pnpm-workspace.yaml            # Workspace: apps/*, packages/*
├── tsconfig.base.json             # Shared TS compiler base config
└── pnpm-lock.yaml
```

## Directory Purposes

**`apps/desktop/src/app/`:**
- Purpose: App-level orchestration. Wires Tauri IPC to the repository and exposes state via React contexts.
- Contains: React contexts, Tauri IPC wrappers, action functions, custom hooks, router, SQLite database loader
- Key files:
  - `providers.tsx` — `CatalogStoreContext` (all catalog entities, mutations)
  - `scanWorkflow.tsx` — `ScanWorkflowContext` (scan start/cancel/poll state machine)
  - `catalogRepository.ts` — singleton repository construction (Tauri vs in-memory branch)
  - `catalogActions.ts` — high-level scan lifecycle (start, cancel, reconcile, sync)
  - `scanCommands.ts` — raw `invoke()` wrappers for Rust scan commands
  - `volumeImportCommands.ts` — raw `invoke()` wrappers for folder enumeration
  - `tauriSqliteDatabase.ts` — lazy singleton SQLite handle loader
  - `router.tsx` — React Router route definitions
  - `RootLayout.tsx` — top-level layout with `AppShell` and `<Outlet />`
  - `appLogging.ts` — forwards `console.*` to Tauri log sink

**`apps/desktop/src/pages/`:**
- Purpose: Route-level page components. Purely presentational — consume contexts, no direct IPC.
- Contains: `ProjectsPage`, `DrivesPage`, `DriveDetailPage`, `ProjectDetailPage`, `ImportFoldersDialog`
- Key files:
  - `pagePrimitives.tsx` — shared page-level UI primitives (`FeedbackNotice`, `SectionCard`, `StatusBadge`, skeleton components)
  - `dashboardHelpers.ts` — formatting utilities (`formatBytes`, `formatParsedDate`, `getDriveName`)
  - `feedbackHelpers.ts` — shared feedback state types and dismiss hook
  - `driveColor.ts` — deterministic drive color assignment

**`apps/desktop/src/styles/`:**
- Purpose: Design tokens and global CSS. Single source of truth for all CSS custom properties.
- Key file: `globals.css` — all `--*` token definitions (canvas, surfaces, ink scale, action color, semantic colors, elevation), Tailwind directives, utility class definitions (`.btn`, `.card`, `.field-shell`, `.eyebrow`, `.drive-dot`, etc.)

**`apps/desktop/src-tauri/src/`:**
- Purpose: Rust backend — filesystem operations, scan engine, volume info. All read-only with respect to the filesystem.
- Key files:
  - `lib.rs` — Tauri builder, plugin registration, command handler list, `AppScanState` init
  - `scan_engine.rs` — threaded directory scanner, folder classifier, size calculator, `ScanSession` lifecycle
  - `volume_info.rs` — `diskutil info` + `df -Pk` wrappers returning `VolumeInfo`
  - `volume_import.rs` — single-level folder enumeration returning sorted `VolumeFolderEntry[]`

**`apps/desktop/src-tauri/vendor/tauri-plugin-sql/`:**
- Purpose: Locally patched fork of `tauri-plugin-sql` v2.4.0.
- Patch summary: `max_connections=1`, WAL mode, `busy_timeout` enabled. Required for correct multi-statement SQLite transactions in the scan ingestion flow. Do not replace with upstream.
- Generated: No
- Committed: Yes

**`packages/domain/src/`:**
- Purpose: Pure TypeScript domain types and stateless business logic. Zero runtime dependencies.
- Key files:
  - `project.ts` — `Project` interface (all fields, schema migration comments)
  - `drive.ts` — `Drive` interface
  - `scan.ts` — `ScanRecord`, `ScanSessionSnapshot`, `ScanSummary`
  - `enums.ts` — `FolderType`, `Category`, `SizeStatus`, `MoveStatus`, etc.
  - `folderClassifier.ts` — TypeScript mirror of Rust folder name classification logic
  - `smartRenameEngine.ts` — rename suggestion generation
  - `renameSuggestion.ts` — `RenameSuggestion` type + status enum

**`packages/data/src/`:**
- Purpose: Repository implementation, persistence adapters, sync adapters, derived view selectors.
- Key files:
  - `repository.ts` — `CatalogRepository` interface (full surface area), all input/output types
  - `localCatalogRepository.ts` — `LocalCatalogRepository` class implementing `CatalogRepository`
  - `localPersistence.ts` — `LocalPersistenceAdapter` interface
  - `sqliteLocalPersistence.ts` — SQLite adapter (reads/writes via `tauri-plugin-sql`)
  - `inMemoryLocalPersistence.ts` — In-memory adapter (tests + non-Tauri environments)
  - `scanIngestionService.ts` — converts `ScanSnapshot` → `Project` + `ScanRecord` upserts
  - `catalogSelectors.ts` — derived view builders (`buildDriveDetailView`, `buildDashboardSnapshot`)
  - `projectListSelectors.ts` — `filterProjectCatalog` for the projects list
  - `supabaseSyncAdapter.ts` — remote sync via Supabase REST
  - `testing/mockCatalogRepository.ts` — mock for unit tests

**`packages/ui/src/`:**
- Purpose: Shared chrome components: application shell, sidebar nav, icons.
- Key files:
  - `AppShell.tsx` — outer layout (sidebar + main area, drag region, macOS traffic light offset)
  - `SidebarNav.tsx` — left nav with `NavItem` type
  - `Icon.tsx` — SVG icon registry (named icons: `folder`, `hardDrive`, `scan`, `plus`, `chevron`, `arrowRight`, etc.)
  - `TopUtilityBar.tsx` — global search bar rendered inside AppShell

## Key File Locations

**Entry Points:**
- `apps/desktop/src/main.tsx` — React root render
- `apps/desktop/src-tauri/src/main.rs` → `lib.rs:run()` — Rust app entry

**Router:**
- `apps/desktop/src/app/router.tsx` — all route definitions

**Repository Interface:**
- `packages/data/src/repository.ts` — `CatalogRepository` interface

**Design Tokens:**
- `apps/desktop/src/styles/globals.css` — all CSS custom properties

**Tauri Config:**
- `apps/desktop/src-tauri/tauri.conf.json` — window config, plugins, bundle targets

**Rust Commands (registered):**
- `apps/desktop/src-tauri/src/lib.rs` — `generate_handler!` list

**IPC Wrappers (TypeScript):**
- `apps/desktop/src/app/scanCommands.ts` — scan + volume info commands
- `apps/desktop/src/app/volumeImportCommands.ts` — folder enumeration command

**Testing:**
- `packages/data/src/testing/mockCatalogRepository.ts` — mock repository
- `packages/data/src/testing/mockData.ts` — test data factories
- `apps/desktop/src/test/setup.ts` — Vitest global setup

## Naming Conventions

**Files:**
- React components: PascalCase (`ProjectsPage.tsx`, `AppShell.tsx`, `ErrorBoundary.tsx`)
- Hooks: camelCase with `use` prefix (`useShortcut.ts`, `useAsyncAction.ts`, `useWindowDragRegions.ts`)
- Non-component TypeScript modules: camelCase (`catalogActions.ts`, `scanCommands.ts`, `tauriSqliteDatabase.ts`)
- CSS: `globals.css` (single global file, no per-component CSS modules)
- Rust modules: snake_case (`scan_engine.rs`, `volume_info.rs`, `volume_import.rs`)

**Directories:**
- Feature grouping in `src/app/` (all orchestration together, not split by type)
- Pages flat in `src/pages/` (one file per route, helpers co-located)

**TypeScript:**
- Types/interfaces: PascalCase (`Project`, `CatalogRepository`, `ScanSessionSnapshot`)
- Functions/hooks: camelCase (`startCatalogScan`, `useCatalogStore`, `getDriveNameFromPath`)
- Constants: UPPER_SNAKE_CASE (`POLL_INTERVAL_MS`, `MAX_SIZE_WALK_ENTRIES`)

**Rust:**
- Structs/enums: PascalCase (`ScanSession`, `FolderClassification`, `AppScanState`)
- Functions/modules: snake_case (`start_scan`, `scan_engine`, `classify_folder_name`)
- Constants: UPPER_SNAKE_CASE (`MAX_SCAN_DEPTH`, `CANCELLED_ERROR`)

## Where to Add New Code

**New Tauri command (Rust):**
1. Add function in an existing module or create new `src/<module>.rs`
2. Declare module in `apps/desktop/src-tauri/src/lib.rs` with `mod <module>;`
3. Add to `generate_handler![]` list in `lib.rs`
4. Add TypeScript wrapper in `apps/desktop/src/app/scanCommands.ts` or a new commands file
5. Tests: add `#[cfg(test)] mod tests { ... }` block inside the same `.rs` file

**New repository method:**
1. Add signature to `CatalogRepository` in `packages/data/src/repository.ts`
2. Implement in `packages/data/src/localCatalogRepository.ts`
3. Add to `packages/data/src/testing/mockCatalogRepository.ts`
4. Expose via `AppProviders` in `apps/desktop/src/app/providers.tsx` if pages need it

**New page:**
1. Create `apps/desktop/src/pages/NewFeaturePage.tsx`
2. Add route in `apps/desktop/src/app/router.tsx`
3. Add nav item in `apps/desktop/src/app/RootLayout.tsx` if it needs sidebar navigation
4. Tests: co-locate as `NewFeaturePage.test.tsx` using `createTestRouter()`

**New shared UI primitive:**
- Page-level only: add to `apps/desktop/src/pages/pagePrimitives.tsx`
- Cross-page chrome: add to `packages/ui/src/` and export from `packages/ui/src/index.ts`

**New domain type:**
1. Add to appropriate file in `packages/domain/src/` (`project.ts`, `drive.ts`, `scan.ts`, or new file)
2. Re-export from `packages/domain/src/index.ts`

**New CSS utility class:**
- Add to `apps/desktop/src/styles/globals.css`; document in `DESIGN.md` if it defines a new pattern

**New custom hook (app-level):**
- Add `apps/desktop/src/app/useNewHook.ts`
- Tests: add `useNewHook.test.ts` in the same directory

## Special Directories

**`apps/desktop/src-tauri/vendor/`:**
- Purpose: Locally patched Rust crates (currently `tauri-plugin-sql` only)
- Generated: No
- Committed: Yes — the patch is intentional and load-bearing

**`apps/desktop/dist/`:**
- Purpose: Vite production build output; served by Tauri as the WebView content
- Generated: Yes (by `vite build`)
- Committed: No

**`apps/desktop/src-tauri/target/`:**
- Purpose: Cargo build artifacts
- Generated: Yes
- Committed: No

**`apps/desktop/src-tauri/gen/`:**
- Purpose: Auto-generated Tauri capability schemas
- Generated: Yes (by `tauri build`)
- Committed: Yes (Tauri convention)

**`.planning/`:**
- Purpose: GSD planning documents (phases, codebase maps)
- Generated: By GSD commands
- Committed: As needed for team coordination

---

*Structure analysis: 2026-05-02*
