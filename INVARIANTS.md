# Locked Invariants

This is the canonical reference for behaviors that have been deliberately hardened across prior passes (numbered 1–8 plus the Phase 1 macOS-first pivot). Each invariant has:

- **What is locked** — the behavior contract, in plain English
- **Spec location** — the authoritative in-code specification
- **Enforcement** — the tests or code paths that make drift surface immediately
- **Change protocol** — what a future pass needs to do before modifying it

A future change that alters a locked behavior must update every enforcement point atomically, or explicitly relocate the invariant (with updated cross-references) in this file. A pass that silently diverges a spec from its enforcement is a regression, not an improvement.

---

## 1. Cascade-delete semantics (Pass 7)

### What is locked

**`deleteProject(projectId)`**
- Removes the project row with the matching id.
- Removes every `projectScanEvent` whose `projectId` matches.
- Leaves every other entity untouched.
- No-op when the projectId does not exist.

**`deleteDrive(driveId)`**
- Removes the drive row itself.
- **Projects survive drive deletion.** `currentDriveId` / `targetDriveId` fields are nullified where they point to the deleted drive; the project row stays. This is the H3 invariant.
- Removes every `scan` whose `driveId` matches.
- Removes every `projectScanEvent` whose parent scan belonged to the deleted drive (keyed via `event.scanId` → `scan.id` → `scan.driveId`).
- Removes every `scanSession` whose `requestedDriveId` matches. The session's embedded `projects` array goes with it (this is the `scan_session_projects` analog on the non-SQLite backends).
- **Sessions with `requestedDriveId === null` are preserved.** They were not tied to any drive; they are not swept up.
- No-op when the driveId does not exist.

### Spec location

`packages/data/src/cascadeDelete.ts` — pure snapshot transforms (`applyProjectDeleteToSnapshot`, `applyDriveDeleteToSnapshot`) with an extensive header comment documenting every bullet above.

### Enforcement

- `InMemoryLocalPersistence` and `StorageLocalPersistence` delegate `deleteProject` / `deleteDrive` directly to the `cascadeDelete.ts` helpers.
- `SqliteLocalPersistence` uses raw SQL (efficiency: no snapshot marshalling across the IPC boundary) but is locked to the same behavior by the contract test.
- `packages/data/src/localPersistenceContract.ts` runs the identical `deleteDrive` / `deleteProject` fixture suite against all three adapters. A divergence anywhere surfaces immediately.

### Change protocol

Any change to cascade behavior must:
1. Update `cascadeDelete.ts` (spec + header comment).
2. Update the SQLite raw SQL in `sqliteLocalPersistence.ts`.
3. Update the contract-test fixture in `localPersistenceContract.ts`.
4. Update this file.

---

## 2. SQLite `PRAGMA foreign_keys = ON` is a no-op (Pass 8)

### What is locked

The pragma is intentionally executed on database open but performs no enforcement work because the SQLite schema declares **no** `REFERENCES` clauses. It is kept so that a future FK migration can be single-diff (add `REFERENCES`, remove the comment). It is not load-bearing.

Real relational integrity for cascade operations is provided by `cascadeDelete.ts` + the contract test + remote Postgres FK rejection (the remote schema does declare FKs).

### Spec location

`packages/data/src/sqliteLocalPersistence.ts` — multi-line comment block immediately preceding the `database.execute("PRAGMA foreign_keys = ON")` call.

### Enforcement

- Presence of the comment.
- The LocalPersistenceAdapter contract test verifies cascade correctness without any FK support.
- A future pass that enables real FK enforcement will fail the existing test suite if cascade order is wrong, because the tests assume programmatic cascade, not FK-driven cascade.

### Change protocol

A future FK migration must:
1. Add `REFERENCES ... ON DELETE CASCADE` (or equivalent) to the SQLite schema.
2. Remove or update the comment.
3. Add a test that fails if the pragma is accidentally set to OFF.
4. Verify the programmatic cascade in `cascadeDelete.ts` does not double-delete rows the FK chain already handled.
5. Update this file.

---

## 3. Three-backend LocalPersistenceAdapter contract

### What is locked

Three adapters implement `LocalPersistenceAdapter` with identical observable behavior:

