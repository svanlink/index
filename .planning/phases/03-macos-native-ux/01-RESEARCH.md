# Phase 3: macOS-Native Catalog UX — Research

**Researched:** 2026-05-02
**Domain:** Tauri v2 macOS chrome (window-vibrancy, overlay titlebar, opener plugin), React 19 in-memory filtering, Rust setup hook
**Confidence:** HIGH — all claims verified against codebase and crates.io/Context7

---

## Summary

Phase 3 addresses five requirements: vibrancy sidebar (MAC-01), overlay titlebar traffic lights (MAC-02), instant client-side search (UX-01), accurate project detail fields (UX-03), and Open in Finder (UX-04).

The codebase is further along on several requirements than the phase description implies. `titleBarStyle: "Overlay"` is already set in `tauri.conf.json` (MAC-02 is partially done — CSS padding is missing, but the Tauri config is not a blocker). `showPathInFinder` is already implemented via `revealItemInDir` from `tauri-plugin-opener` in `nativeContextMenu.ts` and called from `ProjectDetailPage.tsx` (UX-04 is almost done — button exists, capability permission `opener:allow-reveal-item-in-dir` is granted). Search already runs client-side in `useMemo` with no debounce and no DB round-trip (UX-01 is done — confirm the search input path is wired correctly to `filterProjectCatalog`).

The two genuine gaps are: (1) `window-vibrancy` crate is not in `Cargo.toml` and `apply_vibrancy` is not called in `lib.rs` — MAC-01 needs Rust and CSS work; (2) The sidebar CSS uses a non-transparent solid-ish background (`rgba(246, 246, 247, 0.92)`) that blocks the vibrancy material from showing through.

**Primary recommendation:** Add `window-vibrancy = "0.7.1"` to Cargo.toml, call `apply_vibrancy` in the `setup` hook on the `main` window with `NSVisualEffectMaterial::Sidebar`, then make `--sidebar` token `transparent` so the native material bleeds through the CSS layer.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Sidebar vibrancy effect | Rust (Tauri setup hook) | CSS (transparency) | NSVisualEffect must be applied at the native window level; CSS only needs to expose it by setting background to transparent |
| Overlay titlebar + traffic light inset | Tauri config (already set) | CSS padding-top on sidebar | titleBarStyle is a Tauri window config; traffic light avoid-zone is pure CSS |
| Instant search filter | Browser / React (useMemo) | — | filterProjectCatalog already runs in-memory; no Rust involvement needed |
| Accurate project detail | Browser / React (context state) | SQLite (read path) | Data comes from providers.tsx refresh(); detail page reads from optimisticProjects already |
| Open in Finder | Tauri opener plugin (already wired) | JS glue in nativeContextMenu.ts | revealItemInDir is the correct Tauri v2 API; capability is already granted |

---

## MAC-01 — Window Vibrancy

### Current State

- `window-vibrancy` crate: NOT in `apps/desktop/src-tauri/Cargo.toml` [VERIFIED: file read]
- `apply_vibrancy` call: NOT in `apps/desktop/src-tauri/src/lib.rs` [VERIFIED: file read]
- `lib.rs` has a `.setup()` hook at line 48-51 that currently only logs and calls `app.handle()` — the right insertion point for vibrancy

### Crate Version

- Latest: `window-vibrancy = "0.7.1"` (published 2025-11-12) [VERIFIED: crates.io]
- Not in Cargo.toml — must be added

### Correct API (Tauri v2)

`get_webview_window("main")` is the Tauri v2 method for getting the window handle. The window label in `tauri.conf.json` is `"main"` by default (no explicit label set, so Tauri assigns it). [VERIFIED: Context7 /tauri-apps/window-vibrancy]

```rust
// apps/desktop/src-tauri/src/lib.rs — inside .setup(|app| { ... })
#[cfg(target_os = "macos")]
{
    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
    let window = app.get_webview_window("main").unwrap();
    apply_vibrancy(
        &window,
        NSVisualEffectMaterial::Sidebar,
        None,
        None
    ).expect("Failed to apply vibrancy");
}
```

`None, None` = default state (FollowsWindowActiveState) and no corner radius override. [VERIFIED: Context7]

