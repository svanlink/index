---
phase: 03-macos-native-ux
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/desktop/src-tauri/Cargo.toml
  - apps/desktop/src-tauri/src/lib.rs
  - apps/desktop/src-tauri/tauri.conf.json
  - packages/ui/src/SidebarNav.tsx
  - apps/desktop/src/styles/globals.css
  - apps/desktop/src/app/RootLayout.tsx
autonomous: true
requirements:
  - MAC-01
  - MAC-02
  - UX-01
  - UX-03
  - UX-04

must_haves:
  truths:
    - "Moving the window reveals native wallpaper bleed-through in the sidebar"
    - "Traffic light buttons are not obscured by any sidebar text or nav item"
    - "Typing in the search field updates the filtered project list immediately — no Enter required"
    - "Project detail shows honest labels for every field — no bare dashes"
    - "Show in Finder button is present and calls showPathInFinder on click"
  artifacts:
    - path: "apps/desktop/src-tauri/Cargo.toml"
      provides: "window-vibrancy dependency declaration"
      contains: "window-vibrancy"
    - path: "apps/desktop/src-tauri/src/lib.rs"
      provides: "apply_vibrancy call in setup hook, gated on macos"
      contains: "apply_vibrancy"
    - path: "apps/desktop/src-tauri/tauri.conf.json"
      provides: "transparent window + macOSPrivateApi flags"
      contains: "transparent"
    - path: "packages/ui/src/SidebarNav.tsx"
      provides: "transparent sidebar background, correct traffic light spacer"
      contains: "transparent"
    - path: "apps/desktop/src/styles/globals.css"
      provides: "transparent --sidebar token in all three theme contexts"
    - path: "apps/desktop/src/app/RootLayout.tsx"
      provides: "keystroke-level URL update with replace:true"
      contains: "replace: true"
  key_links:
    - from: "apps/desktop/src-tauri/src/lib.rs"
      to: "NSVisualEffectView (native)"
      via: "apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None)"
      pattern: "apply_vibrancy"
    - from: "packages/ui/src/SidebarNav.tsx"
      to: "native vibrancy layer"
      via: "background: transparent removes the CSS occluder"
      pattern: "transparent"
    - from: "apps/desktop/src/app/RootLayout.tsx"
      to: "apps/desktop/src/pages/ProjectsPage.tsx"
      via: "URL searchParam q updated on each keystroke → useEffect in ProjectsPage triggers filter"
      pattern: "replace: true"
---

<objective>
Apply native macOS chrome polish: sidebar vibrancy (MAC-01), traffic light clearance (MAC-02), keystroke search (UX-01), honest project detail labels (UX-03), and Open in Finder verification (UX-04).

Purpose: The app should look and feel native on macOS — wallpaper bleed-through in the sidebar, no content obscured by traffic lights, instant search, and a detail page that never shows placeholder dashes.

Output:
- Rust: window-vibrancy crate added, apply_vibrancy called in setup hook (macOS only)
- Config: tauri.conf.json has transparent=true and macOSPrivateApi=true
- CSS: sidebar background transparent in all three theme contexts (light, alternate, dark)
- SidebarNav: inline background overridden to transparent, backdropFilter removed, traffic light spacer increased from h-5 to h-[52px]
- RootLayout: onSearchChange updates URL on every keystroke with replace:true
- ProjectDetailPage: null field fallbacks changed from bare dashes to honest labels
- UX-04 verified present (no code change required)
</objective>

<execution_context>
@/Users/vaneickelen/.claude/get-shit-done/workflows/execute-plan.md
@/Users/vaneickelen/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/vaneickelen/Desktop/Catalog/.planning/PROJECT.md
@/Users/vaneickelen/Desktop/Catalog/.planning/ROADMAP.md
@/Users/vaneickelen/Desktop/Catalog/.planning/STATE.md
@/Users/vaneickelen/Desktop/Catalog/.planning/phases/03-macos-native-ux/01-RESEARCH.md
@/Users/vaneickelen/Desktop/Catalog/.planning/phases/03-macos-native-ux/PATTERNS.md
</context>

<interfaces>
<!-- Exact current state extracted from codebase — no exploration needed. -->

From apps/desktop/src-tauri/Cargo.toml (lines 15-32):
```toml
[dependencies]
chrono = { version = "0.4", features = ["serde"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri = { version = "2.8.2", features = [] }
tauri-plugin-dialog = "2.4.0"
tauri-plugin-notification = "2.0.0"
tauri-plugin-sql = { path = "vendor/tauri-plugin-sql", features = ["sqlite"] }
tauri-plugin-log = "2.8.0"
log = "0.4.29"
tauri-plugin-opener = "2.5.3"
```
Add after the last dependency: `window-vibrancy = "0.7.1"`

