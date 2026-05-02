# Phase 3: macOS-Native Catalog UX — Pattern Map

**Mapped:** 2026-05-02
**Files analyzed:** 8 (5 new/modified, 3 shared-pattern sources)
**Analogs found:** 8 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src-tauri/Cargo.toml` | config | — | current `Cargo.toml` (self) | exact |
| `src-tauri/src/lib.rs` | config/entrypoint | request-response | current `lib.rs` (self) | exact |
| `src-tauri/tauri.conf.json` | config | — | current `tauri.conf.json` (self) | exact |
| `packages/ui/src/SidebarNav.tsx` | component | request-response | `SidebarNav.tsx` (self) | exact |
| `apps/desktop/src/styles/globals.css` | config | — | `globals.css` (self) | exact |
| `apps/desktop/src/pages/ProjectsPage.tsx` | component | CRUD/transform | `ProjectsPage.tsx` (self) | exact |
| `apps/desktop/src/pages/ProjectDetailPage.tsx` | component | CRUD | `ProjectDetailPage.tsx` (self) | exact |
| `apps/desktop/src/app/nativeContextMenu.ts` | utility | request-response | `nativeContextMenu.ts` (self) | exact |

---

## Pattern Assignments

### UX-01: NSVisualEffectView vibrancy on the sidebar

**Change target:** `apps/desktop/src-tauri/Cargo.toml` + `apps/desktop/src-tauri/src/lib.rs` (Rust) and `packages/ui/src/SidebarNav.tsx` + `apps/desktop/src/styles/globals.css` (frontend).

**Analog — dependency declaration:** `apps/desktop/src-tauri/Cargo.toml` lines 15-33

Current pattern to copy when adding the `window-vibrancy` crate:
```toml
[dependencies]
tauri        = { version = "2.8.2", features = [] }
tauri-plugin-dialog      = "2.4.0"
tauri-plugin-notification = "2.0.0"
tauri-plugin-sql         = { path = "vendor/tauri-plugin-sql", features = ["sqlite"] }
tauri-plugin-log         = "2.8.0"
tauri-plugin-opener      = "2.5.3"
# Add below:
# window-vibrancy = "0.5"   (check crates.io for latest 0.x compatible with Tauri 2)
```

**Analog — plugin registration in `lib.rs`** (lines 33-64):

Every plugin follows the same `.plugin(...)` chain on `tauri::Builder::default()`. The `window-vibrancy` setup call goes in `.setup()`:
```rust
.setup(|app| {
    info!("Catalog desktop starting (v1)");
    // Add vibrancy here:
    // #[cfg(target_os = "macos")]
    // {
    //     use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
    //     let window = app.get_webview_window("main").unwrap();
    //     apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None)
    //         .expect("Unsupported platform — vibrancy requires macOS 10.10+");
    // }
    let _ = app.handle();
    Ok(())
})
```

**Analog — sidebar CSS token:** `apps/desktop/src/styles/globals.css` line 97
```css
--sidebar: rgba(246, 246, 247, 0.92);
```
When vibrancy is active, the sidebar background must be transparent so the NSVisualEffectView bleed-through is visible. Update to:
```css
--sidebar: transparent;
```
The `backdropFilter` in `SidebarNav.tsx` (lines 51-53) already applies `blur(20px) saturate(180%)` via inline style. That CSS-level blur can be removed once native vibrancy is active (native is richer), or kept as a web fallback.

**Analog — sidebar `<aside>` background binding:** `packages/ui/src/SidebarNav.tsx` lines 44-54
```tsx
<aside
  data-tauri-drag-region
  className="sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto border-r px-3 pb-4 pt-3 lg:flex"
  style={{
    width: "var(--sidebar-width, 220px)",
    background: "var(--sidebar)",          // ← token to change to transparent
    borderColor: "var(--hairline)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)"
  }}
>
```
Change `background: "var(--sidebar)"` to `background: "transparent"` (or remove the inline override and let the CSS token do it).

---

### UX-02: Overlay titlebar — traffic light positioning

**Change target:** `apps/desktop/src-tauri/tauri.conf.json` and `apps/desktop/src/styles/globals.css` / `packages/ui/src/SidebarNav.tsx`.

**Analog — current `tauri.conf.json` window block** (lines 13-24):
```json
"windows": [
  {
    "title": "Catalog",
    "width": 1440,
    "height": 960,
    "minWidth": 1180,
    "minHeight": 760,
    "resizable": true,
    "titleBarStyle": "Overlay",
    "hiddenTitle": true
  }
]
```
`titleBarStyle: "Overlay"` and `hiddenTitle: true` are **already set**. No changes needed to `tauri.conf.json` for UX-02 — the titlebar is already overlay. The work is purely CSS padding.

**Analog — drag-region spacer in SidebarNav:** `packages/ui/src/SidebarNav.tsx` lines 55-57
```tsx
{/* Drag handle spacer aligned to the top-nav height so the window
    can be dragged from the whole top edge. */}
