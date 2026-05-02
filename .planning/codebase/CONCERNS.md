# Codebase Concerns

**Analysis Date:** 2026-05-02

## Tech Debt

**MUI still pulled in as a runtime dependency:**
- Issue: `@mui/material`, `@emotion/react`, `@emotion/styled` remain in `apps/desktop/package.json` dependencies. Only `ThemeProvider`, `CssBaseline`, and `materialTheme` are used — pure Tailwind/CSS-var design system was shipped for all components, but the MUI tree-shaking boundary means the full emotion runtime still loads.
- Files: `apps/desktop/src/main.tsx`, `apps/desktop/src/app/materialTheme.ts`
- Impact: Adds ~150–200 KB (gzipped) of unnecessary JS. `CssBaseline` is the only functional piece — it injects a CSS reset that conflicts with Tailwind Preflight.
- Fix approach: Remove `ThemeProvider` + `CssBaseline` wrapper in `main.tsx`, delete `materialTheme.ts`, remove `@mui/material`, `@emotion/react`, `@emotion/styled`, `@fontsource/roboto` from `package.json`. Ensure any global reset is handled via Tailwind's base layer alone.

**Roboto font loaded alongside Inter:**
- Issue: `apps/desktop/src/main.tsx` imports all four Roboto weights (`@fontsource/roboto/{300,400,500,700}.css`) as a side-effect of the legacy MUI wiring. The actual design system uses Inter variable font (`@fontsource-variable/inter`).
- Files: `apps/desktop/src/main.tsx`
- Impact: Loads ~300–400 KB of unused font data on every boot.
- Fix approach: Remove Roboto imports together with the MUI cleanup above.

**`notify` and `sha2` Cargo dependencies declared but unused:**
- Issue: `apps/desktop/src-tauri/Cargo.toml` lists `notify = "6.1"` (volume mount watcher) and `sha2 = "0.10"` (archive manifest hashing). Neither crate is imported anywhere in `src/lib.rs`, `src/scan_engine.rs`, `src/volume_import.rs`, or `src/volume_info.rs`.
- Files: `apps/desktop/src-tauri/Cargo.toml`
- Impact: Increases compile time and binary size; misleads developers about available capabilities; `cargo audit` will track CVEs for crates the app doesn't actually use.
- Fix approach: Remove both lines from `[dependencies]` in `Cargo.toml`. If volume-mount eventing is planned via `notify`, create the Rust module first before re-adding the dependency.

**`AppScanState` sessions map never pruned:**
- Issue: `scan_engine.rs`'s `AppScanState` holds every `ScanSession` in a `HashMap<String, Arc<ScanSession>>` for the lifetime of the process. There is no eviction path — every scan started in a session accumulates. On long-running app instances with frequent scans, this is a slow memory leak.
- Files: `apps/desktop/src-tauri/src/scan_engine.rs` (lines 172–233)
- Impact: Low severity in typical usage (a few scans per session), but can grow unboundedly in developer/power-user scenarios. The session `Arc` also keeps all captured `ScanProjectRecord` vecs alive.
- Fix approach: Add a `prune_finished_sessions` method that removes terminal sessions older than a configurable TTL (e.g., 1 hour or 100 sessions). Call it inside `start_scan` before inserting a new session.

**`IGNORED_SYSTEM_FOLDERS` duplicated across two Rust modules:**
- Issue: The constant is copy-pasted verbatim between `scan_engine.rs` (line 48) and `volume_import.rs` (line 52).
- Files: `apps/desktop/src-tauri/src/scan_engine.rs`, `apps/desktop/src-tauri/src/volume_import.rs`
- Impact: A future addition to the ignore list must be applied in two places; divergence is already a risk.
- Fix approach: Move the constant to a shared `filters.rs` module or `lib.rs` and import it in both places.

