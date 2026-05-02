# Architecture: Optimistic UI for Tauri + React + SQLite

**Domain:** Brownfield optimistic-mutation refactor for `apps/desktop` (Catalog v1)
**Researched:** 2026-05-02
**Confidence:** HIGH (grounded in repo files + verified patterns from React 19 / Tauri v2 / SQLite WAL docs)

## Executive Summary

The current `runMutation` helper in `apps/desktop/src/app/providers.tsx` follows a "mutate then full reload" pattern: every write awaits `repository.<op>()` then calls `refresh()`, which fan-outs to four `SELECT *` queries (`listProjects`, `listDrives`, `listScans`, `listScanSessions`). At catalog scale this is O(n) I/O for O(1) writes and produces visible lag on trivial operations like editing a project name.

The fix is a **typed entity-cache + optimistic apply/rollback** layered on the existing context. We do **not** introduce TanStack Query — that would be a parallel state system fighting the existing repository singleton and Rust-pushed scan ingestion. Instead we keep `CatalogStoreContext` as the single source of truth and add three things:

1. A **scope-aware mutation pipeline** that takes `(optimisticPatch, action, rollback)` triples and updates only the affected slice
2. **Per-slice setter helpers** (`upsertProject`, `removeProject`, `replaceDrive`, etc.) used by both optimistic apply and authoritative reconciliation
3. A **Tauri event channel** (`catalog:projects:changed`, `catalog:drives:changed`) so the Rust scan ingestion path can push targeted invalidations instead of the polling-then-full-refresh pattern in `scanWorkflow.tsx`

The existing `useOptimisticMutation` hook (`apps/desktop/src/app/useOptimisticMutation.ts`) is page-local and only manages UI flags (`isPending`, `isConfirmed`, `error`). It does **not** touch context state. Wiring it to the main path means refactoring `runMutation` itself, not replacing the hook.

## Recommended Architecture

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  Page (e.g. ProjectDetailPage)                                          │
│   - calls store.updateProjectMetadata(input)                            │
│   - optionally uses useOptimisticMutation for local UI flags            │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  CatalogStoreContext (providers.tsx)                                    │
│   - exposes typed mutations: updateProjectMetadata, deleteProject…     │
│   - each mutation runs through runOptimisticMutation()                  │
│                                                                         │
│   runOptimisticMutation<TEntity, TPatch, TResult>({                     │
│     scope:        'projects' | 'drives' | …                             │
│     optimistic:   (state) => nextState,    // immediate                 │
│     action:       () => repo.update(...),  // async                     │
│     reconcile:    (state, result) => state // authoritative apply       │
│     rollback?:    (state, error) => state  // failure restore           │
│   })                                                                    │
│                                                                         │
│   slice setters (pure, immutable):                                      │
│     upsertProject(prev, project) → Project[]                            │
│     removeProject(prev, id)      → Project[]                            │
│     replaceDrive(prev, drive)    → Drive[]                              │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
            ┌──────────────────┼─────────────────────┐
            ▼                  ▼                     ▼
┌──────────────────┐  ┌───────────────────┐  ┌────────────────────────┐
│ LocalCatalog     │  │ catalogEvents     │  │ ScanWorkflowProvider   │
│ Repository       │  │ (Tauri listen())  │  │ (push, not pull)       │
│ (SQLite WAL)     │  │ scoped invalidate │  │ emits scan-ingested    │
└──────────────────┘  └───────────────────┘  └────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With | File |
|-----------|---------------|-------------------|------|
| `CatalogStoreContext` | Owns canonical entity arrays; exposes typed mutations; coordinates scope-aware refresh | Pages, Repository, Event bus | `providers.tsx` |
| `runOptimisticMutation` | Generic apply→action→reconcile/rollback pipeline; sole writer to slice state | Slice setters, Repository | new helper in `providers.tsx` or `optimisticMutation.ts` |
| Slice setters | Pure immutable updaters (`upsertProject`, `removeDrive`, …) | Used by both optimistic + reconcile paths | new `apps/desktop/src/app/catalogSlices.ts` |
| `catalogEvents` | Subscribes to Tauri `emit()` events; routes scoped invalidations into slice setters | Rust backend, slice setters | new `apps/desktop/src/app/catalogEvents.ts` |
| `useOptimisticMutation` | Page-local UI flags only (`isPending`, `isConfirmed`); unchanged | Pages | existing |
| `LocalCatalogRepository` | Returns the **updated entity** from every mutation (not void) | SQLite | `packages/data/src/localCatalogRepository.ts` |
| `ScanWorkflowProvider` | Emits `scan-projects-ingested` after `ingestScanSnapshot`; stops calling top-level `refresh()` | Event bus | `scanWorkflow.tsx` |

