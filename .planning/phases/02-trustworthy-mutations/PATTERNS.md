# Phase 2: Trustworthy Mutations — Pattern Map

**Mapped:** 2026-05-02
**Files analyzed:** 7 change targets
**Analogs found:** 7 / 7

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/app/useImportFromVolume.ts` (extract from DrivesPage) | hook | request-response | `src/app/useAsyncAction.ts` + `src/app/scanWorkflow.tsx` | role-match |
| `src/pages/DriveCreateForm.tsx` (extract from DrivesPage) | component | request-response | `src/pages/DrivesPage.tsx` lines 607–665 (CreateDriveForm) | exact — lift & rename |
| `src/pages/DriveDetailPage.tsx` (extract scan + import sections) | page | request-response | itself (current 723-line file) | exact |
| `src/pages/DrivesPage.tsx` (shrink to ≤ 400 lines) | page | request-response | itself (current 761-line file) | exact |
| `src/pages/pagePrimitives.tsx` (CapacityBar "unknown" state fix) | component | — | itself lines 624–672 | exact |
| `src/pages/DrivesPage.tsx` / `DriveDetailPage.tsx` (empty-state fix) | page | — | itself lines 354–414 | exact |
| `packages/data/src/sqliteLocalPersistence.ts` (prune scan_sessions) | data | CRUD | itself lines 890–921 (deleteDrive cascade) | role-match |

---

## Pattern Assignments

### 1. `src/app/useImportFromVolume.ts` — Extract hook from DrivesPage

**Analog:** `src/app/useAsyncAction.ts` (hook structure) + `src/app/scanWorkflow.tsx` lines 50–165 (multi-state workflow hook)

The import-from-volume flow in `DrivesPage.tsx` owns 5 state variables (lines 93–97), 3 async functions (lines 165–267), and 3 derived values (lines 269–276). This is exactly the pattern `scanWorkflow.tsx` uses for its own multi-step async flow.

**Hook structure pattern** (`src/app/useAsyncAction.ts` lines 55–99):
```typescript
export function useAsyncAction<TResult>(
  action: () => Promise<TResult>,
  options: UseAsyncActionOptions<TResult> = {}
): UseAsyncActionReturn {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const actionRef = useRef(action);
  actionRef.current = action;
  // ... stable refs for callbacks ...

  const run = useCallback((): void => {
    setIsPending(true);
    setError(null);
    actionRef.current().then(
      (result) => { setIsPending(false); onSuccessRef.current?.(result); },
      (rawError: unknown) => {
        const normalised = toError(rawError);
        setIsPending(false);
        setError(normalised);
        onErrorRef.current?.(normalised);
      }
    );
  }, []);

  return { run, isPending, error, reset };
}
```

**Multi-state workflow pattern** (`src/app/scanWorkflow.tsx` lines 50–60, 81–113):
```typescript
// State machine: idle → enumerating → preview → importing
const [importSourcePath, setImportSourcePath] = useState<string | null>(null);
const [importFolders, setImportFolders] = useState<VolumeFolderEntry[] | null>(null);
const [importVolumeInfo, setImportVolumeInfo] = useState<VolumeInfo | null>(null);
const [isPickingImport, setIsPickingImport] = useState(false);
const [isImporting, setIsImporting] = useState(false);
```

**State machine comment convention** (`src/pages/DrivesPage.tsx` lines 85–92):
```typescript
// One-shot flow: pick a mounted volume → read its volume metadata + top-
// level folders in parallel → preview → confirm.
//
//   idle:        importSourcePath === null
//   enumerating: isPickingImport === true
//   preview:     importSourcePath && importFolders !== null
//   importing:   isImporting === true
```

**What the new hook should return:**
```typescript
export interface UseImportFromVolumeReturn {
  // State machine observables
  importSourcePath: string | null;
  importFolders: VolumeFolderEntry[] | null;
  importVolumeInfo: VolumeInfo | null;
  isPickingImport: boolean;
  isImporting: boolean;
  // Derived helpers
  matchedDrive: Drive | null;
  previewExistingPaths: Set<string>;
  previewDriveName: string;
  // Actions
  runImportFromVolume(): Promise<void>;
  closeImportDialog(): void;
  handleConfirmImportFromVolume(): Promise<void>;
}
```

**Imports pattern** (copy from `src/app/volumeImportCommands.ts` lines 1–3 + `src/app/scanCommands.ts` lines 1–2):
```typescript
import { invoke } from "@tauri-apps/api/core";
import { getVolumeInfo, isDesktopScanAvailable } from "./scanCommands";
import {
  enumerateVolumeFolders,
  pickVolumeRoot,
  type VolumeFolderEntry
} from "./volumeImportCommands";
```

**Error surfacing pattern** (`src/pages/DrivesPage.tsx` lines 182–191):
```typescript
} catch (error) {
  closeImportDialog();
  setFeedback({
    tone: "error",
    title: "Could not read folders",
    messages: [error instanceof Error ? error.message : "The selected location could not be read."]
  });
} finally {
  setIsPickingImport(false);
}
```

The hook accepts `drives`, `projects`, `createDrive`, `importFoldersFromVolume`, and a `setFeedback` callback as parameters so it stays decoupled from `useCatalogStore` — matching the pattern of `useAsyncAction` which takes the action as a parameter rather than pulling from context.

---

### 2. `src/pages/DriveCreateForm.tsx` — Lift out of DrivesPage

**Analog:** `src/pages/DrivesPage.tsx` lines 607–760 (CreateDriveForm + FormField)

This is a pure lift-and-rename. `CreateDriveForm` and `FormField` are already defined as standalone function components with explicit prop interfaces. They have no dependency on DrivesPage's closure state.

**Existing component signature** (`src/pages/DrivesPage.tsx` lines 607–619):
```typescript
function CreateDriveForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  isMutating
}: {
  form: DriveFormState;
  onChange: (next: DriveFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  isMutating: boolean;
}) {
```

**Existing FormField signature** (`src/pages/DrivesPage.tsx` lines 738–760):
```typescript
function FormField({
  label,
  required,
  children
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
```

**DriveFormState type** (`src/pages/DrivesPage.tsx` lines 64–70):
```typescript
interface DriveFormState {
  volumeName: string;
  displayName: string;
  capacityTerabytes: string;
}

const initialDriveForm: DriveFormState = { volumeName: "", displayName: "", capacityTerabytes: "" };
```

**New file shape:**
- Export `CreateDriveForm` and `DriveFormState` and `initialDriveForm`
- Keep `FormField` as a module-internal helper (not exported — only `CreateDriveForm` needs it)
- Copy the `FormField` function into the new file unchanged
- Import `type { FormEvent, ReactNode }` from `"react"` — the only React import needed

---

### 3. `src/pages/DriveDetailPage.tsx` — Extract scan + import sections (723 → ≤ 400 lines)

**Analog:** `src/app/scanWorkflow.tsx` (precedent for extracting a complex multi-step flow into a dedicated file) and `src/pages/pagePrimitives.tsx` (precedent for presentational component extraction).

The scan section (lines 371–426) and import section (lines 452–474) of `DriveDetailPage.tsx`, plus their local state machines (lines 64–72) and async handlers (lines 154–226), total roughly 180–200 lines. The extraction follows the same separation already used for `ScanWorkflowProvider`.

**Scan section local state** (`src/pages/DriveDetailPage.tsx` lines 64–72):
```typescript
// Import-from-volume flow state. The three fields form a small state machine:
//   - idle:        importSourcePath === null
//   - enumerating: isPickingImport === true
//   - preview:     importSourcePath !== null && importFolders !== null
//   - importing:   isImporting === true
const [importSourcePath, setImportSourcePath] = useState<string | null>(null);
const [importFolders, setImportFolders] = useState<VolumeFolderEntry[] | null>(null);
const [isPickingImport, setIsPickingImport] = useState(false);
const [isImporting, setIsImporting] = useState(false);
```

**SectionCard composition pattern** (`src/pages/pagePrimitives.tsx` lines 233–264):
```typescript
export function SectionCard({ title, description, children, action }: SectionCardProps) {
  // ...
  return (
    <section className="card overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-5 py-4" ...>
        {/* title + description + action slot */}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
```

**Extracted component target shapes:**
- `DriveImportSection` — owns `importSourcePath`, `importFolders`, `isPickingImport`, `isImporting` state + `runImportPicker` + `handleConfirmImport`. Props: `{ driveId, drive, existingProjectPaths, setFeedback, importFoldersFromVolume }`
- `DriveScanSection` — wraps the existing `useScanWorkflow` read values into a presentational section. Props: `{ drive, scanSummary, activeSession, draftRootPath, setDraftRootPath, isScanAvailable, isPickingDirectory, chooseDirectory, startScan, cancelScan, scanError }`

Both use `SectionCard` from `pagePrimitives.tsx` as the wrapper (unchanged pattern).

---

### 4. `src/pages/pagePrimitives.tsx` — Fix CapacityBar "unknown" state

**Analog:** `src/pages/pagePrimitives.tsx` lines 624–672 (CapacityBar itself)

**Current broken behavior** (lines 634–636):
```typescript
const usedPctStr = pct !== null ? `${Math.max(1, pct)}%` : "28%";
```
When `totalBytes` or `usedBytes` is null, `pct` is null and the bar renders at 28% — a fake fill. `DriveCard` in `DrivesPage.tsx` does the same (lines 556–560):
```typescript
{usedPercent !== null ? (
  <div className="cap-used capacity-bar-fill" style={{ width: `${usedPercent}%` }} />
) : (
  <div className="cap-used opacity-20" style={{ width: "28%" }} />
)}
```

**Fix target — CapacityBar in `pagePrimitives.tsx`:**
```typescript
// BEFORE (line 635):
const usedPctStr = pct !== null ? `${Math.max(1, pct)}%` : "28%";

// AFTER — render nothing when bytes are unknown:
// pct === null branch: render no cap-used child at all, rely on aria-label
// for accessibility, and show a muted track only.
```

The `aria-label` and `role="progressbar"` attributes already handle the unknown state correctly (lines 648–652):
```typescript
aria-valuenow={pct !== null ? Math.round(pct) : undefined}
aria-label={pct !== null ? `Storage ${Math.round(pct)}% used` : "Storage usage unknown"}
```
The fix is purely in the render branch — add an `isUnknown` boolean derived from `pct === null` and skip the `cap-used` div entirely, or render it with `width: 0` and `opacity: 0`. Do not render a phantom 28% fill.

**DriveCard CapacityBar** (`src/pages/DrivesPage.tsx` lines 546–566) must also be fixed — it bypasses the `CapacityBar` component and renders the bar inline. Apply the same null-guard:
```typescript
// Replace the fake `opacity-20 style={{ width: "28%" }}` branch with nothing:
{usedPercent !== null ? (
  <div className="cap-used capacity-bar-fill" style={{ width: `${usedPercent}%` }} />
) : null}
```
The text label below (lines 570–575) already handles null correctly: `{usedPercentInt !== null ? `${usedPercentInt}% used` : "Unknown"}`.

---

### 5. `src/pages/DrivesPage.tsx` / `DriveDetailPage.tsx` — Fix "No import task has run yet" empty-state

**Analog:** `src/pages/DrivesPage.tsx` lines 350–414 (existing empty-state branch)

**Current condition** (`src/pages/DrivesPage.tsx` line 354):
```typescript
} : planningRows.length === 0 && !isCreateOpen ? (
  // Shows empty-state CTA including "No import task has run yet" text
```

The empty-state renders whenever `planningRows.length === 0`, including the first moments after boot before data loads (`isLoading` is guarded on line 350 but `planningRows` is computed from `drives` which starts as `[]`). The correct guard is: show the empty-state only when `!isLoading && drives.length === 0 && projects.length === 0`.

**Fix target — `DrivesPage.tsx`:**
```typescript
// BEFORE (line 354):
} : planningRows.length === 0 && !isCreateOpen ? (

// AFTER:
} : drives.length === 0 && projects.length === 0 && !isCreateOpen ? (
```

The `projects` check is the key addition — if projects exist but no drives do, the user has data and the CTA should not claim "no import task has run yet". The `drives` check is already implied by `planningRows.length === 0` but the `projects` guard is new.

**FeedbackState pattern for any error surface** (`src/pages/feedbackHelpers.ts` lines 7–11):
```typescript
export type FeedbackState = {
  tone: "success" | "warning" | "error" | "info";
  title: string;
  messages: string[];
} | null;
```

---

### 6. Optimistic mutations — wrap IPC writes with `useOptimisticMutation`

**Analog:** `src/app/useOptimisticMutation.ts` lines 60–121 (already implemented, unused by pages)

`useOptimisticMutation` already exists and is fully implemented. No existing page currently uses it — all mutations go through `providers.tsx` `runMutation` which is pessimistic (sets `isMutating = true`, awaits, then calls `refresh()`).

**Current pessimistic pattern** (`src/app/providers.tsx` lines 120–129):
```typescript
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
```

**The optimistic layer goes in the page, not in providers.** The pattern: snapshot current state → apply optimistic local update → call the provider mutation → on rollback, restore snapshot + call `setFeedback`.

**Usage pattern** (`src/app/useOptimisticMutation.ts` lines 25–38 — from the JSDoc):
```typescript
const save = useOptimisticMutation(
  (data: MetadataPayload) => updateProjectMetadata(data),
  {
    onSuccess: () => setFeedback({ tone: "success", title: "Saved", messages: [] }),
    onRollback: (err, data) => {
      restoreLocalState(data.previous);
      setFeedback({ tone: "error", title: "Save failed", messages: [err.message] });
    }
  }
);
```

**For `createDrive` (DrivesPage)** — optimistic pattern:
```typescript
// 1. Capture snapshot of drives before mutation
// 2. Immediately add a placeholder drive to local list (or close the form and show pending state)
// 3. Call createDrive(input) — on success, providers.refresh() replaces the placeholder
// 4. onRollback: restore the snapshot + setFeedback({ tone: "error", ... })
```

The `onRollback` callback receives both the error and the original data (line 105 of `useOptimisticMutation.ts`):
```typescript
onRollbackRef.current?.(normalised, data);
```

---

### 7. `packages/data/src/sqliteLocalPersistence.ts` — Prune `scan_sessions` after ingestion

**Analog:** `packages/data/src/sqliteLocalPersistence.ts` lines 890–921 (the `deleteDrive` cascade — only existing DELETE on `scan_sessions` keyed by drive)

There is no existing `pruneScanSessions` method. The precedent for ordered SQLite deletes is `deleteDrive` (lines 890–921):

```typescript
async deleteDrive(driveId: string): Promise<void> {
  const database = await this.#ensureReady();
  await withTransaction(database, async () => {
    // Delete child before parent — no FK constraints, ordering is manual
    await database.execute(
      "DELETE FROM scan_session_projects WHERE scan_id IN (SELECT scan_id FROM scan_sessions WHERE requested_drive_id = ?)",
      [driveId]
    );
    await database.execute("DELETE FROM scan_sessions WHERE requested_drive_id = ?", [driveId]);
    await database.execute("DELETE FROM drives WHERE id = ?", [driveId]);
  });
}
```

**`withTransaction` pattern** (used throughout the file — wraps multiple DELETEs in a transaction):
```typescript
await withTransaction(database, async () => {
  await database.execute("DELETE FROM scan_session_projects WHERE scan_id IN (...)", [...]);
  await database.execute("DELETE FROM scan_sessions WHERE ...", [...]);
});
```

**New method shape** — prune all terminal sessions except the most recent N per drive:
```typescript
async pruneFinishedScanSessions(keepPerDrive = 3): Promise<void> {
  const database = await this.#ensureReady();
  await withTransaction(database, async () => {
    // 1. Delete scan_session_projects for sessions outside the keep window
    await database.execute(
      `DELETE FROM scan_session_projects
       WHERE scan_id IN (
         SELECT scan_id FROM scan_sessions
         WHERE status IN ('completed', 'failed', 'cancelled', 'interrupted')
           AND scan_id NOT IN (
             SELECT scan_id FROM scan_sessions s2
             WHERE s2.requested_drive_id = scan_sessions.requested_drive_id
               AND s2.status IN ('completed', 'failed', 'cancelled', 'interrupted')
             ORDER BY s2.started_at DESC
             LIMIT ?
           )
       )`,
      [keepPerDrive]
    );
    // 2. Then delete the parent scan_sessions rows
    await database.execute(
      `DELETE FROM scan_sessions
       WHERE status IN ('completed', 'failed', 'cancelled', 'interrupted')
         AND scan_id NOT IN (
           SELECT scan_id FROM scan_sessions s2
           WHERE s2.requested_drive_id = scan_sessions.requested_drive_id
             AND s2.status IN ('completed', 'failed', 'cancelled', 'interrupted')
           ORDER BY s2.started_at DESC
           LIMIT ?
         )`,
      [keepPerDrive]
    );
  });
}
```

**Call site** — call `pruneFinishedScanSessions()` from `scanWorkflow.tsx` after `pollScan` detects a terminal status (line 96–103), or from `catalogActions.ts` after `syncDesktopScanSession` writes a completed session. Do not call it from `providers.tsx` `runMutation` — it is scan-specific.

**IPC invoke shape** (no new Rust command needed — this is a TS-side SQLite operation via the existing `SqlDatabase` interface):
```typescript
// Access via repository (already wired in scanWorkflow.tsx line 51):
const { repository } = useCatalogStore();
// Then: await repository.pruneFinishedScanSessions();
// But repository is LocalCatalogRepository, not SqliteLocalPersistence directly.
// The method must be declared on LocalPersistenceAdapter and forwarded.
```

Check `packages/data/src/localPersistence.ts` for the `LocalPersistenceAdapter` interface — the prune method must be added there first, then implemented in `SqliteLocalPersistence` and the `InMemoryLocalPersistence` stub.

---

## Shared Patterns

### FeedbackState + useFeedbackDismiss (cross-cutting across all page changes)

**Source:** `src/pages/feedbackHelpers.ts` lines 1–29
**Apply to:** All page components that surface errors or success notices

```typescript
// Post a notice:
setFeedback({ tone: "error", title: "Import failed", messages: [err.message] });

// Auto-dismiss wiring (call once per page):
useFeedbackDismiss(feedback, setFeedback);  // dismisses after 2800ms

// Render:
{feedback ? (
  <FeedbackNotice tone={feedback.tone} title={feedback.title} messages={feedback.messages} />
) : null}
```

### IPC invoke shape (Tauri commands)

**Source:** `src/app/scanCommands.ts` lines 22–32, `src/app/volumeImportCommands.ts` lines 51–60
**Apply to:** Any new IPC call (e.g., if a Rust `prune_scan_sessions` command is added later)

```typescript
// Guard + invoke pattern:
export async function someCommand(arg: string): Promise<ResultType> {
  if (!isDesktopScanAvailable()) {
    throw new Error("This command is only available inside the Tauri desktop app.");
  }
  try {
    return await invoke<ResultType>("rust_command_name", { arg });
  } catch (error) {
    throw new Error(normalizeCommandError(error));
  }
}
```

### Transaction + child-before-parent DELETE pattern

**Source:** `packages/data/src/sqliteLocalPersistence.ts` lines 890–921
**Apply to:** `pruneFinishedScanSessions` and any future multi-table cleanup

```typescript
await withTransaction(database, async () => {
  // Always delete child rows first (no FK constraints in this schema)
  await database.execute("DELETE FROM scan_session_projects WHERE scan_id IN (...)", [...]);
  await database.execute("DELETE FROM scan_sessions WHERE ...", [...]);
});
```

### Hook extraction shape (multi-state workflow)

**Source:** `src/app/scanWorkflow.tsx` lines 50–165 and `src/app/useAsyncAction.ts`
**Apply to:** `useImportFromVolume` hook extraction

Key conventions:
- State variables grouped by machine phase at top of hook body
- `useCallback` for all async functions (stable references for event handlers)
- No direct context reads inside the hook — inject deps as parameters
- Return a plain object (not a class instance)
- State machine comment block documents the phases

### Component extraction shape

**Source:** `src/pages/DrivesPage.tsx` lines 607–760 (CreateDriveForm / FormField)
**Apply to:** `DriveCreateForm.tsx`, `DriveImportSection`, `DriveScanSection`

Key conventions:
- Explicit prop interface defined with `interface` or inline object type
- No closure over page state — all values passed as props
- `onSubmit`, `onCancel`, `onChange` callbacks typed explicitly
- Internal-only sub-components stay in the same file and are not exported

---

## No Analog Found

All 7 changes have direct analogs in the existing codebase. No file requires relying on RESEARCH.md patterns from scratch.

| Closest gap | Note |
|---|---|
| `pruneFinishedScanSessions` on `LocalPersistenceAdapter` interface | Interface has no prune method yet — must add to `localPersistence.ts` interface before implementing in `SqliteLocalPersistence` and the InMemory stub. See `LocalPersistenceAdapter` in `packages/data/src/localPersistence.ts`. |
| Optimistic local state update in pages | `useOptimisticMutation` exists but no page calls it yet. The rollback pattern (snapshot → mutate → restore on error) has no prior call-site to copy — follow the JSDoc example in `useOptimisticMutation.ts` lines 25–38. |

---

## Metadata

**Analog search scope:** `apps/desktop/src/`, `apps/desktop/src-tauri/src/`, `packages/data/src/`
**Files read:** 14
**Pattern extraction date:** 2026-05-02
