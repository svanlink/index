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

**Current phase:** Phase 1 — Strip Dead Weight

**GSD commands:**
- `/gsd-plan-phase 1` — plan Phase 1 tasks
- `/gsd-execute-phase 1` — execute Phase 1
- `/gsd-progress` — show current status
- `/gsd-discuss-phase N` — discuss approach before planning

**Always read `.planning/STATE.md` at the start of a session.**

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
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

## Health Stack

- typecheck: corepack pnpm -r typecheck
- test: corepack pnpm -r test
- rust-test: cargo test (run from apps/desktop/src-tauri)
