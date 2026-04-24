# Drive Project Catalog — Project Overview

**Status:** Active  
**Created:** 2026-04-10 (stub — fill in details)

## What is this project?
<!-- Describe the Drive Project Catalog app, its purpose, and current state -->

## Goal
<!-- What does done look like? What's the end state? -->

## Key Links & References
<!-- Repo, staging URLs, design files, etc. -->

## Next Actions
<!-- What needs to happen next? -->

## Notes
<!-- Anything else worth capturing here -->

### Known issue: legacy folder types classified as `personal_folder`

Projects imported before the folder classifier was refined can be stored as
`personal_folder` even when their folder name matches the structured
`YYMMDD_Client_Project` pattern. This mainly affects rows that passed through
the early blanket-assignment migration (Phase 1 audit — H12).

**Recovery path:** open **Settings → Legacy folder type recovery →
“Reclassify legacy folder types”**. The action re-runs the current classifier
against every non-manual project currently stored as `personal_folder` and
upgrades matching rows to `client` or `personal_project`. It never touches
manually created projects and never downgrades rows that are already
structured.