- `SqliteLocalPersistence` — desktop production, backed by the Tauri SQL plugin.
- `StorageLocalPersistence` — fallback when `localStorage` is available but Tauri is not (primarily the `pnpm dev:frontend` dev shortcut that runs Vite alone).
- `InMemoryLocalPersistence` — test-only fallback.

All three must pass:
- `readSnapshot` / `replaceSnapshot` atomic semantics.
- `list*` and `get*ById` query shapes.
- `upsert*` insert-or-update semantics for drives, projects, scans, `projectScanEvents`, and `scanSessions`.
- Cascade delete semantics (see §1).

### Spec location

- `packages/data/src/localPersistence.ts` — the `LocalPersistenceAdapter` TypeScript interface and `CatalogSnapshot` shape.
- `packages/data/src/localPersistenceContract.ts` — the shared test suite (`describeLocalPersistenceContract`) with a deterministic `buildContractFixture`.

### Enforcement

Each adapter's own `*.test.ts` file calls `describeLocalPersistenceContract(name, factory)` with a fresh fixture seed. All three must stay green:

- `packages/data/src/inMemoryLocalPersistence.test.ts`
- `packages/data/src/storageLocalPersistence.test.ts`
- `packages/data/src/sqliteLocalPersistence.test.ts`

### Change protocol

Adding or changing adapter-contract behavior requires updating all three adapters in the same diff plus the contract test fixture, or explicitly removing a backend with its own deletion pass (which must also update the `catalogRepository.ts` fallback ladder and this file).

---

## 4. Remote sync merge semantics (remoteSyncMerge + supabaseSyncMapping)

### What is locked

Remote-pull merges apply Supabase rows onto the local catalog snapshot under the following rules (tests in `remoteSyncMerge.test.ts` are the authoritative spec):

- Remote rows win by `updated_at` (monotonic timestamp compare).
- Local rows whose remote counterpart is absent remain present (pull is not destructive).
- Cursor pagination follows `updated_at`-ordered cursors; the sync adapter persists the last-seen cursor so subsequent pulls are incremental.
- Mapping between local and remote shapes is lossless where applicable, with explicit adapters for fields that differ (e.g., nullable vs required).

### Spec location

- `packages/data/src/remoteSyncMerge.ts`
- `packages/data/src/supabaseSyncMapping.ts`

### Enforcement

- `packages/data/src/remoteSyncMerge.test.ts` (13 tests)
- `packages/data/src/supabaseSyncMapping.test.ts` (11 tests)
- `packages/data/src/supabaseSyncAdapter.test.ts` (12 tests)

### Change protocol

Merge semantics changes must be traced through all three test files plus any consumer (queue/adapter) that depends on them. Cursor-pagination format changes additionally require a migration story for in-flight saved cursors.

---

## 5. Sync queue and retry behavior

### What is locked

- Failed sync operations stay in the queue and are surfaced in the UI as retryable.
- The queue persists across app restarts.
- Sync is fully optional: the app remains usable in local-first mode when `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing or invalid.
- Placeholder Supabase values (`https://your-project.supabase.co`, `your-supabase-anon-key`) are detected and treated as disabled rather than broken.

### Spec location

- `packages/data/src/syncQueue.ts` — queue shape and retry logic.
- `apps/desktop/src/app/syncConfig.ts` — `resolveSupabaseSyncConfig` diagnostics.

### Enforcement

- `packages/data/src/syncQueue.test.ts` (15 tests)
- `apps/desktop/src/app/syncConfig.test.ts` (4 tests including the placeholder case)

### Change protocol

Any change to queue persistence, retry semantics, or placeholder detection must keep existing tests green or be accompanied by test updates that explicitly document the new behavior.

---

## 6. Scan ingestion semantics

### What is locked

- Scans produce `ScanSessionSnapshot` entries with `projects` array, `foldersScanned`, `matchesFound`, `sizeJobsPending`, `summary`, and status transitions.
- Ingestion deduplicates matches by folder path within a session.
- Missing/duplicate/move-status derivations come from the domain status module, not from ad-hoc UI logic.

### Spec location

- `packages/data/src/scanIngestionService.ts`
- `packages/domain/src/status.ts`
- `packages/domain/src/folderClassifier.ts`

### Enforcement

