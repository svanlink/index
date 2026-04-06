#!/usr/bin/env bash
set -euo pipefail

required_vars=(
  APPLE_SIGNING_IDENTITY
  APPLE_TEAM_ID
  APPLE_ID
  APPLE_APP_SPECIFIC_PASSWORD
)

optional_vars=(
  APPLE_CERTIFICATE
  APPLE_CERTIFICATE_PASSWORD
  VITE_SUPABASE_URL
  VITE_SUPABASE_ANON_KEY
  VITE_SUPABASE_SCHEMA
)

missing_required=()

printf 'Drive Project Catalog macOS release preflight\n'
printf '%s\n\n' '============================================'

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    missing_required+=("$var_name")
  else
    printf '[ok] %s is set\n' "$var_name"
  fi
done

printf '\nOptional variables\n'
printf '%s\n' '------------------'
for var_name in "${optional_vars[@]}"; do
  if [[ -n "${!var_name:-}" ]]; then
    printf '[ok] %s is set\n' "$var_name"
  else
    printf '[info] %s is not set\n' "$var_name"
  fi
done

printf '\nExpected release artifacts after build\n'
printf '%s\n' '-------------------------------------'
printf '%s\n' "apps/desktop/src-tauri/target/release/bundle/macos/Drive Project Catalog.app"
printf '%s\n' "apps/desktop/src-tauri/target/release/bundle/dmg/Drive Project Catalog_<version>_aarch64.dmg"

if (( ${#missing_required[@]} > 0 )); then
  printf '\n[error] Missing required signing/notarization variables:\n'
  for var_name in "${missing_required[@]}"; do
    printf ' - %s\n' "$var_name"
  done
  printf '\nSee .env.release.example and MACOS_RELEASE_OPERATIONS.md before attempting a signed release.\n'
  exit 1
fi

printf '\n[ok] Required signing/notarization variables are present.\n'
printf 'Next steps: run build, smoke test the packaged app, sign, notarize, and staple on the release machine.\n'
