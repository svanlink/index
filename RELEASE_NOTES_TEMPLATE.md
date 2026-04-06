# Drive Project Catalog Release Notes Template

Use this template for tagged desktop release candidates and signed releases.

## Release

- Version:
- Git tag:
- Release date:
- Branch or milestone:
- Signed release operator:

## Included in this release

- Desktop packaging/build changes:
- Local-first persistence changes:
- Scan workflow changes:
- Sync changes:
- UI/product usability changes:

## Operator verification summary

- `corepack pnpm test`
- `corepack pnpm typecheck`
- `corepack pnpm build:web`
- `corepack pnpm build:desktop`
- `corepack pnpm release:check:macos`
- `corepack pnpm release:check:rc <tag>`
- Clean machine validation completed:

## macOS artifact details

- `.app` path:
- `.dmg` path:
- SHA256:
- Signed:
- Notarized:
- Stapled:

## Known limitations

- 

## Follow-up work

- 