- `packages/data/src/scanIngestionService.test.ts` (27 tests)
- `packages/data/src/scanSnapshotSchema.test.ts` (19 tests)
- `packages/domain/src/status.test.ts` (15 tests)
- `packages/domain/src/folderClassifier.test.ts` (13 tests)

### Change protocol

Behavior changes must flow through the scan ingestion tests + the snapshot schema tests. Any new `ScanSessionSnapshot` field must be reflected in the contract-test fixture (`buildContractFixture`) so all three local-persistence backends round-trip it.

---

## 7. Runtime platform detection

### What is locked

The single source of truth for "is this running in the Tauri desktop shell" is:

```ts
typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
```

This is used in two places:
- `apps/desktop/src/app/syncConfig.ts` — runtime diagnostics message.
- `apps/desktop/src/app/catalogRepository.ts` — fallback ladder selection (SQLite → Storage → InMemory).
- `apps/desktop/src/app/scanCommands.ts` — `isDesktopScanAvailable()` (used across ~6 scan-command call sites + UI).

### Spec location

Call sites listed above. The detection logic is duplicated because each file needs to answer the question at a different lifecycle stage; unifying would create an import-order hazard (syncConfig is imported by catalogRepository).

### Enforcement

- `apps/desktop/src/app/catalogActions.test.ts` mocks `isDesktopScanAvailable` to verify the non-desktop fallback path.
- The UI copy in `DesktopScanPanel.tsx` exercises the `!isDesktopScanAvailable` branch visually.

### Change protocol

Changing the detection mechanism (e.g., to a different runtime marker) requires updating every call site in the same diff. Adding a fourth runtime target requires re-examining the three-backend contract in §3.

---

## 8. macOS-first scope (Phase 1)

### What is locked

- The product is the macOS Tauri desktop app. Web and mobile companion surfaces are out of scope for the current build.
- No web-release documentation, scripts, or UI copy exists. `WEB_RELEASE.md` was deleted; `dev:web` / `build:web` scripts were renamed to `dev:frontend` / `build:frontend` (they are Tauri's internal Vite build, not a web-app deliverable).
- The local-first / sync boundary is preserved so future companion surfaces remain possible without re-architecting the catalog, but this is not a current commitment.

### Spec location

- `README.md`, `ARCHITECTURE.md` §1, `PRODUCT_SPEC.md` §14, `CODEX_MASTER_PROMPT.md` Platforms section.
- `apps/desktop/src-tauri/tauri.conf.json` — `beforeDevCommand` / `beforeBuildCommand` point to the renamed scripts.

### Enforcement

- A repo-wide grep for `WEB_RELEASE|build:web|dev:web|public web|free public release|web release|web deployment|web build` must return no matches.
- The renamed scripts in `apps/desktop/package.json` must match the Tauri `beforeDevCommand` / `beforeBuildCommand`.

### Change protocol

Reopening web or mobile surfaces requires a deliberate product decision that updates the platform section across all four docs, not a drive-by change to a single file. The three-backend adapter contract (§3) is the architectural seam that keeps future companion surfaces possible — do not weaken it casually.

---

## 9. Pass 1–6 hardening (summary cross-reference)

The early passes predate this document and are not re-derived here. Their effect lives in:

- The cross-adapter contract test (§3) — locked down during the early passes as the primary regression-catching mechanism.
- `cascadeDelete.ts` (§1) — Pass 7 extracted the cascade spec so it could not drift between adapters.
- The tests in `packages/data/src/` with ≥ 10 tests each — each such file corresponds to a hardened subsystem.

If a future pass proposes a structural change to any of these subsystems, it should either cite the original pass's decision or argue why the prior decision is no longer binding.

---

## Change log

| Pass | Date | Change |
|---|---|---|
| 7 | earlier | Extracted `cascadeDelete.ts` pure snapshot transforms; added `localPersistenceContract.ts` three-way contract test. |
| 8 | earlier | Added doc comment at `PRAGMA foreign_keys = ON` documenting it as a no-op; rejected FK migration under the decision rule. |
| Phase 1 | 2026-04-17 | macOS-first doc/config/UI pivot; removed web-release framing; renamed `dev:web`/`build:web` → `dev:frontend`/`build:frontend`. |
| Phase 2 | 2026-04-17 | Created this file. No behavior change. |
