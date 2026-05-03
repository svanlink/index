---
id: 01
title: ⌘K opens palette with 3 pinned actions, Escape closes it
type: AFK
status: done
blocked_by: []
blocks: [02, 03, 04]
estimate: M
---

## Goal

Press ⌘K from any page — a centered modal opens with 3 pinned action items (Register Drive, Import Folders, Open in Finder). Press Escape — it closes. Nothing else yet.

## Why this slice first

Proves the full scaffold works: CommandPaletteContext, portal rendering above the sidebar vibrancy layer, global keyboard listener in RootLayout, and the modal UI shell. Every other slice builds on this.

## Layers

- **Rust** (`src-tauri/`): none
- **React** (`apps/desktop/src/`):
  - NEW `app/commandPalette/CommandPaletteContext.tsx` — `CommandPaletteProvider`, `useCommandPalette()` hook with `open()` / `close()` / `isOpen`
  - NEW `app/commandPalette/CommandPalette.tsx` — modal shell: backdrop blur, centered card (~600px wide, top ~30%), empty search input, 3 action rows (icons + labels), Escape handler
  - MODIFY `app/RootLayout.tsx` — wrap with `CommandPaletteProvider`, attach `⌘K` keydown listener (`metaKey + k`), render `<CommandPalette />` via `ReactDOM.createPortal` into `document.body`
- **Test** (`apps/desktop/src/app/commandPalette/CommandPalette.test.tsx`):
  - renders closed by default
  - ⌘K keydown opens it
  - Escape closes it
  - 3 action items visible when open

## Implementation notes

- Use `document.addEventListener('keydown', handler)` in RootLayout useEffect — clean up on unmount
- Check `e.metaKey && e.key === 'k'` — call `e.preventDefault()` to stop browser default
- Portal: `ReactDOM.createPortal(<CommandPalette />, document.body)`
- Backdrop: fixed inset-0, `bg-black/40 backdrop-blur-sm`, z-index above sidebar (use Tailwind `z-50`)
- Modal card: `bg-[var(--color-surface)]` or equivalent, rounded-xl, shadow-2xl
- Action items: each has an icon (SF Symbol equivalent or Lucide), label, and `onClick` handler — wire to existing dialog openers later (stubs for now, just `console.warn` or TODO)
- Follow existing Tailwind + design token patterns from `DrivesPage.tsx` and `RootLayout.tsx`
- `useCommandPalette()` must throw if used outside provider

## Definition of done

- [ ] ⌘K opens the palette from ProjectsPage, DrivesPage, DriveDetailPage, and ProjectDetailPage
- [ ] Escape closes it
- [ ] 3 action rows visible: "Register Drive", "Import Folders", "Open in Finder"
- [ ] Backdrop blur renders behind the modal
- [ ] Modal is centered horizontally, positioned ~30% from top
- [ ] No TypeScript errors: `corepack pnpm -r typecheck` passes
- [ ] Tests pass: `corepack pnpm -r test` passes

## Out of scope

- Search input does not filter anything yet (just a visual input, no fuse.js)
- Actions do not open dialogs yet (stubs only)
- No recent projects in default state yet
- No result list
