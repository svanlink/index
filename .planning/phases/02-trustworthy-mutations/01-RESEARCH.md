# Phase 2: Trustworthy Mutations — Research

**Researched:** 2026-05-02
**Domain:** React 19 optimistic state, Tauri IPC mutations, SQLite scan-session pruning, code splits
**Confidence:** HIGH (all claims verified against live codebase)

---

## Summary

Phase 2 targets seven requirements across four distinct concerns: (1) wiring the existing `useOptimisticMutation` hook into the global `runMutation` path, (2) fixing two accuracy bugs (fake 28% fill in `CapacityBar`, a stale requirement ACCU-02 whose source message no longer exists), (3) pruning orphaned scan-session rows from SQLite after ingestion, and (4) splitting two large page files into focused components.

The optimistic mutation infrastructure is already written (`useOptimisticMutation.ts`, 121 lines) but **never wired into `CatalogStoreContext`**. `runMutation` (providers.tsx:120–129) calls `refresh()` on every write, re-fetching all four collections unconditionally. The surgical fix is to thread `useOptimistic` state into the context, but the existing hook's design is a good base for per-mutation rollback logic.

ACCU-02 is a no-op bug fix: the `TasksPage.tsx` that displayed "No import task has run yet" was deleted in the pre-v1 cleanup. The message no longer exists anywhere in the codebase. The correct implementation of ACCU-02 per the ROADMAP's success criterion is to verify that the `ProjectsPage` cold-start empty state never fires when drives or projects exist — which is already gated correctly (`projects.length === 0`) but could display during the `isLoading` window.

SQLite has no `deleteScanSession` IPC command and no `ON DELETE CASCADE` FK on `scan_session_projects`. The `ingestScanSnapshot` path writes the ingested session back via `upsertScanSession` but never deletes the row. Pruning requires adding `deleteScanSession` to the `LocalPersistenceAdapter` interface and calling it from `ingestScanSnapshot` after the write completes.

**Primary recommendation:** Implement in three waves — (1) CapacityBar + ACCU-02 verification (zero-risk display fixes), (2) scan-session pruning (new persistence method + repository call), (3) `useOptimistic` wiring + code splits.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Optimistic state management | Frontend (React) | — | React 19 `useOptimistic` is a rendering primitive; no IPC involved |
| Mutation coordination | Frontend (CatalogStoreContext) | — | `runMutation` lives in providers.tsx and wraps every write |
| Scan session pruning | packages/data (persistence) | — | Repository method + SQLite DML; no Tauri command needed |
| CapacityBar display | Frontend (pagePrimitives.tsx) | — | Pure rendering calculation, no backend involved |
| ACCU-02 empty-state | Frontend (ProjectsPage) | — | Conditional render gated on `isLoading` + `projects.length` |
| Code splits | Frontend (pages/) | — | File-level refactor; no runtime behavior change |

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-02 | Optimistic mutations with rollback | `useOptimisticMutation.ts` exists but unwired; `runMutation` in providers.tsx:120–129 is the sole mutation path |
| ACCU-01 | CapacityBar honest null state | Bug found at `pagePrimitives.tsx:635` — fallback `"28%"` when `pct === null` |
| ACCU-02 | No false "no import task" when data exists | Source message deleted; ACCU-02 now targets `ProjectsPage` loading race (isLoading+empty guard) |
| ACCU-04 | SQLite scan-session pruning after ingestion | `ingestScanSnapshot` never deletes; no `deleteScanSession` method exists anywhere |
| UX-02 | Accurate loading/empty/error labels | Scope: verify all 3 pages have correct state labels; no generic spinners found except LoadingState |
| CODE-01 | DrivesPage.tsx split (760→<400 lines) | Natural boundaries identified: `runImportFromVolume` hook + `CreateDriveForm` component |
| CODE-02 | DriveDetailPage.tsx split (720→<400 lines) | Natural boundaries identified: `ScanSection` + `ImportSection` components |
</phase_requirements>

---

