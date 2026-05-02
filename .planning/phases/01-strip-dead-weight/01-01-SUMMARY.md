---
phase: 01-strip-dead-weight
plan: 01
subsystem: frontend, rust-backend
tags: [cleanup, dead-code, mui-removal, rust-deps, constants, toast-fix]
dependency_graph:
  requires: []
  provides: [clean-frontend-entry, constants-rs, clean-rust-deps, clean-import-toast]
  affects: [apps/desktop/src/main.tsx, apps/desktop/src-tauri/Cargo.toml, apps/desktop/src-tauri/src/constants.rs, apps/desktop/src-tauri/src/scan_engine.rs, apps/desktop/src-tauri/src/volume_import.rs, apps/desktop/src/pages/DriveDetailPage.tsx]
tech_stack:
  added: []
  patterns: [constants-module, single-source-of-truth]
key_files:
  created:
    - apps/desktop/src-tauri/src/constants.rs
  modified:
    - apps/desktop/src/main.tsx
    - apps/desktop/package.json
    - apps/desktop/src-tauri/Cargo.toml
    - apps/desktop/src-tauri/src/lib.rs
    - apps/desktop/src-tauri/src/scan_engine.rs
    - apps/desktop/src-tauri/src/volume_import.rs
    - apps/desktop/src/pages/DriveDetailPage.tsx
  deleted:
    - apps/desktop/src/app/materialTheme.ts
decisions:
  - "Cleaned stale Cargo build artifacts from old project path (Drive Manager) as part of Task 2 — pre-existing env issue, not a code change"
  - "MUI chunk size warning not in scope — 574KB JS bundle is pre-existing; code-splitting deferred to Phase 3"
metrics:
  duration: "~35 minutes"
  completed: "2026-05-02"
  tasks_completed: 5
  files_changed: 8
---

# Phase 1 Plan 1: Strip Dead Weight Summary

MUI/Emotion/Roboto bundle removed (~350KB savings), two unused Rust crates dropped, IGNORED_SYSTEM_FOLDERS deduplicated into a single constants.rs, and ghost-route Rename Review toast eliminated.

## What Was Removed

### npm Packages (Task 1)

Removed from `apps/desktop/package.json`:
- `@mui/material`
- `@emotion/react`
- `@emotion/styled`
- `@fontsource/roboto`
- `@fontsource-variable/inter`

Deleted: `apps/desktop/src/app/materialTheme.ts`

Rewritten: `apps/desktop/src/main.tsx` — App renders directly inside `<React.StrictMode>`, no ThemeProvider, no CssBaseline. globals.css provides all needed resets (MAC-03 satisfied by existing file).

No MUI imports survived anywhere in `apps/desktop/src` or the shared packages (ui, domain, data).

### Rust Dependencies (Task 2)

Removed from `apps/desktop/src-tauri/Cargo.toml`:
- `notify = "6.1"` — volume mount watcher, never used in application code
- `sha2 = "0.10"` — archive hashing, never used in application code

`sha2` remains in `Cargo.lock` as a transitive dep of sqlx/wry — expected and not a failure.

## What Was Extracted (Task 3)

Created `apps/desktop/src-tauri/src/constants.rs` with:

```rust
pub(crate) const IGNORED_SYSTEM_FOLDERS: &[&str] = &[...]
```

- Added `mod constants;` as the first mod declaration in `lib.rs`
- Removed duplicate local `const` from `scan_engine.rs` (was lines 48–61)
- Removed duplicate local `const` and its doc comment from `volume_import.rs` (was lines 49–65)
- Both files now import via `use crate::constants::IGNORED_SYSTEM_FOLDERS`
- Single source of truth; `pub(crate)` visibility prevents accidental public export

## What Was Fixed (Task 4)

`apps/desktop/src/pages/DriveDetailPage.tsx` — import success handler:

- Removed `cleanupReviewCount` push block that referenced the nonexistent `/rename-review` route
- Simplified `setFeedback` call: `tone: "success"`, `title: "Folders imported"` (no ternary)
- `buildImportCleanupIssueParts(result)` and its conditional push retained (surfaces real issue details without routing)
- `skippedCount` push retained

## Final Verification Command Results

```
=== 1. No MUI in source ===
CLEAN

=== 2. No direct notify/sha2 in Cargo.toml ===
CLEAN

=== 3. IGNORED_SYSTEM_FOLDERS defined in exactly one place ===
apps/desktop/src-tauri/src/constants.rs:6:pub(crate) const IGNORED_SYSTEM_FOLDERS

=== 4. No ghost-route reference ===
CLEAN

=== 5. materialTheme.ts gone ===
CONFIRMED DELETED

=== 6. TypeScript ===
tsc --noEmit: exit 0, no errors

=== 7. Rust ===
cargo check: exit 0, 0 errors (1 pre-existing unused import warning in lib.rs)

=== 8. Full production build ===
tauri build: Catalog.app + Catalog_1.0.0-rc1_aarch64.dmg produced successfully
Bundle: no @mui or @emotion chunks
```

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `1388422` | chore(01-01): remove MUI, Emotion, Roboto, and fontsource-variable/inter |
| 2 | `a3411df` | chore(01-01): remove unused Rust deps notify and sha2 from Cargo.toml |
| 3 | `455c9a7` | refactor(01-01): extract IGNORED_SYSTEM_FOLDERS to constants.rs |
| 4 | `1586c69` | fix(01-01): remove ghost-route Rename Review toast from DriveDetailPage |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stale Cargo build artifacts from old project path**
- **Found during:** Task 2 and Task 5
- **Issue:** `cargo check` and `tauri build` failed because cached build scripts (in `target/debug/build/` and `target/release/build/`) embedded absolute paths to the old project location `/Users/vaneickelen/Desktop/Drive Manager/Drive Project Catalog/`. When Cargo tried to validate plugin permissions using those paths, the files were not found.
- **Fix:** Removed specific stale `drive-project-catalog-*` and `tauri-*` build dirs that referenced the old path. Both `debug` and `release` profiles required cleanup.
- **Files modified:** Build artifact directories only (not tracked in git)
- **Commit:** Documented in a3411df commit message

## Known Stubs

None — this plan is pure teardown with no UI or data rendering changes. No stub patterns introduced.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- `/Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/src/constants.rs` — FOUND
- `/Users/vaneickelen/Desktop/Catalog/apps/desktop/src/main.tsx` — FOUND (MUI-free)
- `apps/desktop/src/app/materialTheme.ts` — CONFIRMED DELETED
- Commits 1388422, a3411df, 455c9a7, 1586c69 — all present in git log
- `tsc --noEmit` — exit 0
- `cargo check` — exit 0, 0 errors
- `tauri build` — Catalog.app produced, no MUI chunks
