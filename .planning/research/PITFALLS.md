# Domain Pitfalls

**Domain:** Tauri v2 macOS desktop app polish (MUI removal, optimistic UI, native feel, SQLite WAL)
**Researched:** 2026-05-02
**Project:** Catalog v1 milestone

Pitfalls below are ordered by severity. Each maps to a milestone phase using the active scope from `.planning/PROJECT.md`:

- **Phase A — MUI removal & font cleanup**
- **Phase B — Optimistic UI / mutation refactor**
- **Phase C — macOS native polish (titlebar, vibrancy, type)**
- **Phase D — SQLite hygiene (sessions table growth, migration safety)**
- **Phase E — Code-debt splits (pagePrimitives, DrivesPage)**

---

## Critical Pitfalls

### Pitfall 1: Removing CssBaseline without auditing what it actually reset

**What goes wrong:** `CssBaseline` injects a far broader reset than Tailwind Preflight (HTML/body background, `box-sizing: border-box` on `*::before/::after`, `-webkit-font-smoothing: antialiased`, `-moz-osx-font-smoothing: grayscale`, `text-size-adjust`, default `font-family` / `line-height` on `body`, scrollbar baseline, form element normalization beyond Preflight). Pulling it out with the assumption "Preflight covers it" produces silent visual drift: heavier text on macOS (smoothing flips back to subpixel), inconsistent default backgrounds in dark mode, and form controls picking up UA defaults that Preflight does not normalize (e.g. `input[type=search]` cancel button).

**Why it happens:** Preflight is intentionally narrower than CssBaseline. MUI also injects body-level rules (`background-color: theme.palette.background.default`, `color: theme.palette.text.primary`) that Preflight has no equivalent for. The current app relies on those without knowing it.

**Consequences:** App boots looking subtly wrong — slightly bolder text in `.app-shell`, white flash on dark backgrounds, `<input>` styling regressions in `SearchField`.

**Prevention:**
1. Before deleting `CssBaseline`, screenshot every page (light + dark if both exist).
2. Diff Preflight vs CssBaseline rules side-by-side; port the gaps explicitly into a `styles/base.css` in the `@layer base` block. Mandatory ports: `-webkit-font-smoothing: antialiased`, `-moz-osx-font-smoothing: grayscale`, body `background-color` + `color` from design tokens, `font-family` token applied to `html`.
3. After removal, take screenshots again and diff.

**Detection:** Side-by-side screenshots before/after at 1× and 2× DPR. Any change in font weight perception = smoothing regression.

**Phase:** A

---

### Pitfall 2: Emotion runtime survives package removal via transitive imports

**What goes wrong:** Removing `@emotion/react` + `@emotion/styled` from `package.json` does not guarantee they leave the bundle. `@mui/material` deep-imports them; any leftover `import` from `@mui/*` (including types, icons, or a stray `sx={}` prop on a forgotten component) re-pulls the entire emotion runtime back in. Worse: a Vite `optimizeDeps` cache can keep the prebundled emotion chunk alive after the source removal, so `pnpm dev` looks fine but production build still ships it.

**Why it happens:** Tree-shaking only works on side-effect-free ES modules. `@emotion/cache` registers a module-level cache singleton — it has side effects and stays whole-module included whenever any code path references it. The MUI tree-shake boundary is leaky: a single `import { Button } from '@mui/material'` (vs `'@mui/material/Button'`) drags the whole tree.

**Consequences:** ~150–200 KB gzipped JS still ships; the "350 KB savings" claim from PROJECT.md does not materialize; emotion's `<style data-emotion="...">` tags still inject at app boot, potentially overriding Tailwind utilities by cascade order.

**Prevention:**
1. After removing `ThemeProvider`/`CssBaseline`/`materialTheme`, run `grep -r "@mui\|@emotion" apps/desktop/src packages/` — must return zero hits.
2. After removal, run `pnpm --filter @drive-project-catalog/desktop build` and inspect `dist/assets/*.js` for the strings `@emotion`, `emotion-cache`, `MuiTheme`. Any hit means a transitive import survived.
3. Delete `apps/desktop/node_modules/.vite` to clear Vite's optimizeDeps cache before verifying.
4. Inspect the rendered DOM at runtime — no `<style data-emotion="...">` tags should exist in `<head>`.

**Detection:** Bundle analyzer (`vite-bundle-visualizer` or `rollup-plugin-visualizer`) showing zero emotion/mui chunks. Runtime DOM inspection for emotion style tags.

**Phase:** A

---

