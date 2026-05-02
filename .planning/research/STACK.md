# Technology Stack — Tauri v2 + React 19 macOS Native Polish

**Project:** Catalog (brownfield milestone — polish existing Tauri v2 + React 19 + SQLite app)
**Researched:** 2026-05-02
**Overall confidence:** HIGH

## TL;DR — Prescriptive Recommendations

| Concern | Decision | Confidence |
|---------|----------|------------|
| Title bar | `titleBarStyle: "Overlay"` + `hiddenTitle: true` + `trafficLightPosition` | HIGH |
| Window vibrancy | `tauri-apps/window-vibrancy` crate, `NSVisualEffectMaterial::Sidebar` for nav, `HudWindow`/`UnderWindowBackground` for content | HIGH |
| Fonts | `system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text"` — drop Inter + Roboto from runtime | HIGH |
| MUI removal | Uninstall `@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled` together. Remove `ThemeProvider` + `CssBaseline` from `main.tsx`. Tailwind Preflight covers reset. | HIGH |
| IPC mutations | Wire React 19 `useOptimistic` + `useTransition` for write paths. Replace `runMutation`'s full `refresh()` with targeted optimistic updates. | HIGH |
| Bundle size | Vite `manualChunks` for `react-vendor`, `phosphor`, `sql`. Cargo `opt-level="s"`, `lto=true`, `strip=true`, `panic="abort"`. Enable `build.removeUnusedCommands`. | HIGH |
| Icon system | Keep Phosphor; alternative SF-Symbols-style is `lucide-react` if needed. Drop `@mui/icons-material` entirely. | HIGH |

---

## 1. Tauri v2 Window Configuration (macOS Native Feel)

### 1.1 Title Bar Style — `Overlay`, not `Transparent`

Current state: `tauri.conf.json` has `hiddenTitle: true` (good) but `titleBarStyle` not explicitly set to `Overlay`.

**Recommended `tauri.conf.json` window block:**

```json
{
  "windows": [
    {
      "title": "Catalog",
      "width": 1440,
      "height": 960,
      "minWidth": 1180,
      "minHeight": 760,
      "titleBarStyle": "Overlay",
      "hiddenTitle": true,
      "trafficLightPosition": { "x": 16, "y": 18 },
      "decorations": true,
      "transparent": false
    }
  ]
}
```

**Why these values:**

