# Drive Project Catalog

Drive Project Catalog is a desktop-first cataloging app for external hard drives. The current build includes a Tauri desktop shell, a React + TypeScript + Tailwind frontend, shared domain/data/UI packages, local SQLite persistence, manual scan workflow support, scan history, storage planning, and optional Supabase transport on top of a local-first sync boundary.

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
corepack pnpm --filter @drive-project-catalog/desktop build
```

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
- Before shipping a build, verify:
  - `corepack pnpm test`
  - `corepack pnpm typecheck`
  - `corepack pnpm build:web`
  - `corepack pnpm --filter @drive-project-catalog/desktop build`
- Recommended release sanity checks:
  - first run with no config
  - offline launch
  - manual scan
  - scan history load
  - manual sync disabled state
  - invalid config messaging
  - sync failure and retry behavior