<div data-tauri-drag-region className="h-5" aria-hidden="true" />
```
Traffic lights on macOS with `titleBarStyle: "Overlay"` sit at approximately `y=12px`, height ~20px. The existing `h-5` (20px) spacer may need to increase to `h-[52px]` to clear the buttons — measure against the `--topnav-height: 52px` token in `globals.css` line 99. The correct value is `env(titlebar-area-height, 52px)` or a fixed `pt-[52px]` on the sidebar content area.

**Analog — TopUtilityBar:** `packages/ui/src/TopUtilityBar.tsx` — read that file to confirm whether it also needs a left-padding offset equal to the traffic light width (~74px on standard displays). If the top bar spans the full width including over the sidebar, no change is needed there.

---

### UX-03: Client-side substring filter — ProjectsPage

**Change target:** `apps/desktop/src/pages/ProjectsPage.tsx`

**Analog — existing `search` state and `filteredProjects` memo** (lines 67, 116-123):
```tsx
const [search, setSearch] = useState(searchParams.get("q") ?? "");

const filteredProjects = useMemo(
  () => filterProjectCatalog(projects, drives, {
    search, category: categoryFilter || "", folderType: folderTypeFilter || "",
    currentDriveId: driveFilter || undefined, targetDriveId: targetDriveFilter || undefined,
    showUnassigned, showMissing, showDuplicate, showMovePending
  }),
  [categoryFilter, folderTypeFilter, driveFilter, drives, projects, search,
   showDuplicate, showMissing, showMovePending, showUnassigned, targetDriveFilter]
);
```
The filter already runs client-side via `filterProjectCatalog` (pure function in `packages/data/src/projectListSelectors.ts`). The `search` state is already local `useState`. No new state is needed.

**The problem:** `search` is synced from/to `searchParams` (URL). The AppShell's `onSearchChange` prop writes to URL, which triggers a `useEffect` on line 137-140 that then updates `search`:
```tsx
useEffect(() => {
  const nextSearch = searchParams.get("q") ?? "";
  setSearch((current) => (current === nextSearch ? current : nextSearch));
}, [searchParams]);
```
This round-trip (keystroke → URL → effect → state → filter) is the source of per-keystroke lag. Fix: make `search` the authoritative state (already is), update `searchParams` with a debounce or on blur only, and pass `search` directly to the filter memo (already does this). The filter itself (`filterProjectCatalog`) is already a pure in-memory substring scan — no DB call.

**Analog — `filterProjectCatalog` haystack** (`packages/data/src/projectListSelectors.ts` lines 78-93):
```ts
const haystack = [
  project.folderName,
  project.parsedDate,
  project.parsedClient,
  project.parsedProject,
  getDisplayClient(project),
  getDisplayProject(project),
  project.category ?? "",
  getDriveNameFromMap(driveNameMap, project.currentDriveId),
  getDriveNameFromMap(driveNameMap, project.targetDriveId)
]
  .join(" ")
  .toLowerCase();

return haystack.includes(query);
```
This is the filter to keep unchanged — it is already O(projects) with a drive-name map built once per render.

**Pattern to copy for debounce:** There is no existing `useDebounce` hook in the codebase. Inline the debounce inside `onSearchChange` using `useRef` + `setTimeout` matching the pattern used for `feedback` auto-dismiss (line 132-135):
```tsx
const id = window.setTimeout(() => setFeedback(null), 2800);
return () => window.clearTimeout(id);
```
Apply same pattern to delay URL write by 250ms while keeping `search` state immediate.

---

### UX-04: Project detail — accurate size, path, last scan date

**Change target:** `apps/desktop/src/pages/ProjectDetailPage.tsx`

**Analog — existing `MetaField` dl grid** (lines 273-283):
```tsx
<dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
  <MetaField label="Current drive" value={currentDriveName} />
  <MetaField
    label={isMovePending ? "Target drive" : "Size"}
    value={isMovePending ? targetDriveName : (currentProject.sizeBytes !== null ? formatBytes(currentProject.sizeBytes) : "Unknown")}
    tone={isMovePending ? "accent" : undefined}
  />
  <MetaField label="Type" value={getFolderTypeLabel(currentProject.folderType)} />
  <MetaField label="Category" value={currentProject.category ?? "Uncategorized"} />
