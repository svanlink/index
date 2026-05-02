# External Integrations

**Analysis Date:** 2026-05-02

## APIs & External Services

**Cloud Sync (optional):**
- Supabase — remote sync backend for catalog data; accessed via raw PostgREST HTTP API (no Supabase JS SDK dependency)
  - Client: custom `SupabaseSyncAdapter` in `packages/data/src/supabaseSyncAdapter.ts`
  - Auth: `VITE_SUPABASE_ANON_KEY` env var passed as `Authorization: Bearer` header
  - URL: `VITE_SUPABASE_URL` env var
  - Schema: `VITE_SUPABASE_SCHEMA` env var (optional, defaults to `public`)
  - Sync is optional — app runs fully local when vars are absent or placeholder values

**macOS System Commands (Rust, no network):**
- `diskutil info <path>` — queried via `std::process::Command` to obtain filesystem type, volume name, and UUID for drive import; see `apps/desktop/src-tauri/src/volume_info.rs`
- `df -Pk <path>` — queried via `std::process::Command` to obtain total/free bytes; same file

## Data Storage

**Databases:**
- SQLite — embedded, local-only, single-file database
  - File path: `sqlite:drive-project-catalog.db` (in Tauri app data dir)
  - Rust client: vendored `tauri-plugin-sql` + `sqlx` (patched: `max_connections=1`, WAL journal mode, `busy_timeout` for multi-statement transaction safety)
  - TypeScript client: `@tauri-apps/plugin-sql` 2.2 loaded dynamically via `createTauriSqliteDatabaseLoader()` in `apps/desktop/src/app/tauriSqliteDatabase.ts`
  - Tables: `drives`, `projects`, `scans`, `projectScanEvents`, `scanSessions`, sync queue tables
  - In-memory fallback: `InMemoryLocalPersistence` used in test/non-Tauri environments (detected via `window.__TAURI_INTERNALS__`)

**File Storage:**
- None — app indexes folder metadata from the local filesystem but does not store files

**Caching:**
- None — no explicit cache layer; repository data is loaded on demand and held in React state

## Authentication & Identity

**Auth Provider:**
- None dedicated — Supabase anon key provides public read/write access to the project's PostgREST tables
- No user login flow; the app is single-user local-first

## Monitoring & Observability

**Error Tracking:**
- None — no Sentry or equivalent

**Logs:**
- `tauri-plugin-log` 2.8 — unified log pipeline
  - Rust: `log` crate macros (`info!`, `warn!`, `error!`) forwarded via plugin
  - Frontend: `appLogging.ts` (`apps/desktop/src/app/appLogging.ts`) patches `console.*` methods to forward all console output to `@tauri-apps/plugin-log`
  - Output targets: stdout + log file in macOS app log directory (named `Catalog`)
  - Minimum level: `Info`

## CI/CD & Deployment

**Hosting:**
- macOS desktop app — distributed as native `.app` bundle
- No cloud hosting or server-side deployment

**CI Pipeline:**
- Not detected (no GitHub Actions, Buildkite, or similar config files found)
- Release scripts present: `scripts/check-macos-release-env.sh`, `scripts/check-release-candidate.sh`

## Environment Configuration

**Required env vars (Supabase sync — optional feature):**
- `VITE_SUPABASE_URL` — full HTTPS Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key (min 20 chars)

**Optional env vars:**
- `VITE_SUPABASE_SCHEMA` — Supabase schema name (defaults to `public`)

**Secrets location:**
- `.env` file at repo root (gitignored; see `.env.example` for structure)
- Validation + diagnostics logic in `apps/desktop/src/app/syncConfig.ts`; gracefully disables sync for missing/placeholder/invalid values without crashing

## Webhooks & Callbacks

**Incoming:**
- None — no HTTP server or webhook endpoints

**Outgoing:**
- None — Supabase sync uses polling pull/push, not webhooks

## Native Platform Events

**Volume mount detection:**
- Rust `notify` crate (FSEvents on macOS) watches `/Volumes/` for new volume mounts
- Rust emits `volume-mounted` Tauri event with `{ volumeName, volumePath, folderCount, detectedAt }` payload
- Frontend listens via `useVolumeMountedListener` hook (`apps/desktop/src/app/useVolumeMountedListener.ts`) and navigates to the Drives page with mount context in URL query params
- Rust also fires a macOS native notification (`tauri-plugin-notification`) when a new volume is detected

**Native file system access:**
- `tauri-plugin-dialog` — native macOS folder picker; used in scan (`apps/desktop/src/app/scanCommands.ts`) and volume import (`apps/desktop/src/app/volumeImportCommands.ts`) flows
- `tauri-plugin-opener` — reveals project folders in Finder (`revealItemInDir`) and opens paths in the default app; used in `apps/desktop/src/app/nativeContextMenu.ts`

## IPC Bridge (Tauri Commands)

Rust commands registered in `apps/desktop/src-tauri/src/lib.rs` and callable from TypeScript via `invoke()`:

| Command | File | Purpose |
|---------|------|---------|
| `app_info` | `lib.rs` | Returns app name/surface/phase metadata |
| `start_scan` | `scan_engine.rs` | Starts a background filesystem scan session |
| `cancel_scan` | `scan_engine.rs` | Cancels a running scan by ID |
| `get_scan_snapshot` | `scan_engine.rs` | Polls current snapshot for a scan ID |
| `list_scan_snapshots` | `scan_engine.rs` | Lists all scan sessions |
| `get_volume_info` | `volume_info.rs` | Returns filesystem/disk info via diskutil + df |
| `enumerate_volume_folders` | `volume_import.rs` | Lists immediate child directories of a path |

---

*Integration audit: 2026-05-02*
