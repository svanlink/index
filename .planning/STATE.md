# State: Catalog v2

**Initialized:** 2026-05-03 (v2 milestone)
**v1 complete:** 2026-05-03

## Project Reference

- **Name:** Catalog
- **Core Value:** Every piece of data shown is correct — no confusing states, no placeholders, no misleading numbers
- **Current Focus:** v1 polish milestone — trust + speed remediation on a working brownfield Tauri v2 app
- **Mode:** yolo (auto-approve)
- **Granularity:** coarse

## Current Position

- **Milestone:** v2 — footage inventory layer
- **Phase:** Phase 1 — Data & Rust Layer (pending)
- **Plan:** TBD
- **Status:** Roadmap complete, Phase 1 not yet planned

**Progress:** [░░░░░░░░░░] 0/3 phases complete

## Phase Summary

| # | Phase | Status | Requirements |
|---|-------|--------|--------------|
| 1 | Data & Rust Layer | Pending | 4 |
| 2 | Tags UI | Pending | 4 |
| 3 | Manifest Export + Polish | Pending | 5 |

## Performance Metrics

- **Phases planned:** 3
- **Phases complete:** 0
- **Plans complete:** 0
- **Requirements mapped:** 13/13 (100%)
- **Requirements validated:** 0/13

## Accumulated Context

### Key Decisions (v2)

- `project_metadata` table stores format + status only — `correctedClient` in `projects` is the client source of truth (DRY)
- Filter UX: three chip dropdowns (Client ▾ / Format ▾ / Status ▾) — all three as chips, consistent interaction model
- Manifest file format: `.md` — editor/Obsidian-readable, zero deps
- Manifest export: native save panel via `tauri-plugin-dialog` — explicit, not clever
- Manifest filename: includes HHMMSS to avoid silent overwrite
- Manifest write: Rust `std::fs::write` — no `tauri-plugin-fs` capability needed
- pagePrimitives split (CODE-V2-01): already done in ea0e19b — removed from v2 scope
- Tauri commands added: `upsert_project_format_status` + `export_drive_manifest`
- Tag filtering: client-side `useMemo` — same pattern as existing search, no round-trip

### Key Decisions (v1 — preserved for context)

- Coarse granularity: 3 phases (A→1, B+E→2, C+D→3)
- React 19 useOptimistic chosen over useOptimisticMutation.ts
- Instant search: replace:true navigate to avoid polluting back-button history

### Constraints in Force

- macOS only (Tauri WKWebView)
- SQLite singleton, max_connections=1, WAL mode — `BEGIN IMMEDIATE` required for writes
- Migrations are append-only (brownfield user DBs in field) — Migration 14 must be `IF NOT EXISTS`
- Dev build workflow only (`corepack pnpm --filter @drive-project-catalog/desktop dev`)
- `PRAGMA foreign_keys=ON` must be set per connection for `ON DELETE CASCADE` to fire — confirm in Phase 1
- Manifest write via Rust `std::fs::write` — no `tauri-plugin-fs` in capabilities

### Confirmed Pre-Phase Findings

- `PRAGMA foreign_keys = ON` ✅ already set in `#ensureReady()` (sqliteLocalPersistence.ts:1088) — Migration 14 CASCADE will fire automatically, no changes needed
- CODE-V2-02 ✅ confirmed complete — `AppScanState::prune_stale_sessions(5min TTL)` in `scan_engine.rs:212–219`, called on every new scan registration
- `dialog:allow-save` ⚠️ MISSING from `capabilities/default.json` — Phase 3 must add `"dialog:allow-save"` alongside existing `"dialog:allow-open"`

### Blockers

None.

## Session Continuity

**Last session:** 2026-05-03 — v2 roadmap planned (office-hours + autoplan + gsd-new-project)

**Next action:** Run `/gsd-plan-phase 1` to plan Phase 1 (Data & Rust Layer).

**v2 context:**
- Design doc at `~/.gstack/projects/svanlink-index/sebastian-main-design-20260503.md`
- Test plan at `~/.gstack/projects/svanlink-index/sebastian-main-test-plan-20260503-2044.md`
- Requirements: `.planning/REQUIREMENTS-v2.md`
- Roadmap: `.planning/ROADMAP-v2.md`
- Phase 1 critical question: confirm `PRAGMA foreign_keys=ON` in `sqliteLocalPersistence.ts` and `dialog:allow-save` capability
- pagePrimitives split (CODE-V2-01) already done in ea0e19b — skip

**v1 baseline (complete):**
- Full Liquid Glass redesign shipped (fcd6b36): Tailwind removed, vanilla CSS design system.
- CSS-001 DoD complete: zero Tailwind, build passes, 70/70 tests.
- All 4 command palette issues done: fuzzy search, drive results, pinned actions, recent projects.

---
*State updated: 2026-05-03 — v2 roadmap complete, ready for Phase 1 planning*