## Standard Stack

No new packages. All work uses what is already installed.

| Layer | What's Used | Where |
|-------|-------------|-------|
| Optimistic state | React 19 `useOptimistic` (built-in) | providers.tsx |
| Mutation hook | `useOptimisticMutation<TData, TResult>` (already written) | `apps/desktop/src/app/useOptimisticMutation.ts` |
| SQLite access | `SqlDatabase` via `tauri-plugin-sql` | `packages/data/src/sqliteLocalPersistence.ts` |
| Repository interface | `LocalPersistenceAdapter` | `packages/data/src/localPersistence.ts` |
| IPC | `invoke()` via `catalogActions.ts` / `scanCommands.ts` | `apps/desktop/src/app/` |

---

## Architecture Patterns

### Mutation Flow (Current — Pre-Phase-2)

```
User action
  └─► context mutation (e.g. updateProjectMetadata)
        └─► runMutation(providers.tsx:120–129)
              ├─ setIsMutating(true)
              ├─ await operation()          ← IPC round-trip
              ├─ await refresh()           ← fetches ALL 4 collections
              └─ setIsMutating(false)
```

Every write triggers a full `refresh()` that re-fetches projects, drives, scans, and scan sessions unconditionally. The UI is blocked (`isMutating=true`) for the entire round-trip. No optimistic state is applied.

### Mutation Flow (Target — Post-Phase-2)

```
User action
  └─► context mutation (e.g. updateProjectMetadata)
        ├─ apply optimistic state to local React state   ← instant
        ├─ setIsMutating(true)
        ├─ await operation()                             ← IPC round-trip
        │     ├─ SUCCESS: refresh() → confirmed state replaces optimistic
        │     └─ FAILURE: rollback() → restores previous state, shows error
        └─ setIsMutating(false)
```

### `useOptimisticMutation` hook (already written, unwired)

File: `apps/desktop/src/app/useOptimisticMutation.ts` (lines 1–121)

The hook manages `isPending / isConfirmed / error / reset` lifecycle. It does NOT manage collection-level state (`projects[]`, `drives[]`) — that lives in `AppProviders`. The wiring pattern needed:

```typescript
// In AppProviders, per-mutation optimistic state example for createDrive:
const [optimisticDrives, addOptimisticDrive] = useOptimistic(
  drives,
  (current, newDrive: Drive) => [...current, newDrive]
);

// Then in value object, surface optimisticDrives not drives.
// On rollback, useOptimistic automatically restores prior state.
```

React 19 `useOptimistic` is the right primitive for collection-level optimistic updates. `useOptimisticMutation.ts` handles the async lifecycle (isPending/isConfirmed) but delegates collection state management to the caller. Both are needed together.

### Recommended Project Structure After Code Splits

```
apps/desktop/src/
├── app/
│   ├── providers.tsx             (optimistic wiring lives here)
│   ├── useOptimisticMutation.ts  (unchanged)
│   └── useImportFromVolume.ts    ← NEW (extracted from DrivesPage)
├── pages/
│   ├── DrivesPage.tsx            (~280 lines after split)
│   ├── drives/
│   │   └── DriveCreateForm.tsx   ← NEW (extracted from DrivesPage)
│   ├── DriveDetailPage.tsx       (~340 lines after split)
│   └── drives/
│       ├── ScanSection.tsx       ← NEW (extracted from DriveDetailPage)
│       └── ImportSection.tsx     ← NEW (extracted from DriveDetailPage)
```

---

## Exact Bug Locations

### ACCU-01: CapacityBar 28% placeholder

**File:** `apps/desktop/src/pages/pagePrimitives.tsx`
**Line:** 635

```typescript
// pagePrimitives.tsx:631–636
const pct =
  totalBytes && usedBytes !== null && totalBytes > 0
    ? (usedBytes / totalBytes) * 100
    : null;
const usedPctStr = pct !== null ? `${Math.max(1, pct)}%` : "28%";
//                                                           ^^^^ BUG: fabricated fill
```