**`refresh()` reloads the entire catalog on every mutation:**
- Issue: `apps/desktop/src/app/providers.tsx`'s `runMutation` helper always calls `refresh()` after any write, which re-fetches all four collections (`listProjects`, `listDrives`, `listScans`, `listScanSessions`) unconditionally. With a large catalog this creates noticeable UI lag after simple operations like editing a project name.
- Files: `apps/desktop/src/app/providers.tsx` (lines 120–129)
- Impact: Perceived latency on all mutations; repeated database round-trips proportional to catalog size.
- Fix approach: Implement optimistic local state updates (a partial pattern already exists via `useOptimisticMutation`) and call `refresh()` only on background reconciliation or after scans. For mutations, return and apply the updated record directly without a full reload.

**SQLite scan sessions grow without a delete path:**
- Issue: `LocalPersistenceAdapter` (in `packages/data/src/localPersistence.ts`) exposes `upsertScanSession` but no `deleteScanSession` or `pruneScanSessions`. The SQLite `scan_sessions` table and `scan_session_projects` table accumulate every scan run permanently.
- Files: `packages/data/src/localPersistence.ts`, `packages/data/src/sqliteLocalPersistence.ts`
- Impact: DB file grows indefinitely with `scan_session_projects` rows (one per folder per scan). A user who rescans a 500-folder drive weekly accumulates 26K+ rows per year that are never queried after ingestion.
- Fix approach: Add `deleteScanSession(scanId: string): Promise<void>` to the adapter interface. Implement it in `SqliteLocalPersistence` with a CASCADE on `scan_session_projects`. Call it during reconciliation after successful ingestion.

**`pagePrimitives.tsx` at 796 lines — multiple responsibilities:**
- Issue: The file exports `SearchField`, `SectionCard`, `StatusBadge`, `EmptyState`, `LoadingState`, skeleton components, `ConfirmModal`, `MetricCard`, `CapacityBar`, `CapacityLegend`, and `FeedbackNotice` — all in a single 796-line file.
- Files: `apps/desktop/src/pages/pagePrimitives.tsx`
- Impact: Approaching the 800-line file limit; violates single-responsibility; any edit to `ConfirmModal` forces re-analysis of the entire file. Creates merge conflicts for concurrent work.
- Fix approach: Split into at least three files: `search.tsx` (SearchField), `feedback.tsx` (FeedbackNotice, StatusBadge, EmptyState, LoadingState), `capacity.tsx` (CapacityBar, CapacityLegend), and keep `ConfirmModal`/skeletons in `pagePrimitives.tsx`.

**`DrivesPage.tsx` and `DriveDetailPage.tsx` at 760 / 723 lines:**
- Issue: Both page files are just under the 800-line ceiling. Each embeds local state machines, form logic, validation, and rendering — responsibilities that belong in separate hooks and components.
- Files: `apps/desktop/src/pages/DrivesPage.tsx`, `apps/desktop/src/pages/DriveDetailPage.tsx`
- Impact: Hard to test, hard to review, high cognitive load for contributors.
- Fix approach: Extract import flow state into a `useImportFromVolume` hook; extract the drive create form into `DriveCreateForm.tsx`; extract the scan section into `DriveScanSection.tsx`.

**Hardcoded `/Volumes/` macOS path prefix:**
- Issue: Multiple places construct paths by string-interpolating `/Volumes/${drive.volumeName}` directly.
- Files: `apps/desktop/src/app/scanWorkflow.tsx` (line 227), `apps/desktop/src/pages/DriveDetailPage.tsx` (lines 152, 233, 234, 336)
- Impact: Brittle on non-standard macOS volume mount points and completely wrong on any non-macOS OS (the app targets macOS only today, but this is still fragile). Silently produces a bad default scan path when a drive was registered without a known volume mount.
- Fix approach: Derive the path from the last successful scan session's `rootPath` (already attempted in `DriveDetailPage`); expose a `defaultMountPath(volumeName)` helper that reads the actual mount point via the Rust `volume_info` command rather than guessing.

## Known Bugs

