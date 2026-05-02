# Changelog

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