From apps/desktop/src-tauri/src/lib.rs (lines 49-53 — the setup hook):
```rust
.setup(|app| {
    info!("Catalog desktop starting (v1)");
    let _ = app.handle();
    Ok(())
})
```
Vibrancy call goes inside this closure, before `Ok(())`.

From apps/desktop/src-tauri/tauri.conf.json (lines 12-28):
```json
"app": {
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
  ],
  "security": {
    "csp": null
  }
}
```
Add `"transparent": true` to the window object and `"macOSPrivateApi": true` to the `"app"` object (sibling to "windows" and "security").

From packages/ui/src/SidebarNav.tsx (lines 44-57 — the <aside> and drag spacer):
```tsx
<aside
  data-tauri-drag-region
  className="sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto border-r px-3 pb-4 pt-3 lg:flex"
  style={{
    width: "var(--sidebar-width, 220px)",
    background: "var(--sidebar)",          // ← change to "transparent"
    borderColor: "var(--hairline)",
    backdropFilter: "blur(20px) saturate(180%)",       // ← remove
    WebkitBackdropFilter: "blur(20px) saturate(180%)"  // ← remove
  }}
>
  {/* drag spacer */}
  <div data-tauri-drag-region className="h-5" aria-hidden="true" />   {/* ← change h-5 to h-[52px] */}
```

From apps/desktop/src/styles/globals.css — all three --sidebar occurrences:
- Line 97  (light):   `--sidebar: rgba(246, 246, 247, 0.92);`  → `--sidebar: transparent;`
- Line 205 (alt):     `--sidebar: rgba(30, 30, 32, 0.92);`    → `--sidebar: transparent;`
- Line 214 (dark):    `--sidebar: #1d1d1f;`                   → `--sidebar: transparent;`

From apps/desktop/src/app/RootLayout.tsx (lines 70-84 — submitGlobalSearch and onSearchChange):
```tsx
// Current — only fires on submit (Enter key):
onSearchChange={setGlobalSearch}
onSearchSubmit={submitGlobalSearch}

// submitGlobalSearch currently uses navigate() without replace:true,
// which creates a history entry per search.
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Add window-vibrancy — Cargo.toml, lib.rs, tauri.conf.json</name>
  <files>
    apps/desktop/src-tauri/Cargo.toml
    apps/desktop/src-tauri/src/lib.rs
    apps/desktop/src-tauri/tauri.conf.json
  </files>
  <action>
**Cargo.toml** — append to [dependencies] block after the `tauri-plugin-opener` line:
```toml
window-vibrancy = "0.7.1"
```

**lib.rs** — add vibrancy call inside the existing `.setup(|app| { ... })` closure, after the `info!(...)` line and before `Ok(())`. Gate it on macOS only:
```rust
.setup(|app| {
    info!("Catalog desktop starting (v1)");
    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
        if let Some(window) = app.get_webview_window("main") {
            apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None)
                .expect("Failed to apply vibrancy — requires macOS 10.14+");
        }
    }
    let _ = app.handle();
    Ok(())
})
```
Use `if let Some(window)` rather than `.unwrap()` to avoid a panic if the window label ever differs.

**tauri.conf.json** — two additions:
1. Inside the window object (alongside "hiddenTitle": true), add: `"transparent": true`
2. Inside the "app" object (sibling to "windows" and "security"), add: `"macOSPrivateApi": true`

Final "app" object shape:
```json
"app": {
  "macOSPrivateApi": true,
  "windows": [
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
  ],
  "security": {
    "csp": null
  }
}
```

Do NOT change window dimensions, resizable, titleBarStyle, or hiddenTitle.

After writing both files, run:
```bash
cd /Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri && cargo check 2>&1
```
Fix any compile errors before proceeding.
  </action>
  <verify>
    <automated>cd /Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri && cargo check 2>&1 | tail -5</automated>
  </verify>
  <done>cargo check exits 0; Cargo.toml contains "window-vibrancy"; lib.rs contains "apply_vibrancy" inside a #[cfg(target_os = "macos")] block; tauri.conf.json has both "transparent": true and "macOSPrivateApi": true.</done>
</task>

<task type="auto">
  <name>Task 2: Make sidebar transparent — globals.css and SidebarNav.tsx + traffic light spacer</name>
  <files>
    apps/desktop/src/styles/globals.css
    packages/ui/src/SidebarNav.tsx
  </files>
  <action>
**globals.css** — three --sidebar token values must all become transparent so the native vibrancy material is visible in every theme context. Change these exact lines:
- Line 97:  `--sidebar: rgba(246, 246, 247, 0.92);`  →  `--sidebar: transparent;`
- Line 205: `--sidebar: rgba(30, 30, 32, 0.92);`    →  `--sidebar: transparent;`
- Line 214: `--sidebar: #1d1d1f;`                   →  `--sidebar: transparent;`