### Data Flow Direction

**Mutation flow (write):**

```
Page  ──action()──▶  Store.updateProjectMetadata(input)
                       │
                       ▼
                runOptimisticMutation({
                  optimistic: setProjects(prev => upsertProject(prev, draftProject)),
                  action:     () => repository.updateProjectMetadata(input),
                  reconcile:  (saved) => setProjects(prev => upsertProject(prev, saved)),
                  rollback:   (err)   => setProjects(prev => upsertProject(prev, original))
                })
                       │
                       ▼
                SQLite WAL write  ──returns Project──▶  reconcile()
                       │ (on error)
                       ▼
                rollback()  +  surface Error to caller
```

**Read flow (boot only):**

```
App mount ──▶ bootCatalog() ──▶ Promise.all([listProjects, listDrives, listScans, listScanSessions])
                                  ──▶ initial state hydration
```

**Event flow (push from Rust):**

```
Rust scan_engine ──emit('scan-projects-ingested', {projectIds})──▶
  catalogEvents.listen ──▶ repository.listProjects({ids: projectIds})
  ──▶ setProjects(prev => mergeProjects(prev, fetched))
```

## Patterns to Follow

### Pattern 1: Optimistic Apply / Rollback with Snapshot

**What:** Every mutation captures a snapshot of the affected entity before applying the optimistic patch. On failure, the snapshot is restored with the same slice setter used for success.

**When:** All single-entity mutations (`updateProjectMetadata`, `deleteProject`, `deleteDrive`, `createDrive`, `createProject`).

**Example:**

```typescript
async function updateProjectMetadata(input: UpdateProjectMetadataInput): Promise<Project> {
  const previous = projects.find((p) => p.id === input.projectId)
  if (!previous) throw new Error(`Project not found: ${input.projectId}`)

  const draft: Project = { ...previous, ...input.changes, updatedAt: new Date().toISOString() }

  return runOptimisticMutation({
    apply:     () => setProjects((prev) => upsertProject(prev, draft)),
    action:    () => repository.updateProjectMetadata(input),
    reconcile: (saved) => setProjects((prev) => upsertProject(prev, saved)),
    rollback:  () => setProjects((prev) => upsertProject(prev, previous))
  })
}
```

**Rationale:** Snapshot-based rollback is the React 19 / TanStack Query / SWR consensus pattern. It is testable in isolation (slice setter is pure) and avoids the "stale state in closure" bug that plagues hand-rolled optimistic logic.

### Pattern 2: Slice Setters as Pure Functions

**What:** All entity-array updates go through pure functions in `catalogSlices.ts` rather than inline `setProjects((prev) => ...)` callbacks scattered across the provider.

**When:** Always — both optimistic apply and authoritative reconciliation use the same setters.

**Example:**

```typescript
// catalogSlices.ts
export function upsertProject(prev: readonly Project[], next: Project): Project[] {
  const idx = prev.findIndex((p) => p.id === next.id)
  if (idx === -1) return [...prev, next]
  const copy = prev.slice()
  copy[idx] = next
  return copy
}

export function removeProject(prev: readonly Project[], id: string): Project[] {
  return prev.filter((p) => p.id !== id)
}

export function mergeProjects(prev: readonly Project[], incoming: readonly Project[]): Project[] {
  const byId = new Map(prev.map((p) => [p.id, p]))
  for (const p of incoming) byId.set(p.id, p)
  return Array.from(byId.values())
}
```

**Rationale:** Pure setters can be unit-tested without React. Reusing them between optimistic and reconcile paths guarantees that "saved" state matches "draft" state structurally, eliminating a class of UI flicker bugs.

### Pattern 3: Repository Returns Updated Entity

**What:** Every mutation in `LocalCatalogRepository` returns the canonical post-write entity. No mutation returns `void`.

**When:** All `update*`, `create*`, `delete*` methods (delete returns `{ id }` so the cache can be updated).

**Example:**

```typescript
// Already true for updateProjectMetadata + createProject + createDrive.
// CHANGE: deleteProject and deleteDrive currently return void → return { id }.
async deleteProject(projectId: string): Promise<{ id: string }> {
  await persistence.deleteProject(projectId)
  return { id: projectId }
}
```

**Rationale:** Lets the store update its slice without an extra read. Avoids a "delete then re-list" round-trip.

### Pattern 4: Scope-Aware Refresh (Targeted Re-fetch)