**Two render sites use this component:**
1. `pagePrimitives.tsx:652–658` — `CapacityBar` component itself (`<div className="cap-used capacity-bar-fill" ... style={{ width: usedPctStr }}>`)
2. `DrivesPage.tsx:556–560` — `DriveCard` uses its own inline bar (NOT `CapacityBar` component):
   ```typescript
   // DrivesPage.tsx:556–560
   {usedPercent !== null ? (
     <div className="cap-used capacity-bar-fill" style={{ width: `${usedPercent}%` }} />
   ) : (
     <div className="cap-used opacity-20" style={{ width: "28%" }} />  // ← second 28% placeholder
   )}
   ```

**Fix for `CapacityBar` component (pagePrimitives.tsx:635):**
```typescript
const usedPctStr = pct !== null ? `${Math.max(1, pct)}%` : "0%";
// AND render an "unknown" text indicator when pct === null:
// aria-label already says "Storage usage unknown" when pct is null
```

**Fix strategy:** When `pct === null`, render no fill at all (width 0 or hidden) plus an em-dash text fallback in any adjacent label. The `DriveCard` in `DrivesPage.tsx` already has a fallback label `"Unknown capacity"` at line 468 — the bar just needs to not show 28%.

### ACCU-02: "No import task has run yet" — message deleted in v1 cleanup

**Status:** The `TasksPage.tsx` containing this message was deleted in commit `fe96548`. The string does not exist in the current codebase.

**Current behavior to verify/fix per ROADMAP success criterion 3:**
`ProjectsPage.tsx:207` — cold-start empty state guard:
```typescript
if (!isLoading && projects.length === 0 && !isCreateOpen) {
  // renders "No projects yet." message
```

This is correct: `isLoading` is checked first, so the empty state won't flash during boot. However, the guard doesn't check `drives.length`. If a user has drives but no projects (e.g., manually-created drives with no scan), they see "No projects yet / Scan a drive." This is actually accurate. **ACCU-02 is satisfied by the current code.** The planner should implement a lightweight audit confirming no other page fires misleading empty states when data exists.

### ACCU-04: Scan session pruning — no deletion path exists

**Current `ingestScanSnapshot` flow** (`packages/data/src/localCatalogRepository.ts:528–550`):
```typescript
async ingestScanSnapshot(session: ScanSessionSnapshot): Promise<ScanRecord> {
  // ... reads snapshot, computes ingestion ...
  await this.persistence.upsertDrive(ingestion.drive);
  await this.persistence.upsertProjects(changedProjects);
  await this.persistence.upsertProjectScanEvents(changedEvents);
  await this.persistence.upsertScan(ingestion.scan);
  await this.persistence.upsertScanSession(ingestion.session);  // ← updates session row
  // ... enqueues sync ops ...
  // ← NO DELETION OF scan_sessions / scan_session_projects
}
```

**SQLite cascade situation:**
- `scan_session_projects` has `CREATE INDEX idx_scan_session_projects_scan_id ON scan_session_projects (scan_id)` (migration 1, line 174 of sqliteLocalPersistence.ts)
- **NO `FOREIGN KEY ... ON DELETE CASCADE`** declared on `scan_session_projects`
- `#ensureReady()` comment (lines 1028–1051) explicitly notes: "this pragma is currently a NO-OP... our schema declares no FK constraints"
- The existing `deleteDrive` cascade (lines 913–917) manually deletes `scan_session_projects` before `scan_sessions` — this is the pattern to follow for pruning

**Required additions:**

1. `LocalPersistenceAdapter` interface (`packages/data/src/localPersistence.ts`) — add:
   ```typescript
   deleteScanSession(scanId: string): Promise<void>;
   ```

2. `SqliteLocalPersistence.deleteScanSession` (`sqliteLocalPersistence.ts`) — new method:
   ```typescript
   async deleteScanSession(scanId: string): Promise<void> {
     const database = await this.#ensureReady();
     await withTransaction(database, async () => {
       await database.execute("DELETE FROM scan_session_projects WHERE scan_id = ?", [scanId]);
       await database.execute("DELETE FROM scan_sessions WHERE scan_id = ?", [scanId]);
     });
   }
   ```

