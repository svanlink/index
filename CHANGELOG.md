# Changelog

## v2.0.0-rc1 — 2026-05-04

v2 kicks off with a full Liquid Glass design system, accessibility hardening, and a Rust backend that fails loudly instead of silently. Eighteen commits across the desktop app, UI package, and Tauri backend — Tailwind is gone, vanilla CSS design tokens replace it, and every drive/project surface has been redrawn from scratch.

---

### UI redesign — Liquid Glass design system

**Goal:** Replace Tailwind with a deliberate, native-feeling design language built on CSS custom properties.

- **Tailwind removed** — `packages/ui` and the desktop app now use a vanilla CSS design system in `globals.css` with semantic tokens (`--ink`, `--surface`, `--hairline`, `--glass-*`, `--drive-*`)
- **system-ui font stack** — replaces explicit font imports; matches macOS native rendering exactly
- **Liquid Glass material** — backdrop-filter blur + saturate on the sidebar, command palette, and modal backdrops; pulse-ring animation for active scan state
- **Drive cards (A-series)** — 3px left accent border keyed to drive identity color, connection badge, hover-revealed action buttons, capacity legend
- **Drive detail (B-series)** — two-column header, action toolbar, shared `ProjectList` component, connection banner for offline drives
- **Project detail (C-series)** — category avatar, drive color dot, unsaved-changes indicator, drive quick-link to parent
- **Import dialog (D-series)** — split into discrete sections, inline search, extracted sub-components for testability
- **Empty states (E-series)** — context-aware messages with icons, drive-detail CTA, no more bare "Nothing here"
- **Confirm modal (F-series)** — 40px → 28px title, `consequence` prop for danger-tone description, split into structured paragraphs
- **Command palette polish** — aligned design tokens, fixed hover states, extracted `ResultRow`/`SectionLabel`, added clear button

### Accessibility & interaction hardening

**Goal:** Every keyboard path works; modals trap focus correctly.

- **Focus trap** — new `useFocusTrap` hook manages Tab/Shift+Tab containment and focus restoration for every modal
- **Enter-fires-wrong-action bug fixed** — keydown listeners scoped to dialog containers instead of bubbling to ancestor buttons
- **Semantic timeline** — scan history uses `<ol>` + `<time>` instead of div soup
- **j/k navigation** — vim-style list navigation in the command palette and project list
- **Sidebar grouping** — `NavSection` API renders `LIBRARY` / `DRIVES` eyebrow labels; drive entries show their identity dot inline

### Rust backend — eliminate silent failures

**Goal:** Every error gets logged or surfaced; nothing returns `None` quietly.

- **`get_volume_info` returns `Result`** — `Ok(VolumeInfo)` or `Err(String)` with the diskutil/df failure reason; callers can distinguish "infrastructure failure" from "no UUID on FAT32"
- **`list_scan_snapshots` returns `Result`** — propagates lock-poisoning errors instead of panicking
- **TTL eviction for scan sessions** — `prune_stale_sessions` runs opportunistically on every new scan start; 5-minute TTL on finalized sessions bounds map growth without a background thread
- **Size walk ceiling logged** — when `MAX_SIZE_WALK_ENTRIES` is hit, the partial size is logged with a warning so a "ready" status with an undercount is visible in logs
- **Worker thread panics logged** — `Drop::join_size_workers` extracts and logs panic payloads instead of swallowing them
- **`strip_prefix` fallback logged** — should-be-impossible symlink/race conditions in `scan_directory` now warn instead of silently storing absolute paths
- **`finish_size_job` orphan detection** — logs an internal-bug error when a size result arrives for a project_id no longer in the snapshot

### Dead code removal & consolidation

- **`ScanSection`, `ImportSection` removed** — replaced by inline render in DriveDetailPage
- **`MetaField` consolidated** — moved into `pagePrimitives.tsx`, all callers updated
- **`pagePrimitives.tsx` shrunk** — split into smaller modules where the primitives only had one consumer

### Documentation & planning