**What:** Replace `refresh()` (all four collections) with `refreshScope(scope: CatalogScope)` that re-fetches only the named collection.

**When:** After Rust scan ingestion, after multi-entity operations (`importFoldersFromVolume` writes many projects in a single transaction), or as a manual recovery path.

**Example:**

```typescript
type CatalogScope = 'projects' | 'drives' | 'scans' | 'scanSessions'

const refreshScope = useCallback(async (scope: CatalogScope): Promise<void> => {
  switch (scope) {
    case 'projects':     setProjects(await repository.listProjects()); return
    case 'drives':       setDrives(await repository.listDrives()); return
    case 'scans':        setScans(await repository.listScans()); return
    case 'scanSessions': setScanSessions(await repository.listScanSessions()); return
  }
}, [])
```

**Rationale:** Keep `refresh()` available as a "nuclear" recovery option, but stop using it as the consistency mechanism. Scoped refresh is the smallest viable replacement that does not require a full event protocol.

### Pattern 5: Tauri `emit` / `listen` for Backend-Pushed Updates

**What:** Rust scan engine emits typed events when persisted state changes. Frontend listens at provider mount and dispatches scoped updates.

**When:** Phase 2 — after the optimistic mutation pipeline lands. Replaces the 900ms polling loop in `scanWorkflow.tsx`.

**Example:**

```typescript
// catalogEvents.ts
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export interface CatalogEventHandlers {
  onProjectsIngested: (projectIds: readonly string[]) => void
  onScanSessionUpdated: (sessionId: string) => void
}

export async function subscribeCatalogEvents(handlers: CatalogEventHandlers): Promise<UnlistenFn> {
  const off1 = await listen<{ projectIds: string[] }>('scan:projects-ingested',
    (e) => handlers.onProjectsIngested(e.payload.projectIds))
  const off2 = await listen<{ sessionId: string }>('scan:session-updated',
    (e) => handlers.onScanSessionUpdated(e.payload.sessionId))
  return () => { off1(); off2() }
}
```

```rust
// scan_engine.rs — emit after persisting a snapshot batch
app_handle.emit("scan:projects-ingested", ProjectsIngestedPayload {
  project_ids: ingested_ids,
}).ok();
```

**Rationale:** Tauri's event system is the designed mechanism for backend→frontend push (verified in Tauri v2 docs). It eliminates the 4–5 DB round-trips per second documented in `CONCERNS.md` and removes the polling anti-pattern noted in the existing `ARCHITECTURE.md` line 222–226.

### Pattern 6: Reference Equality via Stable Slice Setters

**What:** Slice setters return a new array only when the entity changed. Memoized selectors (`selectedProject`, `getDriveDetailView`) then short-circuit re-renders.

**When:** Hot paths (project list, drive detail view).

**Example:**

```typescript
export function upsertProject(prev: readonly Project[], next: Project): Project[] {
  const idx = prev.findIndex((p) => p.id === next.id)
  if (idx === -1) return [...prev, next]
  if (shallowEqual(prev[idx], next)) return prev as Project[]   // ← bail out
  const copy = prev.slice()
  copy[idx] = next
  return copy
}
```

**Rationale:** Avoids a re-render of every consumer of `projects` when an unrelated entity is reconciled with identical data.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Introducing TanStack Query in Parallel

**What:** Adding `@tanstack/react-query` as a second cache layer alongside `CatalogStoreContext`.
**Why bad:** Two sources of truth for the same data. The Rust scan ingestion writes directly to SQLite; React Query has no way to know without a manual `invalidateQueries` call from the existing context — at which point you've reinvented the scope-aware refresh pattern with a much larger dependency footprint and an unfamiliar mental model.
**Instead:** Strengthen the existing context with the patterns above. TanStack Query is the right tool for HTTP-backed apps with N independent screens; this app has one canonical store and a Rust backend that owns the database.

### Anti-Pattern 2: Calling `refresh()` Inside Optimistic Reconcile

**What:** After a mutation succeeds, calling the full `refresh()` "to be safe."
**Why bad:** Defeats the optimistic pattern entirely — the user sees a flash of stale data while the four `SELECT *` queries run, then the same data they were already looking at.
**Instead:** Trust the returned entity. Only call `refreshScope` when a multi-entity write modified things you can't enumerate in advance (e.g., `importFoldersFromVolume`).

### Anti-Pattern 3: Optimistic Updates Without Snapshot

