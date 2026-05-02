---
phase: 02-trustworthy-mutations
plan: 04
subsystem: frontend/pages
tags: [refactor, code-split, hook-extraction, drives-page]
requirements: [CODE-01]
key-files:
  created:
    - apps/desktop/src/app/useImportFromVolume.ts
    - apps/desktop/src/pages/drives/DriveCreateForm.tsx
    - apps/desktop/src/pages/drives/DriveCard.tsx
  modified:
    - apps/desktop/src/pages/DrivesPage.tsx
decisions:
  - Extract DriveCard in addition to plan-specified extractions to get DrivesPage under 400 lines
  - useImportFromVolume uses injected deps (not useCatalogStore) for testability
  - deriveVolumeName helper co-located in useImportFromVolume (moved from DrivesPage)
metrics:
  duration: "~15 minutes"
  completed: "2026-05-02"
---

# Phase 2 Plan 04: DrivesPage Split Summary

Extracted useImportFromVolume hook, DriveCreateForm, and DriveCard components from DrivesPage.tsx, bringing it to 279 lines.

## Tasks Completed

| Task | Result | Commit |
|------|--------|--------|
| Create useImportFromVolume.ts hook | PASS | e68e88b |
| Create DriveCreateForm.tsx + slim DrivesPage.tsx | PASS | e68e88b |

## Changes Made

### apps/desktop/src/app/useImportFromVolume.ts (new)
- Full import-from-volume state machine (importSourcePath, importFolders, importVolumeInfo, isPickingImport, isImporting)
- Exports: UseImportFromVolumeReturn interface, useImportFromVolume hook
- Injected deps: drives, projects, createDrive, importFoldersFromVolume, navigate, setFeedback
- No useCatalogStore, no JSX

### apps/desktop/src/pages/drives/DriveCreateForm.tsx (new)
- Exports: DriveFormState interface, initialDriveForm constant, DriveCreateForm component
- FormField helper is module-internal (not exported)

### apps/desktop/src/pages/drives/DriveCard.tsx (new)
- Exported DriveCard component (extracted beyond plan spec to reach line target)
- All capacity/health/scan-session display logic verbatim from original

### DrivesPage.tsx
- 758 → 279 lines (CODE-01 closed)
- Imports useImportFromVolume, DriveCreateForm, DriveCard

## Deviations from Plan

**[Rule 2 - Scope expansion]** DriveCard extracted additionally (not in plan spec) because extracting only useImportFromVolume + DriveCreateForm left file at 512 lines, still over 400. DriveCard is a pure presentational component with no cross-cutting state, making it a safe extraction. Zero behavior change.

## Self-Check: PASSED
- useImportFromVolume.ts exists, no JSX, no useCatalogStore
- DriveCreateForm.tsx exports DriveFormState, initialDriveForm, DriveCreateForm
- DrivesPage.tsx: 279 lines (< 400)
- tsc --noEmit exits 0