### Pitfall 3: Stale-closure optimistic state in React Context

**What goes wrong:** `useOptimisticMutation` closes over `projects`/`drives`/`scans` from the provider's `useState`. When two mutations fire in quick succession (user edits a project name, then deletes another project before the first reconciles), the second mutation's optimistic update reads the state snapshot from when its closure was created — overwriting the first mutation's optimistic delta. The first edit appears to succeed in the toast, but the visible list shows the pre-edit state.

**Why it happens:** Functional state setters (`setProjects(prev => …)`) are required to read the latest state inside async callbacks. Direct read of the captured `projects` variable returns the value at the time the mutation handler was constructed, not at the time it ran.

**Consequences:** Optimistic edits silently revert under concurrent activity. The bug is intermittent and hard to reproduce — it depends on timing between user clicks. Users report "I changed the name and it didn't save" but the DB write actually succeeded; the UI just lost the delta.

**Prevention:**
1. Every optimistic state mutation MUST go through the functional setter form: `setProjects(prev => prev.map(p => p.id === id ? {...p, ...patch} : p))`. Never `setProjects([...projects, newProject])`.
2. Snapshot for rollback inside the functional setter, not from the closure: capture `prev` inside the updater, then in `onError` call `setProjects(_ => snapshot)` with the captured rollback.
3. When the mutation needs to read fresh state outside a setter (e.g. for derived computation), use a `useRef` that mirrors the latest state via a `useEffect`.

**Detection:** Add a Playwright test that fires two `updateProject` mutations 50ms apart with the second's `await` resolved before the first's. The final state must reflect both edits.

**Phase:** B

---

### Pitfall 4: SQLITE_BUSY despite single-connection WAL — the read-then-upgrade trap

**What goes wrong:** With `max_connections=1`, the assumption is that lock contention is impossible. False. SQLite returns `SQLITE_BUSY` immediately (ignoring `busy_timeout`) when a transaction that began as a read tries to upgrade to a write — and this can happen in WAL mode even with one connection if the connection has multiple in-flight statement handles or if a read transaction was opened implicitly (e.g. by `SELECT` before `BEGIN`). The vendored `tauri-plugin-sql` patch sets `max_connections=1` but does not enforce that all writes use `BEGIN IMMEDIATE`, so a concurrent scan-snapshot upsert during a foreground mutation can still error out.

**Why it happens:** SQLite's busy_timeout only sleeps when another _connection_ holds the lock. Self-deadlocks within one connection don't sleep — they fail fast. With JS Promises, you can have a `SELECT` from one async call still holding an implicit read transaction when a `BEGIN` for a write call arrives.

**Consequences:** Random "database is locked" errors specifically during scans (when polling fires upserts at 900ms while the user simultaneously edits a project). Occurs in the wild; the vendored single-connection patch does not eliminate it.

**Prevention:**
1. All writes that may be reentrant during reads must start with `BEGIN IMMEDIATE` (acquires the write lock up front, sleeps on busy instead of failing).
2. Serialize all DB operations through a single async queue at the JS layer. The single connection must also have a single in-flight statement at a time.
3. Verify `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000` are applied per connection on open (the busy_timeout is _per connection_ and resets on reopen).
4. Avoid mixing schema reads with writes inside a single transaction — finalize all `SELECT` statements before the first `INSERT`/`UPDATE`.

**Detection:** Stress test: run a scan while firing `updateProject` mutations every 200 ms. Any `database is locked` error in console = fail.

**Phase:** D (also touches B if optimistic mutations land before serialization)

---

### Pitfall 5: Removing or skipping a SQLite migration step on a brownfield app

**What goes wrong:** The repo has 5 migrations with intricate partial-failure recovery branches in migrations 3 and 5 (per CONCERNS.md). Removing migration N because "it looks redundant" or skipping its execution because "the table already looks right" silently breaks every existing user's DB on next app launch — the migration table records the wrong terminal version and future migrations apply against an unexpected schema.

**Why it happens:** SQLite has no transactional DDL guarantees across multi-statement migrations by default, and Tauri's migration system is forward-only with no rollback. There is no automated end-to-end migration test from version 0 → current.

**Consequences:** User opens the app post-update, hits a startup error referencing a column that doesn't exist, and the app cannot self-recover. Worst case: data loss if a recovery branch silently `DROP`s a table thinking it's a stale intermediate.

