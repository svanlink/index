# Roadmap: Catalog v2

**Created:** 2026-05-03
**Source:** sebastian-main-design-20260503.md (APPROVED WITH FIXES — autoplan 2026-05-03)
**Granularity:** coarse (3 phases)
**Mode:** yolo
**Total v2 requirements:** 13
**Coverage:** 13/13 mapped

## Core Value (v2)

Make the catalog the single source of truth for your footage inventory — without needing a drive plugged in.

## Phases

- [ ] **Phase 1: Data & Rust Layer** — Migration 14, project_metadata CRUD, FK pragma, Rust commands for upsert + manifest generation, CODE-V2-02 verify
- [ ] **Phase 2: Tags UI** — Metadata form extension (format + status rows), tag chips on project list, three chip filter dropdowns, tags-survive-rescan guard
- [ ] **Phase 3: Manifest Export + Polish** — Export manifest button + save panel, spinner/error/Finder reveal, manifest format edge cases, MAC-V2-02 vibrancy

---

## Phase Details

### Phase 1: Data & Rust Layer

**Goal**: All new persistence and Rust commands are in place — Migration 14 runs safely on v1 DBs, FK pragma confirmed, format/status upsert wired, manifest Rust command generates correct output.

**Depends on**: Nothing (foundation phase)

**Requirements**: TAG-01, TAG-02, MFST-01, CODE-V2-02

**Success Criteria** (what must be TRUE):
1. Running Migration 14 on an existing v1 SQLite DB creates `project_metadata` with `ON DELETE CASCADE`; re-running the migration is a no-op (`IF NOT EXISTS`); deleting a project cascades to its metadata row (`PRAGMA foreign_keys=ON` already set at connection init ✅)
2. `updateProjectMetadata` IPC accepts `format` and `status` fields and upserts into `project_metadata` atomically; `correctedClient` remains in `projects` table unchanged
3. Calling `export_drive_manifest` with a valid `drive_id` returns a Markdown string with correct project list, paths, sizes, and any format/status/client tags; null `folderPath` renders `(no path recorded)`; missing projects annotated `⚠️ missing`
4. `Format` and `ProjectStatus` string-union types defined in `packages/domain`; `UpdateProjectMetadataInput` in `packages/data` includes `format` and `status` fields
5. CODE-V2-02 verified: `prune_stale_sessions(5min TTL)` present in `scan_engine.rs` — no new code needed ✅

**Plans**: TBD
**Files involved** (known):
- `packages/data/src/migrations/014_project_metadata.sql` (new)
- `packages/data/src/sqliteLocalPersistence.ts` — FK pragma confirm, upsert method
- `packages/data/src/repository.ts` — extend `UpdateProjectMetadataInput`
- `packages/domain/src/project.ts` — `Format` and `ProjectStatus` enums
- `apps/desktop/src-tauri/src/lib.rs` — register `export_drive_manifest` command
- `apps/desktop/src-tauri/src/manifest.rs` (new) — manifest generation logic
- `apps/desktop/src/app/providers.tsx` — wire format/status through IPC

---

### Phase 2: Tags UI

**Goal**: Users can tag any project with Format and Status via the metadata form; chips appear on list rows; three chip dropdowns filter the list instantly; tags survive a rescan.

**Depends on**: Phase 1 (data layer must exist)

**Requirements**: TAG-03, TAG-04, TAG-05, TAG-06

**Success Criteria** (what must be TRUE):
1. ProjectDetailPage metadata form shows Format and Status rows below the existing Category/FolderType rows; selecting a value auto-saves silently; changing and reverting triggers optimistic rollback if IPC fails
2. ProjectsPage list rows show `[RED]`, `[delivered]`-style chips for tagged projects; untagged rows have no chip and no visual gap where chips would appear
3. Three chip dropdowns (Client ▾ / Format ▾ / Status ▾) render below the search field; typing in search narrows by project name independently; selecting a chip filters instantly via `useMemo`; AND logic — three chips narrow together; clearing all chips restores full list
4. After a drive rescan, existing `project_metadata` rows are intact — `scanIngestionService` does not truncate or overwrite the `project_metadata` table

**Plans**: TBD
**Files involved** (known):
- `apps/desktop/src/pages/ProjectDetailPage.tsx` — extend metadata form
- `apps/desktop/src/pages/ProjectsPage.tsx` — add chips to rows, add chip dropdowns
- `apps/desktop/src/app/providers.tsx` — expose format/status in store
- `packages/data/src/scanIngestionService.ts` — confirm no metadata truncation
- `packages/domain/src/project.ts` — `Project` type extended with optional format/status

