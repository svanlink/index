# State: Catalog v1

**Initialized:** 2026-05-02

## Project Reference

- **Name:** Catalog
- **Core Value:** Every piece of data shown is correct — no confusing states, no placeholders, no misleading numbers
- **Current Focus:** v1 polish milestone — trust + speed remediation on a working brownfield Tauri v2 app
- **Mode:** yolo (auto-approve)
- **Granularity:** coarse

## Current Position

- **Milestone:** v1 polish
- **Phase:** Not started (next: Phase 1 — Strip Dead Weight)
- **Plan:** None
- **Status:** Roadmap complete, awaiting `/gsd-plan-phase 1`

**Progress:** [░░░░░░░░░░] 0/3 phases complete

## Phase Summary

| # | Phase | Status | Requirements |
|---|-------|--------|--------------|
| 1 | Strip Dead Weight | Not started | 5 |
| 2 | Trustworthy Mutations | Not started | 7 |
| 3 | macOS-Native Catalog UX | Not started | 5 |

## Performance Metrics

- **Phases planned:** 3
- **Phases complete:** 0
- **Plans complete:** 0
- **Requirements mapped:** 17/17 (100%)
- **Requirements validated:** 0/17

## Accumulated Context

### Key Decisions

- Coarse granularity: 3 phases instead of research-suggested 5 (consolidated A→1, B+E→2, C+D→3)
- Phase order is hard-dependency-driven: MUI strip first, then mutations, then macOS polish
- No TanStack Query — strengthen existing CatalogStoreContext with optimistic mutation pipeline
- Search loop limited to substring filter for v1; fuzzy/⌘K palette deferred to v2
- Drive management remains secondary; project catalog is the daily-driver flow

### Constraints in Force

- macOS only (Tauri WKWebView)
- SQLite singleton, max_connections=1, WAL mode — `BEGIN IMMEDIATE` required for writes
- Migrations are append-only (brownfield user DBs in field)
- Dev build workflow only (`corepack pnpm --filter @drive-project-catalog/desktop dev`)

### Open Todos

- Measure baseline production bundle size before Phase 1 (verify ~350KB MUI savings claim)
- Decide Tauri 2.9 upgrade — bundle with Phase 1 or defer
- Define `scan:projects-ingested` event payload shape before Phase 2 implementation
- Decide whether to front-load `openedAt` migration (currently deferred to v2 with FEAT-V2-03)

### Blockers

None.

## Session Continuity

**Last session:** 2026-05-02 — initialization (PROJECT, REQUIREMENTS, RESEARCH, ROADMAP, STATE)

**Next action:** `/gsd-plan-phase 1` to decompose Phase 1 into executable plans.

**Resume context:** Phase 1 strips MUI/Emotion/Roboto/unused Rust deps, addresses Preflight gaps after CssBaseline removal, removes the broken Rename Review toast, and dedupes IGNORED_SYSTEM_FOLDERS. This is teardown, not feature work — lowest-risk wins, immediate bundle payoff, unblocks design polish in Phase 3.

---
*State initialized: 2026-05-02*