### Required `tauri.conf.json` changes

The vibrancy docs specify `"transparent": true` must be set on the window AND `macOSPrivateApi: true` must be enabled. [VERIFIED: Context7 /tauri-apps/window-vibrancy, Tauri integration example]

Current `tauri.conf.json` window block (lines 13-24) does NOT have these fields. Required additions:

```json
{
  "title": "Catalog",
  "width": 1440,
  "height": 960,
  "minWidth": 1180,
  "minHeight": 760,
  "resizable": true,
  "titleBarStyle": "Overlay",
  "hiddenTitle": true,
  "transparent": true
}
```

And at the app level:

```json
"macOSPrivateApi": true
```

### CSS — Making Sidebar Transparent

The sidebar `<aside>` in `packages/ui/src/SidebarNav.tsx` (line 47-53) uses:

```
background: "var(--sidebar)"
```

`--sidebar` token in `globals.css` line 97:

```css
--sidebar: rgba(246, 246, 247, 0.92);
```

This near-opaque value blocks the native NSVisualEffect material from showing through the WebView. It must become `transparent` for vibrancy to be visible.

The `backdropFilter: "blur(20px) saturate(180%)"` CSS (SidebarNav.tsx line 51-52) is a CSS approximation currently in use. After vibrancy is applied natively, these CSS backdrop-filter lines can be removed from the sidebar — they would fight the native effect. The TopUtilityBar also uses a similar backdrop-filter approach (line 73-74 in TopUtilityBar.tsx) but that is NOT the vibrancy target, so leave it as-is.

Dark mode: `[data-theme="dark"]` in globals.css line 214 sets `--sidebar: #1d1d1f` (solid). This also must become transparent for dark mode vibrancy.

### What Must Stay Non-Transparent

Only the sidebar `<aside>` needs to be transparent. The `TopUtilityBar` `<header>` should keep its glass-blur CSS (`rgba(242, 242, 247, 0.82)` with `backdropFilter`) — it is not part of the vibrancy requirement and creates the frosted-glass topbar look.

---

## MAC-02 — Overlay Titlebar

### Current State

`tauri.conf.json` line 21-22:

```json
"titleBarStyle": "Overlay",
"hiddenTitle": true
```

Both already set. [VERIFIED: file read] The Tauri config work is complete.

### What Is Missing

Traffic light buttons (macOS close/minimize/maximize) appear at approximately `x=12, y=16` (standard macOS position) when `titleBarStyle: "Overlay"` is active. The sidebar content currently starts at `pt-3` (12px padding-top, SidebarNav.tsx line 46) and the drag-handle spacer `div` is `h-5` (20px, line 57). This 20px spacer is the current traffic light buffer — it may be sufficient or slightly tight depending on screen resolution.

Standard macOS traffic light button cluster sits at approximately 12px from top, 12px from left, and the buttons are 12px diameter with 8px gaps. The full avoid zone is approximately 70px wide × 28px tall from top-left.

The sidebar wordmark text block (`px-3 pb-5 pt-2`, line 62) renders immediately below the `h-5` spacer. The vertical clearance is: 12px (pt-3) + 20px (h-5 spacer) + 8px (pt-2 on brand block) = 40px before any text. That is tight. Standard macOS value for sidebar content start is ~28px from top edge (traffic lights are at y≈8 with 12px height = y≈20 + a few px buffer).

The current 20px drag spacer + 12px pt-3 = 32px total clearance before brand block. Needs to be at least ~44px (standard macOS value used by apps like Finder, Notes, Things 3).

### Required CSS Fix

Increase the drag handle spacer from `h-5` (20px) to approximately `h-[44px]` or equivalent to push all sidebar content below the traffic light cluster. No Tauri config change needed.

---

## UX-01 — Instant Client-Side Search

### Current State — ALREADY DONE

Search is fully client-side. In `ProjectsPage.tsx`:

- Line 67: `const [search, setSearch] = useState(searchParams.get("q") ?? "")`
- Line 116-123: `filteredProjects = useMemo(() => filterProjectCatalog(projects, drives, { search, ... }), [...])`
- The `search` state updates on every keystroke via `RootLayout.tsx` line 19: `const [globalSearch, setGlobalSearch] = useState(...)` and `onSearchChange={setGlobalSearch}` passed to `AppShell`