---

### Phase 3: Manifest Export + Polish

**Goal**: "Export manifest" button on DriveDetailPage generates a `.md` file via native save panel; Finder reveals the result; edge cases (empty drive, missing project, no tags) handled; MAC-V2-02 vibrancy applied to content area.

**Depends on**: Phase 1 (manifest Rust command), Phase 2 (tags available for export)

**Requirements**: MFST-02, MFST-03, MFST-04, MFST-05, MAC-V2-02

**Success Criteria** (what must be TRUE):
1. `DriveDetailPage` toolbar shows `[ Scan ] [ Import ] [ Export manifest ]`; clicking Export manifest opens a native macOS save panel with default filename `{DRIVE-NAME}-manifest-{YYYYMMDD}-{HHMMSS}.md`
2. While the manifest is being written, the Export manifest button shows a spinner and is disabled; on success the button returns to normal and Finder reveals the saved file (no toast); on failure an inline error appears in the toolbar (no toast)
3. Manifest `.md` output: correct header, per-project entries with path/size/date/tags as applicable; null path renders `(no path recorded)`; missing projects annotated `⚠️ missing`; projects with no tags omit the Tags line; drive with 0 projects exports header-only manifest without error
4. Export works when drive is NOT mounted — all data comes from catalog index
5. Main content area shows vibrancy effect on macOS when `window-vibrancy` Sidebar or HudWindow material can be applied without visual regressions; degrades gracefully on older macOS

**Plans**: TBD
**Files involved** (known):
- `apps/desktop/src/pages/DriveDetailPage.tsx` — Export manifest button, spinner, inline error
- `apps/desktop/src-tauri/src/lib.rs` — wire save-panel + write + reveal sequence
- `apps/desktop/src-tauri/capabilities/default.json` — add `"dialog:allow-save"` (currently missing)
- `apps/desktop/src/app/appShell/AppShell.tsx` or similar — vibrancy tokens

---

## Progress

| Phase | Status | Requirements | Plans |
|-------|--------|--------------|-------|
| 1. Data & Rust Layer | Pending | TAG-01, TAG-02, MFST-01, CODE-V2-02 | TBD |
| 2. Tags UI | Pending | TAG-03, TAG-04, TAG-05, TAG-06 | TBD |
| 3. Manifest Export + Polish | Pending | MFST-02, MFST-03, MFST-04, MFST-05, MAC-V2-02 | TBD |

## Coverage Validation

| Phase | Requirements | Count |
|-------|--------------|-------|
| 1 | TAG-01, TAG-02, MFST-01, CODE-V2-02 | 4 |
| 2 | TAG-03, TAG-04, TAG-05, TAG-06 | 4 |
| 3 | MFST-02, MFST-03, MFST-04, MFST-05, MAC-V2-02 | 5 |
| **Total** | | **13/13** |

No orphans. No duplicates. 100% coverage.

## Design Decisions (locked)

| Decision | Resolution |
|----------|-----------|
| `project_metadata.client` vs `correctedClient` | Use `correctedClient` — no client field in new table |
| Filter UX | Three chip dropdowns: Client ▾ / Format ▾ / Status ▾ |
| Manifest file format | `.md` (Obsidian/editor-readable) |
| Export location | Native save panel via `tauri-plugin-dialog` |
| Manifest filename collision | Include HHMMSS in default filename |
| CODE-V2-01 pagePrimitives split | Already done in ea0e19b — skip |
| Manifest null folderPath | Print `(no path recorded)` |
| Manifest file write | Rust `std::fs::write` — no `tauri-plugin-fs` needed |

## Pre-Phase Findings (resolved before planning)

1. `PRAGMA foreign_keys=ON` ✅ — already set in `sqliteLocalPersistence.ts:#ensureReady()` (line 1088). Migration 14 CASCADE fires automatically. No changes needed.
2. `dialog:allow-save` ⚠️ — **MISSING** from `capabilities/default.json`. Phase 3 must add `"dialog:allow-save"`. Current file has only `"dialog:allow-open"`. Rust flow: `tauri_plugin_dialog` opens save panel, returns path, then `std::fs::write` to that path.
3. CODE-V2-02 ✅ — confirmed complete. `AppScanState::prune_stale_sessions(Duration::from_secs(5 * 60))` exists in `scan_engine.rs:207`. Phase 1 just verifies; no new implementation needed.

---
*Roadmap created: 2026-05-03*
*Source: sebastian-main-design-20260503.md (office-hours + autoplan approved)*
*Next: /gsd-plan-phase 1*
