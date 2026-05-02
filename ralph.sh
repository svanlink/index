#!/bin/bash
# ralph.sh — AFK implementation loop
#
# Runs the Ralph implementer in a loop until all open issues are done.
# Each pass: picks next issue → implements with TDD → runs feedback loops → commits → marks done.
#
# Usage:
#   ./ralph.sh              # Run until all done
#   ./ralph.sh --max 3      # Run at most 3 passes
#   ./ralph.sh --issue 02   # Work on a specific issue only

set -e
cd "$(dirname "$0")" || exit 1

ISSUES_DIR=".planning/issues"
MAX_PASSES=20  # Safety ceiling — prevents infinite loops
TARGET_ISSUE=""

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --max) MAX_PASSES="$2"; shift 2 ;;
    --issue) TARGET_ISSUE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

PASS=0
START_TIME=$(date +%s)

echo "=== Ralph AFK loop ==="
echo "Max passes: $MAX_PASSES"
echo "Issues dir: $ISSUES_DIR"
echo "Started: $(date)"
echo ""

while [ $PASS -lt $MAX_PASSES ]; do
  PASS=$((PASS + 1))
  echo "--- Pass $PASS / $MAX_PASSES ---"

  # Count open issues
  OPEN_COUNT=0
  OPEN_ISSUES=""
  if [ -d "$ISSUES_DIR" ]; then
    while IFS= read -r -d '' file; do
      if grep -q "status: open" "$file" 2>/dev/null; then
        OPEN_COUNT=$((OPEN_COUNT + 1))
        OPEN_ISSUES="$OPEN_ISSUES

--- $(basename "$file") ---
$(cat "$file")"
      fi
    done < <(find "$ISSUES_DIR" -name "*.md" -not -name "TEMPLATE.md" -print0 | sort -z)
  fi

  if [ $OPEN_COUNT -eq 0 ]; then
    echo "All issues complete. Loop done."
    break
  fi

  echo "Open issues: $OPEN_COUNT"

  # Get recent commits
  RECENT_COMMITS=$(git log --oneline -5 2>/dev/null || echo "no git history")

  # Build prompt
  RALPH_COMMAND=$(cat .claude/commands/ralph.md)
  PROMPT="$RALPH_COMMAND

## Open issues
$OPEN_ISSUES

## Recent commits (context)
$RECENT_COMMITS"

  if [ -n "$TARGET_ISSUE" ]; then
    PROMPT="$PROMPT

## Override: work on issue $TARGET_ISSUE only"
  fi

  # Run one implementation pass
  OUTPUT=$(claude --permission-mode acceptEdits -p "$PROMPT" 2>&1)
  echo "$OUTPUT"

  # Check for completion signal
  if echo "$OUTPUT" | grep -q "NO_MORE_TASKS"; then
    echo ""
    echo "Ralph: no more tasks signal received. Loop complete."
    break
  fi

  # Small pause between passes
  sleep 3
done

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
MINUTES=$((ELAPSED / 60))
SECONDS=$((ELAPSED % 60))

echo ""
echo "=== Ralph complete ==="
echo "Passes: $PASS"
echo "Time: ${MINUTES}m ${SECONDS}s"
echo ""
echo "Next: run ./review.sh to review all commits from this session"
