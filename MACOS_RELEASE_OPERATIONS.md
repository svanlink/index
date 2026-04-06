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
2. Align the app version in:
   - `package.json`
   - `apps/desktop/package.json`
   - `apps/desktop/src-tauri/Cargo.toml`
   - `apps/desktop/src-tauri/tauri.conf.json`
3. Validate release candidate metadata:

```bash
corepack pnpm release:check:rc v1.0.0-rc1
```

4. Run:

```bash
corepack pnpm install
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build:web
corepack pnpm build:desktop
```

5. Run the release preflight:

```bash
./scripts/check-macos-release-env.sh
```

6. Confirm expected artifacts:

- `apps/desktop/src-tauri/target/release/bundle/macos/Drive Project Catalog.app`
- `apps/desktop/src-tauri/target/release/bundle/dmg/Drive Project Catalog_<version>_aarch64.dmg`

7. Smoke test the packaged `.app` locally.
8. Sign the `.app` on the release machine or in CI.
9. Submit for notarization.
10. Staple the notarization ticket.
11. Re-open the final `.app` and `.dmg` to verify Gatekeeper acceptance.
12. Validate the final signed build on a clean macOS machine with no local dev context.
13. Archive the exact artifact, tag, and release notes together.

## Final operator runbook

Use this order during a real release candidate or final release:

1. Prepare release env vars and signing credentials.
2. Run `corepack pnpm release:check:rc <tag>`.
3. Run `corepack pnpm release:check:macos`.
4. Build the desktop bundle.
5. Launch the packaged `.app`.
6. Verify first run with:
   - no Supabase config
   - offline mode
   - SQLite initialization
   - scan shell visibility
   - sync disabled or enabled state clarity
7. Sign the app.
8. Notarize the build.
9. Staple the final deliverables.
10. Validate on a clean machine.
11. Publish notes and artifacts under the exact release tag.

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
- Release candidates should be tagged before final release promotion so the signed artifacts can always be tied back to a concrete git state.
- Keep release notes next to the exact signed artifacts for operator traceability.

## What must still happen outside the repo

- Install and trust the Developer ID Application certificate on the release machine or CI runner.
- Store Apple credentials and any certificate secrets in a secure environment.
- Run the actual `codesign`, notarization submission, stapling, and Gatekeeper validation steps.
- Optionally prepare CI secret storage and secure keychain handling if the release process moves off a single operator machine.

## What still blocks true v1 distribution

- signed and notarized macOS release lane
- formal version bump/release numbering workflow
- final release notes process
- optional CI automation for signing and notarization
- broader QA across multiple macOS machines
