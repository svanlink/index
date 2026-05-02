# Technology Stack

**Analysis Date:** 2026-05-02

## Languages

**Primary:**
- TypeScript 5.9 — all frontend packages (`apps/desktop/src/`, `packages/*/src/`)
- Rust 2021 edition — Tauri backend (`apps/desktop/src-tauri/src/`)

**Secondary:**
- CSS — global styles and component styles (`apps/desktop/src/styles/`)

## Runtime

**Environment:**
- Node.js — frontend dev/build tooling only (no Node.js at runtime; app is native)
- Rust native binary — the actual runtime target via Tauri

**Package Manager:**
- pnpm 10.11.0 (enforced via `corepack`)
- Lockfile: `pnpm-lock.yaml` present at repo root

## Frameworks

**Core:**
- Tauri 2.8.2 — native macOS desktop shell; bridges Rust backend ↔ React frontend via IPC
- React 19.1 — UI rendering layer
- React Router DOM 7.9 — client-side routing (browser router in app, memory router in tests)

**UI Components:**
- MUI (Material UI) 9.0 — component library (`@mui/material`, `@emotion/react`, `@emotion/styled`)
- Phosphor Icons 2.1 (`@phosphor-icons/react`) — icon set

**Build/Dev:**
- Vite 7.1 — frontend dev server (port 1420) and bundler
- `@vitejs/plugin-react` 5.0 — React Fast Refresh for Vite
- Tailwind CSS 3.4 — utility-class CSS framework
- PostCSS + Autoprefixer — CSS processing pipeline
- `tauri-build` 2.0.2 — Rust build script for Tauri codegen

**Testing:**
- Vitest 3.2 — test runner (configured in `vite.config.ts`, uses jsdom environment)
- `@testing-library/react` 16.3 — React component testing
- `@testing-library/jest-dom` 6.8 — DOM matchers
- jsdom 26.1 — DOM environment for tests

## Key Dependencies

**Critical:**
- `@tauri-apps/api` 2.8 — IPC bridge (`invoke`, `listen`) for calling Rust commands and receiving events
- `@tauri-apps/plugin-sql` 2.2 — SQLite access from TypeScript via Tauri IPC
- `tauri-plugin-sql` (vendored, local path) — patched SQLite plugin: `max_connections=1`, WAL mode, `busy_timeout` (fixes `SQLITE_BUSY` on multi-statement transactions)
- `sqlx` (via vendored plugin) — async SQLite pool in Rust
- `serde` / `serde_json` 1.0 — Rust serialization for all IPC payloads
- `chrono` 0.4 — timestamps in scan records

**Infrastructure:**
- `notify` 6.1 (Rust) — filesystem event watcher; used for volume-mount detection (FSEvents on macOS)
- `sha2` 0.10 (Rust) — SHA-256 hashing for file integrity records
- `log` 0.4 + `tauri-plugin-log` 2.8 — unified structured logging (Rust + frontend console forwarded to log plugin)
- `tauri-plugin-dialog` 2.4 — native macOS folder picker dialog
- `tauri-plugin-opener` 2.5 — open paths in Finder / default app
- `tauri-plugin-notification` 2.0 — macOS native system notifications

**Fonts:**
- `@fontsource-variable/inter` 5.2 — Inter variable font
- `@fontsource/roboto` 5.2 — Roboto font

## Workspace Layout

```
drive-project-catalog/          (pnpm monorepo root)
├── apps/desktop/               (@drive-project-catalog/desktop)
│   ├── src/                    React + TypeScript frontend
│   └── src-tauri/              Rust backend + Tauri config
├── packages/domain/            (@drive-project-catalog/domain) — pure domain types + logic
├── packages/data/              (@drive-project-catalog/data) — persistence + sync layer
└── packages/ui/                (@drive-project-catalog/ui) — shared UI components
```

All workspace packages are internal (`private: true`). Cross-package references use `workspace:*` protocol resolved via Vite path aliases at dev/build time.

## Configuration

**Environment:**
- `.env` file at repo root (not committed; `.env.example` documents keys)
- Required vars for optional Supabase sync: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Optional: `VITE_SUPABASE_SCHEMA` (defaults to `public`)
- All env vars are prefixed `VITE_` and accessed via `import.meta.env` in frontend
- App runs fully local-first without any env vars; Supabase sync is gracefully disabled when vars are absent or placeholder

**Build:**
- `apps/desktop/vite.config.ts` — Vite config with workspace path aliases and test setup
- `apps/desktop/src-tauri/tauri.conf.json` — Tauri window config, permissions, bundle targets
- `apps/desktop/tailwind.config.ts` — Tailwind content paths covering app + packages/ui
- `apps/desktop/postcss.config.js` — PostCSS with Tailwind + Autoprefixer

**TypeScript:**
- Strict mode enabled in all packages (individual `tsconfig.json` per package)
- Root `tsconfig.json` at each package; no shared root config

## Platform Requirements

**Development:**
- macOS (primary; app uses macOS-specific tools: `diskutil`, `df -Pk`, FSEvents, `/Volumes/`)
- Rust toolchain + Cargo
- Node.js + pnpm 10.11.0 (via corepack)
- Tauri CLI (`@tauri-apps/cli` 2.8)

**Production:**
- macOS desktop app distributed as `.app` bundle / `.dmg` (Tauri `bundle: { targets: "all" }`)
- Bundle category: `Business`
- App identifier: `com.driveprojectcatalog.app`
- Window: 1440×960 default, 1180×760 minimum, native title bar overlay style (`hiddenTitle: true`)

---

*Stack analysis: 2026-05-02*