- **Design reference HTMLs** — `apps/desktop/catalog-story.html` and `design-presentation.html` capture the design language as standalone artifacts
- **`.planning/REQUIREMENTS-v2.md`, `.planning/ROADMAP-v2.md`** — v2 requirements and phase plan
- **Archived completed issues** — `.planning/archive/issues/` holds the v1 issue history; active `.planning/issues/` only holds v2 work
- **Removed root-level v1 docs** — `ARCHITECTURE.md`, `DESIGN.md`, `INVARIANTS.md`, `PRODUCT_SPEC.md`, `RELEASE_DESKTOP.md`, `SCHEMA.md`, `TASKS.md`, `UI_PAGES.md`, `CODEX_MASTER_PROMPT.md`, `CODING_RULES.md`, `MACOS_RELEASE_OPERATIONS.md`, `Project Overview.md`, `RELEASE_NOTES_TEMPLATE.md`, `UI_Wireframe_and_Architecture_Diagram.png` consolidated into `.planning/` or removed

### Tooling

- **Sandcastle/Ralph scripts updated** — `ralph-once.sh` and `sandcastle.sh` adjusted for v2 issue workflow

---

## v1.0 — 2026-05-02

v1 is a focused trust-and-accuracy milestone on a working brownfield Tauri v2 app. Three phases, 17 requirements, zero tolerance for fabricated data.

---

### Phase 1 — Strip Dead Weight

**Goal:** Remove everything that was never needed and never worked.

- Removed MUI, `@emotion/react`, `@emotion/styled` — entire component library stripped from the `packages/ui` dependency graph
- Removed Supabase sync transport from the critical-path bundle; optional sync is now a true runtime opt-in gated on env vars
- Removed dead exports, unused files, and stale cargo build cache artifacts
- Resolved all TypeScript errors left over from the brownfield state

### Phase 2 — Trustworthy Mutations

**Goal:** Every number shown is either correct or explicitly absent.

- **Accurate capacity display**: `CapacityBar` no longer renders a fabricated fill percentage when drive bytes are unknown — it renders nothing
- **Drive empty-state guard**: The "No import task has run yet" message no longer fires before data loads
- **Optimistic delete**: Deleting a project or drive removes it from the list immediately (optimistic update via `useOptimistic` + `startTransition`)
- **Optimistic create**: Adding a drive shows a placeholder card instantly before the Rust write completes
- **Terminal scan cleanup**: `deleteScanSession` is guarded behind a terminal-status check; `cancelled` sessions are now cleaned up correctly alongside `completed` and `failed`
- **`runMutation` pipeline**: Central mutation wrapper — sets `isMutating`, runs the operation, refreshes, clears flag — used by all write operations
- **Error feedback**: Mutation failures surface as visible UI errors rather than silent no-ops
- **React 19 compliance**: All `applyOptimistic*` calls wrapped in `startTransition` per React 19 requirements — eliminates console warning

### Phase 3 — macOS-Native Catalog UX

**Goal:** The app feels native. Every UI state is honest.

- **Sidebar vibrancy**: `NSVisualEffectView` with `.sidebar` material — desktop wallpaper bleed-through matches native macOS sidebar apps
- **Traffic light clearance**: `h-[52px]` drag region keeps title-bar buttons unobscured with proper spacing
- **Instant search**: Project list filters on every keystroke using `replace:true` navigate — back-button history is not polluted
- **Honest scan states**: Project detail shows "Not yet scanned" and "Path unavailable" instead of bare dashes when scan data is absent
- **Open in Finder**: Verified present and functional in project detail

---

### Framework evaluation — React 19 vs Ripple-TS (2026-05-02)

Evaluated switching Catalog's frontend from React 19 to [Ripple-TS](https://github.com/Ripple-TS/ripple). Decision: **stay React 19**.

- Ripple is v0.3.x early alpha — creator explicitly calls it not production-ready
- No Tauri community template, no component ecosystem, `.tsrx` non-standard syntax
- Catalog has no measurable React-caused pain — the bottleneck is Tauri IPC latency, not React reconciliation
- All four premises for switching were weak or false

**Watch list:**
1. `react-compiler` — add to Vite when stable (~mid-2026)
2. Ripple v1.0 — reassess if it ships with Tauri community support
3. SolidJS — only if a real render performance problem emerges at scale

Research note at `.gstack/projects/svanlink-index/2026-05-02-design-react-vs-ripple.md`.

---

### Test coverage at v1 ship

- **254 passing tests** across domain, data, and component layers
- Regression tests added for terminal scan session cleanup (completed, failed, cancelled) and `sizeJobsPending > 0` guard
- TypeScript: all 4 packages typecheck clean

### Known deferred items (v2)

- Code-split 574KB JS bundle
- `openedAt` migration for projects (FEAT-V2-03)
- Tauri 2.9 upgrade evaluation
- Fuzzy search / ⌘K command palette
