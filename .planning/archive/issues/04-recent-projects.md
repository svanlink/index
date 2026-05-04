---
id: 04
title: Recent projects in default palette state (openedAt tracking)
type: AFK
status: done
blocked_by: [01]
blocks: []
estimate: M
---

## Goal

Palette default state (no query typed) shows 5 most recently visited projects. Visiting a project detail page writes `openedAt` so the list stays fresh.

## Why this slice

Completes the PRD. The palette is useful without typing the moment you open it — your active work is one keystroke away.

## Layers

- **Rust** (`src-tauri/`):
  - NEW migration: `ALTER TABLE projects ADD COLUMN opened_at TEXT` — append-only, brownfield safe, existing rows get NULL
  - NEW Tauri command `update_project_opened_at(project_id: String)` in `commands/project_commands.rs` (or equivalent) — writes current UTC ISO-8601 timestamp to `opened_at` for the given project
- **React** (`apps/desktop/src/`):
  - MODIFY `app/providers.tsx` (or wherever project detail navigation is handled) — call `invoke('update_project_opened_at', { projectId })` when user navigates to a project detail page; use `useEffect` watching the route param
  - MODIFY `app/commandPalette/CommandPalette.tsx` — in default state (query length < 2), render "Recent" section with up to 5 projects sorted by `openedAt DESC` (filter out nulls); show same row format as search results (name, drive, date)
  - MODIFY `useCatalogStore()` or equivalent — ensure `openedAt` field is loaded from SQLite and available on `Project` type
- **Test** (`apps/desktop/src/app/commandPalette/CommandPalette.test.tsx`):
  - opening palette with no query shows recent section (mock projects with openedAt set)
  - projects sorted by openedAt DESC — most recent first
  - projects with null openedAt are excluded from recent list
  - recent section hidden when query.length >= 2

## Implementation notes

- Migration filename: follow existing pattern in `src-tauri/migrations/` — e.g. `YYYYMMDD_add_opened_at.sql`
- Tauri command: use `chrono::Utc::now().to_rfc3339()` for the timestamp string
- On the React side: load `opened_at` field via whatever store refresh mechanism already exists (likely after `load_catalog` or `scan_drive` commands)
- Sort client-side: `[...projects].filter(p => p.openedAt).sort((a, b) => b.openedAt!.localeCompare(a.openedAt!)).slice(0, 5)`
- Do NOT call `update_project_opened_at` on search result clicks — only on actual project detail page render
- If `Project` TypeScript type doesn't have `openedAt`, add it as `openedAt?: string | null`

## Definition of done

- [ ] `ALTER TABLE projects ADD COLUMN opened_at TEXT` migration runs cleanly on existing DB
- [ ] Navigating to a project detail page writes `openedAt` (verify in SQLite directly or via test)
- [ ] Opening palette with no query shows "Recent" section with up to 5 projects, most recent first
- [ ] Projects with no `openedAt` do not appear in recent list
- [ ] Recent section disappears when user starts typing (query >= 2 chars)
- [ ] `corepack pnpm -r typecheck` passes
- [ ] `corepack pnpm -r test` passes

## Out of scope

- Persistent search history across sessions
- More than 5 recent projects
- Keyboard navigation
