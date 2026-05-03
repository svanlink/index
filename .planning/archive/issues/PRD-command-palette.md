---
feature: command-palette
date: 2026-05-03
status: active
issues: [01, 02, 03, 04]
---

# PRD: ⌘K Command Palette

## Problem

Finding footage on the right drive requires navigating to the Projects page, typing in the search bar, and scanning a filtered list. There is no fast path. A filmmaker mid-session who needs to quickly locate the Decathlon shoot from March must stop, navigate, filter, and scroll. The index exists — access to it is slow.

## Solution

A ⌘K command palette that opens from anywhere in the app. Fuzzy search across all projects and drives simultaneously. Default state shows 3 pinned actions and 5 recently visited projects. Selecting a result navigates directly to project detail or drive detail. Escape closes it.

## User Stories

1. As a filmmaker, I press ⌘K from any screen and the palette opens instantly so I don't lose my place navigating menus.
2. As a filmmaker, I type "dec" and immediately see projects matching "Decathlon" with the drive name and date shown, so I know which drive to grab before I open the result.
3. As a filmmaker, I type a drive name and see it in results, so I can jump to the drive detail directly.
4. As a filmmaker, I see my 5 most recently visited projects when I open the palette without typing, so returning to active work is one keystroke.
5. As a filmmaker, I click "Register Drive" in the palette and the register dialog opens, so I can add a new drive without hunting for the button.
6. As a filmmaker, I click "Import Folders" in the palette and the import dialog opens from anywhere.
7. As a filmmaker, I click "Open in Finder" in the palette while a project is in context and the folder opens.
8. As a filmmaker, I press Escape and the palette closes without side effects.
9. As a filmmaker, I search "corrected client name" and it finds projects even if the folder name uses the old convention, because search covers all metadata fields.

## Module Map

**Rust** (`apps/desktop/src-tauri/src/`)
- `db/migrations/` — new migration: `ALTER TABLE projects ADD COLUMN opened_at TEXT`
- `commands/project_commands.rs` (or equivalent) — new command: `update_project_opened_at(project_id: String)`

**React** (`apps/desktop/src/`)
- `app/commandPalette/CommandPaletteContext.tsx` — NEW: context + `useCommandPalette()` hook
- `app/commandPalette/CommandPalette.tsx` — NEW: modal UI, backdrop, result list, action items
- `app/commandPalette/useCommandPaletteSearch.ts` — NEW: fuse.js fuzzy search over projects + drives
- `app/RootLayout.tsx` — MODIFY: add ⌘K keyboard listener, render palette portal
- `app/providers.tsx` — MODIFY: `openedAt` tracking on project navigation

**Tests**
- `apps/desktop/src/app/commandPalette/CommandPalette.test.tsx` — NEW
- `apps/desktop/src/app/commandPalette/useCommandPaletteSearch.test.ts` — NEW

**Dependencies**
- `fuse.js` — add to `apps/desktop/package.json`

## Implementation Decisions

- **Client-side search only** — all data in `CatalogStoreContext`, fuse.js over in-memory arrays. No Rust search command.
- **Portal rendering** — `ReactDOM.createPortal` into `document.body` so palette renders above sidebar vibrancy layer
- **`openedAt` is append-only migration** — `ALTER TABLE projects ADD COLUMN opened_at TEXT` — brownfield safe, existing rows get NULL
- **Fuzzy fields**: `folderName`, `folderPath`, `parsedClient`, `parsedProject`, `correctedClient`, `correctedProject`, `category` for projects; `volumeName`, `displayName` for drives
- **Result display**: project name (folderName or correctedProject), drive displayName, parsedDate or correctedDate
- **Recent projects**: sorted by `openedAt DESC`, top 5, shown only when search query is empty

## Out of Scope

- Keyboard arrow-key navigation through results (mouse/click only)
- Persistent search history across sessions
- Scan history search
- Delete, rename, export actions
- Supabase/sync integration
- Search over notes or free-text metadata

## Definition of Done

- [ ] ⌘K opens palette from any page in the app
- [ ] Escape closes palette
- [ ] Typing "dec" returns fuzzy project matches showing name + drive + date
- [ ] Typing a drive name returns drive results
- [ ] Clicking a project result navigates to project detail page
- [ ] Clicking a drive result navigates to drive detail page
- [ ] Default state (no query) shows 3 actions + up to 5 recent projects
- [ ] Visiting a project detail updates `openedAt` — appears in recent list next time
- [ ] Register Drive action opens existing register dialog
- [ ] Import Folders action opens existing import dialog
- [ ] Open in Finder action opens the project folder (only visible when a project result is highlighted/clicked)
- [ ] `corepack pnpm -r typecheck` passes
- [ ] `corepack pnpm -r test` passes with new tests green
