---
id: 02
title: Typing in palette fuzzy-searches projects, shows name + drive + date
type: AFK
status: done
blocked_by: [01]
blocks: [03]
estimate: M
---

## Goal

Type in the palette search input — projects matching the query appear as results showing project name, drive name, and date. Clicking a result navigates to the project detail page and closes the palette.

## Why this slice first (after 01)

Core search value. Once projects appear in results the palette is immediately useful. Drives and recent history build on this foundation.

## Layers

- **Rust** (`src-tauri/`): none
- **React** (`apps/desktop/src/`):
  - NEW `app/commandPalette/useCommandPaletteSearch.ts` — fuse.js fuzzy search hook
    - Input: `projects: Project[]`, `drives: Drive[]`, `query: string`
    - Fuse.js fields for projects: `folderName`, `folderPath`, `parsedClient`, `parsedProject`, `correctedClient`, `correctedProject`, `category`
    - Returns: `{ projectResults: Project[], driveResults: Drive[] }` (drives section empty for now — added in issue 03)
  - MODIFY `app/commandPalette/CommandPalette.tsx` — wire search input to hook, render project result rows
    - Each project row: project name (prefer `correctedProject ?? parsedProject ?? folderName`), drive `displayName` (lookup from drives by `currentDriveId`), date (prefer `correctedDate ?? parsedDate`)
    - Click → `navigate('/projects/' + project.id)` + `close()`
    - Show "No results" empty state when query has results but nothing matches
    - Section header "Projects" above results
  - Install `fuse.js` in `apps/desktop/package.json`
- **Test** (`apps/desktop/src/app/commandPalette/useCommandPaletteSearch.test.ts`):
  - empty query → empty results
  - "dec" matches project with folderName "2026-03_Decathlon - Shoot"
  - "dcth" fuzzy-matches "Decathlon" (tests fuse.js threshold)
  - correctedClient field is searched (metadata coverage)
  - result includes correct drive displayName

## Implementation notes

- Install fuse.js: `corepack pnpm --filter @drive-project-catalog/desktop add fuse.js`
- Fuse.js config: `threshold: 0.4`, `minMatchCharLength: 2`, `keys` weighted — `correctedProject` and `parsedProject` highest weight, `folderName` medium, `folderPath` lower
- Get `projects` and `drives` from `useCatalogStore()` inside `CommandPalette.tsx`
- Drive lookup: `drives.find(d => d.id === project.currentDriveId)?.displayName ?? 'Unassigned'`
- Only show project results section when `query.length >= 2` — below that, show default state (actions + recent)
- No result limit for now — fuse.js naturally ranks by score, show top 8 max
- Follow existing Tailwind class patterns from `ProjectsPage.tsx` for result rows

## Definition of done

- [ ] Typing "dec" in the palette returns projects with "Decathlon" in any metadata field
- [ ] Each project result shows: name, drive name, date
- [ ] Clicking a project result closes the palette and navigates to `/projects/[id]`
- [ ] "No results" state shown when query matches nothing
- [ ] Section header "Projects" visible above results
- [ ] `corepack pnpm -r typecheck` passes
- [ ] `corepack pnpm -r test` passes with new search hook tests green

## Out of scope

- Drive search results (issue 03)
- Recent projects in default state (issue 04)
- Keyboard arrow navigation
