# Catalog — Design Context (2026-05-03)

## What we know before touching any code

### Current Layout Architecture

`AppShell` (packages/ui/src/AppShell.tsx):
- `SidebarNav` (220px, full height, transparent bg, hairline right border)
- `TopUtilityBar` (56px glass strip, spans content column only, NOT full-width)
- `<main>` — scrollable content

`SidebarNav` has a `h-[52px]` spacer at the top to align drag region with the top bar.
Traffic lights (⬤⬤⬤) are macOS native via `macOSPrivateApi: true` in `tauri.conf.json`.

### The Design Decision Already Made

**Winner layout** (Sesión 1 / design-presentation.html):
- Two columns, no cross-column titlebar
- Sidebar runs full-height with "Catalog" in its own header (Things 3 / Todoist pattern)
- Content toolbar is contextual per section, inside the content column
- Traffic lights live in sidebar top-left corner

**Winner visual system** (mixed from all 3 sessions):
- Light mode tokens: from design-presentation.html (matches globals.css exactly)
- Dark mode tokens: from design-blueprint.html `[data-theme="dark"]`
- Command palette glass: `rgba(36,36,38,.96)` + `blur(40px) saturate(1.8)` (from catalog-story.html)
- Sidebar glass: `blur(24px) saturate(1.8) brightness(1.02)` light / `blur(24px) saturate(1.5) brightness(0.98)` dark (from blueprint)
- Sheet spring: `cubic-bezier(0.34, 1.56, 0.64, 1)` at 220ms (already in globals.css)
- Pulse ring: 3 staggered rings with `animation-delay: 0.8s/1.6s` (already in globals.css)

### The CSS Migration Problem

Three styling systems in conflict:
1. Tailwind utilities (389 occurrences, 15 files)
2. CSS custom properties via globals.css (solid, stay)
3. Inline `style={{}}` (many are only there because Tailwind can't use CSS vars)

Migration plan: CSS-001 in `.planning/issues/CSS-001-tailwind-to-vanilla.md`

Order: pagePrimitives.tsx (62) → ProjectDetailPage.tsx (65) → DriveDetailPage.tsx (49) → ProjectsPage.tsx (42) → rest

### Token System (globals.css) — Already Correct

Light: `--canvas: #f2f2f7`, `--surface: #fff`, `--ink: #1d1d1f`, `--action: #007AFF`
Dark: `--canvas: #1c1c1e`, `--surface: #2a2a2c`, `--ink: #f5f5f7`
Drive palette: `--drive-a` through `--drive-f` (desaturated cool tones)
Animations: `.sheet`, `.pulse-ring`, `.pulse-ring-2/3`, `.table-head-glass` all defined

### Key Files

| File | Role |
|------|------|
| `apps/desktop/src/styles/globals.css` | Token system + CSS classes |
| `packages/ui/src/AppShell.tsx` | Root chrome layout |
| `packages/ui/src/SidebarNav.tsx` | Left sidebar |
| `packages/ui/src/TopUtilityBar.tsx` | Top bar |
| `apps/desktop/src/pages/pagePrimitives.tsx` | Shared components |
| `apps/desktop/design-presentation.html` | Sesión 1 — layout winner |
| `apps/desktop/catalog-story.html` | Sesión 2 — dark mode + animations |
| `.planning/design-blueprint.html` | Sesión 3 — full light+dark blueprint |

### What the Design Implementation Requires

1. **Tailwind removal** (CSS-001) — prerequisite for everything else
2. **Layout change**: Remove TopUtilityBar as a separate component. Sidebar gets its own header with traffic light spacing. Content area gets contextual toolbar per page.
3. **Glass materials**: Apply `backdrop-filter` to sidebar and content toolbar.
4. **Dark mode**: Token system already supports it. Just needs `[data-theme="dark"]` applied.

### Real Data Used in Presentations

Projects: Decathlon Switzerland, IWC Schaffhausen, Vacheron Constantin, Piaget, Insomnia, Rolex Testimonee
Drives (Alpine footage): RED KOMODO, ARCHIVE 2024, ARCHIVE 2023, BMPCC_01–06
Locations: Gstaad, Verbier, Zermatt, Chamonix, Saas-Fee