**"Rename Review" referenced in UI but page does not exist:**
- Symptoms: After importing folders from a volume, `DriveDetailPage.tsx` shows a success/warning toast saying "N need cleanup and were sent to Rename Review." There is no `/rename-review` or equivalent route in `router.tsx`. Clicking or following up on this message leads nowhere.
- Files: `apps/desktop/src/pages/DriveDetailPage.tsx` (lines 204–216), `apps/desktop/src/app/router.tsx`
- Trigger: Import any folder set that contains non-standard folder names.
- Workaround: None — users must navigate to the Projects page and filter manually.

**`CapacityBar` renders a fake 28% fill when size is unknown:**
- Symptoms: When `usedBytes` is null or `totalBytes` is null/zero, `CapacityBar` uses `usedPctStr = "28%"` as a visual placeholder but still renders the bar with no accessible annotation that data is unavailable.
- Files: `apps/desktop/src/pages/pagePrimitives.tsx` (line 635)
- Trigger: Any drive without known total capacity, or freshly scanned projects with `size_status = "unknown"`.
- Workaround: The `aria-label` says "Storage usage unknown" but the visual bar still fills at 28%, which is misleading.

**Scan session polling does not stop on unmount if the poll fires during the cleanup:**
- Symptoms: `clearPollTimer` in `scanWorkflow.tsx` clears the scheduled `setTimeout` but not a poll that is already in-flight. If the component unmounts while `pollScan`'s async chain is running, `setActiveScanId` and `setLastError` are called on an unmounted context.
- Files: `apps/desktop/src/app/scanWorkflow.tsx` (lines 87–113)
- Trigger: Navigate away from a drive detail page while a scan is running.
- Workaround: The context provider is mounted at app root, so unmount is rare in practice.

## Security Considerations

**CSP disabled (`"csp": null`) in production Tauri config:**
- Risk: No Content Security Policy is set in `tauri.conf.json`. A rogue script injected via a malicious database value rendered into the webview, or a supply-chain compromise of a JS dependency, runs without restriction.
- Files: `apps/desktop/src-tauri/tauri.conf.json` (line: `"csp": null`)
- Current mitigation: The app has no external network calls from the webview (all Supabase sync goes through the TS layer, not inline scripts). The Tauri capability system provides a separate permission layer.
- Recommendations: Set a restrictive CSP such as `"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"`. `'unsafe-inline'` for styles is acceptable if inline styles are necessary; scripts should never have it.

**`opener:allow-open-path` capability allows all `$HOME/**` and `/Volumes/**` paths:**
- Risk: The Tauri capability grants the frontend permission to open any file under the user's home directory and any mounted volume via `opener:allow-open-path`. A bug in path construction could let user-controlled data open arbitrary executables or reveal sensitive files to the OS default handler.
- Files: `apps/desktop/src-tauri/capabilities/default.json`
- Current mitigation: `showPathInFinder` and related helpers only pass known `folderPath` values from persisted catalog records, which originate from the scan engine's read-only traversal.
- Recommendations: Narrow the `allow` list to specific subdirectories (e.g., `/Volumes/**` only, removing `$HOME/**`) if home-directory opening is not required; or add server-side path validation in the Rust `opener` command wrapper.

## Performance Bottlenecks

**Full catalog reload on every mutation (repeated from Tech Debt):**
- Problem: Every write — including trivial metadata edits — issues four `SELECT *` queries and replaces all React state arrays.
- Files: `apps/desktop/src/app/providers.tsx` (lines 77–88, 120–129)
- Cause: Architectural choice to use a single `refresh()` as the consistency mechanism.
- Improvement path: Return the updated entity from mutations and apply it locally; reserve `refresh()` for app boot and post-scan reconciliation.

**Scan status polling at 900 ms with full DB sync each tick:**
- Problem: `scanWorkflow.tsx` polls the Rust scan engine every 900 ms. Each poll calls `syncDesktopScanSession` → `getDesktopScanSnapshot` → `ingestScanSnapshot` → SQLite upsert → `refresh()`. This is 4–5 DB round-trips and a full state replacement every second during a scan.
- Files: `apps/desktop/src/app/scanWorkflow.tsx` (line 29), `apps/desktop/src/app/catalogActions.ts`
- Cause: No event-based push from Rust; polling is the only mechanism.
- Improvement path: Use Tauri's event system (`emit`/`listen`) to push scan progress from Rust, eliminating polling entirely. In the interim, reduce poll frequency to 2–3 s for terminal size-job waiting and skip the SQLite upsert for intermediate progress.

