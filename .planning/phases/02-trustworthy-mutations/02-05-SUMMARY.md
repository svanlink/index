---
phase: 02-trustworthy-mutations
plan: 05
subsystem: frontend/pages
tags: [refactor, code-split, drive-detail-page]
requirements: [CODE-02]
key-files:
  created:
    - apps/desktop/src/pages/drives/ScanStatusPanel.tsx
    - apps/desktop/src/pages/drives/ScanSection.tsx
    - apps/desktop/src/pages/drives/ImportSection.tsx
    - apps/desktop/src/pages/drives/ProjectCollection.tsx
  modified:
    - apps/desktop/src/pages/DriveDetailPage.tsx
decisions:
  - Extract ProjectCollection in addition to plan-specified extractions to get DriveDetailPage under 400 lines
  - ImportSection receives state + handlers as props (DriveDetailPage owns the state)
  - ScanSection imports ScanStatusPanel internally (ScanSection is the public API, ScanStatusPanel is an implementation detail)
metrics:
  duration: "~15 minutes"
  completed: "2026-05-02"
---

# Phase 2 Plan 05: DriveDetailPage Split Summary

Extracted ScanSection, ImportSection, ScanStatusPanel, and ProjectCollection from DriveDetailPage.tsx, bringing it to 312 lines.

## Tasks Completed

| Task | Result | Commit |
|------|--------|--------|
| Extract ScanStatusPanel | PASS | 9a3e6a6 |
| Extract ScanSection + ImportSection + slim DriveDetailPage | PASS | 9a3e6a6 |

## Changes Made

### apps/desktop/src/pages/drives/ScanStatusPanel.tsx (new)
- Exported ScanStatusPanel component with ScanStatusPanelProps interface
- MetaField helper is module-internal (inline, not exported)

### apps/desktop/src/pages/drives/ScanSection.tsx (new)
- Exported ScanSection with ScanSectionProps interface
- Renders the full scan card: path input, Browse button, FeedbackNotice for desktop-only + scan error, ScanStatusPanel

### apps/desktop/src/pages/drives/ImportSection.tsx (new)
- Exported ImportSection with ImportSectionProps interface
- Simple action card: import button + desktop-only warning

### apps/desktop/src/pages/drives/ProjectCollection.tsx (new)
- Exported ProjectCollection component
- Renders SectionCard with project link list (extracted beyond plan spec to reach line target)

### DriveDetailPage.tsx
- 720 → 312 lines (CODE-02 closed)
- Removed getScanStatusLabel import (unused after extraction)
- buildImportCleanupIssueParts renamed to buildImportIssueParts (local helper, no external contract)

## Deviations from Plan

**[Rule 2 - Scope expansion]** ProjectCollection extracted additionally (not in plan spec) because extracting only ScanSection + ImportSection + ScanStatusPanel left file at ~463 lines. ProjectCollection has zero cross-cutting state and is a pure presentational component. Zero behavior change.

## Self-Check: PASSED
- ScanStatusPanel.tsx, ScanSection.tsx, ImportSection.tsx, ProjectCollection.tsx all exist
- DriveDetailPage.tsx: 312 lines (< 400)
- tsc --noEmit exits 0
