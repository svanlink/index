---
id: 03
title: Drive results in search + actions wired to existing dialogs
type: AFK
status: done
blocked_by: [02]
blocks: []
estimate: S
---

## Goal

Two things in one slice: (1) drive results appear below project results when you search, and (2) the 3 pinned action items actually open their dialogs. Palette is now feature-complete except for recent projects.

## Why this slice

Drives + actions are both small additions onto the working scaffold. Combining them keeps the issue count low and both can be verified in one QA pass.

## Layers

- **Rust** (`src-tauri/`): none
- **React** (`apps/desktop/src/`):
  - MODIFY `app/commandPalette/useCommandPaletteSearch.ts` — add drives to fuse.js search
    - Fuse.js fields for drives: `volumeName`, `displayName`
    - Return `driveResults: Drive[]` populated
  - MODIFY `app/commandPalette/CommandPalette.tsx`:
    - Render "Drives" section below "Projects" section when `driveResults.length > 0`
    - Drive row: `displayName`, project count (`projects.filter(p => p.currentDriveId === drive.id).length` + " projects")
    - Click drive → `navigate('/drives/' + drive.id)` + `close()`
    - Wire "Register Drive" action → open existing register drive dialog (find how it's currently triggered in `DrivesPage.tsx` and replicate)
    - Wire "Import Folders" action → open existing import dialog (same pattern)
    - Wire "Open in Finder" action → call existing `openInFinder` Tauri command with current project path if available; hide action if no project context
- **Test** (MODIFY `CommandPalette.test.tsx`):
  - drive name search returns drive results
  - clicking drive result closes palette
  - "Register Drive" action click triggers dialog open

## Implementation notes

- Check how `DrivesPage.tsx` currently opens the register/import dialogs — look for `useState` dialog open flags or router-based modals. Replicate the same mechanism from the palette.
- For "Open in Finder" — the action is context-sensitive. Only show it in results when a project row was just clicked or when on a project detail page. Simplest approach: hide it from pinned actions by default; show it on each project result row as a secondary icon button instead. Discuss with Sebastian if this changes the scope.
- Drive result: show `displayName` as primary, project count as secondary text
- Max 5 drive results shown

## Definition of done

- [ ] Searching a drive name returns drive results with displayName + project count
- [ ] Clicking a drive result closes palette and navigates to `/drives/[id]`
- [ ] "Register Drive" action opens the register drive dialog
- [ ] "Import Folders" action opens the import dialog
- [ ] "Open in Finder" is visible and functional on project result rows (or confirm placement decision)
- [ ] `corepack pnpm -r typecheck` passes
- [ ] `corepack pnpm -r test` passes

## Out of scope

- Recent projects in default state (issue 04)
- Keyboard navigation
