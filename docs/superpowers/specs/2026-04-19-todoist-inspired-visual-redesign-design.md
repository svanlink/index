# Todoist-Inspired Visual Redesign

Date: 2026-04-19
Status: Approved for spec writing, pending user review before implementation
Scope: Desktop app visual redesign only

## Summary

Redesign the desktop app so it feels closer to a focused productivity tool like Todoist while preserving the current information architecture, routes, workflows, and data model.

The redesign should make the app feel calmer, lighter, and faster to scan. The current `Projects`, `Drives`, `Scan`, and `Settings` surfaces remain intact. This is not a navigation or feature redesign. It is a coordinated visual-system refresh across the full desktop app, optimized for light mode and kept functionally aligned in dark mode.

## Goals

1. Make the app feel less like a compact admin dashboard and more like a clear, desktop-native organizer.
2. Introduce a Todoist-inspired visual language without producing a literal copy.
3. Improve scan speed by emphasizing names, status, and primary actions over card chrome and decorative structure.
4. Keep dense operational surfaces understandable by flattening selectively rather than uniformly.
5. Apply the redesign consistently across shared shell components and all existing screens.

## Non-Goals

1. Do not change routes, screen hierarchy, or the `Projects` / `Drives` / `Scan` / `Settings` model.
2. Do not remove or redesign core workflows such as scanning, importing, metadata editing, move planning, or sync behavior.
3. Do not introduce new pages, new filters, or Todoist-like behavioral metaphors such as `Inbox`, `Today`, or task nesting.
4. Do not spend equal polish budget on dark mode; keep it coherent and usable, but optimize the redesign for light mode first.

## Design Direction

The redesign follows a "balanced productivity" direction:

- Adopt Todoist-like calm, warmth, density, and hierarchy.
- Keep the app's operational structure intact.
- Prefer list-first presentation on index pages.
- Preserve selective grouping on dense detail pages where the grouped structure genuinely helps comprehension.

The target feeling is warm neutrals, soft dividers, one strong accent, and very clear visual prioritization between primary content and metadata.

## Visual System

### Core Feel

- Warm off-white sidebar, white main content surface.
- Tomato-red accent for primary actions, selected states, and focused highlights.
- Light gray separators instead of prominent panel borders.
- Reduced shadowing and less contrast between stacked surfaces.
- Stronger distinction between primary content and muted metadata.

### Color

Light mode should shift from graphite-led emphasis to warm neutrals plus a single confident red accent.

Expected token direction:

- Sidebar background: soft ivory or warm gray.
- Main surface: white.
- Inset surfaces: very pale warm gray.
- Hairlines: low-contrast, slightly warm grays.
- Accent: Todoist-adjacent tomato red, adapted slightly to avoid a literal clone.
- Status colors: preserve success, warning, info, and danger semantics, but soften fills and reduce saturation of supporting backgrounds.

Dark mode should inherit the same hierarchy but remain secondary in polish. It should feel related to the new system rather than independently art-directed.

### Typography

- Larger, cleaner page titles.
- More restrained supporting metadata.
- Better contrast between names, secondary context, and utility labels.
- Keep the app readable and desktop-native; avoid decorative type or over-branded styling.

### Density and Spacing

- Tighten row height and list rhythm.
- Reduce oversized card padding.
- Standardize spacing across headers, tabs, filters, rows, and grouped forms.
- Preserve breathing room around page titles and major section changes.

### Surfaces

- Default to flat or near-flat surfaces.
- Use cards sparingly and intentionally.
- Replace heavy card framing with separators and subtle inset grouping where possible.
- Keep grouped panels where they support scan workflows, capacity summaries, or dense forms.

### Controls

- Primary buttons become red and more visually assertive.
- Secondary buttons become quieter and flatter.
- Inputs become lighter and more integrated into the layout.
- Tabs and status filters become cleaner and more list-oriented.
- Badges and notices become simpler, with less visual weight.

## Shell and Navigation

The shell architecture stays unchanged, but its styling shifts materially.

### Sidebar

- Keep the current nav model and ordering.
- Reduce the feeling of a heavy rail.
- Use a calmer active state with soft tinted background instead of dark emphasis.
- Quiet the count treatments so they support rather than dominate.
- Make the sidebar search feel integrated into the rail rather than detached from it.

### Top Bar

- Keep the top drag-region structure.
- Reduce visual prominence.
- Let page-level titles and page content lead the experience.
- Keep window controls and title present but less attention-grabbing.

### App Shell Container

- Slightly retune sidebar width, content max-width, and page padding to support the lighter density model.
- Preserve desktop-native behavior and no-bounce shell interactions.

