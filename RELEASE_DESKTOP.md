# Desktop Release Guide

This document is the conservative release checklist for the Tauri desktop build of Drive Project Catalog.

## In-repo readiness

Before creating a distributable build, verify:

```bash
corepack pnpm install
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build:web
corepack pnpm build:desktop
corepack pnpm release:check:macos
```

Expected macOS artifacts:

- `apps/desktop/src-tauri/target/release/bundle/macos/Drive Project Catalog.app`
- `apps/desktop/src-tauri/target/release/bundle/dmg/Drive Project Catalog_<version>_aarch64.dmg`

## Environment expectations

The desktop app is fully usable without cloud sync.

If you want sync enabled in a packaged build, provide these values at build time:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Optional:

- `VITE_SUPABASE_SCHEMA`

If these values are missing or invalid, the packaged app remains local-first and the sync surfaces explain that cloud transport is disabled.

## Packaged desktop behavior to verify

Run the packaged `.app` and verify:

1. First launch with no config still opens cleanly.
2. Local SQLite initializes and data persists across restart.
3. Manual scan works in packaged mode.
4. Scan history renders with no sessions and with existing sessions.
5. Storage planning renders with no drives and with real drives.
6. Sync surfaces explain disabled state when config is absent.
7. Sync failure leaves queue items retryable.

## macOS signing and notarization inputs

For the fuller operator process, see [MACOS_RELEASE_OPERATIONS.md](/Users/vaneickelen/Desktop/01%20-%20Projects/Index/MACOS_RELEASE_OPERATIONS.md).

These steps remain manual and must be completed outside the repo:

- Apple Developer account with Developer ID Application certificate
- Apple notarization credentials
- Final release bundle signing identity
- Release operator machine configured for Apple signing tools

Typical values you will need:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

Exact CI or local secret handling is intentionally not hardcoded in this repo yet.

You can use [.env.release.example](/Users/vaneickelen/Desktop/01%20-%20Projects/Index/.env.release.example) as a safe template for local or CI secret setup.

## Notes on entitlements and capabilities

Current app behavior uses:

- local SQLite
- local scan reads
- native folder picker

No special macOS entitlement file is committed yet because the current desktop behavior does not require a broader sandbox profile. If distribution channel requirements change, review entitlements before shipping.

## Release operator checklist

1. Verify the branch/tag you are packaging.
2. Confirm `tauri.conf.json` product name, identifier, and icons are correct.
3. Build the desktop bundle from a clean working tree.
4. Run `corepack pnpm release:check:macos`.
5. Smoke test the packaged app on macOS.
6. Sign and notarize outside the repo workflow.
7. Archive the exact build artifact and release notes together.