- `titleBarStyle: "Overlay"` — preserves classic macOS traffic lights (close/min/max) AND lets your React content extend edge-to-edge underneath. This is what apps like Linear, Notion, and Arc use.
- `hiddenTitle: true` — hides the window title text but keeps traffic lights.
- `trafficLightPosition` — added in Tauri 2.4.0. `{x: 16, y: 18}` aligns traffic lights with a 56px tall custom header. Adjust `y` to vertically center them in your header height: `y = (headerHeight - 14) / 2`.
- `decorations: true` — keep system window controls. Setting `false` strips them entirely (you'd have to rebuild min/max/close buttons).
- `transparent: false` (default) — only set `true` if combining with `window-vibrancy` (Section 1.2). If you skip vibrancy, leave opaque.

**DO NOT:**
- Use `titleBarStyle: "Transparent"` — older option, loses some native window behaviors per Tauri docs (window dragging/aligning quirks).
- Set `decorations: false` then try to recreate traffic lights in CSS — this is fragile and breaks system shortcuts.
- Hardcode trafficLightPosition without coordinating with your header CSS height.

**Custom drag region:** With `Overlay`, you must add `data-tauri-drag-region` to your top header element so the window can be dragged. Required pattern:

```tsx
<header data-tauri-drag-region className="h-14 flex items-center pl-[88px] pr-4">
  {/* pl-[88px] reserves space for traffic lights (3 lights × ~24px + padding) */}
</header>
```

Sources: [Tauri Window Customization](https://v2.tauri.app/learn/window-customization/), [Tauri 2.4 traffic light commit](https://github.com/tauri-apps/tauri/commit/30f5a1553d3c0ce460c9006764200a9210915a44)

### 1.2 Vibrancy / NSVisualEffectView (Optional but Recommended)

Vibrancy gives the translucent, color-aware blur that makes macOS apps feel native (Finder sidebar, Notes, Music).

**Setup:**

`apps/desktop/src-tauri/Cargo.toml`:
```toml
[target.'cfg(target_os = "macos")'.dependencies]
window-vibrancy = "0.5"
```

`apps/desktop/src-tauri/tauri.conf.json`:
```json
{
  "app": {
    "macOSPrivateApi": true,
    "windows": [
      { "transparent": true, ...rest }
    ]
  }
}
```

`apps/desktop/src/styles/global.css`:
```css
html, body, #root {
  background: transparent;
}
```

`apps/desktop/src-tauri/src/lib.rs` (in `setup`):
```rust
#[cfg(target_os = "macos")]
{
    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
    let window = app.get_webview_window("main").unwrap();
    apply_vibrancy(
        &window,
        NSVisualEffectMaterial::Sidebar,
        Some(NSVisualEffectState::FollowsWindowActiveState),
        Some(10.0), // corner radius
    ).expect("vibrancy unsupported on this platform");
}
```

**Material recommendations for Catalog:**

| Surface | Material | Why |
|---------|----------|-----|
| Sidebar (SidebarNav) | `NSVisualEffectMaterial::Sidebar` | Apple's intended sidebar material — adapts to wallpaper, looks like Finder |
| Main content area | Solid background (no vibrancy) | Vibrancy on data-dense areas hurts contrast and readability |
| Modal/sheet overlays | `NSVisualEffectMaterial::HudWindow` | HUD-style translucency for transient surfaces |

**Hybrid approach (recommended for Catalog):** Apply vibrancy ONLY to the sidebar element via a child window or by making the whole window transparent and rendering an opaque solid `<main>` for content. The two-color split (translucent sidebar, opaque content) is the Finder/Mail/Notes pattern.

**DO NOT:**
- Apply vibrancy to entire window without an opaque content panel — text on vibrant backgrounds fails WCAG contrast and looks amateur.
- Forget `macOSPrivateApi: true` — vibrancy will silently fail.
- Forget `html, body { background: transparent }` — opaque body cancels vibrancy.

**Caveats:**
- `macOSPrivateApi: true` blocks Mac App Store distribution. Not relevant for Catalog (dev build only per PROJECT.md), but flag for future.
- Some users have reported white flash on first paint — mitigate by setting initial `<body>` to a near-window color until React mounts.

Sources: [window-vibrancy README](https://github.com/tauri-apps/window-vibrancy/blob/dev/README.md), [window-vibrancy crate](https://crates.io/crates/window-vibrancy)

### 1.3 Window Configuration Checklist

- [ ] `titleBarStyle: "Overlay"` set
- [ ] `hiddenTitle: true`
- [ ] `trafficLightPosition` aligned with header height
- [ ] Header element uses `data-tauri-drag-region`
- [ ] Header reserves `~88px` left padding for traffic lights
- [ ] If using vibrancy: `macOSPrivateApi: true`, `transparent: true`, `html/body { background: transparent }`
- [ ] If using vibrancy: applied selectively, not to whole content area

---

## 2. React 19 Patterns for Tauri IPC

### 2.1 Replace Full Reload with `useOptimistic` (CRITICAL for Catalog)

PROJECT.md identifies `runMutation` in `apps/desktop/src/app/providers.tsx:120-129` as the perf root cause — it calls `refresh()` after every write, re-fetching all four collections.

**Recommended pattern (per write path):**

```tsx
import { useOptimistic, useTransition, startTransition } from 'react';
import { invoke } from '@tauri-apps/api/core';

function ProjectsList({ projects }: { projects: Project[] }) {
  const [optimisticProjects, addOptimisticProject] = useOptimistic(
    projects,
    (state, optimisticValue: { type: 'add' | 'remove' | 'update'; project: Project }) => {
      switch (optimisticValue.type) {
        case 'add':    return [...state, optimisticValue.project];
        case 'remove': return state.filter(p => p.id !== optimisticValue.project.id);
        case 'update': return state.map(p => p.id === optimisticValue.project.id ? optimisticValue.project : p);
      }
    }
  );
  const [isPending, startTx] = useTransition();

  const handleImport = (project: Project) => {
    startTx(async () => {
      addOptimisticProject({ type: 'add', project });
      try {
        await invoke('import_project', { project });
        // On success: refetch ONLY this collection, not all four
        await refreshProjects();
      } catch (err) {
        // useOptimistic auto-reverts when transition completes without state update
        showToast({ type: 'error', message: err.message });
      }
    });
  };

  return <ul aria-busy={isPending}>{optimisticProjects.map(...)}</ul>;
}
```

**Key rules for `useOptimistic` + Tauri:**

1. **Must be inside a transition.** `useOptimistic` updates only persist during a `startTransition` or React Action. Wrap every `invoke` call in `startTransition`.
2. **Optimistic state auto-reverts** when the transition completes if you don't update real state — this is the rollback mechanism.
3. **Refetch the single affected collection**, never all four. PROJECT.md notes a partial `useOptimisticMutation` already exists — wire it up.
4. **Server is source of truth.** SQLite write succeeds → refetch that collection → optimistic state replaced by real state.

### 2.2 Long-Running Operations: `listen` + `useSyncExternalStore`

For scans (which can take minutes), don't use `useOptimistic`. Use Tauri events:

```tsx
import { listen } from '@tauri-apps/api/event';
import { useEffect, useSyncExternalStore } from 'react';

// External store for scan progress (subscribe pattern)
const scanProgressStore = createScanProgressStore();

function ScanProgress({ scanId }: { scanId: string }) {
  const progress = useSyncExternalStore(
    scanProgressStore.subscribe,
    () => scanProgressStore.getSnapshot(scanId),
    () => null
  );

  useEffect(() => {
    const unlisten = listen<{ scanId: string; pct: number }>('scan:progress', (e) => {
      scanProgressStore.update(e.payload.scanId, e.payload.pct);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  return <ProgressBar value={progress?.pct ?? 0} />;
}
```

**Why `useSyncExternalStore`:** Tauri events arrive outside React's reconciliation. `useSyncExternalStore` is the official React 19 escape hatch for external event sources — avoids `useState` + `useEffect` race conditions.

### 2.3 Stable Command Wrapper

Create `apps/desktop/src/lib/ipc.ts` to type-wrap every `invoke` call:

```ts
import { invoke } from '@tauri-apps/api/core';

export const ipc = {
  importProject: (input: ImportProjectInput) =>
    invoke<Project>('import_project', { input }),
  removeProject: (id: string) =>
    invoke<void>('remove_project', { id }),
  // ...one method per command
} as const;
```

This (a) gives you IDE autocomplete, (b) centralizes error handling, (c) makes Rust signature drift compile-fail at the call site, (d) is the foundation for adopting `tauri-specta` later if you want auto-generated bindings.

**Future option:** [tauri-specta](https://github.com/specta-rs/tauri-specta) auto-generates TS types from Rust commands. Worth adopting once command surface stabilizes — eliminates manual wrapper drift. NOT urgent for this milestone.

### 2.4 What NOT to Do

- DO NOT call `await invoke(...)` directly inside a click handler without `startTransition` — blocks the UI thread on render.
- DO NOT mirror Tauri events into a `useState` — re-render storms on rapid events (scan progress fires hundreds of times/sec).
- DO NOT use `React.memo` to fix perf caused by full-collection refetch — fix the refetch instead.
- DO NOT wrap every command in `try/catch` at call sites — centralize in `ipc.ts` wrapper.

Sources: [React 19 useOptimistic](https://react.dev/reference/react/useOptimistic), [Smooth Async Transitions in React 19](https://blog.appsignal.com/2025/08/27/smooth-async-transitions-in-react-19.html)

---

## 3. CSS Approaches That Feel Native on macOS

### 3.1 System Font Stack — DROP Inter and Roboto

Current state: app ships `@fontsource-variable/inter` (5.2) and `@fontsource/roboto` (5.2). Both are dead weight on macOS — every Mac has SF Pro built in and renders it perfectly.

**Recommended `tailwind.config.ts`:**

```ts
import type { Config } from 'tailwindcss';

export default {
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Helvetica Neue"',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          '"SF Mono"',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      fontFeatureSettings: {
        // Enable SF Pro's optical sizing and ligatures
        default: '"ss01", "ss02", "cv11"',
      },
    },
  },
} satisfies Config;
```

**Why:**
- `system-ui` is the modern generic and resolves to SF Pro on macOS (Chrome + Safari ship this).
- `-apple-system` and `BlinkMacSystemFont` are kept as fallbacks for older WebKit (Tauri uses WKWebView, generally current — but cheap insurance).
- SF Pro auto-switches between SF Pro Display (>20pt) and SF Pro Text (<20pt) for optimal legibility — Inter cannot do this.

**Removal steps:**
1. `pnpm remove @fontsource-variable/inter @fontsource/roboto` (in `apps/desktop`)
2. Delete font imports from `apps/desktop/src/main.tsx` (and anywhere else)
3. Update `tailwind.config.ts` as above
4. Verify in dev — text should look slightly different (SF Pro's tighter rhythm)

**Bundle savings:** ~150KB woff2 + parsing/load avoided.

### 3.2 macOS Design Tokens

Define in `apps/desktop/src/styles/tokens.css`:

```css
:root {
  /* macOS Sequoia system colors (semantic) */
  --color-bg-window: oklch(98.5% 0.002 250);
  --color-bg-sidebar: oklch(96% 0.003 250 / 0.7); /* translucent over vibrancy */
  --color-bg-content: oklch(99% 0 0);
  --color-bg-control: oklch(94% 0.003 250);
  --color-bg-control-hover: oklch(90% 0.005 250);

  --color-separator: oklch(88% 0.005 250 / 0.6);
  --color-text-primary: oklch(20% 0.01 250);
  --color-text-secondary: oklch(45% 0.01 250);
  --color-text-tertiary: oklch(60% 0.008 250);

  /* macOS accent — defaults to blue but user can change in System Settings.
     Use the CSS system color when possible: */
  --color-accent: AccentColor; /* CSS Color Module 4 — respects user choice */
  --color-accent-fallback: oklch(58% 0.18 250);

  /* macOS rhythm */
  --radius-control: 6px;
  --radius-window: 10px;
  --radius-sheet: 12px;

  --shadow-sheet: 0 20px 60px -10px oklch(0% 0 0 / 0.3),
                  0 0 0 0.5px oklch(0% 0 0 / 0.15);

  /* macOS animation curves */
  --ease-mac-out: cubic-bezier(0.25, 0.1, 0.25, 1);
  --duration-mac-fast: 150ms;
  --duration-mac-normal: 250ms;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg-window: oklch(18% 0.005 250);
    --color-bg-sidebar: oklch(22% 0.005 250 / 0.6);
    --color-bg-content: oklch(20% 0.005 250);
    --color-text-primary: oklch(96% 0 0);
    /* etc */
  }
}
```

**Key choices:**
- `AccentColor` keyword respects the user's macOS accent color preference (System Settings → Appearance). Fallback for older WebKit.
- OKLCH not HSL — perceptual uniformity, better for design tokens.
- Translucent sidebar background designed to layer over vibrancy material.
- 0.5px borders are the macOS standard (look like Retina hairlines).

### 3.3 Native-Feeling Controls

**Backdrop blur (when not using `window-vibrancy`):**

```css
.glass-panel {
  background: oklch(98% 0.002 250 / 0.7);
  backdrop-filter: saturate(1.8) blur(20px);
  -webkit-backdrop-filter: saturate(1.8) blur(20px);
}
```

The `saturate(1.8)` is critical — it's what makes macOS vibrancy look color-aware vs. just a Gaussian blur.

**Native scroll behavior:**

```css
.scroll-container {
  overflow-y: auto;
  overscroll-behavior: contain;
  /* Hide scrollbar until scrolling — macOS default */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.scroll-container:hover {
  scrollbar-color: oklch(60% 0.005 250 / 0.4) transparent;
}
```

**Selection color:**

```css
::selection {
  background: AccentColor;
  color: AccentColorText;
}
```

### 3.4 What NOT to Do

- DO NOT load Inter, Roboto, or any web font — wastes bandwidth and looks foreign on macOS.
- DO NOT use `box-shadow` for window-level shadows — Tauri renders the macOS window shadow natively.
- DO NOT animate `width`, `height`, `top`, `left` — use `transform` and `opacity` only (per global frontend rules).
- DO NOT hardcode accent color — use `AccentColor` keyword to respect user prefs.
- DO NOT use rounded corners > 12px on windows/sheets — Apple's HIG uses 10–12px.
- DO NOT use `backdrop-filter` AND `window-vibrancy` on the same surface — redundant; vibrancy wins.

Sources: [System font stack CSS-Tricks](https://css-tricks.com/snippets/css/system-font-stack/), [Apple SF Pro fonts](https://developer.apple.com/fonts/), [SF Symbols Apple](https://developer.apple.com/sf-symbols/)

---

## 4. Removing MUI / Emotion Cleanly

PROJECT.md confirms: all components migrated to Tailwind, but `ThemeProvider` + `CssBaseline` still wrap `main.tsx`. This is pure dead weight + Preflight conflict.

### 4.1 Removal Sequence

**Order matters** — uninstalling MUI before removing imports breaks the build.

```bash
# Step 1: Identify remaining imports (should be only main.tsx per PROJECT.md)
cd apps/desktop
grep -rn "@mui\|@emotion" src/ packages/ || echo "Clean"

# Step 2: Edit main.tsx — remove ThemeProvider, CssBaseline, theme imports
# Step 3: Verify dev build still works
corepack pnpm --filter @drive-project-catalog/desktop dev

# Step 4: Uninstall packages
corepack pnpm --filter @drive-project-catalog/desktop remove \
  @mui/material \
  @mui/icons-material \
  @emotion/react \
  @emotion/styled \
  @fontsource/roboto

# Step 5: Re-run build, check bundle
corepack pnpm --filter @drive-project-catalog/desktop build
```

**Expected `main.tsx` shape after cleanup:**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './styles/tokens.css';
import './styles/global.css'; // contains @tailwind directives

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

No `ThemeProvider`. No `CssBaseline`. No emotion cache. Tailwind Preflight (already in your `global.css` via `@tailwind base`) handles the reset.

### 4.2 Verification Checklist

- [ ] `pnpm ls @mui/material @mui/icons-material @emotion/react @emotion/styled` returns nothing
- [ ] `grep -rn "@mui\|@emotion" apps/desktop/src packages/*/src` returns nothing
- [ ] Dev build runs without errors
- [ ] No console warnings about missing emotion cache
- [ ] Visual regression: pages look the same (or better — Preflight no longer fights CssBaseline)
- [ ] Bundle size dropped by ~350KB gzipped (per PROJECT.md estimate — verify with `vite build --mode production` and check `dist/`)

### 4.3 Icon System Decision

`@mui/icons-material` removed. Catalog already has `@phosphor-icons/react`. Keep Phosphor — it's tree-shakeable when you import per-icon:

```tsx
// Good — tree-shakes to single icon
import { FolderSimple } from '@phosphor-icons/react';

// Bad — pulls entire icon set
import * as Icons from '@phosphor-icons/react';
```

**Alternative if Phosphor doesn't feel "Mac enough":** [`lucide-react`](https://lucide.dev/) — Feather-derived, sharper, looks closer to SF Symbols. Migration effort: low (similar API). Not required.

### 4.4 What NOT to Do

- DO NOT keep `ThemeProvider` "just in case" — it actively hurts (CssBaseline conflicts with Tailwind Preflight per PROJECT.md).
- DO NOT migrate to a different CSS-in-JS library (styled-components, vanilla-extract). Tailwind is already in place; adding another layer is regression.
- DO NOT keep `@emotion/*` as transitive deps — they were only needed for MUI. Verify nothing else (e.g., a chart library) requires them.

Sources: [MUI interoperability](https://mui.com/material-ui/integrations/interoperability/), [MUI removal guide](https://copyprogramming.com/howto/how-to-uninstall-material-ui-in-react-a-guide-to-installing-the-latest-mui)

---

## 5. Bundle Size Optimization

### 5.1 Rust / Cargo (`apps/desktop/src-tauri/Cargo.toml`)

```toml
[profile.release]
codegen-units = 1
lto = true
opt-level = "s"        # "s" for size; use "3" only if profiling shows CPU-bound
panic = "abort"
strip = true

[profile.dev]
incremental = true
```

**Expected impact:** 30–50% smaller binary vs. defaults. `lto + codegen-units=1` slows compile but Catalog ships dev build per PROJECT.md, so release profile only matters when you eventually distribute.

### 5.2 Remove Unused Tauri Commands (Tauri 2.4+)

`apps/desktop/src-tauri/tauri.conf.json`:

```json
{
  "build": {
    "removeUnusedCommands": true
  }
}
```

Requires `tauri@2.4+` (you're on 2.8.2 — eligible). Reads your capability ACL and strips unreferenced plugin commands at build time. Reduces binary size AND attack surface.

**Action:** audit `apps/desktop/src-tauri/capabilities/` and ensure only commands you actually call are listed.

### 5.3 Remove Unused Rust Dependencies

PROJECT.md flags `notify` (6.1) and `sha2` (0.10) as declared but unused. Remove them:

```toml
# Delete these lines from src-tauri/Cargo.toml [dependencies]
# notify = "6.1"
# sha2 = "0.10"
```

`notify` alone pulls FSEvents bindings + ~15 transitive crates. `sha2` is small but compiles AVX2 intrinsics on x86 — wasted compile time on Apple Silicon.

### 5.4 Vite `manualChunks` Strategy

`apps/desktop/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'safari17', // Tauri WKWebView on macOS Sonoma+ supports modern syntax
    minify: 'esbuild',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor':    ['react', 'react-dom', 'react-router-dom'],
          'tauri-vendor':    ['@tauri-apps/api', '@tauri-apps/plugin-sql'],
          'icons':           ['@phosphor-icons/react'],
        },
      },
    },
    // Avoid sourcemaps in production bundle (Tauri DevTools can use them in dev)
    sourcemap: false,
  },
  server: {
    port: 1420,
    strictPort: true,
  },
});
```

**Why `target: 'safari17'`:**
- WKWebView on macOS Sonoma+ = Safari 17 engine.
- Lets esbuild skip ES2015 transforms — smaller output, modern syntax (top-level await, optional chaining native, etc.).
- DO NOT target `'es2015'` or default — Vite will emit polyfills your runtime doesn't need.

**Why these chunks:**
- `react-vendor` rarely changes — long cache.
- `tauri-vendor` updates with Tauri version bumps.
- `icons` isolates Phosphor (largest single dep) so app code chunks stay small.

### 5.5 Verify with `vite build --report` or Manual Inspection

After cleanup, inspect:

```bash
corepack pnpm --filter @drive-project-catalog/desktop build
ls -lah apps/desktop/dist/assets/
# Or with rollup-plugin-visualizer for treemap:
# pnpm add -D rollup-plugin-visualizer
```

**Targets (per global web rules — App page tier):**
- JS gzipped: < 300KB total
- CSS: < 50KB
- Largest single chunk: < 150KB gzipped

### 5.6 What NOT to Do

- DO NOT enable `lto = "fat"` without measuring — sometimes worse than `lto = true`.
- DO NOT chunk by route (`react.lazy`) for Tauri — IPC startup cost is 0 vs network; keep eager loading for snappy navigation.
- DO NOT preload Phosphor icons globally — import per-icon.
- DO NOT add `terser` minifier — esbuild minify is faster and equivalent for this size class.
- DO NOT remove `@tauri-apps/plugin-log` to save bytes — observability matters more than 10KB.

Sources: [Tauri App Size docs](https://v2.tauri.app/concept/size/), [Tauri removeUnusedCommands](https://github.com/tauri-apps/tauri/commit/013f8f652302f2d49c5ec0a075582033d8b074fb), [Vite Tauri integration](https://v2.tauri.app/start/frontend/vite/)

---

## 6. Recommended Stack Summary

### Core (keep)
| Technology | Version | Purpose |
|------------|---------|---------|
| Tauri | 2.8.2 → consider 2.9.x | Native shell |
| React | 19.1 | UI |
| TypeScript | 5.9 | Types |
| Vite | 7.1 | Build |
| Tailwind CSS | 3.4 | Styling |
| React Router DOM | 7.9 | Routing |
| `@tauri-apps/api` | 2.8 | IPC |
| `@tauri-apps/plugin-sql` (vendored) | 2.2 | SQLite |
| `@phosphor-icons/react` | 2.1 | Icons |
| Vitest | 3.2 | Tests |

### Add
| Technology | Version | Purpose | Notes |
|------------|---------|---------|-------|
| `window-vibrancy` (Rust crate) | 0.5+ | macOS vibrancy | Optional but recommended |

### Remove
| Technology | Reason |
|------------|--------|
| `@mui/material` | Migrated to Tailwind; ThemeProvider is dead weight |
| `@mui/icons-material` | Use Phosphor |
| `@emotion/react` | MUI dep only |
| `@emotion/styled` | MUI dep only |
| `@fontsource-variable/inter` | Use system-ui (SF Pro) |
| `@fontsource/roboto` | Use system-ui |
| `notify` (Rust) | Declared but unused |
| `sha2` (Rust) | Declared but unused |

### Future Consideration (NOT this milestone)
| Technology | When |
|------------|------|
| `tauri-specta` | Once Rust command surface stabilizes — auto-generate TS bindings |
| Code-signing + notarization | If/when distributing outside dev build |

---

## 7. Confidence Assessment

| Area | Confidence | Source basis |
|------|------------|--------------|
| Tauri window config (Overlay, traffic lights) | HIGH | Official Tauri 2.x docs + verified commit |
| `window-vibrancy` setup | HIGH | Official tauri-apps repo README + crate docs |
| React 19 `useOptimistic` + `useTransition` | HIGH | Official React 19 docs |
| System font stack | HIGH | Multi-source consensus (CSS-Tricks, Apple developer, Stefan Judis) |
| MUI removal sequence | HIGH | Direct reading of PROJECT.md state + MUI docs |
| Cargo profile settings | HIGH | Official Tauri size docs |
| `removeUnusedCommands` | HIGH | Tauri 2.4 commit + official docs |
| Vite `manualChunks` for Tauri | MEDIUM | General Vite best practice; Tauri-specific chunking less documented — verify by measuring |
| `target: 'safari17'` | MEDIUM | Safe given WKWebView baseline; verify against actual Tauri-bundled WebView version on min supported macOS |
| Vibrancy material choices (Sidebar vs HudWindow) | MEDIUM | Based on Apple HIG conventions and observed usage in Finder/Notes — not formally documented for web contexts |

---

## 8. Open Questions / Phase Flags

- **Vibrancy hybrid layout:** The "translucent sidebar + opaque content" pattern requires either two stacked windows or a transparent main window with an opaque content `<div>` covering most of it. Implementation detail to resolve in execution phase.
- **Tauri 2.9 upgrade:** 2.9.x is current stable; 2.8.2 → 2.9 is minor and likely safe but read changelog before upgrading.
- **`removeUnusedCommands` interaction with vendored `tauri-plugin-sql`:** Vendored plugin may need `#![plugin(tauri_plugin_sql)]` annotation in `generate_handler!` per the docs caveat. Verify before enabling.
- **Bundle size baseline:** Measure current bundle BEFORE making changes so MUI-removal savings are quantifiable.