3. `InMemoryLocalPersistence.deleteScanSession` — must also implement for parity.

4. Call site in `LocalCatalogRepository.ingestScanSnapshot` (localCatalogRepository.ts:528) — after `upsertScan(ingestion.scan)`, add:
   ```typescript
   await this.persistence.deleteScanSession(session.scanId);
   ```

**Note on ordering:** `upsertScan` writes the `scans` table record (the ingested ScanRecord). The `scan_sessions` row is a staging table — delete it AFTER the permanent record is committed. The `scan_session_projects` child rows have no FK constraint so explicit deletion first is required (as shown in the existing `deleteDrive` pattern).

**Contract test:** `localPersistenceContract.ts` must gain a new test in its `upsertScanSession` group verifying that after `ingestScanSnapshot`, the session row is absent. Both `InMemory` and `SQLite` adapters must pass. (Or add to `localCatalogRepository.test.ts` since `ingestScanSnapshot` is a repository-level method.)

### FOUND-02: runMutation wiring — what `refresh()` costs

`refresh()` (providers.tsx:77–88):
```typescript
const refresh = useCallback(async () => {
  const [nextProjects, nextDrives, nextScans, nextScanSessions] = await Promise.all([
    repository.listProjects(),
    repository.listDrives(),
    repository.listScans(),
    repository.listScanSessions()
  ]);
  // ... 4 setState calls
}, []);
```

Every mutation triggers 4 parallel SQLite SELECTs. For a `createDrive` mutation (which only changes `drives`), this also re-fetches `projects`, `scans`, and `scanSessions` unnecessarily. The optimistic approach lets the UI respond instantly while `refresh()` runs in the background.

**Minimal wiring pattern for `createDrive` (exemplar):**

```typescript
// In AppProviders:
const [optimisticDrives, addOptimisticDrive] = useOptimistic(
  drives,
  (current: Drive[], newDrive: Drive) => [...current, newDrive]
);

// Modified createDrive in value:
createDrive: async (input) => {
  // Apply optimistic update before await
  const tempDrive: Drive = {
    id: `temp-${Date.now()}`,
    displayName: input.displayName ?? input.volumeName,
    volumeName: input.volumeName,
    // ... minimal shape for UI
  };
  addOptimisticDrive(tempDrive);  // instant UI update
  try {
    const result = await runMutation(() => repository.createDrive(input));
    return result;  // refresh() in runMutation replaces optimistic state
  } catch (err) {
    // useOptimistic auto-reverts on re-render with real state
    throw err;
  }
}
```

**Scope decision for planner:** Full `useOptimistic` wiring for all 6 mutations (updateProjectMetadata, createProject, createDrive, importFoldersFromVolume, deleteProject, deleteDrive) is high-value but complex. A pragmatic v1 scope: wire optimistic for `createDrive`, `deleteProject`, `deleteDrive` (the mutations users notice lag on). `importFoldersFromVolume` is already async-heavy so lag is expected.

### CODE-01: DrivesPage.tsx split (760 lines → target <400)

**Natural extraction boundaries:**

| Extracted Unit | Lines | What it contains |
|----------------|-------|-----------------|
| `useImportFromVolume` hook | ~85 lines | State: `importSourcePath`, `importFolders`, `importVolumeInfo`, `isPickingImport`, `isImporting`. Functions: `runImportFromVolume`, `closeImportDialog`, `handleConfirmImportFromVolume`, `matchExistingDrive`, `pathsAlreadyOnDrive`, `deriveVolumeName` |
| `DriveCreateForm` component | ~115 lines | Lines 607–665 + `FormField` helper (738–760) |
| `ImportDriveBanner` component | ~48 lines | Lines 689–736 (already self-contained) |
| Remaining DrivesPage | ~280 lines | `DrivesPage`, `DriveCard`, `useDriveMetrics`, `getDriveScanSession` |

