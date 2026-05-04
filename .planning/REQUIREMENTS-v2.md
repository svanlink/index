# Requirements: Catalog v2

**Defined:** 2026-05-03
**Source of truth:** ~/.gstack/projects/svanlink-index/sebastian-main-design-20260503.md
**Design reviewed:** autoplan 2026-05-03 — APPROVED WITH FIXES

## Core Value (v2 addition)

**Make the catalog the single source of truth for your footage inventory — without needing a drive plugged in.**

## Feature Requirements

### Project Tagging System

- **TAG-01**: Migration 14 creates `project_metadata` table (format + status only, not client) with `ON DELETE CASCADE` on `project_id`; `PRAGMA foreign_keys=ON` confirmed per connection in `sqliteLocalPersistence.ts`; migration is append-only and safe on existing v1 DBs
- **TAG-02**: `UpdateProjectMetadataInput` extended with `format: Format | null` and `status: ProjectStatus | null`; new `upsert_project_format_status(project_id, format, status)` Tauri command for direct metadata write; `Format` and `ProjectStatus` enums defined in `packages/domain`
- **TAG-03**: Format and Status rows added to the existing metadata form on `ProjectDetailPage` (no second Metadata section); auto-save on change (silent); optimistic update with rollback on IPC failure
- **TAG-04**: Tag chips (Format + Status) visible on project list rows in `ProjectsPage`; untagged rows render no chip and no empty gap; chips are small, muted, right-aligned
- **TAG-05**: Three chip dropdowns (Client ▾ / Format ▾ / Status ▾) on `ProjectsPage`; client dropdown autocompletes from existing `correctedClient` values; instant client-side filter via `useMemo`; AND logic across all three; clearing any chip restores that dimension
- **TAG-06**: Tags survive rescan — `scanIngestionService` does not clear `project_metadata` rows; metadata persists across drive re-scans

### Drive Manifest Export

- **MFST-01**: `export_drive_manifest(drive_id)` Rust command queries `projects` + `project_metadata` JOIN by `current_drive_id`, formats as UTF-8 `.md`, writes via `std::fs::write`, returns saved path; drive does NOT need to be mounted
- **MFST-02**: "Export manifest" button in `DriveDetailPage` toolbar; on click opens native macOS save panel via `tauri-plugin-dialog`; default filename includes drive name + HHMMSS to avoid silent overwrite (e.g. `ARCHIVE-2024-manifest-20260503-203000.md`)
- **MFST-03**: While writing: button shows spinner (disabled); on success: Finder reveals saved file via `opener:allow-reveal-item-in-dir` (no toast); on failure: inline error in toolbar (no toast)
- **MFST-04**: Manifest includes Format, Status, and Client (from `correctedClient`) when set; omits Tags line if no tags; null `folderPath` renders `Path: (no path recorded)`; projects with `missingStatus = "missing"` annotated with `⚠️ missing`
- **MFST-05**: Drive with 0 projects exports an empty manifest (header only, no crash); drive not connected still works (all data from catalog index)

### Code Health

- **CODE-V2-02**: AppScanState TTL eviction verified complete in `ea0e19b` — confirm sessions map is pruned and no memory leak; no new implementation needed if already done
- **MAC-V2-02**: Vibrancy applied to main content area (not just sidebar) when macOS supports it cleanly — uses existing `window-vibrancy` crate, Sidebar or HudWindow material

## Acceptance Criteria (v2 complete when all TRUE)

1. Any project can have Format and Status tags — tags survive rescan, appear as chips on list rows, filter the project list instantly
2. Three chip dropdowns (Client ▾ / Format ▾ / Status ▾) on ProjectsPage filter the list instantly client-side with no round-trip
3. Clicking "Export manifest" on DriveDetailPage opens a native save panel, writes a `.md` file, and reveals it in Finder — drive does NOT need to be mounted
4. Manifest includes Format/Status tags and correctedClient if set; handles null folderPath gracefully; annotates missing projects with ⚠️
5. `PRAGMA foreign_keys=ON` confirmed per connection — CASCADE delete on `project_metadata` works
6. Migration 14 is append-only and safe on an existing v1 DB (no data loss, no crash)
7. No regressions: existing tests pass, typecheck clean, build passes

## Out of Scope (v2)

| Feature | Reason |
|---------|--------|
| Footage metadata (codec, resolution, duration) | Requires ffprobe — heavyweight, different infrastructure |
| Supabase remote sync | Not a pain point at current scale |
| Rename Review flow | Complex UX, not a daily-driver need |
| Thumbnail / first-frame preview | No signal needed yet |
| Notes / freeform text per project | Tags cover the structured use case |
| PDF/HTML manifest export | Markdown is editor/Obsidian-readable — sufficient |
| Free-text tag taxonomies | Too loose to be useful at filter time |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TAG-01 | Phase 1 | Pending |
| TAG-02 | Phase 1 | Pending |
| MFST-01 | Phase 1 | Pending |
| CODE-V2-02 | Phase 1 | Pending |
| TAG-03 | Phase 2 | Pending |
| TAG-04 | Phase 2 | Pending |
| TAG-05 | Phase 2 | Pending |
| TAG-06 | Phase 2 | Pending |
| MFST-02 | Phase 3 | Pending |
| MFST-03 | Phase 3 | Pending |
| MFST-04 | Phase 3 | Pending |
| MFST-05 | Phase 3 | Pending |
| MAC-V2-02 | Phase 3 | Pending |

**Coverage:** 13 v2 requirements, 3 phases, 0 unmapped ✓

---
*Requirements defined: 2026-05-03*