Leave `--sidebar-width`, `--color-sidebar`, and all other sidebar-adjacent tokens untouched.

**SidebarNav.tsx** — three changes to the `<aside>` inline style and one change to the drag spacer:

1. Change `background: "var(--sidebar)"` → `background: "transparent"`
   (The CSS var is now transparent anyway; the inline override also needs to be transparent.)

2. Remove the `backdropFilter` and `WebkitBackdropFilter` lines entirely from the `<aside>` inline style object. The native NSVisualEffect layer provides richer blur — CSS backdrop-filter on the same element creates a doubled, incorrect blur. Do NOT remove backdropFilter from TopUtilityBar.tsx (that file is out of scope).

3. Change the drag spacer from `className="h-5"` to `className="h-[52px]"`. The traffic light buttons on macOS with titleBarStyle Overlay sit at y≈8px with height 16px; 52px matches `--topnav-height` and provides standard clearance. This gives 52px of drag region above the wordmark before any tappable content starts.

After the `<aside>` style edit, the style prop should look like:
```tsx
style={{
  width: "var(--sidebar-width, 220px)",
  background: "transparent",
  borderColor: "var(--hairline)"
}}
```

Run TypeScript check after editing:
```bash
cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm tsc --noEmit 2>&1 | tail -20
```
  </action>
  <verify>
    <automated>grep -c "^\s*--sidebar: transparent" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/styles/globals.css && grep -c "h-\[52px\]" /Users/vaneickelen/Desktop/Catalog/packages/ui/src/SidebarNav.tsx</automated>
  </verify>
  <done>globals.css has three --sidebar values set to transparent; SidebarNav.tsx aside style has background:transparent, no backdropFilter, and the drag spacer uses h-[52px]; tsc --noEmit exits 0.</done>
</task>

<task type="auto">
  <name>Task 3: Wire search to filter on every keystroke + fix project detail null labels + verify UX-04</name>
  <files>
    apps/desktop/src/app/RootLayout.tsx
    apps/desktop/src/pages/ProjectDetailPage.tsx
  </files>
  <action>
**RootLayout.tsx — instant search (UX-01):**

Replace the current `onSearchChange={setGlobalSearch}` wiring. The `submitGlobalSearch` function already builds the correct URL; extract that logic into a shared helper and call it on every keystroke with `replace: true`.

Rename `submitGlobalSearch` to `navigateSearch` and add a `replace` parameter. Then define two callers:

```tsx
function navigateSearch(value: string, replace: boolean) {
  const nextQuery = value.trim();
  if (location.pathname === "/projects") {
    const nextParams = new URLSearchParams(searchParams);
    if (nextQuery) {
      nextParams.set("q", nextQuery);
    } else {
      nextParams.delete("q");
    }
    const nextSearch = nextParams.toString();
    navigate(nextSearch ? `/projects?${nextSearch}` : "/projects", { replace });
    return;
  }
  navigate(nextQuery ? `/projects?q=${encodeURIComponent(nextQuery)}` : "/projects", { replace });
}

function handleSearchChange(value: string) {
  setGlobalSearch(value);
  navigateSearch(value, true);   // replace=true: no history entry per keystroke
}

function handleSearchSubmit(value: string) {
  navigateSearch(value, false);  // replace=false: submit adds a history entry
}
```

Update the AppShell props:
```tsx
onSearchChange={handleSearchChange}
onSearchSubmit={handleSearchSubmit}
```

Remove the old `submitGlobalSearch` function entirely.

**ProjectDetailPage.tsx — honest null labels (UX-03):**

Locate the null fallback rendering for `lastScannedAt`. The research confirms that `sizeBytes` already shows "Unknown" and `folderPath` already falls back to `folderName`. The only gap to verify and fix is `lastScannedAt` going through `formatDate(null)`.

1. Find `formatDate` usage on `lastScannedAt` (line ~322). If `formatDate(null)` returns `"—"` or empty string, add an explicit guard:
   ```tsx
   value={currentProject.lastScannedAt
     ? formatDate(currentProject.lastScannedAt)
     : "Not yet scanned"}
   ```

2. Confirm `sizeBytes` fallback already reads `"Unknown"` (not `"—"`). If it already does, no change needed. If it shows `"—"`, change to `"Unknown"`.