</dl>
```
Size is already wired: `formatBytes(currentProject.sizeBytes)` with `"Unknown"` fallback — not a placeholder dash. Path already displays on line 253-255:
```tsx
<p className="mono mt-2 text-[12px] leading-[1.5]" style={{ color: "var(--ink-3)" }}>
  {currentProject.folderPath ?? currentProject.folderName}
</p>
```

**Analog — scan activity MetaField** (lines 320-323):
```tsx
<dl className="mb-4 grid gap-x-6 gap-y-3 sm:grid-cols-3">
  <MetaField label="Last seen"    value={formatDate(currentProject.lastSeenAt)} />
  <MetaField label="Last scanned" value={formatDate(currentProject.lastScannedAt)} />
  <MetaField label="Source"       value={currentProject.isManual ? "Manual entry" : "Scanned"} />
</dl>
```
`lastScannedAt` is already displayed. The field exists on the `Project` type (`packages/domain/src/project.ts` line 37: `lastScannedAt: string | null`).

**Conclusion for UX-04:** All three data fields (`sizeBytes`, `folderPath`, `lastScannedAt`) are already bound to real data and rendered without placeholder dashes in the current `ProjectDetailPage.tsx`. Verify in the running app — if dashes appear, the values are `null` in the DB row, not a UI bug.

**Pattern for adding a new MetaField to the identity card dl** (copy the `MetaField` component pattern from lines 486-516):
```tsx
function MetaField({ label, value, tone, mono }: {
  label: string;
  value: string;
  tone?: "accent" | "warn";
  mono?: boolean;
}) {
  const valueColor =
    tone === "accent" ? "var(--accent-ink)"
    : tone === "warn"   ? "var(--warn)"
    :                     "var(--ink)";
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.08em]"
          style={{ color: "var(--ink-4)" }}>
        {label}
      </dt>
      <dd className={`tnum truncate text-[13.5px] font-medium ${mono ? "mono" : ""}`}
          style={{ color: valueColor, marginTop: 2 }}>
        {value}
      </dd>
    </div>
  );
}
```

---

### UX-05: "Open in Finder" button on ProjectDetailPage

**Change target:** `apps/desktop/src/pages/ProjectDetailPage.tsx` + (if needed) `apps/desktop/src/app/nativeContextMenu.ts`.

**Analog — existing "Show in Finder" button** (`apps/desktop/src/pages/ProjectDetailPage.tsx` lines 217-225):
```tsx
<button
  type="button"
  className="btn btn-sm"
  onClick={() => void showPathInFinder(currentProject.folderPath)}
  disabled={!currentProject.folderPath}
>
  <Icon name="folder" size={11} />
  Show in Finder