**Prevention:**
1. Treat migrations as append-only. Never delete, edit, or reorder a migration that has shipped.
2. Before any migration change, write a test in `sqliteLocalPersistence.test.ts` that boots from an empty DB and runs all migrations in sequence. Then write a second test that boots from each historical schema version and migrates forward.
3. If a migration logically becomes a no-op, leave it in place and add a new no-op marker — do not delete.
4. For any new migration that does `DROP TABLE` + rename, wrap each step in its own `run:` async block (per CONCERNS.md guidance) and add explicit recovery for partial states.

**Detection:** Cold-start integration test that runs every migration from version 0 to head with assertions on final schema. Snapshot test of `sqlite_master` post-migration.

**Phase:** D

---

## Moderate Pitfalls

### Pitfall 6: Traffic light position resets on theme change

**What goes wrong:** Tauri 2.4.0+ exposes `trafficLightPosition` for overlay titlebars, but macOS resets the position whenever the system theme changes (light↔dark) or when the window goes fullscreen and back. The traffic lights snap to their default position, often clipping into custom sidebar content or the search field.

**Why it happens:** AppKit reconstructs the titlebar on appearance change; the custom position is not persisted by the native API, only by Tauri's wrapper, which doesn't re-apply on `ThemeChanged`.

**Consequences:** On a Mac configured to follow system theme at sunset, users see traffic lights teleport at 19:00. Fullscreen toggle does the same.

**Prevention:**
1. Listen to the `tauri://theme-changed` event (and `tauri://resize` for fullscreen exit) and re-call `setTrafficLightPosition` on every fire.
2. Test by manually toggling Appearance in System Settings while the app is open.
3. If using `tauri-plugin-decorum` or `tauri-plugin-mac-rounded-corners`, verify whichever plugin you choose handles this — some do, some don't.

**Detection:** Manual: toggle dark mode with app open, observe traffic light snap. Automated: hard to assert visually without screenshot diff.

**Phase:** C

---

### Pitfall 7: `system-ui` font on macOS picks San Francisco — but at the wrong weight axis

**What goes wrong:** Setting `font-family: system-ui` on macOS resolves to San Francisco, which has multiple cuts (SF Pro Text < 20px, SF Pro Display ≥ 20px) that the OS auto-selects. WKWebView respects this, but variable-axis weights from the design system (e.g. Inter `font-variation-settings: 'wght' 450`) do not transfer to SF — SF only honors discrete weights (300, 400, 500, 600, 700). A token like `--font-weight-medium: 450` renders at 400 on SF, looking lighter than the design intends.

**Why it happens:** Inter is a true variable font with a continuous weight axis; SF system font is not exposed as variable to web content. WKWebView quantizes to the nearest discrete cut.

**Consequences:** If you swap from Inter to system-ui to feel native, mid-weight UI text (450, 550) renders one stop lighter. Sidebar nav labels look anemic.

