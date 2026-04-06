#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

release_tag="${1:-}"

if [[ -z "$release_tag" ]]; then
  printf 'Usage: ./scripts/check-release-candidate.sh <tag>\n'
  printf 'Example: ./scripts/check-release-candidate.sh v1.0.0-rc1\n'
  exit 1
fi

if [[ ! "$release_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-rc[0-9]+)?$ ]]; then
  printf '[error] Invalid release tag format: %s\n' "$release_tag"
  printf 'Expected formats like v1.0.0-rc1 or v1.0.0\n'
  exit 1
fi

root_version="$(node -p "require('${repo_root}/package.json').version")"
desktop_version="$(node -p "require('${repo_root}/apps/desktop/package.json').version")"
tauri_version="$(
  node -p "JSON.parse(require('node:fs').readFileSync('${repo_root}/apps/desktop/src-tauri/tauri.conf.json', 'utf8')).version"
)"

expected_version="${release_tag#v}"

printf 'Drive Project Catalog release candidate preflight\n'
printf '%s\n\n' '==============================================='

printf '[info] Requested tag: %s\n' "$release_tag"
printf '[info] Expected version from tag: %s\n\n' "$expected_version"

printf 'Version consistency\n'
printf '%s\n' '-------------------'
printf '[info] root package version: %s\n' "$root_version"
printf '[info] desktop package version: %s\n' "$desktop_version"
printf '[info] tauri config version: %s\n' "$tauri_version"

if [[ "$root_version" != "$desktop_version" || "$root_version" != "$tauri_version" ]]; then
  printf '\n[error] Version mismatch detected across repo metadata.\n'
  exit 1
fi

if [[ "$root_version" != "$expected_version" ]]; then
  printf '\n[error] Version %s does not match tag %s.\n' "$root_version" "$release_tag"
  exit 1
fi

printf '\n[ok] Repo version metadata matches the requested tag.\n'

printf '\nRequired operator files\n'
printf '%s\n' '-----------------------'

required_files=(
  "README.md"
  "RELEASE_DESKTOP.md"
  "MACOS_RELEASE_OPERATIONS.md"
  "RELEASE_NOTES_TEMPLATE.md"
  ".env.release.example"
  "scripts/check-macos-release-env.sh"
)

for relative_path in "${required_files[@]}"; do
  absolute_path="${repo_root}/${relative_path}"
  if [[ -f "$absolute_path" ]]; then
    printf '[ok] %s\n' "$relative_path"
  else
    printf '[error] Missing required file: %s\n' "$relative_path"
    exit 1
  fi
done

printf '\nExpected release artifacts after build\n'
printf '%s\n' '-------------------------------------'
printf '%s\n' "apps/desktop/src-tauri/target/release/bundle/macos/Drive Project Catalog.app"
printf '%s\n' "apps/desktop/src-tauri/target/release/bundle/dmg/Drive Project Catalog_${expected_version}_aarch64.dmg"

printf '\nRecommended release command sequence\n'
printf '%s\n' '----------------------------------'
printf '%s\n' "corepack pnpm install"
printf '%s\n' "corepack pnpm test"
printf '%s\n' "corepack pnpm typecheck"
printf '%s\n' "corepack pnpm build:web"
printf '%s\n' "corepack pnpm build:desktop"
printf '%s\n' "./scripts/check-macos-release-env.sh"

printf '\n[ok] Release-candidate repo checks passed for %s.\n' "$release_tag"
