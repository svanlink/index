# Drive Project Catalog

Drive Project Catalog is a desktop-first cataloging app for external hard drives. The current build includes a Tauri desktop shell, a React + TypeScript + Tailwind frontend, shared domain/data/UI packages, local SQLite persistence, manual scan workflow support, scan history, storage planning, and optional Supabase transport on top of a local-first sync boundary.

## Current release strategy

- Desktop app: local or personal use in the unsigned Tauri app
- Public/shareable release: web deployment
- Signed and notarized macOS distribution: future/optional, not the current release path

## Workspace

- `apps/desktop`: Tauri desktop application
- `packages/domain`: shared catalog types and enums
- `packages/data`: repository interfaces and mock data adapter
- `packages/ui`: reusable shell components

## Commands

Use `corepack pnpm` since `pnpm` is managed through Corepack in this environment.

```bash
corepack pnpm install
corepack pnpm dev:web
corepack pnpm dev
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build:web
corepack pnpm build:desktop
corepack pnpm release:check:macos
corepack pnpm release:check:rc v1.0.0-rc1
```

## Free public release path

The recommended free public release path is the web app.

- Web deployment guide: [WEB_RELEASE.md](/Users/vaneickelen/Desktop/01%20-%20Projects/Index/WEB_RELEASE.md)
- Recommended targets: [Vercel](https://vercel.com/) or [Netlify](https://www.netlify.com/)
- Public web builds use `corepack pnpm build:web`

The desktop app stays useful for local/personal workflows, especially when you need scan commands and local SQLite behavior.

## Environment

Optional Supabase sync is enabled only when both of these variables are present in the desktop/web build environment:

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
- A fuller release/operator guide lives in [RELEASE_DESKTOP.md](/Users/vaneickelen/Desktop/01%20-%20Projects/Index/RELEASE_DESKTOP.md).
- macOS signing/notarization preparation now lives in [MACOS_RELEASE_OPERATIONS.md](/Users/vaneickelen/Desktop/01%20-%20Projects/Index/MACOS_RELEASE_OPERATIONS.md).
- Release note structure now lives in [RELEASE_NOTES_TEMPLATE.md](/Users/vaneickelen/Desktop/01%20-%20Projects/Index/RELEASE_NOTES_TEMPLATE.md).
- Before shipping a build, verify:
  - `corepack pnpm test`
  - `corepack pnpm typecheck`
  - `corepack pnpm build:web`
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
- Cut release notes from [RELEASE_NOTES_TEMPLATE.md](/Users/vaneickelen/Desktop/01%20-%20Projects/Index/RELEASE_NOTES_TEMPLATE.md) and archive them with the exact signed artifacts.

## Release boundaries

Inside the repo, this project now defines:

- desktop bundle metadata
- product naming consistency
- icon wiring
- local-first runtime behavior
- optional sync environment expectations
- release verification and operator notes
- a web deployment path for free public release

Outside the repo, future signed macOS distribution still requires:

- Developer ID signing setup
- notarization credentials
- release operator machine or CI secrets
- final signing and notarization execution
- Gatekeeper validation on the final signed artifacts
