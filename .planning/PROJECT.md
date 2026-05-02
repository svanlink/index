# Catalog

## What This Is

A macOS desktop app for cataloging and browsing creative and developer projects across external drives. Lets you scan volumes, import folders as projects, and find anything instantly. Built on Tauri v2 (Rust + React), data lives in local SQLite — no account, no cloud required.

## Core Value

Every piece of data shown is correct. No confusing states, no placeholders, no misleading numbers — if Catalog shows it, you can trust it.

## Requirements

### Validated

- ✓ Drive registration and storage tracking — existing
- ✓ Volume scanning via Rust-based threaded directory walker — existing
- ✓ Project import from scanned volumes — existing
- ✓ Project and drive browsing pages (ProjectsPage, DrivesPage, DriveDetailPage, ProjectDetailPage) — existing
- ✓ Local SQLite persistence (WAL mode, vendored tauri-plugin-sql) — existing
- ✓ Tailwind CSS + Inter variable font design system — existing
- ✓ pnpm monorepo structure (apps/desktop + packages/domain, data, ui) — existing

### Active

- [ ] Remove MUI + Roboto font from runtime bundle (~350KB savings, eliminates Tailwind Preflight conflict)
- [ ] Fix performance: optimistic mutations instead of full catalog reload on every write
- [ ] Fix CapacityBar: no fake 28% fill when size data is unknown
- [ ] Fix misleading "No import task has run yet" state when drives/projects already exist
- [ ] Project search and browse feel instantaneous (no perceived lag)
- [ ] Project detail page shows accurate data (size, path, scan status, last scanned)
- [ ] macOS-native visual direction: system colors, crisp typography, sidebars that feel at home on macOS
- [ ] No broken flows surfaced in UI (Rename Review removed from UI until page exists)
- [ ] Dead Rust dependencies removed (notify, sha2 — declared but unused)
- [ ] Large files split (pagePrimitives.tsx at 796 lines, DrivesPage/DriveDetailPage at 760/723 lines)

### Out of Scope

- Rename Review flow — UI references it but page doesn't exist; not a daily-driver need for v1
- Remote Supabase sync — optional adapter exists but not needed for personal use
- Signed .app distribution — dev build (`corepack pnpm dev`) is the workflow
- Drive management as primary flow — secondary to project catalog for daily use
- Cross-platform support — macOS only by design

## Context

- **Stack**: Tauri 2.8.2, React 19, TypeScript 5.9, Rust 2021, SQLite (WAL), Vite 7, Tailwind 3.4
- **Monorepo**: `apps/desktop/` + `packages/domain` (pure types + logic), `packages/data` (SQLite adapters), `packages/ui` (AppShell, SidebarNav)
- **MUI status**: ThemeProvider + CssBaseline still wrap `main.tsx` despite all components being migrated to Tailwind. This is pure dead weight — the ThemeProvider does nothing useful, CssBaseline conflicts with Preflight.
- **Performance root cause**: `runMutation` in `apps/desktop/src/app/providers.tsx` (lines 120–129) calls `refresh()` after every write, which re-fetches all four collections (projects, drives, scans, sessions) unconditionally. A partial optimistic update pattern (`useOptimisticMutation`) exists but isn't wired up.
- **Known bugs**: CapacityBar uses `"28%"` as placeholder when bytes are unknown; Rename Review is mentioned in toasts but the route doesn't exist in router.tsx.
- **Unused Rust deps**: `notify` and `sha2` in Cargo.toml — neither is imported anywhere.

## Constraints

- **Platform**: macOS only — Tauri desktop app, WKWebView renderer
- **Runtime**: Dev build via `corepack pnpm --filter @drive-project-catalog/desktop dev`
- **No MUI**: Conflicts with Tailwind Preflight; adds unnecessary bundle weight; design system already migrated
- **SQLite singleton**: Max connections = 1, WAL mode, busy_timeout — mutation concurrency must be coordinated

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Remove MUI + Roboto entirely | Dead weight, Preflight conflict, ~350KB savings | — Pending |
| Optimistic UI updates over full reload | Core value is accuracy AND speed — full reload makes both worse | — Pending |
| macOS native visual direction | User's mental model is Finder/Xcode, not a web app | — Pending |
| Catalog flow only for v1 | Drive management and Rename Review are secondary; daily value is finding projects | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-02 after initialization*