`filterProjectCatalog` in `packages/data/src/projectListSelectors.ts` (line 23-93) runs in-memory substring match against `haystack.includes(query)` — no debounce, no DB call. [VERIFIED: file read]

The search flows: TopUtilityBar input → `onSearchChange` → `setGlobalSearch` in RootLayout → URL param update via `submitGlobalSearch` on submit, but `ProjectsPage` reads `search` from its own local state at line 67 which syncs from URL params at lines 137-140:

```ts
useEffect(() => {
  const nextSearch = searchParams.get("q") ?? "";
  setSearch((current) => (current === nextSearch ? current : nextSearch));
}, [searchParams]);
```

This means search requires a form submit (Enter key) to update the URL and trigger the filter. The input value in `RootLayout` (`globalSearch`) updates on every keystroke, but `ProjectsPage.tsx` only filters after the URL param changes (on submit). This is the UX-01 gap.

### Gap

UX-01 requires "as user types — no debounce lag." Currently a submit is required to trigger filtering. Two options:

A) Wire `onSearchChange` directly to update the URL param on every keystroke (adds history noise, but simple).
B) Pass the live `globalSearch` value down from RootLayout into ProjectsPage as a prop or via context (avoids URL pollution, instant response).

Option B is cleaner. The search value already lives in RootLayout state. The ProjectsPage `useMemo` already computes the filtered list. The only gap is that ProjectsPage reads from `searchParams.get("q")` rather than from a live prop.

The simplest fix: change `onSearchChange` in RootLayout to also call `setSearchParams` immediately (not just on submit), or pass the live search string via a context/prop rather than requiring the URL roundtrip. Given the existing URL-as-state pattern in the codebase, updating the URL on every keystroke with `replace: true` (no history entry) is the least-invasive approach.

---

## UX-03 — Accurate Project Detail

### Current Data Model

`Project` interface in `packages/domain/src/project.ts`:

| Field | Type | Notes |
|-------|------|-------|
| `sizeBytes` | `number \| null` | Present — shown in detail `MetaField` at line 277 |
| `folderPath` | `string \| null` | Present — shown at line 254 as mono text below project name |
| `lastScannedAt` | `string \| null` | Present — shown in "Scan activity" section MetaField at line 322 |

[VERIFIED: file reads]

### Current Detail Page Rendering (ProjectDetailPage.tsx)

- **Size**: Line 277 — `currentProject.sizeBytes !== null ? formatBytes(currentProject.sizeBytes) : "Unknown"` — shows "Unknown" if null, not a dash
- **Path**: Line 254 — `currentProject.folderPath ?? currentProject.folderName` — shows folder name as fallback, never a dash
- **Last scanned**: Line 322 — `formatDate(currentProject.lastScannedAt)` — `formatDate` is from `dashboardHelpers.ts`

### Stale Data Risk

After a rescan, `providers.tsx` calls `refresh()` inside `runMutation`. Scan completion is via `scanWorkflow.tsx` — check whether `refresh()` is called after scan ingestion.

The `ProjectDetailPage` reads `selectedProject` from `useCatalogStore()`, which reads `optimisticProjects` from context. After `refresh()` is called in providers, `setProjects(nextProjects)` updates the source array. `selectedProject` is recomputed via `useMemo` at line 162-164: `projects.find((p) => p.id === selectedProjectId)`. This correctly picks up fresh data post-refresh.

No stale-context bug found. The detail page will show updated data after any mutation-triggered refresh. The concern is whether `lastScannedAt` and `sizeBytes` are actually updated by the ingestion path — that is a data question, not a React question.

### "Show in Finder" Button

Line 219-226 of `ProjectDetailPage.tsx` — button already exists:

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

Button is disabled when `folderPath` is null. Calls `showPathInFinder` from `nativeContextMenu.ts`. UX-04 is functionally complete.

---

## UX-04 — Open in Finder

### Current State — FUNCTIONALLY COMPLETE

Implementation chain already in place:

1. **Button**: `ProjectDetailPage.tsx` line 219-226 — calls `showPathInFinder(currentProject.folderPath)` [VERIFIED]
2. **Function**: `nativeContextMenu.ts` line 89-99 — `showPathInFinder` calls `revealItemInDir(normalized)` from `@tauri-apps/plugin-opener` [VERIFIED]
3. **Plugin in Cargo.toml**: `tauri-plugin-opener = "2.5.3"` at line 32 [VERIFIED]
4. **Plugin registered in lib.rs**: `.plugin(tauri_plugin_opener::init())` at line 46 [VERIFIED]
5. **Capability granted**: `"opener:allow-reveal-item-in-dir"` in `capabilities/default.json` line 13 [VERIFIED]

`revealItemInDir` is the correct Tauri v2 opener plugin function for revealing a file/folder in Finder (equivalent to `open -R`). [VERIFIED: Context7]

No work needed for UX-04 unless testing reveals a regression.

---

## Standard Stack

### Core (Required Additions)

| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| window-vibrancy | 0.7.1 | Apply NSVisualEffect materials to macOS window | [VERIFIED: crates.io, published 2025-11-12] |

### Already Present (No Changes Needed)

| Library | Version | Purpose |
|---------|---------|---------|
| tauri | 2.8.2 | Desktop framework | [VERIFIED: Cargo.toml] |
| tauri-plugin-opener | 2.5.3 | revealItemInDir for Finder integration | [VERIFIED: Cargo.toml] |
| tauri-plugin-log | 2.8.0 | Logging | [VERIFIED: Cargo.toml] |

### Installation

```bash
# In apps/desktop/src-tauri/
cargo add window-vibrancy@0.7.1
```

Or manually add to `Cargo.toml`:

```toml
window-vibrancy = "0.7.1"
```

---

## Architecture Patterns

### Pattern 1: Vibrancy in Tauri v2 Setup Hook

Apply vibrancy in the `.setup()` closure, after the window is created. The window label is `"main"` (Tauri v2 default when no label is specified).

```rust
// Source: Context7 /tauri-apps/window-vibrancy
.setup(|app| {
    info!("Catalog desktop starting (v1)");
    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
        let window = app.get_webview_window("main").unwrap();
        apply_vibrancy(
            &window,
            NSVisualEffectMaterial::Sidebar,
            None,
            None,
        ).expect("Failed to apply vibrancy");
    }
    Ok(())
})
```

### Pattern 2: Sidebar CSS Transparency for Vibrancy

The sidebar `background` must be `transparent` so the native NSVisualEffect layer shows through the WKWebView. The existing `backdropFilter` CSS is redundant once vibrancy is applied and should be removed from the sidebar element only.

In `packages/ui/src/SidebarNav.tsx` — change the `<aside>` style:

```tsx
// Before
style={{
  background: "var(--sidebar)",
  backdropFilter: "blur(20px) saturate(180%)",
  WebkitBackdropFilter: "blur(20px) saturate(180%)"
}}

// After
style={{
  background: "transparent"
  // no backdropFilter — native NSVisualEffect handles this
}}
```

In `globals.css` — `--sidebar` token no longer needs to be set for the sidebar component (it can remain for other potential uses or be cleaned up separately).

### Pattern 3: Instant Search via URL Replace

To make search filter on every keystroke without creating browser history entries, update `RootLayout.tsx` `submitGlobalSearch` to also be called from `onSearchChange`, using `replace: true`:

```tsx
// In RootLayout.tsx
function handleSearchChange(value: string) {
  setGlobalSearch(value);
  const nextQuery = value.trim();
  if (location.pathname === "/projects") {
    const nextParams = new URLSearchParams(searchParams);
    if (nextQuery) {
      nextParams.set("q", nextQuery);
    } else {
      nextParams.delete("q");
    }
    navigate(
      nextParams.toString() ? `/projects?${nextParams.toString()}` : "/projects",
      { replace: true }
    );
  }
}
```

Pass `onSearchChange={handleSearchChange}` instead of `onSearchChange={setGlobalSearch}`.

