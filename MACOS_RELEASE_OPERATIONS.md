# macOS Signing and Release Operations

This document prepares the repository for a real signed macOS release of Drive Project Catalog without hardcoding secrets or pretending signing can be fully tested in-repo.

## What is ready inside the repo

- Tauri desktop bundle metadata
- product name and identifier
- icon wiring
- local-first runtime behavior
- optional sync env guidance
- release artifact expectations
- operator checklists and preflight validation script

## What still remains outside the repo

- Apple Developer Program membership
- Developer ID Application certificate
- notarization-capable Apple account setup
- CI secret storage or secure operator machine configuration
- final code signing execution
- notarization submission and stapling

## Required signing and notarization inputs

Typical values:

- `APPLE_SIGNING_IDENTITY`
- `APPLE_TEAM_ID`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`

Optional certificate-import flow for CI:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`

Optional packaged-build sync inputs:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_SCHEMA`

See [.env.release.example](/Users/vaneickelen/Desktop/01%20-%20Projects/Index/.env.release.example) for a safe template.

## Conservative macOS release flow

1. Start from a tagged, verified release branch or milestone.
2. Run:

```bash
corepack pnpm install
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build:web
corepack pnpm build:desktop
```

3. Run the release preflight:

```bash
./scripts/check-macos-release-env.sh
```

4. Confirm expected artifacts:

- `apps/desktop/src-tauri/target/release/bundle/macos/Drive Project Catalog.app`
- `apps/desktop/src-tauri/target/release/bundle/dmg/Drive Project Catalog_<version>_aarch64.dmg`

5. Smoke test the packaged `.app` locally.
6. Sign the `.app` on the release machine or in CI.
7. Submit for notarization.
8. Staple the notarization ticket.
9. Re-open the final `.app` and `.dmg` to verify Gatekeeper acceptance.
10. Archive the exact artifact, tag, and release notes together.

## Entitlements and capabilities review

Current desktop behavior includes:

- local SQLite persistence
- native folder picker
- read-only local scanning

This does not currently imply a broad custom entitlement profile in-repo. Before public distribution, review whether any signing profile or entitlements file is required for your chosen distribution method.

Questions to review before signed release:

- Are you distributing outside the Mac App Store via Developer ID?
- Does your CI or operator machine need certificate import support?
- Do you need a custom entitlements file for your notarized distribution policy?
- Do you want an automated signing/notarization lane later?

## Versioning expectations

- Git tags remain the source of release milestones.
- Tauri/Cargo/package versions should be intentionally bumped as part of a formal release cut.
- Do not rely on milestone tags alone as the long-term app versioning process.

## What still blocks true v1 distribution

- signed and notarized macOS release lane
- formal version bump/release numbering workflow
- final release notes process
- optional CI automation for signing and notarization
- broader QA across multiple macOS machines