**What:** Applying the patch with `setProjects((prev) => prev.map(...))` and on failure re-fetching from the DB.
**Why bad:** During the failed-mutation window, the UI shows the optimistic state; on rollback it shows whatever the DB has, which may differ from the original due to a concurrent scan ingestion. User sees data jump twice (forward, then sideways).
**Instead:** Capture `previous` before applying, restore with the same slice setter on failure. The UI reverses cleanly.

### Anti-Pattern 4: Mutating Inside Optimistic State

**What:** `prev.find(p => p.id === id).name = newName` then `setProjects([...prev])`.
**Why bad:** Violates immutability rule (per repo coding-style.md), breaks `React.memo` and `useMemo` reference checks, and corrupts the rollback snapshot.
**Instead:** Always construct a new entity object and use the pure slice setter.

### Anti-Pattern 5: Polling After Adding the Event Channel

**What:** Keeping the 900ms `pollScan` loop in `scanWorkflow.tsx` "as a backup" after wiring `listen('scan:session-updated')`.
**Why bad:** Doubles the work; the event channel will fire first, the poll then triggers a redundant SQLite read and a state replacement that is structurally identical to what just happened.
**Instead:** Remove the poll loop entirely once the event listener is verified end-to-end. Keep `reconcilePersistedScanSessions` for app boot only.

## SQLite WAL Implications for Concurrent Reads

The vendored `tauri-plugin-sql` is patched to `max_connections=1` with WAL mode (`ARCHITECTURE.md:212`). This has specific implications for optimistic-update reconciliation:

| Concern | Behavior | Implication for optimistic UI |
|---------|----------|------------------------------|
| Single writer, single reader (pool=1) | Reads block during writes (and vice versa) within the JS process | Optimistic apply runs synchronously in React state — never blocks. The DB write is the only blocking operation. |
| WAL allows concurrent reader processes | Rust scan ingestion (separate connection from same plugin) can write while JS reads in flight | Race window: optimistic apply + JS-side read of the same row could observe a Rust-written intermediate state. **Mitigation:** treat the Rust event channel (`scan:projects-ingested`) as authoritative — apply scoped re-fetch on receipt. |
| `busy_timeout` on the connection | If the single pooled connection is busy, queries wait rather than fail | Rare `SQLITE_BUSY` is unlikely. Optimistic mutations don't need explicit retry logic. |
| WAL checkpoint on idle | Periodic `wal-index` flush; transparent to the app | None at the architecture layer. |

**Verdict:** WAL mode is **safe** for the optimistic pattern as designed. The single-writer constraint actually helps — the JS layer cannot accidentally race against itself. The only meaningful race is JS↔Rust, and the event channel is the correct synchronization primitive.

## Pattern for Multi-Entity Mutations

