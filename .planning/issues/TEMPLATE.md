---
id: NN
title: Short title — what the user can see/do when this is done
type: AFK
status: open
blocked_by: []
blocks: []
estimate: S
---

## Goal
One sentence: what becomes possible in the running app when this issue is complete.

## Why this slice first
Why this order — what does completing this unblock.

## Layers
- **Rust** (`src-tauri/src/`): [file] — [what changes]
- **React** (`apps/desktop/src/`): [file] — [what changes]
- **Test** (`[package]/src/`): [test file] — [what the test proves]

## Implementation notes
Key decisions, gotchas, existing patterns to follow.
Point to analogous code in the repo where relevant.

## Definition of done
- [ ] [Observable outcome in the running app]
- [ ] `corepack pnpm -r typecheck` passes clean
- [ ] `corepack pnpm -r test` passes (new tests green, no regressions)
- [ ] No `console.log` in modified files
- [ ] Commit message written

## Out of scope
What this issue explicitly does NOT do.
