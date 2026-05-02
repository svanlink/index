# Catalog

Catalog is a macOS desktop app for filmmakers and photographers who manage footage across many external drives. It maintains a local index of every project across every drive — so you always know what is where, without mounting drives or opening Finder.

**v1 status: complete.** See [CHANGELOG.md](CHANGELOG.md) for what shipped.

## What it does

- **Drive catalog**: register drives by volume name; view capacity, last scanned date, and incoming/missing project sets
- **Project catalog**: every folder imported as a project, with scan history, file counts, and path availability status
- **Scan sessions**: record when a drive was scanned, what was found, what changed
- **Instant search**: filter projects by name on every keystroke, no submit required
- **Optimistic mutations**: delete and create operations feel instant — UI updates before the Rust write completes
- **Honest null states**: capacity bars only render when bytes are known; scan states say "Not yet scanned" rather than showing dashes

## Stack

| Layer | Choice |
|-------|--------|
| Shell | Tauri v2 (macOS only — WKWebView) |
| Frontend | React 19 + TypeScript + Tailwind |
| Backend | Rust (Tauri commands) |
| Persistence | SQLite via `rusqlite`, WAL mode |
| Monorepo | pnpm workspaces |
| Optional sync | Supabase (disabled when env vars absent) |

## Current release strategy

- Primary release path: unsigned Tauri desktop app for local/personal use on macOS
- Future/optional: signed and notarized macOS distribution — infrastructure lives in [MACOS_RELEASE_OPERATIONS.md](MACOS_RELEASE_OPERATIONS.md) and is not on the current critical path

## Workspace

- `apps/desktop`: Tauri desktop application (React frontend + Rust scan engine)
- `packages/domain`: shared catalog types and enums
- `packages/data`: repository interfaces and persistence/sync adapters
- `packages/ui`: reusable shell components

## Commands

Use `corepack pnpm` since `pnpm` is managed through Corepack in this environment.

```bash
corepack pnpm install
corepack pnpm dev
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build:desktop
corepack pnpm release:check:macos
corepack pnpm release:check:rc v1.0.0-rc1
```

`corepack pnpm dev` launches the full Tauri desktop shell. The Vite frontend build runs internally via Tauri's `beforeDevCommand` / `beforeBuildCommand` hooks and does not need to be invoked directly.

## Environment

Optional Supabase sync is enabled only when both of these variables are present in the desktop build environment:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Optional:

```bash
VITE_SUPABASE_SCHEMA=
```

If these variables are missing or invalid, the app remains fully usable in local-first mode and the sync surfaces explain that cloud transport is disabled.

## Desktop packaging notes

- The desktop app uses Tauri and local SQLite for durable local persistence.
- The packaged macOS app is produced from `apps/desktop/src-tauri`.
- The current desktop release path is unsigned local use, not public signed distribution.
- A fuller release/operator guide lives in [RELEASE_DESKTOP.md](RELEASE_DESKTOP.md).
- macOS signing/notarization preparation lives in [MACOS_RELEASE_OPERATIONS.md](MACOS_RELEASE_OPERATIONS.md).
- Release note structure lives in [RELEASE_NOTES_TEMPLATE.md](RELEASE_NOTES_TEMPLATE.md).
- Before shipping a build, verify:
  - `corepack pnpm test`
  - `corepack pnpm typecheck`
  - `corepack pnpm build:desktop`
  - `corepack pnpm release:check:macos`
  - `corepack pnpm release:check:rc v1.0.0-rc1`
- Recommended release sanity checks:
  - first run with no config
  - offline launch
  - manual scan
  - scan history load
  - manual sync disabled state
  - invalid config messaging
  - sync failure and retry behavior
  - packaged app launch from `.app`

## Release candidate discipline

- Keep the root workspace version, desktop package version, Rust crate version in `apps/desktop/src-tauri/Cargo.toml`, and `tauri.conf.json` version aligned before tagging a release candidate.
- Use tags like `v1.0.0-rc1` for release candidates and `v1.0.0` for the final release.
- Run `corepack pnpm release:check:rc <tag>` before creating the tag to verify version consistency and required operator files.
- Cut release notes from [RELEASE_NOTES_TEMPLATE.md](RELEASE_NOTES_TEMPLATE.md) and archive them with the exact signed artifacts.

## Release boundaries

Inside the repo, this project now defines:

- desktop bundle metadata
- product naming consistency
- icon wiring
- local-first runtime behavior
- optional sync environment expectations
- release verification and operator notes

Outside the repo, future signed macOS distribution still requires:

- Developer ID signing setup
- notarization credentials
- release operator machine or CI secrets
- final signing and notarization execution
- Gatekeeper validation on the final signed artifacts
