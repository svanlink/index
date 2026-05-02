---
description: Convert a completed Grill Me session into a PRD and vertical slice issues ready for the AFK loop.
argument-hint: "[feature name]"
---

You are creating a PRD and Kanban issue board for Catalog (macOS Tauri v2 + Rust + React 19 + SQLite).

**First:** Read `.planning/STATE.md` to understand current project state. Review the current conversation — it should contain a completed Grill Me Decision Summary. If there is no Decision Summary, stop and tell the user to run `/grill-me` first.

**Then:** Produce the following in order.

---

## 1. PRD — write to `.planning/issues/PRD-$ARGUMENTS.md`

Structure:
```
# PRD: [Feature Name]
Date: [today]
Status: active

## Problem
[One paragraph: what pain does this solve for the filmmaker/photographer using Catalog]

## Solution
[One paragraph: what we're building]

## User Stories
As a [role], I want [action], so that [outcome].
- Cover: happy path, edge cases, error states
- Minimum 5 stories, maximum 15

## Module Map
Files and modules that will be created or modified:
- Rust: [exact file paths in src-tauri/]
- React: [exact file paths in apps/desktop/src/]
- Tests: [exact test file paths]

## Implementation Decisions
[Key decisions from the Grill Me session — what we're doing and why]

## Out of Scope
[Explicit list of what we are NOT building — critical for definition of done]

## Definition of Done
Observable acceptance criteria — things you can see/click/verify in the running app:
- [ ] [criterion 1]
- [ ] [criterion 2]
```

---

## 2. Vertical Slice Issues — write each to `.planning/issues/[NN]-[slug].md`

**Critical rule: every issue must be a vertical slice (traceable bullet).**
A vertical slice crosses ALL required layers in one issue: Rust + React + test.
Never create a horizontal issue (all DB changes, then all API, then all UI separately).

Each issue at completion must produce something **visible and testable** in the running app.

**Issue file format:**
```
---
id: [NN]
title: [Short title — what you can see when it's done]
type: AFK
status: open
blocked_by: []
blocks: []
estimate: S | M | L
---

## Goal
[One sentence: what the user can do or see when this issue is complete]

## Why this slice first
[Why this order — what does it unblock]

## Layers
- **Rust** (`src-tauri/`): [specific files and what changes]
- **React** (`apps/desktop/src/`): [specific files and what changes]
- **Test**: [what test file, what the test proves]

## Implementation notes
[Key decisions, gotchas, patterns to follow from the existing codebase]

## Definition of done
- [ ] [what you can observe in the running app]
- [ ] `corepack pnpm -r typecheck` passes
- [ ] `corepack pnpm -r test` passes (new tests green)
- [ ] No console.log in modified files

## Out of scope
[What this issue explicitly does NOT do]
```

**Ordering rules:**
- Issue 01 must be the thinnest possible vertical slice — touches all layers, proves the full flow works end to end
- Independent issues (no blocking relationship) get the same `blocked_by: []` — these can run in parallel
- Number sequentially: `01`, `02`, `03`, etc.
- Maximum 7 issues per PRD — if you need more, split into two PRDs

**After creating all files:** Output a summary table:
```
| Issue | Title | Type | Blocked by | Estimate |
|-------|-------|------|-----------|---------|
| 01 | ... | AFK | — | S |
| 02 | ... | AFK | 01 | M |
```

Feature: **$ARGUMENTS**
