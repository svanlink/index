# Drive Project Catalog — Build Roadmap

## Phase 1 — Foundation
- Initialize monorepo
- Create desktop app scaffold with Tauri
- Add React + TypeScript + Tailwind
- Create shared packages for domain + UI + data
- Add mock data and static shell

## Phase 2 — Domain and Data
- Define shared types
- Implement status helpers
- Implement repositories / data interfaces
- Create local persistence abstraction
- Create sync abstraction

## Phase 3 — Core UI
- Dashboard
- Projects list
- Project detail
- Drives list
- Drive detail
- Manual project creation
- Manual drive creation

## Phase 4 — Scan Engine
- Tauri command for manual scan
- Depth=2 traversal
- Hidden/system folder ignore rules
- Strict naming parser
- Scan cancellation support
- Scan session persistence
- Background size calculation

## Phase 5 — Business Logic
- duplicate detection
- missing detection
- move planning
- reserved capacity
- display values from corrections

## Phase 6 — Sync Readiness
- local-first workflow
- sync queue abstraction
- Supabase-compatible adapters
- settings/config for sync later

## Phase 7 — Polish
- error states
- empty states
- badge system
- loading states
- visual refinement
