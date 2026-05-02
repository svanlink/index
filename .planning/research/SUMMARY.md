# Research Summary — Catalog v1 Polish Milestone

**Project:** Catalog (brownfield Tauri v2 + React 19 macOS desktop catalog)
**Synthesized:** 2026-05-02
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md, PROJECT.md
**Overall confidence:** HIGH

---

## Executive Summary

Catalog is a brownfield Tauri v2 + React 19 macOS app with a working scan + browse + import core. The v1 polish milestone is not feature work — it is **trust-and-speed remediation** on three already-known fault lines: a leftover MUI/Emotion runtime fighting Tailwind Preflight, a `runMutation` helper that triggers four full `SELECT *` refetches on every write, and a generic web-app aesthetic that does not feel native on macOS. Research confirms each of these has a high-confidence, well-documented fix path.

The recommended approach is layered and order-dependent: strip dead weight first (MUI, Emotion, Inter, Roboto, unused Rust crates), then re-architect the mutation pipeline around scope-aware optimistic updates + Tauri event push (replacing the 900ms scan poll), then layer macOS-native chrome (Overlay titlebar with positioned traffic lights, optional vibrancy on the sidebar only, system-ui fonts, AccentColor). Search-loop differentiators (fuzzy matching, recents, pinned, multi-token AND) come after the foundation is solid. The single biggest risk is rushing past the mutation refactor — every new feature shipped before optimistic updates land inherits the full-reload performance bug, so this gate matters.

Key risks are well-mapped: removing CssBaseline without auditing what it actually reset (subpixel font smoothing, body backgrounds, form normalization), Emotion runtime surviving via leaky MUI tree-shake boundaries, stale-closure optimistic state under concurrent mutations, SQLite `BEGIN IMMEDIATE` self-deadlocks under concurrent scans, and vibrancy silently failing because the WKWebView background is opaque. Mitigations are concrete and per-pitfall in PITFALLS.md.

---

## Key Findings

### Stack Decisions (HIGH confidence)

**Keep:** Tauri 2.8.2, React 19.1, TypeScript 5.9, Vite 7.1, Tailwind 3.4, React Router 7.9, `@tauri-apps/api` 2.8, vendored `@tauri-apps/plugin-sql` 2.2, `@phosphor-icons/react` 2.1, Vitest 3.2.

**Add:** `window-vibrancy` Rust crate (0.5+) for native NSVisualEffectView translucency. Optional but high-impact.

**Remove:** `@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled`, `@fontsource-variable/inter`, `@fontsource/roboto`, Rust `notify` (6.1), Rust `sha2` (0.10). MUI's `ThemeProvider` + `CssBaseline` in `main.tsx` are dead weight and actively conflict with Preflight.