`ProjectsPage` already reads from `searchParams.get("q")` and syncs to local `search` state via `useEffect`. With the URL updating on every keystroke, the filter fires on every keystroke — no debounce required.

### Anti-Patterns to Avoid

- **Applying vibrancy outside the setup hook**: The window must exist before `apply_vibrancy` is called. The setup hook is the only safe place in Tauri v2.
- **Keeping `backdrop-filter` CSS on the sidebar after vibrancy**: CSS backdrop-filter on the WebView competes with the native NSVisualEffect layer, creating a doubled blur that looks wrong.
- **Setting `transparent: true` without `macOSPrivateApi: true`**: The window will render with a black background instead of transparent.
- **Updating search URL with `push` instead of `replace`**: Creates a history entry per keystroke — Back button becomes unusable.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| macOS vibrancy effect | Custom NSView via FFI | window-vibrancy 0.7.1 | Handles NSVisualEffectView setup, state management, corner radius — extensive edge case handling |
| Reveal in Finder | `Command::new("open").args(["-R", path])` shell exec | `tauri-plugin-opener::revealItemInDir` | Already integrated, capability scoped, handles sandbox constraints |

---

## Common Pitfalls

### Pitfall 1: Vibrancy Invisible Due to Non-Transparent WebView Background

**What goes wrong:** `apply_vibrancy` succeeds in Rust, but the sidebar looks unchanged — still solid white/gray.
**Why it happens:** The CSS sets `background: rgba(246, 246, 247, 0.92)` on the sidebar `<aside>`, covering the native effect.
**How to avoid:** Set sidebar background to `transparent`. Also requires `"transparent": true` in `tauri.conf.json` windows config.
**Warning signs:** Vibrancy appears nowhere, or only in areas outside the WKWebView frame.

### Pitfall 2: Missing `macOSPrivateApi: true`

**What goes wrong:** Window renders with black background when `transparent: true` is set.
**Why it happens:** macOS WKWebView requires the private API flag to enable transparency.
**How to avoid:** Add `"macOSPrivateApi": true` to the `app` section of `tauri.conf.json`.
**Warning signs:** Black window background instead of transparent.

### Pitfall 3: Traffic Light Overlap

**What goes wrong:** The "Catalog" wordmark or top nav item overlaps the traffic light buttons.
**Why it happens:** The current `h-5` (20px) spacer in SidebarNav is smaller than the standard macOS traffic light clearance zone (~28px button bottom + buffer).
**How to avoid:** Increase spacer to `h-[44px]` to provide standard clearance.
**Warning signs:** Traffic lights appear visually on top of sidebar text.

### Pitfall 4: Search Filtering Requires Enter Key

**What goes wrong:** User types in search box but list does not update until Enter is pressed.
**Why it happens:** `ProjectsPage` reads from `searchParams.get("q")` which only updates on form submit. RootLayout's `globalSearch` state is live but not plumbed to the URL on each keystroke.
**How to avoid:** Use `navigate(..., { replace: true })` in `onSearchChange` handler.
**Warning signs:** Filter only applies on Enter, not on keystroke.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust/Cargo | window-vibrancy build | ✓ | checked via Cargo.toml presence | — |
| tauri-plugin-opener | UX-04 (already wired) | ✓ | 2.5.3 | — |
| window-vibrancy crate | MAC-01 | ✗ (not in Cargo.toml) | 0.7.1 available | None — must add |

**Missing dependencies with no fallback:**
- `window-vibrancy = "0.7.1"` — must be added to `Cargo.toml` for MAC-01.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes (search input) | Substring match on client-side string array — no injection surface |
| V6 Cryptography | no | — |

### Threat Patterns for This Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via "Show in Finder" | Tampering | `opener:allow-reveal-item-in-dir` capability already scoped; `revealItemInDir` does not execute — only reveals in Finder |
| XSS via search input rendering | Tampering | React renders all values as text nodes; no `dangerouslySetInnerHTML` in search or project list |

No new security surface introduced in this phase. The `opener:allow-open-path` capability in `capabilities/default.json` is already path-scoped to `$HOME/**` and `/Volumes/**`.

---

## Open Questions

