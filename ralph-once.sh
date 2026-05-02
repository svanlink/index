#!/bin/bash
# ralph-once.sh — Single-pass AFK implementer (human-in-the-loop version)
# Use this to test the loop or run one implementation pass manually.
# For the full autonomous loop, use ralph.sh

set -e
cd "$(dirname "$0")" || exit 1

ISSUES_DIR=".planning/issues"
TARGET_ISSUE="${1:-}"  # Optional: pass issue ID to target a specific one

# Gather all open issue files
OPEN_ISSUES=""
if [ -d "$ISSUES_DIR" ]; then
  while IFS= read -r -d '' file; do
    if grep -q "status: open" "$file" 2>/dev/null; then
      OPEN_ISSUES="$OPEN_ISSUES

--- $(basename "$file") ---
$(cat "$file")"
    fi
  done < <(find "$ISSUES_DIR" -name "*.md" -not -name "TEMPLATE.md" -print0 | sort -z)
fi

if [ -z "$OPEN_ISSUES" ]; then
  echo "No open issues found in $ISSUES_DIR"
  echo "Create issues with /prd first, or copy TEMPLATE.md"
  exit 0
fi

# Get recent commits for context
RECENT_COMMITS=$(git log --oneline -5 2>/dev/null || echo "no git history")

# Build the prompt
RALPH_COMMAND=$(cat .claude/commands/ralph.md)

PROMPT="$RALPH_COMMAND

## Open issues from $ISSUES_DIR
$OPEN_ISSUES

## Recent commits (for context)
$RECENT_COMMITS"

# If targeting a specific issue, add that instruction
if [ -n "$TARGET_ISSUE" ]; then
  PROMPT="$PROMPT

## Override: work on issue $TARGET_ISSUE specifically"
fi

echo "=== Ralph single pass ==="
echo "Open issues found: $(echo "$OPEN_ISSUES" | grep -c "status: open" || echo "?")"
echo "Starting implementation..."
echo ""

# Run claude with the ralph prompt
claude --permission-mode acceptEdits -p "$PROMPT"