3. Confirm `folderPath` display: if `folderPath` is null AND `folderName` is also null/empty, show `"Path unavailable"` instead of blank.

**UX-04 verification (grep only — no code change):**

Run these greps and confirm both return results:
```bash
grep -n "showPathInFinder" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/pages/ProjectDetailPage.tsx
grep -n "opener:allow-reveal-item-in-dir" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/capabilities/default.json
```

If either grep returns nothing, file a note in the SUMMARY — but based on research both are present and verified.

Run tsc and build checks after all edits:
```bash
cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm tsc --noEmit 2>&1 | tail -20
cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm --filter @drive-project-catalog/desktop build 2>&1 | tail -30
```
  </action>
  <verify>
    <automated>grep -n "replace: true" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/app/RootLayout.tsx && grep -n "Not yet scanned" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/pages/ProjectDetailPage.tsx && grep -n "showPathInFinder" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/pages/ProjectDetailPage.tsx</automated>
  </verify>
  <done>RootLayout.tsx has replace:true in the handleSearchChange path; ProjectDetailPage.tsx shows "Not yet scanned" for null lastScannedAt; showPathInFinder button is present; opener:allow-reveal-item-in-dir is in capabilities; tsc --noEmit and pnpm build both exit 0.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user input → React state → URL | Search string from keyboard; never used in SQL or shell |
| URL q param → filterProjectCatalog | In-memory substring match on client-held array; no injection surface |
| folderPath → revealItemInDir | Native Tauri opener plugin; does not execute the path, only reveals in Finder |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-01 | Tampering | folderPath → revealItemInDir | accept | revealItemInDir reveals in Finder only (no exec); capability already scoped to `opener:allow-reveal-item-in-dir`; path comes from trusted SQLite row, not user text input |
| T-03-02 | Tampering | search input → URL → filterProjectCatalog | accept | filter is pure in-memory substring match against project array; no SQL, no shell; React renders results as text nodes (no dangerouslySetInnerHTML) |
| T-03-03 | Spoofing | macOSPrivateApi: true flag | accept | required for WKWebView transparency; no additional IPC surface exposed; standard Tauri vibrancy integration pattern |
</threat_model>

<verification>
After all three tasks complete, run this suite from the monorepo root:

```bash
# 1. Rust compile
cd /Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri && cargo check 2>&1

# 2. TypeScript
cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm tsc --noEmit 2>&1

# 3. Frontend build
cd /Users/vaneickelen/Desktop/Catalog && corepack pnpm --filter @drive-project-catalog/desktop build 2>&1

# 4. Grep gates (all must return results)
grep "window-vibrancy" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/Cargo.toml
grep "apply_vibrancy" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/src/lib.rs
grep "transparent" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/tauri.conf.json
grep "macOSPrivateApi" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/tauri.conf.json
grep "h-\[52px\]" /Users/vaneickelen/Desktop/Catalog/packages/ui/src/SidebarNav.tsx
grep "replace: true" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/app/RootLayout.tsx
grep "Not yet scanned" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/pages/ProjectDetailPage.tsx
grep "showPathInFinder" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/pages/ProjectDetailPage.tsx
grep "opener:allow-reveal-item-in-dir" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/capabilities/default.json
```

All greps must return at least one match. cargo check, tsc, and pnpm build must all exit 0.
</verification>

<success_criteria>
Phase 3 is done when:
- [ ] MAC-01: `apply_vibrancy` is called in lib.rs setup hook gated on #[cfg(target_os = "macos")]; tauri.conf.json has transparent:true and macOSPrivateApi:true; sidebar background is transparent in all theme contexts
- [ ] MAC-02: SidebarNav drag spacer is h-[52px]; no sidebar content overlaps traffic light buttons
- [ ] UX-01: RootLayout handleSearchChange calls navigate with replace:true on every keystroke; ProjectsPage receives the URL param and filters immediately
- [ ] UX-03: null lastScannedAt shows "Not yet scanned"; null sizeBytes shows "Unknown"; null folderPath shows "Path unavailable"
- [ ] UX-04: showPathInFinder button present in ProjectDetailPage; opener:allow-reveal-item-in-dir granted in capabilities
- [ ] cargo check exits 0
- [ ] tsc --noEmit exits 0
- [ ] pnpm build exits 0
</success_criteria>

<output>
After completion, create `/Users/vaneickelen/Desktop/Catalog/.planning/phases/03-macos-native-ux/03-01-SUMMARY.md` following the summary template at `@/Users/vaneickelen/.claude/get-shit-done/templates/summary.md`.
</output>