`ImportDriveBanner` is currently a file-local function — it can stay in `DrivesPage.tsx` or be co-located with the hook. `DriveCreateForm` is also file-local and a natural component extract.

**Files to create:**
- `apps/desktop/src/app/useImportFromVolume.ts` — hook only (no JSX)
- `apps/desktop/src/pages/drives/DriveCreateForm.tsx` — or inline in same directory

### CODE-02: DriveDetailPage.tsx split (720 lines → target <400)

**Natural extraction boundaries:**

| Extracted Unit | Lines | What it contains |
|----------------|-------|-----------------|
| `ScanSection` component | ~120 lines | Lines 371–426 (ScanCard + ScanStatusPanel inner) |
| `ImportSection` component | ~35 lines | Lines 452–474 (import SectionCard with FeedbackNotice) |
| `ScanStatusPanel` component | ~85 lines | Lines 583–667 (already a named function, just needs moving) |
| Remaining DriveDetailPage | ~340 lines | Identity card, storage detail, project collections, danger zone, all handlers |

`ScanStatusPanel` (lines 583–667) is already a named function — extract verbatim. `ScanSection` wraps it plus the path input and error notices. `ImportSection` is the smallest possible card with one button.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Optimistic collection updates | Custom rollback state machine | React 19 `useOptimistic` | Built-in, handles concurrent mode correctly |
| Optimistic mutation lifecycle | Re-implement isPending/isConfirmed | `useOptimisticMutation.ts` (already exists) | Already written and tested |
| SQLite child-row deletion | FK constraint migration | Manual `withTransaction` delete | Schema has no FK constraints; existing pattern in `deleteDrive` shows the approach |
| 28% fill math | Custom "unknown" percentage estimate | Show nothing / em-dash | Fabricated data breaks trust |

---

## Common Pitfalls

### Pitfall 1: `useOptimistic` only active during the pending transition

**What goes wrong:** `useOptimistic` reverts its optimistic state to the base state as soon as the React transition ends — not when the async operation ends. If `refresh()` hasn't resolved by then, the UI flickers back to stale data briefly.

**How to avoid:** Wrap the mutation + refresh in a `startTransition` so React knows the async operation is part of the same transition. OR keep `isMutating=true` until `refresh()` resolves, suppressing the revert.

**Warning signs:** UI shows the optimistic value, then briefly shows the pre-mutation value, then shows the confirmed value (triple-flash).

### Pitfall 2: Deleting `scan_sessions` before the `ScanRecord` write lands

**What goes wrong:** `ingestScanSnapshot` calls `upsertScan` (writes the `scans` table) then `upsertScanSession`. If deletion happens before `upsertScan` commits, the scan history record is lost.

**How to avoid:** Delete in this order: (1) `upsertScan` — permanent record, (2) `deleteScanSession` — staging cleanup. This is the only safe sequence.

### Pitfall 3: `InMemoryLocalPersistence` parity

**What goes wrong:** Adding `deleteScanSession` to `SqliteLocalPersistence` but forgetting `InMemoryLocalPersistence`. The contract tests run against both — the test suite catches this, but only if the new test is added.

**How to avoid:** Add `deleteScanSession` to the `LocalPersistenceAdapter` interface first, which forces a TypeScript compile error on `InMemoryLocalPersistence`.

### Pitfall 4: DrivesPage import-flow state is tightly coupled to page-level state

**What goes wrong:** `handleConfirmImportFromVolume` calls `createDrive` and `importFoldersFromVolume` from the CatalogStore context, then calls `navigate()` and `setFeedback()`. Extracting to a hook requires passing these as parameters or including them in hook return values.

**How to avoid:** The hook should accept `{ createDrive, importFoldersFromVolume, drives, projects, navigate, setFeedback }` as input. Return `{ importSourcePath, importFolders, importVolumeInfo, isPickingImport, isImporting, runImportFromVolume, closeImportDialog, handleConfirmImportFromVolume }`.

