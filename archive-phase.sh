#!/bin/bash
# archive-phase.sh — Doc rot guard
#
# Moves completed planning docs to .planning/archive/ so they don't
# pollute future agent contexts with stale information.
#
# Run this when a GSD phase or PRD is complete.
#
# Usage:
#   ./archive-phase.sh phases/01-strip-dead-weight
#   ./archive-phase.sh issues/PRD-command-palette.md
#   ./archive-phase.sh issues/01-thin-vertical-slice.md

set -e
cd "$(dirname "$0")" || exit 1

TARGET="${1:-}"
ARCHIVE_DIR=".planning/archive"

if [ -z "$TARGET" ]; then
  echo "Usage: ./archive-phase.sh <path relative to .planning/>"
  echo ""
  echo "Examples:"
  echo "  ./archive-phase.sh phases/01-strip-dead-weight"
  echo "  ./archive-phase.sh issues/PRD-my-feature.md"
  echo "  ./archive-phase.sh issues/01-first-slice.md"
  exit 1
fi

SOURCE=".planning/$TARGET"

if [ ! -e "$SOURCE" ]; then
  echo "Not found: $SOURCE"
  exit 1
fi

mkdir -p "$ARCHIVE_DIR"

# Preserve directory structure inside archive
DEST="$ARCHIVE_DIR/$TARGET"
mkdir -p "$(dirname "$DEST")"

echo "Archiving: $SOURCE → $DEST"
mv "$SOURCE" "$DEST"

# Git track the move
git add "$ARCHIVE_DIR"
git rm -r "$SOURCE" 2>/dev/null || true

echo "Done."
echo ""
echo "Commit the archive:"
echo "  git commit -m 'chore: archive completed planning docs for $TARGET'"