`importFoldersFromVolume` writes N project rows in a single repository call. The optimistic version cannot enumerate the IDs in advance (they're generated server-side).

**Approach: Optimistic placeholder + scoped reconcile.**

```typescript
async function importFoldersFromVolume(input: ImportFoldersFromVolumeInput): Promise<ImportFoldersFromVolumeResult> {
  const previousProjects = projects   // snapshot full slice (cheap — array of refs)

  // Optimistic: don't fabricate IDs, just show pending count via isMutating + a transient flag
  setIsMutating(true)
  try {
    const result = await repository.importFoldersFromVolume(input)
    // Reconcile: scoped re-fetch (we know which slice changed)
    await refreshScope('projects')
    return result
  } catch (error) {
    setProjects(previousProjects)   // full-slice rollback (single-write, cheap)
    throw error
  } finally {
    setIsMutating(false)
  }
}
```

**Rationale:** When you can't enumerate the optimistic patch, fall back to "scoped re-fetch on success" + "full-slice snapshot rollback on failure." Still avoids touching the other three collections. Snapshotting an array of references is O(1) — only the references are captured, not deep clones.

## Data Freshness Strategy

| Trigger | Strategy | Rationale |
|---------|----------|-----------|
| App boot | Full `Promise.all` of all four lists | Need complete state; one-time cost |
| Single-entity mutation success | Trust returned entity → slice upsert | The DB just told us the truth |
| Single-entity mutation failure | Restore snapshot | Optimistic patch was wrong |
| Multi-entity mutation success | `refreshScope(<affected>)` only | Can't enumerate; affected scope is known |
| Tauri `scan:projects-ingested` event | `repository.listProjects({ids})` → merge | Rust wrote outside our control |
| User clicks "Refresh" (manual escape hatch) | `refresh()` (full reload) | Recovery; rare |
| Window focus / app foreground | **None for v1** | Rust events cover the only external writer |
| Periodic background poll | **None** | Antithetical to the goal |

## Build Order Implications

The refactor decomposes into three layered increments. Each is independently shippable.

### Phase A — Foundation (slice setters + repository contract)

Order matters: setters and repository return types must land before the pipeline can use them.

1. Create `apps/desktop/src/app/catalogSlices.ts` with pure setters (`upsertProject`, `removeProject`, `upsertDrive`, `removeDrive`, `mergeProjects`, `replaceScanSession`, etc.). Unit-test each.
2. Modify `LocalCatalogRepository.deleteProject` and `deleteDrive` to return `{ id }` instead of `void`. Update the `CatalogRepository` interface and `MockCatalogRepository`.
3. Confirm existing `update*` and `create*` methods already return the entity (they do per `CatalogStoreContextValue`).

**Quality gate:** `pnpm test` passes; `pnpm tsc --noEmit` clean.

### Phase B — Optimistic pipeline + scoped refresh

4. Add `runOptimisticMutation` helper to `providers.tsx` (or extract to `apps/desktop/src/app/optimisticMutation.ts` if `providers.tsx` is approaching the 800-line limit).
5. Add `refreshScope(scope)` alongside the existing `refresh()`. Do not remove `refresh()` yet.
6. Rewrite each mutation in `CatalogStoreContextValue` to use `runOptimisticMutation` + slice setters. Keep `runMutation` available for `importFoldersFromVolume` (multi-entity case).
7. Update `ProjectDetailPage` save flow to surface `rollback` errors via `useOptimisticMutation`'s `onRollback`.

**Quality gate:** Manual test — edit a project name, confirm UI updates instantly; force a failure (disconnect SQLite path), confirm rollback restores prior state.

### Phase C — Event channel (replaces polling)

8. Add `scan:projects-ingested` and `scan:session-updated` `emit()` calls in Rust `scan_engine.rs` after each successful persistence batch.
9. Create `apps/desktop/src/app/catalogEvents.ts` with `subscribeCatalogEvents()`.
10. Wire subscription in `AppProviders` `useEffect` after `bootCatalog()`. On `scan:projects-ingested`, call `repository.listProjects({ids})` (requires adding `ids` filter to `listProjects` — small repository change) and merge.
11. Remove the `pollScan` loop in `scanWorkflow.tsx`. Keep `reconcilePersistedScanSessions` for boot only.

**Quality gate:** Run a scan; verify projects appear without the 900ms polling tick; verify CPU drops compared to baseline during long scans.

## Scalability Considerations

| Concern | At 100 projects | At 10K projects | At 100K projects |
|---------|----------------|-----------------|------------------|
| Boot `listProjects` | ~5ms | ~80ms | ~800ms (consider streaming or paged hydration) |
| Optimistic apply (`upsertProject`) | O(n) scan + O(n) copy ≈ negligible | ~0.5ms | ~5ms (indexed Map cache becomes worthwhile) |
| Re-render of consumers | Negligible | Noticeable if all consumers iterate the full list | Mandates virtualization (`react-window`) and selector memoization |
| Slice rollback (snapshot of references) | Free | Free | Free (always O(n) shallow refs, never deep) |
| Tauri event payload size | <1KB | <50KB (10K UUIDs) | Batch into chunks of 1K IDs |

**Action item for v1:** None. Current catalog scale (per `PROJECT.md`) is hundreds-to-low-thousands of projects. Indexed Map cache becomes a Phase D consideration only if the user reports lag at 10K+.

## Sources

- `apps/desktop/src/app/providers.tsx` (current `runMutation` implementation, lines 77–129) — primary
- `apps/desktop/src/app/useOptimisticMutation.ts` (existing partial pattern) — primary
- `.planning/codebase/ARCHITECTURE.md` (anti-patterns section, polling vs events) — primary
- `.planning/codebase/CONCERNS.md` (performance bottlenecks, lines 102–113) — primary
- Tauri v2 `emit`/`listen` API — https://v2.tauri.app/develop/calling-frontend/ (HIGH confidence — official)
- React 19 `useOptimistic` semantics — https://react.dev/reference/react/useOptimistic (HIGH confidence — official; pattern matches what we implement manually here, but `useOptimistic` is single-component scoped and unsuitable for context-shared state)
- SQLite WAL concurrency — https://www.sqlite.org/wal.html (HIGH confidence — official)
- TanStack Query optimistic update guide (consulted as anti-pattern reference) — https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates (HIGH confidence — official)

---

*Architecture research for optimistic UI: 2026-05-02*
