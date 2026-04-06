# Desktop Release Guide

This document now covers the desktop app as a local or personal-use build. Public distribution should currently use the web deployment path instead of a signed macOS release.

For the recommended public release path, see [WEB_RELEASE.md](/Users/vaneickelen/Desktop/01%20-%20Projects/Index/WEB_RELEASE.md).

## Current desktop position

- Desktop packaging is ready for local/internal use.
- Signed and notarized public macOS distribution is postponed.
- The desktop app remains the place where scan commands and local SQLite behavior are available.

## In-repo readiness

Before creating a distributable build, verify:

```bash
corepack pnpm install
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build:web
corepack pnpm build:desktop
corepack pnpm release:check:macos
corepack pnpm release:check:rc v1.0.0-rc1
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

## Future macOS signing and notarization inputs

For the fuller operator process, see [MACOS_RELEASE_OPERATIONS.md](/Users/vaneickelen/Desktop/01%20-%20Projects/Index/MACOS_RELEASE_OPERATIONS.md).

These steps are future/optional and remain manual outside the repo:

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

1. Verify the branch, milestone branch, and intended tag you are packaging.
2. Bump and align the version in:
   - `package.json`
   - `apps/desktop/package.json`
   - `apps/desktop/src-tauri/Cargo.toml`
   - `apps/desktop/src-tauri/tauri.conf.json`
3. Run `corepack pnpm release:check:rc <tag>` and confirm the version matches the intended release candidate or final tag.
4. Confirm `tauri.conf.json` product name, identifier, and icons are correct.
5. Prepare release environment variables from [.env.release.example](/Users/vaneickelen/Desktop/01%20-%20Projects/Index/.env.release.example).
6. Run `corepack pnpm release:check:macos`.
7. Build the desktop bundle from a clean working tree.
8. Smoke test the packaged app on the release machine.
9. Sign the `.app`.
10. Submit for notarization.
11. Staple the notarization ticket to the final app and distributable archive if applicable.
12. Validate the signed and stapled build on a clean macOS machine.
13. Cut release notes from [RELEASE_NOTES_TEMPLATE.md](/Users/vaneickelen/Desktop/01%20-%20Projects/Index/RELEASE_NOTES_TEMPLATE.md).
14. Archive the exact build artifact, notes, and final tag together.

## Artifact naming and release expectations

- macOS artifacts should be archived alongside the exact tag they were built from.
- The `.dmg` name should reflect the Tauri version at build time, for example `Drive Project Catalog_1.0.0-rc1_aarch64.dmg`.
- Release candidates should use tags like `v1.0.0-rc1`.
- Final releases should use tags like `v1.0.0`.
- Release notes should explicitly record whether the `.app` and `.dmg` were signed, notarized, and stapled.

## Free release recommendation

If you want a shareable public release today, deploy the web build instead of the packaged macOS app:

- run `corepack pnpm build:web`
- deploy `apps/desktop/dist`
- use [WEB_RELEASE.md](/Users/vaneickelen/Desktop/01%20-%20Projects/Index/WEB_RELEASE.md) for hosting guidance
