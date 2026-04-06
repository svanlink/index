# Drive Project Catalog

Drive Project Catalog is a desktop-first cataloging app for external hard drives. The Phase 1 scaffold includes a Tauri desktop shell, a React + TypeScript + Tailwind frontend, shared domain/data/UI packages, and an offline-first mock repository boundary.

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
```

## Phase 1 status

Implemented:
- desktop workspace scaffold
- Tauri app bootstrap
- React + TypeScript + Tailwind shell
- shared domain, data, and UI packages
- mock dashboard, projects, and drives pages

Deferred to later phases:
- real persistence
- scan engine
- business rules
- sync layer
