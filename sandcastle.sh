#!/bin/bash
# sandcastle.sh — Parallel AFK agent runner using git worktrees
#
# For issues with no blocking relationships (blocked_by: []), runs multiple
# Ralph agents simultaneously in isolated git worktrees, then merges.
#
# Usage:
#   ./sandcastle.sh             # Auto-detect parallelizable issues, run them
#   ./sandcastle.sh --dry-run   # Show what would run without executing

set -e
cd "$(dirname "$0")" || exit 1

ISSUES_DIR=".planning/issues"
WORKTREES_DIR=".planning/worktrees"
DRY_RUN=false
BASE_BRANCH=$(git branch --show-current)

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "=== Sandcastle parallel runner ==="
echo "Base branch: $BASE_BRANCH"
echo "Dry run: $DRY_RUN"
echo ""

# Find all open issues with no blockers (blocked_by: [])
PARALLEL_ISSUES=()
if [ -d "$ISSUES_DIR" ]; then
  while IFS= read -r -d '' file; do
    if grep -q "status: open" "$file" 2>/dev/null; then
      # Check if blocked_by is empty: blocked_by: []
      if grep -q "blocked_by: \[\]" "$file" 2>/dev/null; then
        ISSUE_ID=$(grep "^id:" "$file" | awk '{print $2}' | tr -d '"')
        PARALLEL_ISSUES+=("$ISSUE_ID:$file")
      fi
    fi
  done < <(find "$ISSUES_DIR" -name "*.md" -not -name "TEMPLATE.md" -print0 | sort -z)
fi

if [ ${#PARALLEL_ISSUES[@]} -eq 0 ]; then
  echo "No parallelizable issues found (all have blockers)."
  echo "Run ./ralph.sh to work through sequential issues first."
  exit 0
fi

echo "Parallelizable issues: ${#PARALLEL_ISSUES[@]}"
for entry in "${PARALLEL_ISSUES[@]}"; do
  ISSUE_ID="${entry%%:*}"
  FILE="${entry##*:}"
  TITLE=$(grep "^title:" "$FILE" | sed 's/title: //')
  echo "  [$ISSUE_ID] $TITLE"
done
echo ""

if $DRY_RUN; then
  echo "Dry run — exiting without execution."
  exit 0
fi

# Ensure worktrees dir exists
mkdir -p "$WORKTREES_DIR"

# Collect worktree branch names for merging later
BRANCHES=()
PIDS=()

for entry in "${PARALLEL_ISSUES[@]}"; do
  ISSUE_ID="${entry%%:*}"
  FILE="${entry##*:}"
  BRANCH="impl/issue-${ISSUE_ID}"
  WORKTREE_PATH="$WORKTREES_DIR/issue-${ISSUE_ID}"

  echo "--- Starting agent for issue $ISSUE_ID on branch $BRANCH ---"

  # Create worktree
  if git worktree list | grep -q "$WORKTREE_PATH"; then
    echo "  Worktree exists, removing..."
    git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || true
  fi
  git worktree add "$WORKTREE_PATH" -b "$BRANCH" 2>/dev/null || \
    git worktree add "$WORKTREE_PATH" "$BRANCH" 2>/dev/null

  BRANCHES+=("$BRANCH:$WORKTREE_PATH")

  # Build ralph prompt for this specific issue
  RALPH_COMMAND=$(cat .claude/commands/ralph.md)
  ISSUE_CONTENT=$(cat "$FILE")
  RECENT_COMMITS=$(git log --oneline -5 2>/dev/null || echo "")

  PROMPT="$RALPH_COMMAND

## Target issue: $ISSUE_ID (work on this one only)

--- $(basename "$FILE") ---
$ISSUE_CONTENT

## Recent commits (context)
$RECENT_COMMITS"

  # Run claude in the worktree (background process)
  (
    cd "$WORKTREE_PATH"
    claude --permission-mode acceptEdits -p "$PROMPT" > "$WORKTREES_DIR/issue-${ISSUE_ID}.log" 2>&1
    echo "Agent $ISSUE_ID done" >> "$WORKTREES_DIR/issue-${ISSUE_ID}.log"
  ) &
  PIDS+=($!)
  echo "  Agent PID: $!"
done

echo ""
echo "All agents running. Waiting for completion..."
echo "Logs: $WORKTREES_DIR/issue-*.log"
echo ""

# Wait for all agents to finish
for PID in "${PIDS[@]}"; do
  wait "$PID" && echo "PID $PID finished" || echo "PID $PID failed (check logs)"
done

echo ""
echo "=== All agents complete. Merging branches ==="

# Merge each branch back
MERGE_FAILURES=()
for entry in "${BRANCHES[@]}"; do
  BRANCH="${entry%%:*}"
  WORKTREE_PATH="${entry##*:}"
  ISSUE_ID="${BRANCH##*/issue-}"

  echo "Merging $BRANCH..."
  if git merge "$BRANCH" --no-ff -m "feat: merge issue $ISSUE_ID (parallel implementation)"; then
    echo "  Merged OK"
    # Clean up worktree
    git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || true
    git branch -d "$BRANCH" 2>/dev/null || true
  else
    echo "  MERGE CONFLICT — resolve manually"
    MERGE_FAILURES+=("$BRANCH")
  fi
done

echo ""
if [ ${#MERGE_FAILURES[@]} -gt 0 ]; then
  echo "Merge failures (resolve manually):"
  for branch in "${MERGE_FAILURES[@]}"; do
    echo "  $branch"
  done
  echo ""
  echo "After resolving: git merge --continue"
else
  echo "All branches merged clean."
fi

echo ""
echo "Next: run /review-impl to review all merged commits"
