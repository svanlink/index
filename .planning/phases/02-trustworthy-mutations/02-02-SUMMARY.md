---
phase: 02-trustworthy-mutations
plan: 02
subsystem: data/persistence
tags: [scan-sessions, sqlite, leak-fix, interface]
requirements: [ACCU-04]
key-files:
  modified:
    - packages/data/src/localPersistence.ts
    - packages/data/src/sqliteLocalPersistence.ts
    - packages/data/src/inMemoryLocalPersistence.ts
    - packages/data/src/localCatalogRepository.ts
decisions:
  - deleteScanSession placed after deleteDrive in interface and implementations for discoverability
  - Call deleteScanSession after both upsertScan and upsertScanSession to preserve ordering invariant
metrics:
  duration: "~5 minutes"
  completed: "2026-05-02"
---

# Phase 2 Plan 02: Scan Session Pruning Summary

Added deleteScanSession to the persistence layer and wired it in ingestScanSnapshot to prune orphaned staging rows after ingestion.

## Tasks Completed

| Task | Result | Commit |
|------|--------|--------|
| Add deleteScanSession to interface + both implementations | PASS | 70b25cc |
| Wire deleteScanSession in ingestScanSnapshot | PASS | 70b25cc |

## Changes Made

### localPersistence.ts
- Added `deleteScanSession(scanId: string): Promise<void>` to `LocalPersistenceAdapter` interface, after `deleteDrive`

### sqliteLocalPersistence.ts
- Implemented `deleteScanSession` with `withTransaction`: DELETE scan_session_projects first, then scan_sessions (child before parent, no FK constraints)

### inMemoryLocalPersistence.ts
- Implemented `deleteScanSession`: filters `#snapshot.scanSessions` by scanId using spread + filter (immutable pattern)

### localCatalogRepository.ts
- `ingestScanSnapshot`: added `await this.persistence.deleteScanSession(session.scanId)` after upsertScan + upsertScanSession

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED
- deleteScanSession in 5 locations in packages/data/src/ (interface, sqlite, inmemory, repository, test comment)
- tsc --noEmit exits 0 for both data and desktop packages