## Fragile Areas

**SQLite migration chain (5 migrations with partial-failure recovery logic):**
- Files: `packages/data/src/sqliteLocalPersistence.ts` (lines 79–540+)
- Why fragile: Migrations 3 and 5 involve `DROP TABLE` → rename sequences. Both include partial-failure recovery branches that detect intermediate states. The logic is correct but intricate — any future migration that touches `projects` or `scan_session_projects` must understand all prior states. There are no automated integration tests that run all migrations sequentially from a cold DB.
- Safe modification: Always use `run:` (async, full JS control) rather than `statements:` for any migration that touches table structure. Add a test in `sqliteLocalPersistence.test.ts` that boots from a completely empty DB and verifies all five migrations succeed before writing any new migration.
- Test coverage: `sqliteLocalPersistence.test.ts` exists but focuses on CRUD operations; migration path is not tested end-to-end.

**Scan session matching between Rust memory and SQLite:**
- Files: `apps/desktop/src/app/catalogActions.ts` (lines 87–155), `apps/desktop/src/app/scanWorkflow.tsx`
- Why fragile: `reconcilePersistedScanSessions` must correctly correlate Rust in-memory sessions (keyed by `scanId` string like `scan-1`) with SQLite rows. If the Rust process resets its counter (e.g., app restart), new scan IDs could collide with old SQLite rows. The reconciliation then marks the old row "interrupted" and creates a fresh one — but only if the status is `"running"`.
- Safe modification: Any change to `start_scan` ID generation in Rust must be coordinated with the reconciliation logic in `catalogActions.ts`.

**`DrivesPage` import flow state machine uses 5 separate `useState` calls:**
- Files: `apps/desktop/src/pages/DrivesPage.tsx` (lines 93–97)
- Why fragile: `importSourcePath`, `importFolders`, `importVolumeInfo`, `isPickingImport`, `isImporting` are independent `useState` values that form an implicit state machine. Partial updates (e.g., `setImportSourcePath` succeeds but `setImportFolders` is never called due to a thrown error) leave the UI in an inconsistent intermediate state.
- Safe modification: Consolidate into a single `useReducer` or `useMachine` with explicit state transitions.

**`ConfirmModal` uses `Enter` key to confirm without focus trap:**
- Files: `apps/desktop/src/pages/pagePrimitives.tsx` (lines 489–499)
- Why fragile: The `keydown` listener is attached to the dialog `div` which receives focus via `tabIndex={-1}`. If focus escapes (e.g., via a screen reader), `Enter` still fires `onConfirm`. There is also no `aria-describedby` linking the description text to the dialog element.
- Safe modification: Use the native `<dialog>` element or a headless dialog primitive that manages focus trapping automatically.

## Scaling Limits

**`ScanProjectRecord` list embedded in `ScanSnapshot` in memory:**
- Current capacity: A scan of a drive with 1,000 folders holds 1,000 `ScanProjectRecord` structs (each with ~10 string fields) inside the `ScanSession`'s `Mutex<ScanSnapshot>`. The entire list is cloned on every `snapshot()` call.
- Limit: At ~500 bytes per record, 10K folders = ~5 MB per clone. Marginal for typical use but noticeable on NAS volumes with thousands of folders.
- Scaling path: Stream results incrementally rather than accumulating in memory; or paginate the `get_scan_snapshot` IPC response.

**`scan_session_projects` table has no row limit or TTL:**
- Current capacity: Unbounded.
- Limit: On a 4 TB archive drive rescanned weekly, the table accumulates ~2M rows per year.
- Scaling path: Implement `deleteScanSession` with cascading delete (see Tech Debt above); purge sessions older than 90 days automatically on app boot.

## Dependencies at Risk

