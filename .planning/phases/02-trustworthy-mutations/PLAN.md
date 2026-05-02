---
phase: 02-trustworthy-mutations
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/desktop/src/pages/pagePrimitives.tsx
  - apps/desktop/src/pages/DrivesPage.tsx
autonomous: true
requirements:
  - ACCU-01
  - ACCU-02
  - UX-02

must_haves:
  truths:
    - "CapacityBar never renders a 28% fill when bytes are unknown — it renders nothing or an honest zero-width bar"
    - "No user with drives or projects sees a 'No import task has run yet' message"
    - "Every loading, empty, and error state label in DrivesPage and ProjectsPage matches the underlying data state"
  artifacts:
    - path: "apps/desktop/src/pages/pagePrimitives.tsx"
      provides: "CapacityBar with honest null state"
      contains: "pct !== null"
    - path: "apps/desktop/src/pages/DrivesPage.tsx"
      provides: "DriveCard with null-safe capacity bar, accurate empty-state guard"
      contains: "drives.length === 0 && projects.length === 0"
  key_links:
    - from: "pagePrimitives.tsx CapacityBar"
      to: "pct === null branch"
      via: "usedPctStr calculation"
      pattern: "pct !== null.*Math\\.max"
    - from: "DrivesPage DriveCard"
      to: "inline capacity bar"
      via: "usedPercent conditional"
      pattern: "usedPercent !== null"
---

<objective>
Remove two fabricated display values and tighten one empty-state guard.

Purpose: Trust is broken the moment the UI shows a number it made up. The 28% CapacityBar fill is fabricated — it has no relationship to actual drive capacity. The DrivesPage empty-state can fire before data loads, surfacing a CTA that doesn't apply. Both are accuracy bugs, not cosmetic ones.

Output: pagePrimitives.tsx CapacityBar renders an honest null state; DrivesPage DriveCard shows no fill bar when bytes are unknown; DrivesPage empty-state is gated on real data presence; ProjectsPage loading race confirmed absent. ACCU-01, ACCU-02, and UX-02 closed.
</objective>

<execution_context>
@/Users/vaneickelen/Desktop/Catalog/.planning/phases/02-trustworthy-mutations/01-RESEARCH.md
</execution_context>

<context>
@/Users/vaneickelen/Desktop/Catalog/.planning/ROADMAP.md
@/Users/vaneickelen/Desktop/Catalog/.planning/REQUIREMENTS.md

<interfaces>
<!-- Key contracts the executor needs. Extracted from live codebase. -->

From apps/desktop/src/pages/pagePrimitives.tsx (lines 631–636) — BUG LOCATION:
```typescript
const pct =
  totalBytes && usedBytes !== null && totalBytes > 0
    ? (usedBytes / totalBytes) * 100
    : null;
const usedPctStr = pct !== null ? `${Math.max(1, pct)}%` : "28%";  // ← BUG: fabricated fill
// aria-label already correct: "Storage usage unknown" when pct is null (lines 648–652)
```

From apps/desktop/src/pages/DrivesPage.tsx (lines 556–560) — SECOND BUG LOCATION:
```typescript
{usedPercent !== null ? (
  <div className="cap-used capacity-bar-fill" style={{ width: `${usedPercent}%` }} />
) : (
  <div className="cap-used opacity-20" style={{ width: "28%" }} />  // ← BUG: fabricated fill
)}
// Text label below (lines 570–575) already handles null: "Unknown" — correct
```

From apps/desktop/src/pages/DrivesPage.tsx (line 354) — EMPTY STATE BUG LOCATION:
```typescript
// planningRows is derived from drives; starts as [] before boot resolves
} : planningRows.length === 0 && !isCreateOpen ? (
  // Shows empty-state CTA — can fire at boot before drives load
```