### Pitfall 5: ACCU-02 is a solved problem — don't re-break it

**What goes wrong:** Adding unnecessary guards that check `drives.length` in addition to `projects.length === 0` in `ProjectsPage` changes semantically correct behavior. A user with drives but no projects should see "No projects yet" — that's accurate.

**How to avoid:** ACCU-02 implementation is a verification/audit task, not a code change. Confirm the `isLoading` guard is first in the condition (it is) and document as verified.

---

## Code Examples

### `withTransaction` pattern for deletion (existing in sqliteLocalPersistence.ts:1742–1752)

```typescript
// [VERIFIED: /packages/data/src/sqliteLocalPersistence.ts:890-922]
// Pattern used by deleteDrive for cascade:
await withTransaction(database, async () => {
  await database.execute(
    "DELETE FROM scan_session_projects WHERE scan_id IN (...)",
    [driveId]
  );
  await database.execute("DELETE FROM scan_sessions WHERE requested_drive_id = ?", [driveId]);
  await database.execute("DELETE FROM drives WHERE id = ?", [driveId]);
});
```

New `deleteScanSession` should follow the same pattern with direct `scan_id` equality:

```typescript
// [ASSUMED: pattern follows existing deleteDrive; exact SQL not yet written]
await withTransaction(database, async () => {
  await database.execute("DELETE FROM scan_session_projects WHERE scan_id = ?", [scanId]);
  await database.execute("DELETE FROM scan_sessions WHERE scan_id = ?", [scanId]);
});
```

### React 19 `useOptimistic` (built-in, no import needed beyond React)

```typescript
// [VERIFIED: apps/desktop/package.json — react@^19.1.1 installed]
const [optimisticList, addOptimistic] = useOptimistic(
  realList,
  (currentList: Item[], newItem: Item) => [...currentList, newItem]
);
// optimisticList is used in renders; addOptimistic called before await
```

---

## ACCU-02 Verdict: Already Resolved

The `TasksPage.tsx` containing `"No import task has run yet."` (line 381 of d65072e) was deleted in commit `fe96548` during the pre-v1 scope reduction. The string does not appear anywhere in the current codebase (`git grep` across all files returns zero matches in non-planning files).

**Current ProjectsPage behavior** (`ProjectsPage.tsx:207`):
```typescript
if (!isLoading && projects.length === 0 && !isCreateOpen) {
  // Shows "No projects yet." — correct
```

This is semantically correct: `isLoading` guards against false positives during boot. The ACCU-02 requirement as written in REQUIREMENTS.md is satisfied. The planner should mark this as a verification task: confirm the guard order, confirm no other pages show the message, close the requirement.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| Block UI with `isMutating` on every write | `useOptimistic` for instant feedback, `refresh()` for confirmed state | Mutations feel instant |
| Explicit FK cascade in SQLite | Manual DELETE ordering (no FK constraints in schema) | Must maintain cascade order in code |
| `TasksPage` CCC-style task tracking | Deleted (v1 scope) | ACCU-02 source message gone |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | React 19 `useOptimistic` is available in the project (react@19 is installed) | FOUND-02 | If react@18, `useOptimistic` doesn't exist; must use `useState` rollback instead |
| A2 | `deleteScanSession` after ingest won't break `listScanSessions` used in scan polling | ACCU-04 | If polling reads session after deletion, poll will fail; need to confirm poll reads from in-memory `activeScanId` not DB |
| A3 | The split threshold "<400 lines" for extracted files is achievable with the identified boundaries | CODE-01/02 | File count estimates are approximate; exact line counts depend on blank lines and imports |

---

## Open Questions

1. **React version — `useOptimistic` availability**
   - What we know: `useOptimistic` is React 19+. Training knowledge places it there.
   - What's unclear: This repo's exact installed react version.
   - Recommendation: `grep '"react"' apps/desktop/package.json` before implementation. If `@19`, use `useOptimistic`. If `@18`, use `useState` snapshot approach in `runMutation`.