**Vendored `tauri-plugin-sql` fork:**
- Risk: `apps/desktop/src-tauri/vendor/tauri-plugin-sql` is a local copy of `tauri-plugin-sql 2.4.0` with a one-connection-pool patch. Upstream bug fixes, security patches, and Tauri 2.x compatibility updates will not be applied automatically.
- Impact: Any upstream security fix in `tauri-plugin-sql` requires manually diffing and re-applying the patch to the vendored copy.
- Migration plan: File an upstream issue or PR for the `max_connections=1` + WAL option. When/if merged, remove the vendor directory and reference the published crate version.

**`@tauri-apps/plugin-sql` NPM package version mismatch:**
- Risk: `package.json` references `"@tauri-apps/plugin-sql": "^2.2.0"` (the upstream JS bindings), while the Rust side vendors `2.4.0`. The JS API surface may differ from the Rust implementation in the vendored copy.
- Files: `apps/desktop/package.json`, `apps/desktop/src-tauri/Cargo.toml`
- Migration plan: Pin the NPM package to exactly `2.4.0` to match the vendored Rust crate version.

## Missing Critical Features

**Rename Review page never implemented:**
- Problem: The import flow generates `cleanupReviewCount` and surfaces a toast saying folders "were sent to Rename Review," implying a dedicated UI exists. The route does not exist and `renameSuggestions` from the domain package (`packages/domain/src/smartRenameEngine.ts`, `packages/data/src/localPersistence.ts`) are never surfaced in any page.
- Blocks: Users cannot act on the smart rename suggestions that the engine generates. The `listRenameSuggestions`, `upsertRenameSuggestion`, `updateRenameSuggestionStatus`, and `undoLastRenameOperation` repository methods are implemented but completely unreachable from the UI.

**No scan session cleanup UI:**
- Problem: Users cannot delete individual scan sessions from the UI. The history accumulates indefinitely in the drive detail scan section.
- Blocks: Users who rescan a drive many times see a long list of historical sessions with no way to prune it.

## Test Coverage Gaps

**`DriveDetailPage` has no test file:**
- What's not tested: Drive deletion confirmation flow, scan start/cancel interaction via the workflow provider, import-from-volume state machine, capacity bar rendering, feedback notice dismissal.
- Files: `apps/desktop/src/pages/DriveDetailPage.tsx` (723 lines, 0 test coverage)
- Risk: The most complex page in the app — 5 import-flow state variables, scan workflow integration, drive deletion — has no automated regression protection.
- Priority: High

**`ProjectDetailPage` has no test file:**
- What's not tested: Optimistic mutation flow for metadata edits, rollback on save failure, project deletion confirmation, scan event history loading.
- Files: `apps/desktop/src/pages/ProjectDetailPage.tsx`
- Risk: Metadata edit is the primary user action on this page; a regression in `useOptimisticMutation` integration would go undetected.
- Priority: High

**`ImportFoldersDialog` has no test file:**
- What's not tested: Folder selection/deselection, duplicate detection rendering, confirm flow.
- Files: `apps/desktop/src/pages/ImportFoldersDialog.tsx` (312 lines)
- Risk: Core import path; errors here silently skip or double-import folders.
- Priority: High

**SQLite migration end-to-end path not tested:**
- What's not tested: Cold-start migration from schema version 0 → 5; partial-failure recovery scenarios for migrations 3 and 5.
- Files: `packages/data/src/sqliteLocalPersistence.test.ts`
- Risk: A regression in migration ordering or the partial-failure recovery branches silently corrupts a user's local DB on app update.
- Priority: High

**`pagePrimitives.tsx` components have no unit tests:**
- What's not tested: `CapacityBar` level thresholds, `SearchField` keyboard shortcuts, `ConfirmModal` enter-key confirm behavior, `StatusBadge` tone mapping.
- Files: `apps/desktop/src/pages/pagePrimitives.tsx`
- Risk: Design-system primitives used across all pages; a broken `CapacityBar` or `StatusBadge` affects every view.
- Priority: Medium

---

*Concerns audit: 2026-05-02*
