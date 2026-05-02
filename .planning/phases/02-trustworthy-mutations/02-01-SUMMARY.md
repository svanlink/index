---
phase: 02-trustworthy-mutations
plan: 01
subsystem: frontend/pages
tags: [accuracy, ux, capacity-bar, empty-state]
requirements: [ACCU-01, ACCU-02, UX-02]
key-files:
  modified:
    - apps/desktop/src/pages/pagePrimitives.tsx
    - apps/desktop/src/pages/DrivesPage.tsx
decisions:
  - Use isUnknown boolean flag in CapacityBar to conditionally omit fill div entirely
  - Guard DrivesPage empty-state on both drives.length===0 AND projects.length===0
metrics:
  duration: "~5 minutes"
  completed: "2026-05-02"
---

# Phase 2 Plan 01: CapacityBar + Empty-State Accuracy Summary

Removed two fabricated display values and tightened one empty-state guard.

## Tasks Completed

| Task | Result | Commit |
|------|--------|--------|
| Fix CapacityBar 28% fabricated fill | PASS | d35dede |
| Fix DriveCard inline bar + empty-state guard | PASS | d35dede |
| Verify ACCU-02 + audit loading/empty/error states | PASS | d35dede |

## Changes Made

### pagePrimitives.tsx — CapacityBar
- Added `isUnknown = pct === null` boolean
- Wrapped `cap-used capacity-bar-fill` div in `{!isUnknown && (...)}` — fill absent when bytes unknown
- No aria-label changes (already correct: "Storage usage unknown")

### DrivesPage.tsx — DriveCard + empty-state
- DriveCard null branch: `<div ... style={{ width: "28%" }} />` → `null`
- Empty-state guard: `planningRows.length === 0` → `drives.length === 0 && projects.length === 0`

### ProjectsPage.tsx
- Verified `!isLoading` precedes `projects.length === 0` — no change needed
- "No import task has run yet" string: absent from all source files

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED
- No "28%" in pagePrimitives.tsx or DrivesPage.tsx
- "No import task" absent from source
- tsc --noEmit exits 0