**Prevention:**
1. Decide weight strategy before swapping: either keep Inter (and accept it's not "native") or move to system-ui and snap all weight tokens to {400, 500, 600, 700}.
2. If using system-ui, declare exact stack: `font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif`. The `-apple-system` keyword is required for SF Text/Display auto-switching to work in WKWebView.
3. Don't mix: never set `font-variation-settings` on a system-ui element.

**Detection:** Visual comparison of body text and 500-weight UI labels at 13px and 16px.

**Phase:** C

---

### Pitfall 8: Vibrancy + WKWebView — the opaque background trap

**What goes wrong:** Applying `tauri-plugin-window-vibrancy` to get a translucent macOS sidebar requires the WKWebView itself to have a transparent background. By default, Tauri's WKWebView renders with an opaque white (or the app theme) background — the NSVisualEffectView underneath is rendered, then immediately covered by the webview's opaque layer. Result: vibrancy code runs, no blur visible.

**Why it happens:** Two layers must both be transparent — the WKWebView's `setValue:false forKey:"drawsBackground"` AND the HTML `<html>`/`<body>` must have `background: transparent` (not just no background — Tailwind Preflight sets `background-color` on body in some configs).

**Consequences:** "I added vibrancy and nothing happened." Hours spent debugging the wrong layer.

**Prevention:**
1. In `tauri.conf.json`, set `"transparent": true` on the window.
2. In CSS (`@layer base`): `html, body { background: transparent; }`. Surface backgrounds go on inner containers, not body.
3. Apply `apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, ...)` in Rust setup.
4. Verify by temporarily setting desktop wallpaper to a high-contrast image — the blur should be visibly tinted by it.

**Detection:** Set a bright red desktop wallpaper. If you see red tint through the sidebar = working. If you see solid white/grey = layered wrong.

**Phase:** C

---

### Pitfall 9: Optimistic update + concurrent background refetch overwrites the optimistic value

**What goes wrong:** Even after wiring `useOptimisticMutation`, the existing `refresh()` call in providers may still fire from another code path (scan poll, route change). If `refresh()` resolves _after_ the optimistic update but _before_ the server mutation reconciles, the fresh server data (which doesn't yet include the optimistic change) overwrites the optimistic state. The UI flickers: user's edit appears, disappears, then reappears 200 ms later when the mutation resolves.

**Why it happens:** This is the classic "cancel queries before optimistic update" problem — without a query cancellation mechanism, in-flight reads will land on top of pending writes.

**Consequences:** Visible UI flicker on every edit during scan polling. Looks broken even though it's eventually correct.

**Prevention:**
1. When starting an optimistic mutation, mark the entity ID as "pending" in a `Set<string>` ref.
2. Inside `refresh()`, when applying server results, preserve any record whose ID is in the pending set — overwrite only after the corresponding mutation resolves.
3. Alternative: pause `refresh()` entirely while any mutation is in-flight (simpler, slightly less responsive during scans).
4. After mutation reconciles, re-evaluate whether `refresh()` is needed at all — if the server returns the updated record, apply it locally and skip the refetch.

**Detection:** Edit a project name during an active scan. The edit should not flicker.

**Phase:** B

---

### Pitfall 10: `@fontsource-variable/inter` import order vs Preflight

**What goes wrong:** Removing `@fontsource/roboto` is straightforward, but if the remaining `@fontsource-variable/inter` import lands in `main.tsx` _after_ Tailwind's CSS import, the font-face declarations are appended after Preflight's body font-family setting. Network-slow scenarios show a brief Helvetica/Arial flash before Inter loads. With CssBaseline previously in place, MUI was masking this with its own fallback stack.

**Why it happens:** CSS-in-JS injection order is not the same as static `@import` order. Removing CssBaseline strips the safety net.

**Consequences:** FOUT on cold app launch.

**Prevention:**
1. Import font CSS first in `main.tsx`, before any other CSS.
2. Set explicit fallback stack in `--font-sans`: `'Inter Variable', -apple-system, BlinkMacSystemFont, system-ui, sans-serif`.
3. Use `font-display: optional` on the `@font-face` to avoid swap-in flash entirely (acceptable for Tauri since the font is local, no network fetch — should be instant).
4. Preload the font file via `<link rel="preload" as="font" type="font/woff2" crossorigin>`.

**Detection:** Force-quit and relaunch app 10× while observing first paint. No font swap visible.

**Phase:** A

---

## Minor Pitfalls

### Pitfall 11: Bundle size doesn't shrink as expected because Vite caches the prebundle

**What goes wrong:** After removing MUI deps, `pnpm dev` shows the same bundle size as before. Conclusion: "removal didn't work." Actual cause: Vite's optimizeDeps cache in `node_modules/.vite` retained the prebundled chunk.

**Prevention:** Delete `node_modules/.vite` after dep changes. Run `pnpm install` then `pnpm dev`. Verify with `pnpm build` (production) for the real number.

**Phase:** A

---

### Pitfall 12: macOS overlay titlebar makes the top 28 px undraggable for content

**What goes wrong:** `titleBarStyle: "Overlay"` makes the titlebar transparent but the OS still owns the top ~28 px for window dragging. Click handlers on UI placed in this region will fire OS drag instead of the React handler.

**Prevention:**
1. Apply `data-tauri-drag-region` to the titlebar background only.
2. For interactive elements in the titlebar area (search field, sidebar header), explicitly set `-webkit-app-region: no-drag` (CSS) or wrap in an element without the drag attribute.

**Phase:** C

---

### Pitfall 13: Tailwind's `dark:` variant won't auto-switch on macOS theme change without a listener

**What goes wrong:** `prefers-color-scheme: dark` works for first paint but doesn't always re-evaluate cleanly on live theme toggle in WKWebView. The app sticks on the theme it booted with.

**Prevention:** Listen to `window.matchMedia('(prefers-color-scheme: dark)')` `change` event AND Tauri's theme event. Toggle a `class="dark"` on `<html>` based on either source. Use `darkMode: 'class'` in `tailwind.config.js` instead of `'media'`.

**Phase:** C

---

### Pitfall 14: `scan_session_projects` table growth exposed by removed pruning during migration

**What goes wrong:** If a Phase D migration adds a `deleteScanSession` cascade but doesn't backfill-prune existing rows on first launch, an existing user with a year of accumulated `scan_session_projects` rows still has 100K+ rows after the "fix." The fix only prevents future growth.

**Prevention:** Pair the schema/code change with a one-shot prune migration that deletes sessions older than N days on first run after upgrade.

**Phase:** D

---

### Pitfall 15: Splitting `pagePrimitives.tsx` breaks tree-shaking / re-export chain

**What goes wrong:** Splitting a 796-line file into 4 smaller files commonly introduces a `pagePrimitives.tsx` barrel that re-exports everything for backward compatibility. Barrel files defeat tree-shaking — every import of `SearchField` now also loads `CapacityBar`, `ConfirmModal`, etc.

**Prevention:**
1. Update import sites at split time. Don't keep a barrel.
2. If a barrel is unavoidable, mark it `"sideEffects": false` in package.json AND ensure each re-exported file has no side effects.
3. Verify with bundle analyzer that splitting did not increase bundle size.

**Phase:** E

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation |
|-------|---------------|------------|
| A — MUI removal | CssBaseline reset gaps (#1), emotion runtime survival (#2), font flash (#10), Vite cache deception (#11) | Screenshot diffing, post-build grep for `@emotion`, font-display tuning, clear `.vite` cache |
| B — Optimistic UI | Stale closures (#3), refetch overwrites (#9) | Functional setters mandatory, pending-set guard against `refresh()` |
| C — macOS polish | Traffic light reset on theme change (#6), system-ui weight quantization (#7), vibrancy opacity layering (#8), drag region conflicts (#12), dark mode listener (#13) | Theme/resize event re-application, weight token discipline, `transparent: true` + transparent body, explicit no-drag |
| D — SQLite hygiene | SQLITE_BUSY self-deadlock (#4), migration deletion/skip (#5), backfill missing on prune (#14) | `BEGIN IMMEDIATE` for writes, append-only migrations, one-shot prune migration |
| E — File splits | Barrel file kills tree-shaking (#15) | Update import sites, no barrels |

---

## Sources

- [Tauri Window Customization v2](https://v2.tauri.app/learn/window-customization/) — HIGH (official docs)
- [Tauri commit: traffic light position](https://github.com/tauri-apps/tauri/commit/30f5a1553d3c0ce460c9006764200a9210915a44) — HIGH
- [tauri-plugin-decorum](https://crates.io/crates/tauri-plugin-decorum/0.1.0) — MEDIUM (community plugin)
- [tauri-apps/window-vibrancy](https://github.com/tauri-apps/window-vibrancy) — HIGH
- [WKBlurEffect demo (NSVisualEffectView + WKWebView)](https://github.com/revblaze/WKBlurEffect) — MEDIUM
- [Emotion issue #3133 — cache leakage](https://github.com/emotion-js/emotion/issues/3133) — HIGH (project bug tracker)
- [Emotion PR #3110 — global cache memory leak](https://github.com/emotion-js/emotion/pull/3110) — HIGH
- [Tailwind Preflight docs](https://tailwindcss.com/docs/preflight) — HIGH (official)
- [MUI x Tailwind interoperability](https://mui.com/material-ui/integrations/interoperability/) — HIGH (official)
- [SQLite WAL mode docs](https://sqlite.org/wal.html) — HIGH
- [SQLite busy_timeout C API](https://sqlite.org/c3ref/busy_timeout.html) — HIGH
- [Bert Hubert: SQLITE_BUSY despite timeout](https://berthub.eu/articles/posts/a-brief-post-on-sqlite3-database-locked-despite-timeout/) — HIGH (technical post-mortem)
- [Concurrent optimistic updates in React Query — TkDodo](https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query) — HIGH (TanStack maintainer)
- [Dmitri Pavlutin: stale closures in React hooks](https://dmitripavlutin.com/react-hooks-stale-closures/) — MEDIUM
- [Tauri WKWebView font rendering issue #12638](https://github.com/tauri-apps/tauri/issues/12638) — MEDIUM
- [8 Tips for Native Look and Feel in Tauri](https://dev.to/akr/8-tips-for-creating-a-native-look-and-feel-in-tauri-applications-3loe) — LOW (community blog, verified against Tauri docs)
- [Tauri SQL plugin docs](https://v2.tauri.app/plugin/sql/) — HIGH

**Confidence overall:** HIGH — all critical pitfalls verified against official sources or project bug trackers; minor pitfalls verified against community consensus + at least one authoritative source.