</button>
```
This button **already exists** and uses `showPathInFinder` from `nativeContextMenu.ts`.

**Analog — `showPathInFinder` implementation** (`apps/desktop/src/app/nativeContextMenu.ts` lines 89-99):
```ts
export async function showPathInFinder(path: string | null | undefined): Promise<void> {
  const normalized = path?.trim();
  if (!normalized || !isTauriRuntimeAvailable()) return;

  try {
    await revealItemInDir(normalized);   // tauri-plugin-opener
  } catch (error) {
    console.warn("[finder] reveal path unavailable", error);
  }
}
```
`revealItemInDir` is from `@tauri-apps/plugin-opener`. The plugin is already registered in `lib.rs` line 46 (`.plugin(tauri_plugin_opener::init())`) and in `Cargo.toml` line 32 (`tauri-plugin-opener = "2.5.3"`). No Rust changes needed.

**Alternate — `openPathInFinder`** (lines 77-87): opens the path itself (not its parent). Use `showPathInFinder` (reveals in Finder = shows the folder highlighted inside its parent) rather than `openPathInFinder` (opens the folder in Finder). The existing button already uses the correct call.

**Conclusion for UX-05:** The button and underlying utility already exist. If the requirement is "add it to a second location" (e.g., a standalone action card), copy the button markup from lines 217-225 verbatim.

---

## Shared Patterns

### Tauri IPC command pattern
**Source:** `apps/desktop/src/app/scanCommands.ts` lines 22-45 and `volumeImportCommands.ts` lines 51-60
**Apply to:** Any new Rust command + TS caller added for Phase 3 (none currently needed — `opener` plugin handles Finder without a custom command)
```ts
// TS caller pattern:
export async function myCommand(arg: string): Promise<ResultType> {
  if (!isDesktopScanAvailable()) {
    throw new Error("Only available in Tauri desktop app.");
  }
  try {
    return await invoke<ResultType>("my_command", { arg });
  } catch (error) {
    throw new Error(normalizeMyCommandError(error));
  }
}
```
```rust
// Rust command pattern (volume_info.rs lines 17-29):
#[tauri::command]
pub fn my_command(arg: String) -> Option<MyResult> {
    // ... implementation
}
// Register in lib.rs invoke_handler:
// tauri::generate_handler![..., my_command]
```

### Tauri plugin registration
**Source:** `apps/desktop/src-tauri/src/lib.rs` lines 33-64
**Apply to:** Adding `window-vibrancy` for UX-01
```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Pattern: each new plugin adds one .plugin(...) line
        .setup(|app| {
            // one-time setup, including vibrancy application
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // list all #[tauri::command] fns here
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### CSS design token usage
**Source:** `apps/desktop/src/styles/globals.css` lines 16-100 and all page files
**Apply to:** Any CSS changes for traffic light padding (UX-02)
- Never hardcode pixel values that match tokens — use `var(--topnav-height)` (52px), `var(--sidebar-width)` (220px), `var(--hairline)`, `var(--ink-3)`, etc.
- Traffic light safe area: use `env(titlebar-area-height, 52px)` or `padding-top: var(--topnav-height)` for sidebar top padding.

### FeedbackNotice / error surface
**Source:** `apps/desktop/src/pages/pagePrimitives.tsx` (imported in both ProjectsPage and ProjectDetailPage)
**Apply to:** Any new async action that can fail
```tsx
const [feedback, setFeedback] = useState<{
  tone: "success" | "warning" | "error" | "info";
  title: string;
  messages: string[];
} | null>(null);

// Auto-dismiss (from ProjectDetailPage lines 98-105):
useEffect(() => {
  if (!feedback) return;
  const timeoutId = window.setTimeout(() => setFeedback(null), 2800);
  return () => window.clearTimeout(timeoutId);
}, [feedback]);
```

### `useCatalogStore` — accessing project data
**Source:** `apps/desktop/src/app/providers.tsx` lines 36-58 (interface) and 248-253 (hook)
**Apply to:** Any component that needs `projects`, `selectedProject`, `drives`
```tsx
const {
  projects,
  drives,
  selectedProject,
  isLoading,
  isMutating
} = useCatalogStore();
```
All project fields from `packages/domain/src/project.ts` are available on `Project`: `folderPath`, `sizeBytes`, `lastScannedAt`, `lastSeenAt`, `createdAt`, `folderName`, `parsedClient`, `parsedProject`, etc.

---

## No Analog Found

None. All Phase 3 changes have direct analogs or are modifications of existing files.

---

## Key Findings

1. **`titleBarStyle: "Overlay"` is already set** in `tauri.conf.json` (line 21). UX-02 is pure CSS padding work — no Tauri config change required.

2. **"Show in Finder" button already exists** in `ProjectDetailPage.tsx` (lines 217-225) using `showPathInFinder` from `nativeContextMenu.ts`, which calls `revealItemInDir` from the already-registered `tauri-plugin-opener`. UX-05 is verifying placement, not implementing from scratch.

3. **Client-side filter is already client-side** — `filteredProjects` in `ProjectsPage.tsx` uses `useMemo` + `filterProjectCatalog` (pure in-memory function). The only DB round-trip issue is the `search → URL → useEffect → state` round-trip adding one React render cycle of lag. Fix by debouncing the URL write, not by changing the filter architecture.

4. **`tauri-plugin-opener` is registered** — `lib.rs` line 46, `Cargo.toml` line 32. No new Rust commands or plugin registrations are needed for UX-05.

5. **`window-vibrancy` crate is not yet in `Cargo.toml`** — UX-01 requires adding it and calling `apply_vibrancy` in the `.setup()` closure.

6. **Project fields `sizeBytes`, `folderPath`, `lastScannedAt` are all present** on the `Project` type (`packages/domain/src/project.ts`) and already rendered in `ProjectDetailPage.tsx`. If they show `—`, the source is null DB values from pre-scan rows, not missing UI bindings.

---

## Metadata

**Analog search scope:** `apps/desktop/src/`, `packages/ui/src/`, `packages/domain/src/`, `packages/data/src/`, `apps/desktop/src-tauri/`
**Files read:** 18
**Pattern extraction date:** 2026-05-02