**Critical version-specific items:**
- `titleBarStyle: "Overlay"` + `trafficLightPosition` requires Tauri 2.4+ (you're on 2.8.2 — eligible).
- `removeUnusedCommands: true` requires Tauri 2.4+. Audit `capabilities/` first.
- Vite `target: 'safari17'` matches WKWebView baseline on macOS Sonoma+; lets esbuild skip ES2015 transforms.
- Cargo profile: `opt-level = "s"`, `lto = true`, `codegen-units = 1`, `panic = "abort"`, `strip = true`.

### Table-Stakes Features (Daily-Driver Bar)

A daily driver is judged in this order: **trust → speed of access → friction-free repetition.**

Must-haves for v1:
- Honest-unknown UI primitive (em-dash for unknown values, never a fake number — kills the CapacityBar "28%" bug class)
- Last-scanned timestamp visible everywhere data is shown
- Drive-connected status badge on project detail (unmounted ≠ deleted)
- Boot opens to last-viewed page; no white flash on navigation
- Instant substring search across project names (in-memory filter, not per-keystroke SQLite query)
- Cancel stale in-flight queries (race protection)
- Keyboard-first navigation (↑/↓/Enter, ⌘F focus search, ⌘1/⌘2 switch surfaces, Esc clears, ⌘, Settings)
- Reveal in Finder + Open in Terminal on every project detail
- Native macOS window chrome (Overlay titlebar, positioned traffic lights, system fonts)

Differentiators worth chasing in v1 (pick 2–3):
- Fuzzy match with highlighted match characters (use `nucleo` Rust crate or `fuse.js`)
- Empty-search shows recents + pinned (requires `openedAt` column)
- Multi-token AND search ("client acme 2024")
- README rendering inline on project detail
- Vibrancy sidebar (single biggest "real Mac app" signal)

Anti-features explicitly rejected (already in PROJECT.md Out of Scope):
- File operations (move/copy/delete) — Rust read-only invariant is load-bearing
- Cloud sync, FTP/SFTP/S3
- Dual-pane file manager view (Forklift territory)
- Onboarding wizard, in-app settings sprawl, ML auto-categorization
- Manual rename review surface (engine stays in domain, no UI)

### Architecture Approach (Optimistic UI in this Tauri + React Context)

**Verdict: do NOT introduce TanStack Query.** Two sources of truth for the same data is a regression — the Rust scan ingestion writes directly to SQLite and `CatalogStoreContext` is already the canonical store. Strengthen what's there.

The recommended architecture is a **typed entity-cache + optimistic apply/rollback** layered on the existing context. Three additions:

1. **`runOptimisticMutation` pipeline** — generic `(optimisticPatch, action, reconcile, rollback)` helper that updates only the affected slice. Sole writer to slice state.
2. **Pure slice setters** in new `apps/desktop/src/app/catalogSlices.ts` (`upsertProject`, `removeProject`, `mergeProjects`, etc.). Used by both optimistic apply and authoritative reconcile. Unit-testable without React.
3. **Tauri event channel** (`scan:projects-ingested`, `scan:session-updated`) replacing the 900ms `pollScan` loop in `scanWorkflow.tsx`. Backend pushes targeted invalidations.

Supporting changes:
- Repository mutations return the canonical post-write entity (not `void`). `deleteProject`/`deleteDrive` change from `void` → `{ id }`.
- `refreshScope(scope)` alongside existing `refresh()`. Keep `refresh()` as nuclear recovery.
- Snapshot for rollback captured before optimistic apply, restored via the same slice setter on failure.
- React 19 `useOptimistic` is single-component scoped — unsuitable for context-shared state. Manually implementing the pattern is correct here. Wrap async paths in `useTransition` so the pipeline stays non-blocking.

Multi-entity mutations (`importFoldersFromVolume`) cannot enumerate IDs in advance — fall back to "scoped re-fetch on success + full-slice reference snapshot rollback on failure."

SQLite WAL is **safe** for this pattern. Single-writer constraint actually helps: JS layer cannot race against itself. The only meaningful race is JS↔Rust, which the event channel handles. All writes that may interleave with reads must use `BEGIN IMMEDIATE` to avoid `SQLITE_BUSY` self-deadlocks.

### Top Pitfalls

| # | Pitfall | Phase | Severity |
|---|---------|-------|----------|
| 1 | CssBaseline removal exposes Preflight gaps (subpixel smoothing, body background, form normalization) | A | CRITICAL |
| 2 | Emotion runtime survives package removal via leaky MUI tree-shake — verify with post-build grep + bundle analyzer | A | CRITICAL |
| 3 | Stale-closure optimistic state under concurrent mutations — functional setters mandatory | B | CRITICAL |
| 4 | `SQLITE_BUSY` self-deadlock from read-then-upgrade transactions even with `max_connections=1` — use `BEGIN IMMEDIATE` for all writes | B + D | CRITICAL |
| 5 | Skipping/deleting an existing migration corrupts brownfield user DBs — migrations are append-only | D | CRITICAL |
| 6 | Traffic light position resets on theme change + fullscreen — re-apply on `tauri://theme-changed` | C | MODERATE |
| 7 | `system-ui` quantizes Inter's continuous weight axis to discrete SF cuts — snap weight tokens to {400,500,600,700} | C | MODERATE |
| 8 | Vibrancy invisible because WKWebView background is opaque — `transparent: true` + `html, body { background: transparent }` mandatory | C | MODERATE |
| 9 | Background `refresh()` overwrites optimistic state during scan polling — guard with pending-set or pause refresh while mutations in-flight | B | MODERATE |
| 10 | FOUT during MUI removal — preload font, `font-display: optional` | A | MODERATE |
| 11 | Vite optimizeDeps cache hides bundle savings — clear `node_modules/.vite` before measuring | A | MINOR |
| 12 | Overlay titlebar makes top 28px undraggable for content — `data-tauri-drag-region` on bg only, `no-drag` on interactive elements | C | MINOR |
| 13 | Tailwind `dark:` doesn't auto-switch on live macOS theme toggle — listen to `matchMedia` change + Tauri theme event | C | MINOR |

---

## Implications for Roadmap

The research strongly suggests a **5-phase order** with tight dependencies. Each phase is independently shippable and unblocks the next.

### Suggested Phase Structure

**Phase A — Strip dead weight (MUI + fonts + unused Rust deps)**
- *Rationale:* Lowest-risk wins, immediate bundle-size payoff, and removes the Preflight conflict that's likely masking other CSS bugs. Must precede design polish (Phase C) because design tokens land cleanly only after MUI's `ThemeProvider` is gone.
- *Delivers:* Clean `main.tsx` (no `ThemeProvider`/`CssBaseline`), ~350KB bundle reduction, system-ui font stack, smaller Rust binary.
- *Features in scope:* none new — this is teardown.
- *Pitfalls to avoid:* #1 (audit CssBaseline before deleting), #2 (post-build grep for emotion), #10 (FOUT), #11 (clear Vite cache).
- *Quality gate:* `grep -rn "@mui\|@emotion"` returns nothing; bundle analyzer confirms no emotion/mui chunks; visual diff vs. baseline screenshots.

**Phase B — Optimistic mutation pipeline + scoped refresh + event channel**
- *Rationale:* The single most important change in the milestone. Every new feature shipped after this inherits sub-100ms perceived latency; every feature shipped before inherits the full-reload bug. Must precede Phase C polish (no point polishing a UI that flickers on every save) and Phase D feature work.
- *Delivers:* Sub-100ms perceived feedback on every write, removal of 900ms `pollScan` loop, foundation for all subsequent features.
- *Features in scope:* Optimistic mutations across all single-entity writes; honest-unknown UI primitive (em-dash for `null` values); drive-connected status on project detail; last-scanned timestamps surfaced.
- *Pitfalls to avoid:* #3 (functional setters mandatory), #4 (`BEGIN IMMEDIATE`), #9 (refetch overwrite guard).
- *Build sub-order:* slice setters first → repository return-type contract → `runOptimisticMutation` + `refreshScope` → page wiring → Tauri event channel + remove poll loop.
- *Quality gate:* Edit project name during active scan — no flicker; force failure — clean rollback; CPU drops during scans.

**Phase C — macOS-native polish (chrome, vibrancy, type, color)**
- *Rationale:* Has hard dependency on Phase A (system-ui requires MUI font stack gone) and benefits from Phase B (no flicker to mask the polish). This is the "feels like a Mac app" milestone.
- *Delivers:* `titleBarStyle: "Overlay"` with positioned traffic lights, hybrid vibrancy (sidebar translucent, content opaque), system-ui font stack with discrete weight tokens, `AccentColor` keyword respecting user prefs, design tokens in OKLCH, native scroll behavior, selection color, dark mode auto-switch.
- *Features in scope:* native chrome, vibrancy sidebar, design token system.
- *Pitfalls to avoid:* #6 (re-apply traffic light position on theme change), #7 (snap weight tokens), #8 (transparent background layering), #12 (drag region conflicts), #13 (live dark mode toggle).
- *Quality gate:* Toggle macOS theme with app open — no traffic light snap, no theme stuck; bright wallpaper visible through sidebar = vibrancy working.

**Phase D — Daily-driver search loop (the differentiator)**
- *Rationale:* Builds on Phases A–C. This is what makes the app loved, not just tolerated. Search is the most-used feature — magic here pays off every session.
- *Delivers:* Fuzzy match with highlighted characters, empty-search recents + pinned section, multi-token AND search, visible filter chips (Drive / Type / Connected), full keyboard navigation (⌘F, ⌘1/⌘2, Esc, ↑/↓/Enter), Reveal in Finder + Open in Terminal.
- *Features in scope:* search loop, pinned/recents (requires `openedAt` column migration), keyboard shortcuts.
- *Pitfalls to avoid:* #5 (migration is append-only), and any Phase B pitfall that resurfaces if `openedAt` write goes through old path.
- *Quality gate:* Type 5 chars, results within 50ms perceived; Esc always returns to unfiltered catalog; recents survive restart.

**Phase E — Code debt + remaining polish**
- *Rationale:* Cleanup that the daily-driver experience doesn't depend on but the codebase health does. Last because nothing blocks on it.
- *Delivers:* `pagePrimitives.tsx` (796 lines) split, `DrivesPage`/`DriveDetailPage` (760/723 lines) split, `scan_session_projects` table pruning migration, `removeUnusedCommands` audit + enable.
- *Features in scope:* none new.
- *Pitfalls to avoid:* #5 (append-only migrations), #14 (pair schema change with one-shot prune backfill), #15 (no barrel files when splitting).

### Research Flags

| Phase | Needs `/gsd-research-phase`? | Reason |
|-------|------------------------------|--------|
| A | No | STACK.md + PITFALLS.md cover removal sequence completely. |
| B | **Yes (light)** | `useOptimistic` vs. context-cache trade-offs are well-documented but the multi-entity mutation pattern (`importFoldersFromVolume`) deserves a focused spike before implementation. |
| C | **Yes (light)** | Vibrancy hybrid layout (translucent sidebar + opaque content) — verify two-window vs. transparent-window-with-opaque-div approach for this specific app shell. Also verify `tauri-plugin-sql` interaction with `removeUnusedCommands`. |
| D | No | Standard search-UX patterns; `nucleo` and `fuse.js` are battle-tested. |
| E | No | Mechanical refactor + standard SQLite migration patterns. |

### Minimum Lovable v1

If only two phases ship: **Phase A + Phase B.** That delivers a tool the user trusts (honest unknowns, no flicker, clean reset) and that responds instantly to every action. Everything else is upside.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against official Tauri 2.x docs, React 19 docs, MUI removal guides, and direct PROJECT.md state. Vibrancy material choices for web context are MEDIUM (based on HIG conventions, not formally documented). |
| Features | HIGH | Synthesized from current product reviews (HoudahSpot 6, Forklift 4, Raycast, Alfred) plus UX research and existing PROJECT.md scope. Anti-features explicitly grounded in PROJECT.md Out of Scope. |
| Architecture | HIGH | Grounded in repo files (`providers.tsx`, `useOptimisticMutation.ts`, `scanWorkflow.tsx`) plus verified Tauri v2 / React 19 / SQLite WAL docs. Clear precedent against introducing TanStack Query. |
| Pitfalls | HIGH | All critical pitfalls verified against official sources or project bug trackers. Minor pitfalls have at least one authoritative source. |

### Gaps to Address During Planning

1. **Bundle baseline measurement** — measure current production bundle BEFORE Phase A so MUI-removal savings are quantifiable. (PROJECT.md claims ~350KB; verify.)
2. **Vibrancy hybrid layout decision** — two-window vs. transparent-window-with-opaque-content-div. Resolve in Phase C planning.
3. **Tauri 2.9 upgrade decision** — minor version bump, likely safe; read changelog before deciding to bundle with Phase A.
4. **`removeUnusedCommands` × vendored `tauri-plugin-sql`** — verify the vendored plugin doesn't need a `#![plugin(tauri_plugin_sql)]` annotation in `generate_handler!` before enabling in Phase E.
5. **Scan engine event payload shape** — define `scan:projects-ingested` payload (just IDs vs. full entities) before Phase B implementation. ID-only is recommended (fetch on receipt) but worth confirming.
6. **`openedAt` migration timing** — Phase D needs an `openedAt` column. Either bundle the migration with Phase D or front-load to Phase B alongside the optimistic refactor (preferable — fewer migration boundaries).

---

## Sources

### Stack
- [Tauri Window Customization v2](https://v2.tauri.app/learn/window-customization/) — HIGH
- [Tauri 2.4 traffic light commit](https://github.com/tauri-apps/tauri/commit/30f5a1553d3c0ce460c9006764200a9210915a44) — HIGH
- [tauri-apps/window-vibrancy README](https://github.com/tauri-apps/window-vibrancy/blob/dev/README.md) — HIGH
- [React 19 useOptimistic](https://react.dev/reference/react/useOptimistic) — HIGH
- [Tauri App Size docs](https://v2.tauri.app/concept/size/) — HIGH
- [Tauri removeUnusedCommands](https://github.com/tauri-apps/tauri/commit/013f8f652302f2d49c5ec0a075582033d8b074fb) — HIGH
- [System font stack — CSS-Tricks](https://css-tricks.com/snippets/css/system-font-stack/) — HIGH
- [MUI interoperability](https://mui.com/material-ui/integrations/interoperability/) — HIGH

### Features
- [HoudahSpot 6 official](https://www.houdahspot.com/powerful-mac-file-search.html) — HIGH
- [Forklift 4 official](https://binarynights.com/) — HIGH
- [Raycast file search](https://www.raycast.com/core-features/file-search) — HIGH
- [Mac Finder keyboard shortcuts](https://support.apple.com/en-us/102650) — HIGH
- [Search UX best practices — Pencil & Paper](https://www.pencilandpaper.io/articles/search-ux) — MEDIUM
- [Empty State UX best practices](https://www.pencilandpaper.io/articles/empty-states) — MEDIUM

### Architecture
- `apps/desktop/src/app/providers.tsx` (lines 77–129) — primary
- `apps/desktop/src/app/useOptimisticMutation.ts` — primary
- `.planning/codebase/ARCHITECTURE.md` + `CONCERNS.md` — primary
- [Tauri v2 emit/listen](https://v2.tauri.app/develop/calling-frontend/) — HIGH
- [SQLite WAL](https://www.sqlite.org/wal.html) — HIGH
- [TanStack Query optimistic updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates) — HIGH (consulted as anti-pattern reference)

### Pitfalls
- [Tailwind Preflight docs](https://tailwindcss.com/docs/preflight) — HIGH
- [Emotion issue #3133 cache leakage](https://github.com/emotion-js/emotion/issues/3133) — HIGH
- [SQLite busy_timeout C API](https://sqlite.org/c3ref/busy_timeout.html) — HIGH
- [Bert Hubert: SQLITE_BUSY despite timeout](https://berthub.eu/articles/posts/a-brief-post-on-sqlite3-database-locked-despite-timeout/) — HIGH
- [TkDodo: Concurrent optimistic updates](https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query) — HIGH
- [Dmitri Pavlutin: stale closures in React hooks](https://dmitripavlutin.com/react-hooks-stale-closures/) — MEDIUM
- [Tauri WKWebView font rendering #12638](https://github.com/tauri-apps/tauri/issues/12638) — MEDIUM

---

*Research synthesis: 2026-05-02. Ready for requirements definition + roadmap construction.*
