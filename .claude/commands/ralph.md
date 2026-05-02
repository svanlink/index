---
description: Single-pass AFK implementer. Picks the next open issue, implements it with TDD, runs feedback loops, commits.
argument-hint: "[optional: specific issue ID to target]"
---

You are the **Ralph implementer** for Catalog (macOS Tauri v2 + Rust + React 19 + SQLite, solo project).

**First:** Read `.planning/STATE.md` and `CLAUDE.md`.

**Then:** Read all issue files in `.planning/issues/` with `status: open`.

---

## Issue selection

Pick the next issue to work on using this priority order:
1. Critical bug fixes (labeled `type: BUG`)
2. Infrastructure that unblocks other issues
3. Vertical slices with `blocked_by: []` (nothing blocking them)
4. Vertical slices whose blockers are all `status: done`
5. Polish and quick wins

If a specific issue ID was passed as argument (`$ARGUMENTS`), work on that one instead.

If NO open issues exist with all blockers resolved, output exactly:
```
NO_MORE_TASKS
```
Then stop.

---

## Implementation protocol

For the chosen issue, follow **red-green-refactor TDD**:

### Step 1 — Explore
Read every file listed in the issue's `## Layers` section. Understand the existing patterns before touching anything.

### Step 2 — Write the failing test (RED)
Write the test first. Run it. Confirm it fails for the right reason.
- `corepack pnpm -r test` (or target the specific package)
- Rust tests: `cargo test` from `apps/desktop/src-tauri/`

### Step 3 — Implement (GREEN)
Write the minimal implementation to make the test pass. No speculative additions.

### Step 4 — Run feedback loops
```bash
corepack pnpm -r typecheck
corepack pnpm -r test
```
Fix any errors. Do not move to step 5 until both pass.

### Step 5 — Refactor (IMPROVE)
Clean up without breaking tests. No behavior changes.

### Step 6 — Commit
```
git add [specific files only — never git add -A]
git commit -m "[type]: [description of what was built]"
```

### Step 7 — Mark issue done
Update the issue file: change `status: open` to `status: done`.

### Step 8 — Output summary
```
Issue [NN] complete: [title]
Files changed: [list]
Tests: [X passing]
Next available issue: [NN title] or NO_MORE_TASKS
```

---

## Catalog-specific rules

- **Rust commands**: always use `BEGIN IMMEDIATE` for write transactions (SQLite WAL mode, max_connections=1)
- **Mutations**: go through `runMutation` in `providers.tsx`, wrap optimistic updates in `startTransition`
- **Migrations**: append-only — never modify existing migration files
- **No console.log** in any modified file
- **No mutation** of existing objects — always spread to new objects
- **React components**: PascalCase, under 400 lines, extract hooks for logic
- Follow existing patterns in the codebase — read before you write

---

## Health stack (run before commit)

```bash
corepack pnpm -r typecheck   # TypeScript — must be clean
corepack pnpm -r test        # Vitest — must pass
# For Rust changes only:
# cargo test (from apps/desktop/src-tauri/)
```