## Screen-by-Screen Redesign

### Projects Page

This page should become the clearest expression of the redesign.

- Simplify the page header and reduce dashboard styling.
- Make status tabs feel like fast, readable filters.
- Flatten list presentation so project rows feel crisp and sortable by eye.
- Emphasize project name, current status, and drive relationship before supporting metadata.
- Reduce boxiness in filter controls and result containers.

### Drives Page

- Keep storage intelligence and operational actions exactly as they are.
- Reduce the dashboard feeling by softening card frames and making summaries easier to skim.
- Present capacity, health, and reserved space with cleaner sublines and lighter visual grouping.
- Keep import and create actions visible without overpowering the page.

### Project Detail Page

- Preserve edit, move, and delete flows.
- Make metadata forms cleaner and more restrained.
- Reduce competition between primary actions and secondary controls.
- Present status and history information in quieter grouped sections.

### Drive Detail Page

- Preserve scan and import flows in full.
- Make the scan workflow the clearest action zone on the page.
- Reduce visual weight on surrounding sections so operational priority is obvious.
- Keep project, capacity, and status information readable without turning the page back into a dashboard.

### Settings Page

- Keep the single-responsibility sync surface.
- Style it as a quiet operations page with one clear primary action.
- Reduce visual competition between metrics and feedback notices.

## Shared Component Pass

The redesign must be driven through shared components first so the app changes coherently.

Primary targets:

- `apps/desktop/src/styles/globals.css`
- `packages/ui/src/SidebarNav.tsx`
- `packages/ui/src/TopUtilityBar.tsx`
- `packages/ui/src/AppShell.tsx`
- `apps/desktop/src/pages/pagePrimitives.tsx`

This pass should update:

- color tokens
- typography primitives
- button styles
- field styles
- chips and badges
- notice styling
- section card styling
- tabs and filters
- row separators
- progress and capacity treatments
- shell spacing and visual density

## Page-Level Pass

After shared primitives are retuned, apply targeted layout updates in:

- `apps/desktop/src/pages/ProjectsPage.tsx`
- `apps/desktop/src/pages/DrivesPage.tsx`
- `apps/desktop/src/pages/ProjectDetailPage.tsx`
- `apps/desktop/src/pages/DriveDetailPage.tsx`
- `apps/desktop/src/pages/SettingsPage.tsx`

This pass should avoid logic changes. The emphasis is presentational:

- rearranging spacing
- changing container styles
- flattening list treatments
- simplifying headers
- rebalancing grouped sections

## Implementation Constraints

1. Do not change application behavior while redesigning.
2. Do not rename routes or nav labels.
3. Do not degrade clarity on dense operational pages by flattening everything uniformly.
4. Keep light mode as the main polish target.
5. Keep dark mode coherent enough that the UI still feels intentionally designed.

## Risks and Mitigations

### Risk: Flattening dense pages too aggressively

Dense operational pages currently rely on cards to organize information. If they are flattened too far, the interface may become harder to parse.

Mitigation:

- Use selective grouping on detail pages.
- Let index pages carry the strongest list-first treatment.
- Keep scan, sync, and move-planning sections visually bounded when needed.

### Risk: Half-redesigned feel across screens

If only colors change but layout density and shared primitives do not, the app will feel inconsistent.

Mitigation:

- Start with shared tokens and shell.
- Then update all user-facing pages in the same pass.

### Risk: Losing product identity by copying too literally

Mitigation:

- Use Todoist as a visual reference for calm hierarchy and density.
- Adapt the system to this product's own operational needs instead of reproducing specific branded patterns one-for-one.

## Verification

After implementation:

1. Run the desktop test suite.
2. Run the frontend build and typecheck path.
3. Review light mode for consistency across shell, list pages, detail pages, and settings.
4. Review dark mode for functional alignment and visual coherence.
5. Confirm no workflows or information architecture changed.

## Acceptance Criteria

The redesign is successful when:

1. The app clearly feels more like a focused productivity desktop app than an admin dashboard.
2. `Projects` and `Drives` feel flatter, faster, and easier to scan.
3. Primary actions and selected states use a clear red-accent hierarchy.
4. Dense detail pages remain understandable and operationally safe.
5. The full app feels visually unified rather than partially recolored.

## Proposed Implementation Sequence

1. Retune global tokens, typography, base surfaces, buttons, fields, and shared shell components.
2. Redesign the Projects and Drives index surfaces to establish the new density and list treatment.
3. Apply the same system to Project Detail, Drive Detail, and Settings.
4. Run verification and correct any regressions or mismatched components.
