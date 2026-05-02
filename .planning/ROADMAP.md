# Roadmap: Catalog v1

**Created:** 2026-05-02
**Granularity:** coarse (3-5 phases)
**Mode:** yolo
**Total v1 requirements:** 17
**Coverage:** 17/17 mapped

## Core Value

Every piece of data shown is correct. No confusing states, no placeholders, no misleading numbers — if Catalog shows it, you can trust it.

## Phases

- [ ] **Phase 1: Strip Dead Weight** - Remove MUI, Roboto, unused Rust deps; address Preflight gaps; remove broken-flow toast
- [ ] **Phase 2: Trustworthy Mutations** - Optimistic mutation pipeline, accuracy fixes, scan-session pruning, code splits
- [ ] **Phase 3: macOS-Native Catalog UX** - Native chrome (vibrancy + traffic lights), instant search, accurate project detail with Open in Finder

## Phase Details

### Phase 1: Strip Dead Weight
**Goal**: Foundation is clean — no dead runtime code, no dead deps, no broken-flow UI references; CSS baseline is sound after MUI removal
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-03, FOUND-04, MAC-03, ACCU-03
**Success Criteria** (what must be TRUE):
  1. Running `grep -rn "@mui\|@emotion\|@fontsource"` in `apps/desktop/src` returns no matches and the production bundle ships no MUI/Emotion chunks
  2. `cargo tree` shows no `notify` or `sha2` crates pulled in
  3. App opens with correct typography, body background, and form rendering — no visual regression after CssBaseline removal (subpixel smoothing intact, no unstyled flash)
  4. Importing folders from a volume no longer surfaces a "Rename Review" toast referencing a route that doesn't exist
  5. `IGNORED_SYSTEM_FOLDERS` is defined in exactly one Rust module and imported by both `scan_engine.rs` and `volume_import.rs`
**Plans**: TBD
**UI hint**: yes

### Phase 2: Trustworthy Mutations
**Goal**: Every write feels instant and every shown value is honest; large page files are split for maintainability
**Depends on**: Phase 1
**Requirements**: FOUND-02, ACCU-01, ACCU-02, ACCU-04, UX-02, CODE-01, CODE-02
**Success Criteria** (what must be TRUE):
  1. Editing a project name, deleting a project, or registering a drive reflects in the UI before the IPC round-trip completes; on simulated failure the change rolls back cleanly with a visible error
  2. CapacityBar renders an em-dash (or equivalent honest-unknown state) when `usedBytes` or `totalBytes` is null — never a fabricated 28% fill
  3. With drives or projects already in the catalog, the user never sees the "No import task has run yet" message
  4. After a successful scan ingestion, `scan_sessions` rows for that session are removed and `scan_session_projects` rows cascade — no orphaned scan-session debris in SQLite
  5. Every loading, empty, and error state in the catalog has a specific, accurate label that matches the underlying state (no generic spinners, no contradictory copy)
  6. `DrivesPage.tsx` and `DriveDetailPage.tsx` are each under 400 lines, with import flow and scan/import sections extracted to focused hooks/components
**Plans**: 6 plans
- [ ] 02-01-PLAN.md — Fix CapacityBar 28% fabricated fill and DrivesPage empty-state guard (ACCU-01, ACCU-02, UX-02)
- [ ] 02-02-PLAN.md — Add deleteScanSession to persistence layer and wire in ingestScanSnapshot (ACCU-04)
- [ ] 02-03-PLAN.md — Wire useOptimistic in providers.tsx for deleteProject, deleteDrive, createDrive (FOUND-02)
- [ ] 02-04-PLAN.md — Extract useImportFromVolume hook and DriveCreateForm, slim DrivesPage to <400 lines (CODE-01)
- [ ] 02-05-PLAN.md — Extract ScanSection, ImportSection, ScanStatusPanel, slim DriveDetailPage to <400 lines (CODE-02)
- [ ] 02-06-PLAN.md — Full build verification and Phase 2 sign-off
**UI hint**: yes

### Phase 3: macOS-Native Catalog UX
**Goal**: App looks and feels like a native macOS catalog tool — vibrant sidebar, native chrome, instant search, accurate detail view with Finder integration
**Depends on**: Phase 2
**Requirements**: MAC-01, MAC-02, UX-01, UX-03, UX-04
**Success Criteria** (what must be TRUE):
  1. The window sidebar shows native NSVisualEffectView vibrancy (Sidebar material) — desktop wallpaper bleeds through subtly when the window is moved
  2. The titlebar uses Overlay style with traffic lights positioned correctly (no content obscured, no overlap with sidebar nav, position survives theme change and fullscreen toggle)
  3. Typing in the project search field filters the visible list within one frame — no debounce wait, no SQLite round-trip per keystroke
  4. Project detail page shows accurate size, full file path, scan status, and last-scanned timestamp — no placeholder dashes when real data exists, no stale data after a rescan
  5. Project detail has an "Open in Finder" button that reveals the project folder in Finder via the appropriate Tauri shell command
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Strip Dead Weight | 0/? | Not started | - |
| 2. Trustworthy Mutations | 0/6 | Planned | - |
| 3. macOS-Native Catalog UX | 0/? | Not started | - |

## Coverage Validation

| Phase | Requirements | Count |
|-------|--------------|-------|
| 1 | FOUND-01, FOUND-03, FOUND-04, MAC-03, ACCU-03 | 5 |
| 2 | FOUND-02, ACCU-01, ACCU-02, ACCU-04, UX-02, CODE-01, CODE-02 | 7 |
| 3 | MAC-01, MAC-02, UX-01, UX-03, UX-04 | 5 |
| **Total** | | **17/17** |

No orphans. No duplicates. 100% coverage.

## Notes

- Phase order is dependency-driven (per research SUMMARY.md): MUI strip MUST precede mutation refactor MUST precede polish — design tokens land cleanly only after MUI's ThemeProvider is gone, and there's no point polishing UI that flickers on every save.
- Original research suggested 5 phases (A–E); coarse granularity consolidates: research Phase A → Phase 1, Phase B + E → Phase 2 (mutations + code splits naturally cluster around mutation boundaries), Phase C + D → Phase 3 (macOS chrome and search-loop UX both deliver "feels native" together).
- Research Phase D extras (fuzzy match, recents, ⌘K) deferred to v2 (FEAT-V2-03) — v1 ships substring filter only per UX-01.
- All 3 phases have UI hints — every phase touches the React/Tailwind frontend.

---
*Roadmap created: 2026-05-02*
*Phase 2 planned: 2026-05-02*