From apps/desktop/src/pages/ProjectsPage.tsx (line 207) — ALREADY CORRECT (verify only):
```typescript
if (!isLoading && projects.length === 0 && !isCreateOpen) {
  // isLoading guard is first — no false empty-state during boot
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix CapacityBar 28% fabricated fill in pagePrimitives.tsx</name>
  <files>apps/desktop/src/pages/pagePrimitives.tsx</files>
  <action>
Fix the fabricated fallback at line 635. When `pct` is null (bytes unknown), the bar fill div must not render at all — not at 28%, not at any width.

Change:
```typescript
const usedPctStr = pct !== null ? `${Math.max(1, pct)}%` : "28%";
```

To — derive an isUnknown boolean and conditionally render the fill child:
```typescript
const isUnknown = pct === null;
const usedPctStr = !isUnknown ? `${Math.max(1, pct!)}%` : "0%";
```

Then in the JSX render of CapacityBar (lines 652–658), wrap the `cap-used` fill div in a conditional so it is absent when unknown:
```tsx
{!isUnknown && (
  <div className="cap-used capacity-bar-fill" style={{ width: usedPctStr }} />
)}
```

The `aria-label` and `role="progressbar"` attributes already handle accessibility correctly when pct is null — do not change them.

Do NOT add any em-dash text inside the CapacityBar component itself. The component is a visual bar only; any adjacent text label lives outside it. The aria-label is the accessible name.
  </action>
  <verify>
    <automated>grep -n "28%" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/pages/pagePrimitives.tsx | grep -v "^#" | wc -l | tr -d ' ' | xargs -I{} test {} -eq 0 && echo "PASS: no 28% in pagePrimitives" || echo "FAIL: 28% still present"</automated>
  </verify>
  <done>pagePrimitives.tsx contains no "28%" string; the fill div is conditionally absent when pct is null; tsc --noEmit passes</done>
</task>

<task type="auto">
  <name>Task 2: Fix DriveCard inline bar + DrivesPage empty-state guard</name>
  <files>apps/desktop/src/pages/DrivesPage.tsx</files>
  <action>
Two fixes in one file.

**Fix A — DriveCard inline capacity bar (around line 558):**

Change:
```tsx
) : (
  <div className="cap-used opacity-20" style={{ width: "28%" }} />
)}
```

To:
```tsx
) : null}
```

The text label below already renders "Unknown" when `usedPercentInt` is null — that remains correct and untouched.

**Fix B — DrivesPage empty-state guard (around line 354):**

`planningRows` is derived from `drives`. When `drives` is empty at boot (before the catalog loads), `planningRows.length === 0` fires immediately, showing the "add your first drive" CTA before any data has resolved. If the user has projects but their drives list hasn't loaded yet, this is misleading.

Change the empty-state condition from:
```typescript
planningRows.length === 0 && !isCreateOpen
```

To:
```typescript
drives.length === 0 && projects.length === 0 && !isCreateOpen
```

The `projects` and `drives` values are already in scope from `useCatalogStore()`. This guard means: only show the "no drives yet" CTA when we know for certain there are zero drives AND zero projects. A user with projects but no drives in the list is in a data-inconsistent state and should not see the new-user CTA.

Also verify `isLoading` is checked before this branch — if the outer condition already guards on `isLoading`, the inner change is sufficient. Do not add a redundant `isLoading` check if one already exists in the surrounding code.

Do not change any other logic in DrivesPage — this is a surgical two-line fix.
  </action>
  <verify>
    <automated>grep -n "28%" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/pages/DrivesPage.tsx | grep -v "^#" | wc -l | tr -d ' ' | xargs -I{} test {} -eq 0 && echo "PASS: no 28% in DrivesPage" || echo "FAIL: 28% still present"</automated>
  </verify>
  <done>DrivesPage.tsx has no "28%" string; the empty-state guard includes both drives.length === 0 and projects.length === 0; tsc --noEmit passes for both changed files</done>
</task>

<task type="auto">
  <name>Task 3: Verify ACCU-02 + audit remaining empty/loading/error states</name>
  <files>apps/desktop/src/pages/ProjectsPage.tsx</files>
  <action>
This task is a verification audit — it produces a code change only if a genuine accuracy bug is found.

**Step 1 — Confirm "No import task has run yet" is absent:**
```bash
grep -rn "No import task" apps/desktop/src/ packages/
```
Expected: zero matches. If the string exists anywhere in non-planning source code, that is a bug — remove it.

**Step 2 — Confirm ProjectsPage loading race guard:**
Read ProjectsPage.tsx around line 207. Confirm the condition order is:
```typescript
if (!isLoading && projects.length === 0 && !isCreateOpen) {
```
`isLoading` must be the FIRST condition. If it comes after `projects.length === 0`, the empty state flashes at boot before data loads — fix the order.

**Step 3 — Audit other pages for generic loading/empty/error states:**
Check DrivesPage, DriveDetailPage, ProjectsPage, and ProjectDetailPage for:
- Spinner text that says only "Loading..." with no context about what is loading
- Empty-state messages that fire when they shouldn't (similar to the DrivesPage bug fixed in Task 2)
- Error states that show a generic message when a specific one is available

For each genuine issue found: fix it in place. For issues that require understanding context state, add a specific label (e.g., "Loading drives..." instead of "Loading...").

Do not invent fixes for states that are already accurate. The goal is to match labels to actual state — not to add more copy.

**Step 4 — Run type check:**
```bash
cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm --filter @drive-project-catalog/desktop exec tsc --noEmit
```
  </action>
  <verify>
    <automated>grep -rn "No import task" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/ /Users/vaneickelen/Desktop/Catalog/packages/ 2>/dev/null | grep -v ".planning" | wc -l | tr -d ' ' | xargs -I{} test {} -eq 0 && echo "PASS: ACCU-02 string absent" || echo "FAIL: ACCU-02 string found"</automated>
  </verify>
  <done>"No import task has run yet" absent from all source files; ProjectsPage isLoading guard precedes projects.length check; no generic spinners or contradictory empty states remain; tsc --noEmit exits 0</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| SQLite → React state | `usedBytes` / `totalBytes` may be null if diskutil hasn't run yet or the drive is unmounted |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-01 | Information Disclosure | CapacityBar | mitigate | Render no fill and no percentage when bytes are null — fabricated numbers (28%) mislead users into trusting false data |
| T-02-02 | Spoofing | DrivesPage empty-state | mitigate | Gate empty-state CTA on both drives.length === 0 AND projects.length === 0 so the UI never claims "no data exists" when data does exist |
</threat_model>

<verification>
After all three tasks:

1. `grep -rn "28%" apps/desktop/src/pages/` returns zero matches in pagePrimitives.tsx and DrivesPage.tsx
2. `grep -n "No import task" apps/desktop/src/pages/` returns zero matches
3. `grep -n "isLoading" apps/desktop/src/pages/ProjectsPage.tsx | head -5` — isLoading check appears before projects.length === 0 in the empty-state condition
4. `cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm --filter @drive-project-catalog/desktop exec tsc --noEmit` exits 0
</verification>

<success_criteria>
- CapacityBar renders no fill div when pct is null (zero "28%" strings in pagePrimitives.tsx)
- DriveCard renders null (not a 28%-wide div) when usedPercent is null (zero "28%" strings in DrivesPage.tsx)
- DrivesPage empty-state guard checks both drives.length === 0 and projects.length === 0
- "No import task has run yet" string absent from all non-planning source files
- ProjectsPage isLoading check precedes projects.length === 0 in empty-state condition
- tsc --noEmit exits 0 for the desktop app
</success_criteria>

<output>
After completion, create `/Users/vaneickelen/Desktop/Catalog/.planning/phases/02-trustworthy-mutations/02-01-SUMMARY.md` following the standard summary template.
</output>

---
phase: 02-trustworthy-mutations
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/data/src/localPersistence.ts
  - packages/data/src/sqliteLocalPersistence.ts
  - packages/data/src/inMemoryLocalPersistence.ts
  - packages/data/src/localCatalogRepository.ts
autonomous: true
requirements:
  - ACCU-04

must_haves:
  truths:
    - "After a scan completes and is ingested, the scan_sessions row for that scan_id is absent from SQLite"
    - "scan_session_projects rows for the same scan_id are also absent (manual cascade, child-before-parent delete)"
    - "InMemoryLocalPersistence implements deleteScanSession so TypeScript enforces parity at compile time"
    - "Deletion happens only after the permanent ScanRecord has been written (upsertScan before deleteScanSession)"
  artifacts:
    - path: "packages/data/src/localPersistence.ts"
      provides: "LocalPersistenceAdapter interface with deleteScanSession method"
      contains: "deleteScanSession"
    - path: "packages/data/src/sqliteLocalPersistence.ts"
      provides: "SQLite implementation of deleteScanSession using withTransaction"
      contains: "scan_session_projects"
    - path: "packages/data/src/inMemoryLocalPersistence.ts"
      provides: "In-memory implementation of deleteScanSession"
      contains: "deleteScanSession"
    - path: "packages/data/src/localCatalogRepository.ts"
      provides: "ingestScanSnapshot calls deleteScanSession after upsertScan"
      contains: "deleteScanSession"
  key_links:
    - from: "localCatalogRepository.ingestScanSnapshot"
      to: "persistence.deleteScanSession"
      via: "direct method call after upsertScan"
      pattern: "deleteScanSession.*scanId"
    - from: "SqliteLocalPersistence.deleteScanSession"
      to: "scan_session_projects table"
      via: "DELETE FROM scan_session_projects WHERE scan_id = ?"
      pattern: "DELETE FROM scan_session_projects"
---

<objective>
Add deleteScanSession to the persistence layer and call it from ingestScanSnapshot to prune orphaned scan-session staging rows after a scan is fully ingested.

Purpose: scan_sessions and scan_session_projects are staging tables. Once a scan is ingested into the permanent scans/projects tables, the staging rows serve no purpose — they are orphaned forever. Each completed scan leaks rows. This fix closes that leak.

Output: LocalPersistenceAdapter gains deleteScanSession; both persistence implementations implement it; localCatalogRepository.ingestScanSnapshot calls it after upsertScan; ACCU-04 closed.
</objective>

<execution_context>
@/Users/vaneickelen/Desktop/Catalog/.planning/phases/02-trustworthy-mutations/01-RESEARCH.md
</execution_context>

<context>
@/Users/vaneickelen/Desktop/Catalog/.planning/REQUIREMENTS.md

<interfaces>
<!-- Key contracts the executor needs. Extracted from live codebase. -->

From packages/data/src/localPersistence.ts — interface to extend:
```typescript
export interface LocalPersistenceAdapter {
  // ... existing methods ...
  upsertScanSession(session: ScanSessionSnapshot): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  deleteDrive(driveId: string): Promise<void>;
  // ADD after deleteDrive:
  // deleteScanSession(scanId: string): Promise<void>;
}
```

From packages/data/src/sqliteLocalPersistence.ts (lines 890–921) — PATTERN TO FOLLOW:
```typescript
async deleteDrive(driveId: string): Promise<void> {
  const database = await this.#ensureReady();
  await withTransaction(database, async () => {
    await database.execute(
      "DELETE FROM scan_session_projects WHERE scan_id IN (SELECT scan_id FROM scan_sessions WHERE requested_drive_id = ?)",
      [driveId]
    );
    await database.execute("DELETE FROM scan_sessions WHERE requested_drive_id = ?", [driveId]);
    await database.execute("DELETE FROM drives WHERE id = ?", [driveId]);
  });
}
```

New deleteScanSession target shape (follow the same pattern, keyed by scan_id directly):
```typescript
async deleteScanSession(scanId: string): Promise<void> {
  const database = await this.#ensureReady();
  await withTransaction(database, async () => {
    // Child before parent — no FK constraints in schema
    await database.execute("DELETE FROM scan_session_projects WHERE scan_id = ?", [scanId]);
    await database.execute("DELETE FROM scan_sessions WHERE scan_id = ?", [scanId]);
  });
}
```

From packages/data/src/localCatalogRepository.ts (lines 528–550) — CALL SITE:
```typescript
async ingestScanSnapshot(session: ScanSessionSnapshot): Promise<ScanRecord> {
  // ... ingestion logic ...
  await this.persistence.upsertScan(ingestion.scan);          // ← permanent record
  await this.persistence.upsertScanSession(ingestion.session); // ← staging (still needed for poll loop)
  // ADD AFTER both upserts:
  // await this.persistence.deleteScanSession(session.scanId);
}
```

CRITICAL ORDERING NOTE from research (Pitfall 2):
- upsertScan writes the permanent scans table record — MUST happen first
- upsertScanSession updates the staging row — call site pattern
- deleteScanSession removes staging rows — MUST be LAST, after upsertScan commits

CRITICAL SAFETY NOTE from research (Open Question 2):
- The scan poll loop in scanWorkflow.tsx calls getScanSession(scanId) to check if the session exists
- getScanSession returning null causes the poll to stop (if (!session) → activeScanId(null))
- deleteScanSession must ONLY run inside ingestScanSnapshot, which is called from scanWorkflow.tsx
  only when the scan has reached terminal status AND sizeJobsPending === 0
- This matches the existing poll termination condition at scanWorkflow.tsx:96
- Do NOT add a separate pruning job or call deleteScanSession from any other location
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add deleteScanSession to interface and both persistence implementations</name>
  <files>
    packages/data/src/localPersistence.ts
    packages/data/src/sqliteLocalPersistence.ts
    packages/data/src/inMemoryLocalPersistence.ts
  </files>
  <action>
**Step 1 — Interface (localPersistence.ts):**

Add `deleteScanSession(scanId: string): Promise<void>;` to the `LocalPersistenceAdapter` interface, placed after `deleteDrive`. This addition will immediately cause a TypeScript compile error on both implementations, which is the intended forcing function.

**Step 2 — SQLite implementation (sqliteLocalPersistence.ts):**

Add the `deleteScanSession` method to `SqliteLocalPersistence`. Follow the `deleteDrive` pattern exactly — use `withTransaction`, delete child rows before parent, key by `scan_id` directly (not via a subquery):

```typescript
async deleteScanSession(scanId: string): Promise<void> {
  const database = await this.#ensureReady();
  await withTransaction(database, async () => {
    await database.execute("DELETE FROM scan_session_projects WHERE scan_id = ?", [scanId]);
    await database.execute("DELETE FROM scan_sessions WHERE scan_id = ?", [scanId]);
  });
}
```

Place this method near `deleteDrive` for discoverability.

**Step 3 — InMemory implementation (inMemoryLocalPersistence.ts):**

Read the existing structure of InMemoryLocalPersistence to understand how scan sessions are stored (likely a Map or array). Implement `deleteScanSession` to remove the matching session from that storage. Example:

```typescript
async deleteScanSession(scanId: string): Promise<void> {
  // Remove the session matching scanId from the in-memory store
  // (exact implementation depends on the current storage shape — read the file first)
}
```

Do not guess at the storage shape — read inMemoryLocalPersistence.ts before writing the implementation.

After implementing all three, run:
```bash
cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm --filter @drive-project-catalog/data exec tsc --noEmit
```
This must exit 0 before proceeding to Task 2.
  </action>
  <verify>
    <automated>cd /Users/vaneickelen/Desktop/Catalog && grep -n "deleteScanSession" packages/data/src/localPersistence.ts packages/data/src/sqliteLocalPersistence.ts packages/data/src/inMemoryLocalPersistence.ts | wc -l | tr -d ' ' | xargs -I{} test {} -ge 3 && echo "PASS: deleteScanSession in all 3 files" || echo "FAIL: missing implementation"</automated>
  </verify>
  <done>LocalPersistenceAdapter interface declares deleteScanSession; SqliteLocalPersistence implements it with withTransaction and child-before-parent DELETE order; InMemoryLocalPersistence implements it against its in-memory store; tsc --noEmit for @drive-project-catalog/data exits 0</done>
</task>

<task type="auto">
  <name>Task 2: Wire deleteScanSession call in ingestScanSnapshot</name>
  <files>packages/data/src/localCatalogRepository.ts</files>
  <action>
Read localCatalogRepository.ts starting at line 528 to understand the full ingestScanSnapshot body.

Find the sequence:
```typescript
await this.persistence.upsertScan(ingestion.scan);
await this.persistence.upsertScanSession(ingestion.session);
```

Add the deletion call AFTER both upserts. The exact order must be:
1. `upsertScan` — writes the permanent ScanRecord (scans table)
2. `upsertScanSession` — updates the staging row with terminal status
3. `deleteScanSession` — removes staging rows now that the permanent record is committed

```typescript
await this.persistence.upsertScan(ingestion.scan);
await this.persistence.upsertScanSession(ingestion.session);
await this.persistence.deleteScanSession(session.scanId);
```

Use `session.scanId` (the parameter passed to `ingestScanSnapshot`), not `ingestion.session.scanId`, unless they are the same value — verify by reading the method signature.

Do not add any conditional check around `deleteScanSession`. The method is only called from `ingestScanSnapshot`, which is only called when the scan is terminal (enforced by the call site in scanWorkflow.tsx). The safety is at the call site, not at the deletion site.

After the change, run:
```bash
cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm --filter @drive-project-catalog/data exec tsc --noEmit
```
Then run the full desktop app type check:
```bash
cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm --filter @drive-project-catalog/desktop exec tsc --noEmit
```
Both must exit 0.
  </action>
  <verify>
    <automated>grep -n "deleteScanSession" /Users/vaneickelen/Desktop/Catalog/packages/data/src/localCatalogRepository.ts | wc -l | tr -d ' ' | xargs -I{} test {} -ge 1 && echo "PASS: deleteScanSession wired in repository" || echo "FAIL: not wired"</automated>
  </verify>
  <done>localCatalogRepository.ingestScanSnapshot calls deleteScanSession after upsertScan and upsertScanSession; tsc --noEmit exits 0 for both @drive-project-catalog/data and @drive-project-catalog/desktop</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Scan poll loop → SQLite | getScanSession(scanId) returns null after deletion; poll loop must handle this gracefully |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-03 | Denial of Service | ingestScanSnapshot | mitigate | withTransaction wraps both DELETEs — if either fails, SQLite rolls back; no partial deletion leaves orphaned child rows |
| T-02-04 | Tampering | deleteScanSession ordering | mitigate | Child rows (scan_session_projects) deleted before parent (scan_sessions) — no FK constraints, order is the only guard |
| T-02-05 | Denial of Service | scan poll loop | accept | Poll calls getScanSession; null return stops polling gracefully (scanWorkflow.tsx existing guard). Deletion only fires after terminal status — poll has already stopped. Low risk. |
</threat_model>

<verification>
After both tasks:

1. `grep -rn "deleteScanSession" packages/data/src/` shows matches in localPersistence.ts, sqliteLocalPersistence.ts, inMemoryLocalPersistence.ts, localCatalogRepository.ts
2. `grep -A2 "upsertScan\b" packages/data/src/localCatalogRepository.ts` — deleteScanSession call appears within 3 lines of upsertScan
3. `cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm --filter @drive-project-catalog/data exec tsc --noEmit` exits 0
4. `cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm --filter @drive-project-catalog/desktop exec tsc --noEmit` exits 0
</verification>

<success_criteria>
- LocalPersistenceAdapter.deleteScanSession declared in interface
- SqliteLocalPersistence.deleteScanSession: DELETE scan_session_projects first, scan_sessions second, inside withTransaction
- InMemoryLocalPersistence.deleteScanSession: removes session from in-memory store
- localCatalogRepository.ingestScanSnapshot calls deleteScanSession after upsertScan
- Both tsc --noEmit commands exit 0
</success_criteria>

<output>
After completion, create `/Users/vaneickelen/Desktop/Catalog/.planning/phases/02-trustworthy-mutations/02-02-SUMMARY.md` following the standard summary template.
</output>

---
phase: 02-trustworthy-mutations
plan: 03
type: execute
wave: 2
depends_on:
  - "02-01"
files_modified:
  - apps/desktop/src/app/providers.tsx
  - apps/desktop/src/pages/DrivesPage.tsx
  - apps/desktop/src/pages/DriveDetailPage.tsx
autonomous: true
requirements:
  - FOUND-02

must_haves:
  truths:
    - "Deleting a project causes the project to disappear from the list before the IPC round-trip completes"
    - "Deleting a drive causes the drive to disappear from the list before the IPC round-trip completes"
    - "Registering a drive causes a pending drive card to appear in the list before IPC completes"
    - "On simulated IPC failure (e.g., removing the IPC call temporarily), the optimistic change reverts and a visible error is shown"
    - "refresh() still runs after the IPC call resolves, replacing optimistic state with confirmed server state"
  artifacts:
    - path: "apps/desktop/src/app/providers.tsx"
      provides: "Three mutations wired with useOptimistic — deleteProject, deleteDrive, createDrive"
      contains: "useOptimistic"
    - path: "apps/desktop/src/pages/DrivesPage.tsx"
      provides: "DriveCard list rendered from optimisticDrives; error feedback on rollback"
  key_links:
    - from: "providers.tsx useOptimistic for drives"
      to: "DrivesPage DriveCard list"
      via: "CatalogStoreContext value.drives"
      pattern: "optimisticDrives"
    - from: "providers.tsx useOptimistic for projects"
      to: "ProjectsPage project list"
      via: "CatalogStoreContext value.projects"
      pattern: "optimisticProjects"
---

<objective>
Wire React 19 useOptimistic into providers.tsx for the three mutations users notice most: deleteProject, deleteDrive, createDrive.

Purpose: Every mutation currently blocks the UI behind isMutating=true for the full IPC + refresh round-trip (~300–800ms). useOptimisticMutation.ts is fully written but never used. Wiring it gives instant feedback: delete removes the item immediately, create shows a pending card immediately, and failure cleanly reverts with a visible error.

Output: Three mutations (deleteProject, deleteDrive, createDrive) are wrapped with useOptimistic in providers.tsx; pages receive optimistic collection state via context; FOUND-02 closed.
</objective>

<execution_context>
@/Users/vaneickelen/Desktop/Catalog/.planning/phases/02-trustworthy-mutations/01-RESEARCH.md
@/Users/vaneickelen/Desktop/Catalog/.planning/phases/02-trustworthy-mutations/PATTERNS.md
</execution_context>

<context>
@/Users/vaneickelen/Desktop/Catalog/.planning/REQUIREMENTS.md

<interfaces>
<!-- Key contracts. Extracted from live codebase. -->

From apps/desktop/src/app/providers.tsx — full current mutation wiring:
```typescript
// Line 120–129: runMutation — pessimistic, blocks UI for full round-trip
const runMutation = useCallback(async <T,>(operation: () => Promise<T>) => {
  setIsMutating(true);
  try {
    const result = await operation();
    await refresh();
    return result;
  } finally {
    setIsMutating(false);
  }
}, [refresh]);

// Lines 169–174: current mutation registrations in value useMemo
updateProjectMetadata: (input) => runMutation(() => repository.updateProjectMetadata(input)),
createProject: (input) => runMutation(() => repository.createProject(input)),
createDrive: (input) => runMutation(() => repository.createDrive(input)),
importFoldersFromVolume: (input) => runMutation(() => repository.importFoldersFromVolume(input)),
deleteProject: (projectId) => runMutation(() => repository.deleteProject(projectId)),
deleteDrive: (driveId) => runMutation(() => repository.deleteDrive(driveId))
```

From apps/desktop/src/app/useOptimisticMutation.ts — hook signature (ALREADY WRITTEN, UNUSED):
```typescript
export function useOptimisticMutation<TData, TResult>(
  action: (data: TData) => Promise<TResult>,
  options: UseOptimisticMutationOptions<TData, TResult> = {}
): UseOptimisticMutationReturn<TData>

// UseOptimisticMutationReturn<TData>: { mutate, isPending, isConfirmed, error, reset }
// onRollback: (error: Error, data: TData) => void
```

From providers.tsx CatalogStoreContextValue (lines 36–58):
```typescript
interface CatalogStoreContextValue {
  projects: Project[];  // consumers see this — must surface optimistic list here
  drives: Drive[];      // consumers see this — must surface optimistic list here
  // ...
}
```

React 19 useOptimistic shape (built-in, no import beyond react):
```typescript
const [optimisticList, addOptimistic] = useOptimistic(
  realList,                                     // base state
  (current: Item[], change: Item) => newList    // reducer
);
// optimisticList is used during pending transition
// When transition ends and refresh() resolves, React reverts to realList (confirmed)
```

Domain types (from @drive-project-catalog/domain):
```typescript
// Drive: { id: string; volumeName: string; displayName: string; ... }
// Project: { id: string; name: string; driveId: string; ... }
```

Pitfall to avoid (from RESEARCH.md Pitfall 1 — triple-flash):
"Wrap the mutation + refresh in a startTransition so React knows the async operation
is part of the same transition. OR keep isMutating=true until refresh() resolves."
The isMutating=true approach is already in place via runMutation — keep it active
until refresh() resolves. This prevents the optimistic → stale → confirmed triple-flash.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wire useOptimistic for deleteProject, deleteDrive, createDrive in providers.tsx</name>
  <files>apps/desktop/src/app/providers.tsx</files>
  <action>
Read the full providers.tsx before making changes (it is ~230 lines). Understand the existing useState declarations and the value useMemo before modifying either.

**What to add:**

Add three `useOptimistic` pairs at the top of `AppProviders`, alongside the existing `useState` declarations:

```typescript
import { useOptimistic } from "react"; // add to existing react import

// After const [scanSessions, setScanSessions] = useState...
const [optimisticProjects, applyOptimisticProjectChange] = useOptimistic(
  projects,
  (current: Project[], change: { type: "delete"; id: string } | { type: "add"; project: Project }) => {
    if (change.type === "delete") return current.filter((p) => p.id !== change.id);
    if (change.type === "add") return [...current, change.project];
    return current;
  }
);

const [optimisticDrives, applyOptimisticDriveChange] = useOptimistic(
  drives,
  (current: Drive[], change: { type: "delete"; id: string } | { type: "add"; drive: Drive }) => {
    if (change.type === "delete") return current.filter((d) => d.id !== change.id);
    if (change.type === "add") return [...current, change.drive];
    return current;
  }
);
```

**What to change in the value useMemo:**

Replace the three target mutation registrations. Keep `updateProjectMetadata`, `createProject`, and `importFoldersFromVolume` unchanged — they stay on `runMutation`. Only change these three:

**deleteProject:**
```typescript
deleteProject: async (projectId) => {
  applyOptimisticProjectChange({ type: "delete", id: projectId });
  return runMutation(() => repository.deleteProject(projectId));
},
```

**deleteDrive:**
```typescript
deleteDrive: async (driveId) => {
  applyOptimisticDriveChange({ type: "delete", id: driveId });
  return runMutation(() => repository.deleteDrive(driveId));
},
```

**createDrive:**
```typescript
createDrive: async (input) => {
  // Optimistic placeholder — minimal shape for the card to render
  const tempDrive: Drive = {
    id: `temp-${Date.now()}`,
    volumeName: input.volumeName,
    displayName: input.displayName ?? input.volumeName,
    capacityBytes: input.capacityTerabytes != null
      ? Math.round(parseFloat(input.capacityTerabytes) * 1_000_000_000_000)
      : null,
    usedBytes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  applyOptimisticDriveChange({ type: "add", drive: tempDrive });
  return runMutation(() => repository.createDrive(input));
},
```

**In the value useMemo, surface optimistic lists instead of real lists:**

```typescript
const value = useMemo<CatalogStoreContextValue>(() => ({
  repository,
  projects: optimisticProjects,  // was: projects
  drives: optimisticDrives,      // was: drives
  // ... all other fields unchanged
}), [
  optimisticDrives,   // was: drives
  optimisticProjects, // was: projects
  // ... rest of deps unchanged
]);
```

**Add optimisticProjects and optimisticDrives to the useMemo deps array.** Remove `drives` and `projects` from deps if they are now only accessed via the optimistic wrappers — but check first: `getDriveDetailView` and `selectedProject`/`selectedDrive` derive from `drives` and `projects` directly. Keep those using the real state variables (not optimistic), since they are for read operations that should reflect confirmed state.

**DO NOT change:**
- `runMutation` itself — it still handles the IPC call and refresh
- `updateProjectMetadata`, `createProject`, `importFoldersFromVolume` — stay pessimistic
- The `selectedProject` and `selectedDrive` derivations — use real `projects` and `drives`
- The `getDriveDetailView` callback — uses real `drives`, `projects`, etc.

After changes, run type check:
```bash
cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm --filter @drive-project-catalog/desktop exec tsc --noEmit
```

If the Drive type shape is incompatible with the tempDrive literal, read the Drive type definition from packages/domain/src/ and adjust the placeholder fields to match exactly.
  </action>
  <verify>
    <automated>grep -n "useOptimistic\|optimisticDrives\|optimisticProjects" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/app/providers.tsx | wc -l | tr -d ' ' | xargs -I{} test {} -ge 4 && echo "PASS: useOptimistic wired" || echo "FAIL: useOptimistic missing"</automated>
  </verify>
  <done>providers.tsx uses useOptimistic for drives and projects; deleteProject, deleteDrive, createDrive apply optimistic state before runMutation; value.drives and value.projects surface optimistic lists; tsc --noEmit exits 0</done>
</task>

<task type="auto">
  <name>Task 2: Verify optimistic feedback in DrivesPage and DriveDetailPage</name>
  <files>
    apps/desktop/src/pages/DrivesPage.tsx
    apps/desktop/src/pages/DriveDetailPage.tsx
  </files>
  <action>
Both pages receive `drives` and `projects` from `useCatalogStore()`. Since providers.tsx now surfaces `optimisticDrives` as `drives`, no page-level changes are required for the list rendering to be optimistic — the context change propagates automatically.

This task verifies that the pages will correctly display rollback errors if the IPC fails, and adds rollback feedback where it is missing.

**Step 1 — DrivesPage delete drive:**
Read the `deleteDrive` call site in DrivesPage.tsx. It currently calls `deleteDrive(driveId)` from context. If the call is not wrapped in a try/catch with setFeedback on error, add one:

```typescript
try {
  await deleteDrive(driveId);
} catch (error) {
  setFeedback({
    tone: "error",
    title: "Could not delete drive",
    messages: [error instanceof Error ? error.message : "Deletion failed."]
  });
}
```

**Step 2 — DrivesPage create drive:**
Read the `createDrive` call site in DrivesPage.tsx (inside `CreateDriveForm` submit handler). If it lacks try/catch with setFeedback, add one with the same pattern as above but with title "Could not register drive".

**Step 3 — DriveDetailPage delete project:**
Read the `deleteProject` call site in DriveDetailPage.tsx. Apply the same try/catch + setFeedback pattern with title "Could not delete project".

**Step 4 — Confirm setFeedback exists in scope:**
`setFeedback` is likely already declared in both pages via `useState<FeedbackState | null>(null)`. Verify it is in scope at each call site. If not already declared in a page, add:
```typescript
const [feedback, setFeedback] = useState<FeedbackState | null>(null);
```
And wire the FeedbackNotice render if not already present.

**Step 5 — Type check:**
```bash
cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm --filter @drive-project-catalog/desktop exec tsc --noEmit
```
  </action>
  <verify>
    <automated>cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm --filter @drive-project-catalog/desktop exec tsc --noEmit 2>&1 | tail -5</automated>
  </verify>
  <done>deleteProject, deleteDrive, createDrive call sites in pages are wrapped in try/catch; setFeedback on error shows a specific message; tsc --noEmit exits 0</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Optimistic state → confirmed state | useOptimistic reverts to real state when the React transition ends; if refresh() hasn't resolved, there can be a brief revert to stale data |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-06 | Tampering | useOptimistic triple-flash | mitigate | Keep isMutating=true (via runMutation) until refresh() resolves; this suppresses the stale revert window |
| T-02-07 | Denial of Service | tempDrive ID collision | accept | temp-${Date.now()} is sufficiently unique for a single-user desktop app; real ID replaces it after refresh() |
| T-02-08 | Information Disclosure | Rollback error messages | mitigate | Error messages from IPC are already normalized via normalizeScanCommandError; pass err.message to setFeedback |
</threat_model>

<verification>
After both tasks:

1. `grep -n "useOptimistic" apps/desktop/src/app/providers.tsx` — shows at least 2 useOptimistic calls
2. `grep -n "optimisticDrives\|optimisticProjects" apps/desktop/src/app/providers.tsx` — present in value useMemo
3. `grep -n "setFeedback.*error\|tone.*error" apps/desktop/src/pages/DrivesPage.tsx` — present at delete/create call sites
4. `cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm --filter @drive-project-catalog/desktop exec tsc --noEmit` exits 0
</verification>

<success_criteria>
- useOptimistic declared in providers.tsx for both drives and projects collections
- deleteProject, deleteDrive, createDrive apply optimistic state before awaiting runMutation
- value.drives and value.projects surface the optimistic lists (not the raw useState values)
- DrivesPage and DriveDetailPage catch mutation errors and show setFeedback with a specific message
- tsc --noEmit exits 0
</success_criteria>

<output>
After completion, create `/Users/vaneickelen/Desktop/Catalog/.planning/phases/02-trustworthy-mutations/02-03-SUMMARY.md` following the standard summary template.
</output>

---
phase: 02-trustworthy-mutations
plan: 04
type: execute
wave: 2
depends_on:
  - 02-03
files_modified:
  - apps/desktop/src/app/useImportFromVolume.ts
  - apps/desktop/src/pages/drives/DriveCreateForm.tsx
  - apps/desktop/src/pages/DrivesPage.tsx
autonomous: true
requirements:
  - CODE-01

must_haves:
  truths:
    - "DrivesPage.tsx is under 400 lines after extraction"
    - "useImportFromVolume hook encapsulates all import-from-volume state and async logic"
    - "DriveCreateForm component renders identically to the previous inline version"
    - "Zero behavior change — TypeScript types match exactly what DrivesPage consumed before"
  artifacts:
    - path: "apps/desktop/src/app/useImportFromVolume.ts"
      provides: "Hook encapsulating import-from-volume state machine"
      contains: "UseImportFromVolumeReturn"
    - path: "apps/desktop/src/pages/drives/DriveCreateForm.tsx"
      provides: "Extracted DriveCreateForm component"
      contains: "DriveCreateForm"
    - path: "apps/desktop/src/pages/DrivesPage.tsx"
      provides: "Slimmed DrivesPage under 400 lines"
      contains: "useImportFromVolume"
  key_links:
    - from: "DrivesPage.tsx"
      to: "useImportFromVolume"
      via: "import and destructure"
      pattern: "useImportFromVolume"
    - from: "DrivesPage.tsx"
      to: "DriveCreateForm"
      via: "import and JSX"
      pattern: "DriveCreateForm"
---

<objective>
Extract useImportFromVolume hook and DriveCreateForm component from DrivesPage.tsx, bringing it under 400 lines.

Purpose: DrivesPage.tsx is 760 lines — well above the 400-line target. The import-from-volume state machine (~85 lines) and the create-drive form (~115 lines) are natural extraction boundaries with no closure state crossing the page boundary.

Output: apps/desktop/src/app/useImportFromVolume.ts and apps/desktop/src/pages/drives/DriveCreateForm.tsx created; DrivesPage.tsx slimmed to under 400 lines; zero behavior change; CODE-01 closed.
</objective>

<execution_context>
@/Users/vaneickelen/Desktop/Catalog/.planning/phases/02-trustworthy-mutations/PATTERNS.md
</execution_context>

<context>
@/Users/vaneickelen/Desktop/Catalog/.planning/REQUIREMENTS.md

<interfaces>
<!-- Key contracts extracted from PATTERNS.md (live codebase analysis). -->

useImportFromVolume target return interface (from PATTERNS.md):
```typescript
export interface UseImportFromVolumeReturn {
  importSourcePath: string | null;
  importFolders: VolumeFolderEntry[] | null;
  importVolumeInfo: VolumeInfo | null;
  isPickingImport: boolean;
  isImporting: boolean;
  matchedDrive: Drive | null;
  previewExistingPaths: Set<string>;
  previewDriveName: string;
  runImportFromVolume(): Promise<void>;
  closeImportDialog(): void;
  handleConfirmImportFromVolume(): Promise<void>;
}
```

Hook input parameters (from PATTERNS.md — must be injected, not pulled from context):
- drives, projects, createDrive, importFoldersFromVolume, navigate, setFeedback

State machine phases (from DrivesPage.tsx lines 85–92):
```
idle:        importSourcePath === null
enumerating: isPickingImport === true
preview:     importSourcePath && importFolders !== null
importing:   isImporting === true
```

DriveCreateForm component interface (from PATTERNS.md):
```typescript
// Props (from DrivesPage.tsx lines 607–619):
interface DriveCreateFormProps {
  form: DriveFormState;
  onChange: (next: DriveFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  isMutating: boolean;
}

// DriveFormState (from DrivesPage.tsx lines 64–70):
export interface DriveFormState {
  volumeName: string;
  displayName: string;
  capacityTerabytes: string;
}
export const initialDriveForm: DriveFormState = { volumeName: "", displayName: "", capacityTerabytes: "" };
```

FormField (internal helper in DriveCreateForm — not exported):
```typescript
function FormField({ label, required, children }: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) { ... }
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create useImportFromVolume.ts hook</name>
  <files>apps/desktop/src/app/useImportFromVolume.ts</files>
  <action>
Read DrivesPage.tsx in full before creating this file. The hook must lift out the exact logic from lines 85–276 (state variables + async functions + derived values) without changing any behavior.

Create `apps/desktop/src/app/useImportFromVolume.ts` as a pure TypeScript module (no JSX):

**Structure:**
1. Import section — import only what the hook itself needs: `useState`, `useCallback` from react; `VolumeFolderEntry`, `VolumeInfo`, `pickVolumeRoot`, `enumerateVolumeFolders` from volumeImportCommands; Drive and Project types from domain
2. Declare the `UseImportFromVolumeReturn` interface (exported)
3. Declare the hook function with injected deps as parameters:
   ```typescript
   export function useImportFromVolume(deps: {
     drives: Drive[];
     projects: Project[];
     createDrive: (input: CreateDriveInput) => Promise<Drive>;
     importFoldersFromVolume: (input: ImportFoldersFromVolumeInput) => Promise<ImportFoldersFromVolumeResult>;
     navigate: (path: string) => void;
     setFeedback: (f: FeedbackState) => void;
   }): UseImportFromVolumeReturn
   ```
4. Copy the state variables verbatim from DrivesPage.tsx lines 93–97
5. Copy the state machine comment block from lines 85–92
6. Copy `runImportFromVolume`, `closeImportDialog`, `handleConfirmImportFromVolume` as `useCallback`-wrapped functions, referencing `deps.createDrive`, `deps.importFoldersFromVolume`, `deps.navigate`, `deps.setFeedback` instead of the destructured page-local names
7. Copy the three derived values (matchedDrive, previewExistingPaths, previewDriveName) from lines 269–276 using `deps.drives` and `deps.projects`
8. Return the `UseImportFromVolumeReturn` object

Follow the `useAsyncAction.ts` hook structure convention: state variables at top, `useRef` for stable deps if needed, `useCallback` for all async functions, plain object return.

Do NOT reference `useCatalogStore()` inside the hook — all context values arrive via the `deps` parameter.
  </action>
  <verify>
    <automated>test -f /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/app/useImportFromVolume.ts && echo "PASS: file exists" || echo "FAIL: file missing"</automated>
  </verify>
  <done>useImportFromVolume.ts exists; exports UseImportFromVolumeReturn interface and useImportFromVolume function; contains no JSX; no useCatalogStore import</done>
</task>

<task type="auto">
  <name>Task 2: Create DriveCreateForm.tsx and slim DrivesPage.tsx</name>
  <files>
    apps/desktop/src/pages/drives/DriveCreateForm.tsx
    apps/desktop/src/pages/DrivesPage.tsx
  </files>
  <action>
First, ensure the directory exists:
```bash
mkdir -p /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/pages/drives
```

**Create apps/desktop/src/pages/drives/DriveCreateForm.tsx:**

Lift the `CreateDriveForm` function (DrivesPage.tsx lines 607–665), the `FormField` helper (lines 738–760), and the `DriveFormState` interface + `initialDriveForm` constant (lines 64–70) verbatim into the new file.

Exports from DriveCreateForm.tsx:
- `export interface DriveFormState { ... }`
- `export const initialDriveForm: DriveFormState = { ... }`
- `export function DriveCreateForm({ form, onChange, onSubmit, onCancel, isMutating }: DriveCreateFormProps) { ... }`

`FormField` stays in the file but is NOT exported (module-internal).

Imports needed: `type { FormEvent, ReactNode }` from `"react"`. No other imports required.

**Slim DrivesPage.tsx:**

Replace the extracted sections with imports:
```typescript
import { useImportFromVolume } from "../app/useImportFromVolume";
import { DriveCreateForm, type DriveFormState, initialDriveForm } from "./drives/DriveCreateForm";
```

Remove from DrivesPage.tsx:
- The `DriveFormState` interface (now in DriveCreateForm.tsx)
- The `initialDriveForm` constant (now in DriveCreateForm.tsx)
- The `CreateDriveForm` function (now in DriveCreateForm.tsx)
- The `FormField` function (now in DriveCreateForm.tsx)
- The import-from-volume state variables and async functions (now in useImportFromVolume.ts)

Update the DrivesPage component body to use the hook:
```typescript
const {
  importSourcePath,
  importFolders,
  importVolumeInfo,
  isPickingImport,
  isImporting,
  matchedDrive,
  previewExistingPaths,
  previewDriveName,
  runImportFromVolume,
  closeImportDialog,
  handleConfirmImportFromVolume,
} = useImportFromVolume({
  drives,
  projects,
  createDrive,
  importFoldersFromVolume,
  navigate,
  setFeedback,
});
```

After slimming, verify line count:
```bash
wc -l /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/pages/DrivesPage.tsx
```
Must be under 400.

Then run type check:
```bash
cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm --filter @drive-project-catalog/desktop exec tsc --noEmit
```
  </action>
  <verify>
    <automated>wc -l /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/pages/DrivesPage.tsx | awk '{print $1}' | xargs -I{} test {} -lt 400 && echo "PASS: DrivesPage under 400 lines" || echo "FAIL: DrivesPage still too long"</automated>
  </verify>
  <done>DriveCreateForm.tsx exists and exports DriveFormState, initialDriveForm, DriveCreateForm; DrivesPage.tsx is under 400 lines; useImportFromVolume is imported and wired; tsc --noEmit exits 0</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Hook deps injection | useImportFromVolume receives createDrive and importFoldersFromVolume as parameters — these are the same context functions, just injected instead of read from context |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-09 | Tampering | Hook extraction closure correctness | mitigate | All async functions wrapped in useCallback with explicit deps; no stale closure risk from the extraction |
| T-02-10 | Denial of Service | Missing directory | mitigate | mkdir -p before creating DriveCreateForm.tsx; tsc --noEmit catches import resolution failures |
</threat_model>

<verification>
After both tasks:

1. `test -f apps/desktop/src/app/useImportFromVolume.ts && echo ok`
2. `test -f apps/desktop/src/pages/drives/DriveCreateForm.tsx && echo ok`
3. `wc -l apps/desktop/src/pages/DrivesPage.tsx | awk '{print $1}'` < 400
4. `grep -n "useImportFromVolume\|DriveCreateForm" apps/desktop/src/pages/DrivesPage.tsx` — both imports present
5. `cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm --filter @drive-project-catalog/desktop exec tsc --noEmit` exits 0
</verification>

<success_criteria>
- useImportFromVolume.ts created with correct interface and hook body
- DriveCreateForm.tsx created with DriveFormState, initialDriveForm, DriveCreateForm exports
- DrivesPage.tsx under 400 lines
- App builds with zero type errors
- Rendering is visually identical to pre-extraction (pure refactor, zero behavior change)
</success_criteria>

<output>
After completion, create `/Users/vaneickelen/Desktop/Catalog/.planning/phases/02-trustworthy-mutations/02-04-SUMMARY.md` following the standard summary template.
</output>

---
phase: 02-trustworthy-mutations
plan: 05
type: execute
wave: 2
depends_on:
  - 02-03
files_modified:
  - apps/desktop/src/pages/drives/ScanSection.tsx
  - apps/desktop/src/pages/drives/ImportSection.tsx
  - apps/desktop/src/pages/drives/ScanStatusPanel.tsx
  - apps/desktop/src/pages/DriveDetailPage.tsx
autonomous: true
requirements:
  - CODE-02

must_haves:
  truths:
    - "DriveDetailPage.tsx is under 400 lines after extraction"
    - "ScanSection, ImportSection, and ScanStatusPanel are standalone files with explicit prop interfaces"
    - "Zero behavior change — DriveDetailPage renders identically before and after"
  artifacts:
    - path: "apps/desktop/src/pages/drives/ScanSection.tsx"
      provides: "Extracted ScanSection component"
      contains: "ScanSection"
    - path: "apps/desktop/src/pages/drives/ImportSection.tsx"
      provides: "Extracted ImportSection component"
      contains: "ImportSection"
    - path: "apps/desktop/src/pages/drives/ScanStatusPanel.tsx"
      provides: "Extracted ScanStatusPanel component"
      contains: "ScanStatusPanel"
    - path: "apps/desktop/src/pages/DriveDetailPage.tsx"
      provides: "Slimmed DriveDetailPage under 400 lines"
      contains: "ScanSection"
  key_links:
    - from: "DriveDetailPage.tsx"
      to: "ScanSection"
      via: "import and JSX render"
      pattern: "ScanSection"
    - from: "DriveDetailPage.tsx"
      to: "ImportSection"
      via: "import and JSX render"
      pattern: "ImportSection"
    - from: "ScanSection.tsx"
      to: "ScanStatusPanel.tsx"
      via: "import and JSX render"
      pattern: "ScanStatusPanel"
---

<objective>
Extract ScanSection, ImportSection, and ScanStatusPanel from DriveDetailPage.tsx, bringing it under 400 lines.

Purpose: DriveDetailPage.tsx is 723 lines. The scan section (~120 lines), import section (~35 lines), and ScanStatusPanel (~85 lines) are already defined as named functions — they are natural extraction candidates with explicit prop surfaces.

Output: Three new component files in apps/desktop/src/pages/drives/; DriveDetailPage.tsx slimmed to under 400 lines; zero behavior change; CODE-02 closed.
</objective>

<execution_context>
@/Users/vaneickelen/Desktop/Catalog/.planning/phases/02-trustworthy-mutations/PATTERNS.md
</execution_context>

<context>
@/Users/vaneickelen/Desktop/Catalog/.planning/REQUIREMENTS.md

<interfaces>
<!-- Key contracts from PATTERNS.md (live codebase analysis). -->

Extracted component target shapes (from PATTERNS.md):

DriveScanSection props (use the exact lines from DriveDetailPage.tsx — read first):
```typescript
// Props derived from what the scan section consumes from DriveDetailPage state:
// drive, scanSummary, activeSession, draftRootPath, setDraftRootPath,
// isScanAvailable, isPickingDirectory, chooseDirectory, startScan, cancelScan, scanError
```

DriveImportSection props (from PATTERNS.md):
```typescript
// Props: driveId, drive, existingProjectPaths, setFeedback, importFoldersFromVolume
// Owns: importSourcePath, importFolders, isPickingImport, isImporting state
// Owns: runImportPicker, handleConfirmImport async handlers
```

ScanStatusPanel:
```typescript
// Already a named function in DriveDetailPage.tsx — lift verbatim
// Read lines 583–667 to get exact props interface
```

Wrapper pattern from pagePrimitives.tsx:
```typescript
export function SectionCard({ title, description, children, action }: SectionCardProps) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-5 py-4">...</div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
```
Both extracted sections use SectionCard as their outer wrapper — import it from pagePrimitives.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Read DriveDetailPage.tsx and extract ScanStatusPanel</name>
  <files>
    apps/desktop/src/pages/drives/ScanStatusPanel.tsx
  </files>
  <action>
Read DriveDetailPage.tsx in full before any extraction. Map the exact line ranges for:
- `ScanStatusPanel` function (research says ~lines 583–667)
- `ScanSection` / `DriveScanSection` function (research says ~lines 371–426)
- `ImportSection` / `DriveImportSection` function (research says ~lines 452–474)
- Import-from-volume state and async handlers consumed by ImportSection (research says ~lines 64–72 + 154–226)

Ensure the directory exists:
```bash
mkdir -p /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/pages/drives
```

Create `apps/desktop/src/pages/drives/ScanStatusPanel.tsx`:

Lift `ScanStatusPanel` verbatim from DriveDetailPage.tsx. The component is already a named function — copy its definition, add the necessary imports at the top (React, any types it references from domain/data/pagePrimitives), and export it:

```typescript
export function ScanStatusPanel({ ... }: ScanStatusPanelProps) { ... }
```

Derive the prop interface from what the function currently receives. If it has an inline prop type, convert it to a named interface for clarity.

Do NOT change the component's render logic — this is a pure lift.
  </action>
  <verify>
    <automated>test -f /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/pages/drives/ScanStatusPanel.tsx && echo "PASS: ScanStatusPanel.tsx exists" || echo "FAIL: missing"</automated>
  </verify>
  <done>ScanStatusPanel.tsx exists with exported ScanStatusPanel function and named prop interface; file contains the exact rendering logic from DriveDetailPage.tsx</done>
</task>

<task type="auto">
  <name>Task 2: Extract ScanSection and ImportSection, slim DriveDetailPage</name>
  <files>
    apps/desktop/src/pages/drives/ScanSection.tsx
    apps/desktop/src/pages/drives/ImportSection.tsx
    apps/desktop/src/pages/DriveDetailPage.tsx
  </files>
  <action>
**Create apps/desktop/src/pages/drives/ScanSection.tsx:**

Extract the scan section JSX block plus its supporting logic. This component:
- Imports `ScanStatusPanel` from `./ScanStatusPanel`
- Imports `SectionCard` and any other shared primitives from `../pagePrimitives`
- Receives all scan state as explicit props (no useScanWorkflow call inside — props injected from DriveDetailPage)
- Exports `ScanSection` with a named prop interface

**Create apps/desktop/src/pages/drives/ImportSection.tsx:**

Extract the import section JSX block (~35 lines). This component:
- If it has its own state (importSourcePath, importFolders, isPickingImport, isImporting), decide: either keep that state inside ImportSection (self-contained), or pass it as props from DriveDetailPage. Choose whichever results in a cleaner interface and fewer prop threads.
- Imports `SectionCard` and `FeedbackNotice` from `../pagePrimitives` or `../feedbackHelpers`
- Exports `ImportSection` with a named prop interface

**Slim DriveDetailPage.tsx:**

Add imports:
```typescript
import { ScanSection } from "./drives/ScanSection";
import { ImportSection } from "./drives/ImportSection";
```

Remove from DriveDetailPage.tsx:
- `ScanStatusPanel` function (now in ScanStatusPanel.tsx, imported by ScanSection)
- The scan section JSX block (replaced by `<ScanSection ... />`)
- The import section JSX block (replaced by `<ImportSection ... />`)
- Any import-from-volume state/handlers that moved into ImportSection

Replace inline JSX with the extracted components, passing props.

Verify line count:
```bash
wc -l /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/pages/DriveDetailPage.tsx
```
Must be under 400.

Run type check:
```bash
cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm --filter @drive-project-catalog/desktop exec tsc --noEmit
```
  </action>
  <verify>
    <automated>wc -l /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/pages/DriveDetailPage.tsx | awk '{print $1}' | xargs -I{} test {} -lt 400 && echo "PASS: DriveDetailPage under 400 lines" || echo "FAIL: still too long"</automated>
  </verify>
  <done>ScanSection.tsx and ImportSection.tsx exist with exported components and named prop interfaces; DriveDetailPage.tsx is under 400 lines; tsc --noEmit exits 0</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Prop injection | ScanSection and ImportSection receive state from DriveDetailPage via props — no shared mutable refs |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-11 | Tampering | Import closure during extraction | mitigate | tsc --noEmit catches any missed imports or type mismatches immediately |
| T-02-12 | Denial of Service | Missing drives/ directory | mitigate | mkdir -p in Task 1 before any file creation |
</threat_model>

<verification>
After both tasks:

1. `test -f apps/desktop/src/pages/drives/ScanSection.tsx && echo ok`
2. `test -f apps/desktop/src/pages/drives/ImportSection.tsx && echo ok`
3. `test -f apps/desktop/src/pages/drives/ScanStatusPanel.tsx && echo ok`
4. `wc -l apps/desktop/src/pages/DriveDetailPage.tsx | awk '{print $1}'` < 400
5. `cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm --filter @drive-project-catalog/desktop exec tsc --noEmit` exits 0
</verification>

<success_criteria>
- ScanSection.tsx, ImportSection.tsx, ScanStatusPanel.tsx created with exported components and named prop interfaces
- DriveDetailPage.tsx under 400 lines
- App builds with zero type errors
- DriveDetailPage renders identically before and after (pure refactor)
</success_criteria>

<output>
After completion, create `/Users/vaneickelen/Desktop/Catalog/.planning/phases/02-trustworthy-mutations/02-05-SUMMARY.md` following the standard summary template.
</output>

---
phase: 02-trustworthy-mutations
plan: 06
type: execute
wave: 3
depends_on:
  - 02-01
  - 02-02
  - 02-03
  - 02-04
  - 02-05
files_modified: []
autonomous: true
requirements:
  - FOUND-02
  - ACCU-01
  - ACCU-02
  - ACCU-04
  - UX-02
  - CODE-01
  - CODE-02

must_haves:
  truths:
    - "Full production build completes without errors"
    - "All seven Phase 2 requirements are verifiable against the built output"
    - "No 28% appears in any source file under apps/desktop/src or packages/"
    - "DrivesPage.tsx and DriveDetailPage.tsx are each under 400 lines"
    - "deleteScanSession exists in all three persistence files"
    - "useOptimistic is wired in providers.tsx"
  artifacts:
    - path: "apps/desktop/src/pages/DrivesPage.tsx"
      provides: "Final slimmed DrivesPage"
      contains: "useImportFromVolume"
    - path: "apps/desktop/src/pages/DriveDetailPage.tsx"
      provides: "Final slimmed DriveDetailPage"
      contains: "ScanSection"
---

<objective>
Run the full build and verify all Phase 2 success criteria are met.

Purpose: Plans 01–05 make targeted changes across frontend and data layers. This final plan confirms nothing was broken in the process and all seven requirements are provably closed.

Output: pnpm build exits 0; all seven requirement checks pass; Phase 2 declared complete.
</objective>

<execution_context>
@/Users/vaneickelen/Desktop/Catalog/.planning/ROADMAP.md
</execution_context>

<context>
@/Users/vaneickelen/Desktop/Catalog/.planning/REQUIREMENTS.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Run full build and verify all Phase 2 requirements</name>
  <files></files>
  <action>
Run each check in order. If any check fails, fix the underlying issue before proceeding.

**1. Type check (both packages):**
```bash
cd /Users/vaneickelen/Desktop/Catalog
corepack pnpm --filter @drive-project-catalog/data exec tsc --noEmit
corepack pnpm --filter @drive-project-catalog/desktop exec tsc --noEmit
```

**2. ACCU-01 — No fabricated 28% fill:**
```bash
grep -rn "28%" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/pages/ /Users/vaneickelen/Desktop/Catalog/packages/ 2>/dev/null | grep -v ".planning"
```
Expected: zero matches. If any match found, fix the source before proceeding.

**3. ACCU-02 / UX-02 — No stale empty-state strings:**
```bash
grep -rn "No import task" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/ /Users/vaneickelen/Desktop/Catalog/packages/ 2>/dev/null | grep -v ".planning"
```
Expected: zero matches.

**4. ACCU-04 — deleteScanSession in all persistence files:**
```bash
grep -rn "deleteScanSession" /Users/vaneickelen/Desktop/Catalog/packages/data/src/
```
Expected: matches in localPersistence.ts, sqliteLocalPersistence.ts, inMemoryLocalPersistence.ts, localCatalogRepository.ts (minimum 4 lines).

**5. FOUND-02 — useOptimistic wired in providers.tsx:**
```bash
grep -n "useOptimistic" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/app/providers.tsx
```
Expected: at least 2 matches (one per collection).

**6. CODE-01 — DrivesPage.tsx under 400 lines:**
```bash
wc -l /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/pages/DrivesPage.tsx
```
Expected: < 400.

**7. CODE-02 — DriveDetailPage.tsx under 400 lines:**
```bash
wc -l /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/pages/DriveDetailPage.tsx
```
Expected: < 400.

**8. Production build:**
```bash
cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm --filter @drive-project-catalog/desktop build
```
Expected: exits 0 with no errors.

If the build fails, diagnose from the error output and fix the specific issue. Do not mark Phase 2 complete until all 8 checks pass.
  </action>
  <verify>
    <automated>cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm --filter @drive-project-catalog/desktop build 2>&1 | tail -10</automated>
  </verify>
  <done>All 8 checks pass; build exits 0; Phase 2 success criteria confirmed</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Build output → runtime | Production build confirms no import resolution failures from the code splits |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-13 | Denial of Service | Build failure from import errors | mitigate | tsc --noEmit in each prior plan catches import errors before build; build is a final confirmation |
</threat_model>

<verification>
All 8 numbered checks in Task 1 pass.
</verification>

<success_criteria>
- tsc --noEmit exits 0 for both packages
- Zero "28%" strings in source pages and packages
- Zero "No import task" strings in source
- deleteScanSession present in 4+ data source files
- useOptimistic present in providers.tsx
- DrivesPage.tsx line count < 400
- DriveDetailPage.tsx line count < 400
- pnpm build exits 0
</success_criteria>

<output>
After completion, create `/Users/vaneickelen/Desktop/Catalog/.planning/phases/02-trustworthy-mutations/02-06-SUMMARY.md` following the standard summary template.

Then update `/Users/vaneickelen/Desktop/Catalog/.planning/ROADMAP.md`:
- Phase 2 progress row: "6/6 plans complete"
- Phase 2 checkbox: mark as complete [ ] → [x]
</output>
