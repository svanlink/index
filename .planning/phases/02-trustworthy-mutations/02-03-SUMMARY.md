---
phase: 02-trustworthy-mutations
plan: 03
subsystem: frontend/state
tags: [optimistic-ui, react-19, useOptimistic, mutations]
requirements: [FOUND-02]
key-files:
  modified:
    - apps/desktop/src/app/providers.tsx
decisions:
  - Use React 19 built-in useOptimistic (no external library)
  - Keep isMutating=true via runMutation until refresh() resolves to prevent triple-flash
  - tempDrive uses Drive interface exactly (totalCapacityBytes, not capacityBytes)
  - selectedProject/selectedDrive derivations remain on real state (not optimistic) for read operations
metrics:
  duration: "~10 minutes"
  completed: "2026-05-02"
---

# Phase 2 Plan 03: Optimistic Mutations Summary

Wired React 19 useOptimistic for deleteProject, deleteDrive, and createDrive in providers.tsx.

## Tasks Completed

| Task | Result | Commit |
|------|--------|--------|
| Wire useOptimistic for deleteProject, deleteDrive, createDrive | PASS | ea3f5e1 |
| Verify error feedback in DrivesPage and DriveDetailPage | PASS | ea3f5e1 |

## Changes Made

### providers.tsx
- Added `useOptimistic` to React import
- Added `optimisticProjects` with delete/add reducer (after useState block)
- Added `optimisticDrives` with delete/add reducer (after useState block)
- `deleteProject`: applies `applyOptimisticProjectChange({ type: "delete" })` before runMutation
- `deleteDrive`: applies `applyOptimisticDriveChange({ type: "delete" })` before runMutation
- `createDrive`: builds tempDrive with Drive-exact shape, applies `applyOptimisticDriveChange({ type: "add" })` before runMutation
- value.projects → optimisticProjects; value.drives → optimisticDrives
- Updated useMemo deps to include optimistic vars and apply functions

### DrivesPage + DriveDetailPage (Task 2 — verified, no changes needed)
- createDrive already wrapped in try/catch with setFeedback
- deleteDrive already wrapped in try/catch with setFeedback
- Both pages receive optimistic lists automatically via context propagation

## Deviations from Plan

**Auto-fix [Rule 1 - Type correctness]** — tempDrive shape adjusted: plan used `capacityBytes`/`capacityTerabytes` fields that don't exist on Drive interface. Used actual Drive fields: `totalCapacityBytes`, `usedBytes`, `freeBytes`, `reservedIncomingBytes`, `lastScannedAt`, `createdManually`.

## Self-Check: PASSED
- useOptimistic wired in providers.tsx (3 matches: import + 2 declarations)
- optimisticDrives/optimisticProjects in value useMemo
- DrivesPage and DriveDetailPage already had try/catch + setFeedback at mutation call sites
- tsc --noEmit exits 0
