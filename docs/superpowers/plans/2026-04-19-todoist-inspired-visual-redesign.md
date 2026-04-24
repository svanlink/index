# Todoist-Inspired Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the desktop app's visuals into a Todoist-inspired, light-mode-first productivity interface without changing routes, workflows, or data behavior.

**Architecture:** Drive the redesign from shared tokens and shell components first so every page inherits the new visual language. Then apply targeted presentational updates to list pages and detail pages, preserving grouped operational sections only where density requires them.

**Tech Stack:** React 19, React Router 7, Tailwind utilities, CSS custom properties, Vitest, TypeScript

---

### Task 1: Save the approved redesign plan in the repo

**Files:**
- Create: `docs/superpowers/plans/2026-04-19-todoist-inspired-visual-redesign.md`
- Reference: `docs/superpowers/specs/2026-04-19-todoist-inspired-visual-redesign-design.md`

- [ ] Step 1: Confirm the approved spec is present
Run: `test -f 'docs/superpowers/specs/2026-04-19-todoist-inspired-visual-redesign-design.md' && echo OK`
Expected: `OK`

- [ ] Step 2: Write the implementation plan
Create this file with tasks covering shared tokens, shell, page primitives, list pages, detail pages, and verification.

- [ ] Step 3: Confirm the plan file exists
Run: `test -f 'docs/superpowers/plans/2026-04-19-todoist-inspired-visual-redesign.md' && echo OK`
Expected: `OK`

### Task 2: Retune the shared visual system

**Files:**
- Modify: `apps/desktop/src/styles/globals.css`
- Modify: `packages/ui/src/AppShell.tsx`
- Modify: `packages/ui/src/SidebarNav.tsx`
- Modify: `packages/ui/src/TopUtilityBar.tsx`
- Modify: `apps/desktop/src/pages/pagePrimitives.tsx`

- [ ] Step 1: Adjust the light-mode token system
Change warm neutrals, red accent, softer sidebar, lighter separators, quieter cards, and updated button/input states in `apps/desktop/src/styles/globals.css`.

- [ ] Step 2: Align shared shell spacing and container density
Update shell spacing in `packages/ui/src/AppShell.tsx` so the sidebar and main pane reflect the new density and list-first rhythm.

- [ ] Step 3: Redesign the sidebar
Update `packages/ui/src/SidebarNav.tsx` to use a calmer active state, quieter counts, warmer rail background, and integrated search presentation.

- [ ] Step 4: Redesign the top utility bar
Update `packages/ui/src/TopUtilityBar.tsx` to reduce chrome, soften the title treatment, and align the drag-region bar with the lighter visual system.

- [ ] Step 5: Redesign shared primitives
Update `apps/desktop/src/pages/pagePrimitives.tsx` so section cards, fields, badges, notices, and list-adjacent elements inherit the new visual language.

### Task 3: Apply the new list treatment to Projects and Drives

**Files:**
- Modify: `apps/desktop/src/pages/ProjectsPage.tsx`
- Modify: `apps/desktop/src/pages/DrivesPage.tsx`

- [ ] Step 1: Refine Projects page header and filters
Keep existing search/filter behavior, but simplify the header, reinforce status-tab hierarchy, and reduce boxed framing.

- [ ] Step 2: Flatten the Projects list presentation
Retune row density, separators, and supporting metadata emphasis so project names and statuses read first.

- [ ] Step 3: Refine Drives page header and action zone
Keep create/import behavior intact while making primary actions, capacity summaries, and drive surfaces visually calmer.

- [ ] Step 4: Flatten and rebalance drive summaries
Reduce dashboard heaviness in drive rows/cards while preserving storage and health clarity.

### Task 4: Apply the new grouped-surface treatment to detail pages and settings

**Files:**
- Modify: `apps/desktop/src/pages/ProjectDetailPage.tsx`
- Modify: `apps/desktop/src/pages/DriveDetailPage.tsx`
- Modify: `apps/desktop/src/pages/SettingsPage.tsx`

- [ ] Step 1: Retune Project Detail surfaces
Keep edit, move, and delete flows intact while simplifying the header, metadata grouping, and related/history sections.

- [ ] Step 2: Retune Drive Detail surfaces
Keep scan/import behavior intact while making the scan area visually primary and the surrounding storage sections quieter.

- [ ] Step 3: Retune Settings surface
Keep sync behavior intact while simplifying metric presentation and using the red-accent action hierarchy sparingly.

### Task 5: Verify and stabilize

**Files:**
- Review: `apps/desktop/src/styles/globals.css`
- Review: `packages/ui/src/AppShell.tsx`
- Review: `packages/ui/src/SidebarNav.tsx`
- Review: `packages/ui/src/TopUtilityBar.tsx`
- Review: `apps/desktop/src/pages/pagePrimitives.tsx`
- Review: `apps/desktop/src/pages/ProjectsPage.tsx`
- Review: `apps/desktop/src/pages/DrivesPage.tsx`
- Review: `apps/desktop/src/pages/ProjectDetailPage.tsx`
- Review: `apps/desktop/src/pages/DriveDetailPage.tsx`
- Review: `apps/desktop/src/pages/SettingsPage.tsx`

- [ ] Step 1: Run targeted desktop tests
Run: `corepack pnpm --filter @drive-project-catalog/desktop test`
Expected: All desktop Vitest tests pass.

- [ ] Step 2: Run the frontend build
Run: `corepack pnpm --filter @drive-project-catalog/desktop build:frontend`
Expected: TypeScript and Vite build complete successfully.

- [ ] Step 3: Review for scope compliance
Confirm that routes, information architecture, scan/import behavior, project editing behavior, and sync behavior were not changed as part of the redesign.
