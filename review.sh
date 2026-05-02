#!/bin/bash
# review.sh — Post-implementation reviewer
#
# Runs /review-impl in a fresh context over recent commits.
# Always run this after ralph.sh or sandcastle.sh completes.
#
# Usage:
#   ./review.sh          # Review last 1 commit
#   ./review.sh 5        # Review last N commits

set -e
cd "$(dirname "$0")" || exit 1

N="${1:-1}"
REVIEW_COMMAND=$(cat .claude/commands/review-impl.md)

echo "=== Review: last $N commit(s) ==="
echo ""

# Show what we're reviewing
git log --oneline -"$N"
echo ""

RECENT_DIFF=$(git diff HEAD~"$N"..HEAD 2>/dev/null || echo "")
RECENT_LOG=$(git log --oneline -"$N")

PROMPT="$REVIEW_COMMAND

## Commits to review
$RECENT_LOG

## Diff
\`\`\`diff
$RECENT_DIFF
\`\`\`

Review these $N commit(s). Use $N as the value for commits to review."

claude -p "$PROMPT"
