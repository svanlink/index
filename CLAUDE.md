# Catalog

## Project

This is a Tauri v2 macOS desktop app for cataloging projects across external drives. Rust backend + React/TypeScript frontend. pnpm monorepo at `apps/desktop/`.

**Run:** `corepack pnpm --filter @drive-project-catalog/desktop dev`

## GSD Workflow

This project uses Get Shit Done (GSD) for planning and execution.

**Planning artifacts:** `.planning/`
- `PROJECT.md` — project context and requirements
- `ROADMAP.md` — 3 phases, 17 requirements
- `REQUIREMENTS.md` — full requirement list with REQ-IDs
- `STATE.md` — current project state
- `config.json` — YOLO mode, coarse granularity, parallel execution

**Current phase:** v1 complete — v2 planning in progress

**GSD commands:**
- `/gsd-plan-phase N` — plan a phase
- `/gsd-execute-phase N` — execute a phase
- `/gsd-progress` — show current status
- `/gsd-discuss-phase N` — discuss approach before planning

**Always read `.planning/STATE.md` at the start of a session.**

## Matt Pocock Workflow (v2)

Catalog uses a full alignment-first, AFK-implementation workflow for all v2 features.

**Workflow order (always follow this):**
1. `/grill-me [feature]` — alignment session, one question at a time
2. `/prd [feature]` — PRD + vertical slice issues in `.planning/issues/`
3. `./ralph.sh` — AFK loop: implements all open issues with TDD
4. `./review.sh [N]` — post-implementation reviewer in fresh context
5. `./sandcastle.sh` — parallel agents for independent issues (no blockers)

**Scripts:**
- `ralph.sh` — full AFK loop (runs until NO_MORE_TASKS)
- `ralph-once.sh [issue-id]` — single pass, human-in-loop
- `sandcastle.sh` — parallel execution via git worktrees
- `review.sh [N]` — review last N commits
- `archive-phase.sh [path]` — doc rot guard: archive completed planning docs

**Issues Kanban:** `.planning/issues/` — vertical slice issues, one per feature chunk
**Archive:** `.planning/archive/` — completed docs (prevents doc rot in agent context)

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- New feature alignment before planning → use /grill-me command
- Feature planning + issue creation → use /prd command
- Run implementation loop → run ralph.sh or ralph-once.sh
- Parallel independent issues → run sandcastle.sh
- Review after implementation → run review.sh or use /review-impl command
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
- Archive completed planning docs → run archive-phase.sh

## Health Stack

- typecheck: corepack pnpm -r typecheck
- test: corepack pnpm -r test
- rust-test: cargo test (run from apps/desktop/src-tauri)