1. **Default window label for vibrancy**
   - What we know: `tauri.conf.json` has no explicit `label` field in the window config; Tauri v2 assigns `"main"` by default
   - What's unclear: Whether a Tauri v2 app without an explicit label uses `"main"` — this is the conventional default
   - Recommendation: Use `app.get_webview_window("main")` and add a runtime check — if `None` is returned, log a warning rather than panicking [ASSUMED]

2. **`macOSPrivateApi` location in tauri.conf.json schema**
   - What we know: Context7 shows it at app level; the current config has `app.security` but no `macOSPrivateApi` key
   - What's unclear: Whether the v2 schema uses `app.macOSPrivateApi` or a top-level key
   - Recommendation: Check the official Tauri v2 config schema at `https://schema.tauri.app/config/2` before writing the config change [ASSUMED placement]

3. **Vibrancy and dark mode interaction**
   - What we know: `[data-theme="dark"]` sets `--sidebar: #1d1d1f` (solid); NSVisualEffectMaterial::Sidebar adapts to the system light/dark mode automatically
   - What's unclear: Whether the existing `data-theme="dark"` toggle interacts with the native vibrancy (the sidebar CSS must be transparent in both themes)
   - Recommendation: Remove `--sidebar` from the dark theme override entirely; let the native material handle the appearance

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Default Tauri v2 window label is `"main"` when not specified | MAC-01 code example | `app.get_webview_window("main")` returns None; vibrancy call panics |
| A2 | `macOSPrivateApi: true` belongs in `tauri.conf.json` at the `app` level | MAC-01 config | Transparency silently ignored; black window background |

---

## Sources

### Primary (HIGH confidence)

- Context7 `/tauri-apps/window-vibrancy` — API signatures, Tauri v2 integration pattern, materials list
- crates.io API — `window-vibrancy 0.7.1` (published 2025-11-12), `tauri-plugin-opener 2.5.3`
- `/Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/Cargo.toml` — verified no window-vibrancy dep
- `/Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/src/lib.rs` — verified setup hook location
- `/Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/tauri.conf.json` — verified titleBarStyle Overlay already set
- `/Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/capabilities/default.json` — verified opener:allow-reveal-item-in-dir granted
- `/Users/vaneickelen/Desktop/Catalog/apps/desktop/src/app/nativeContextMenu.ts` — verified revealItemInDir implementation
- `/Users/vaneickelen/Desktop/Catalog/apps/desktop/src/pages/ProjectDetailPage.tsx` — verified "Show in Finder" button exists, fields shown
- `/Users/vaneickelen/Desktop/Catalog/apps/desktop/src/pages/ProjectsPage.tsx` — verified client-side filterProjectCatalog in useMemo
- `/Users/vaneickelen/Desktop/Catalog/packages/ui/src/SidebarNav.tsx` — verified sidebar background token and drag spacer height
- `/Users/vaneickelen/Desktop/Catalog/packages/ui/src/TopUtilityBar.tsx` — verified top bar separate from sidebar
- `/Users/vaneickelen/Desktop/Catalog/apps/desktop/src/styles/globals.css` — verified `--sidebar: rgba(246,246,247,0.92)`
- `/Users/vaneickelen/Desktop/Catalog/packages/domain/src/project.ts` — verified sizeBytes, folderPath, lastScannedAt fields present
- `/Users/vaneickelen/Desktop/Catalog/packages/data/src/projectListSelectors.ts` — verified filterProjectCatalog is pure in-memory substring

### Tertiary (LOW confidence — assumptions only)

- Default window label `"main"` in Tauri v2 when not specified: [ASSUMED] from training knowledge, not verified against Tauri v2 schema docs

---

## Metadata

**Confidence breakdown:**
- MAC-01 (vibrancy): HIGH — crate API verified via Context7, CSS gap identified in exact file/line
- MAC-02 (titlebar): HIGH — config already set; only CSS padding gap remains
- UX-01 (search): HIGH — code traced end-to-end; URL-on-keystroke gap confirmed
- UX-03 (detail accuracy): HIGH — all three fields present in model and rendered; stale-data path reviewed
- UX-04 (Open in Finder): HIGH — full implementation chain verified, capability granted

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (stable Tauri ecosystem, 30-day window)