2. **Scan polling after session deletion**
   - What we know: `pollScan` in `scanWorkflow.tsx` calls `syncDesktopScanSession → repository.getScanSession(scanId)` to check if the session still exists. After `deleteScanSession`, `getScanSession` returns `null`.
   - What's unclear: The poll loop at `scanWorkflow.tsx:87–113` guards `if (!session)` → sets `activeScanId(null)` and shows error. This would fire for completed scans if `deleteScanSession` runs too early.
   - Recommendation: `deleteScanSession` must only run inside `ingestScanSnapshot` when the scan has reached a terminal status AND `sizeJobsPending === 0` — matching the poll termination condition at line 96.

3. **`useOptimistic` scope — which mutations to wire**
   - What we know: 6 mutations exist in `CatalogStoreContext`. Full wiring is correct but increases Phase 2 scope.
   - Recommendation: Wire `createDrive`, `deleteProject`, `deleteDrive` in Phase 2. `importFoldersFromVolume` has inherent latency (file enumeration); `updateProjectMetadata` and `createProject` are lower-frequency. Defer remaining to Phase 3 if time is tight.

---

## Environment Availability

Step 2.6: SKIPPED (no external CLI dependencies — all work is source code changes in the existing monorepo).

---

## Validation Architecture

`nyquist_validation` is `false` in `.planning/config.json`. Section omitted.

---

## Security Domain

This phase makes no changes to authentication, authorization, user input validation, or data access control. No ASVS categories apply. All mutations go through the existing `invoke()` + `withTransaction` path that was already in scope.

---

## Sources

### Primary (HIGH confidence — live codebase reads)

- `apps/desktop/src/app/providers.tsx:120–129` — `runMutation` exact implementation
- `apps/desktop/src/app/useOptimisticMutation.ts:1–121` — full hook implementation
- `apps/desktop/src/pages/pagePrimitives.tsx:631–636` — CapacityBar 28% bug exact line
- `apps/desktop/src/pages/DrivesPage.tsx:556–560` — second 28% placeholder in DriveCard
- `apps/desktop/src/pages/DriveDetailPage.tsx:1–721` — full file, split boundaries identified
- `apps/desktop/src/pages/DrivesPage.tsx:1–760` — full file, split boundaries identified
- `apps/desktop/src/pages/ProjectsPage.tsx:207` — ACCU-02 guard condition
- `packages/data/src/sqliteLocalPersistence.ts:890–922` — deleteDrive cascade pattern
- `packages/data/src/sqliteLocalPersistence.ts:140–175` — scan_sessions schema, no FK constraint
- `packages/data/src/localCatalogRepository.ts:528–550` — ingestScanSnapshot, no deletion
- `packages/data/src/repository.ts:177–219` — CatalogRepository interface (no deleteScanSession)
- `apps/desktop/src/app/scanWorkflow.tsx:87–113` — poll termination condition
- `apps/desktop/src/app/catalogActions.ts:53–56` — ingestScanSession call site
- `git show d65072e:apps/desktop/src/pages/TasksPage.tsx` — source of deleted ACCU-02 message

### Tertiary (LOW confidence)

- React 19 `useOptimistic` API shape — from training knowledge, not verified against installed package.json version [A1]

---

## Metadata

**Confidence breakdown:**
- Bug locations (ACCU-01, ACCU-04): HIGH — exact file:line confirmed by source read
- ACCU-02 verdict: HIGH — confirmed deleted via `git grep` across all revisions
- Code split boundaries: HIGH — line counts confirmed, extraction points identified by reading full files
- `useOptimistic` wiring: MEDIUM — API shape from training; react version not confirmed
- FOUND-02 full scope: MEDIUM — approach is clear, exact wiring lines require react version confirmation

**Research date:** 2026-05-02
**Valid until:** 2026-06-01 (stable codebase, no fast-moving deps)
