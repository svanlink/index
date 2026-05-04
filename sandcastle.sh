#!/bin/bash
# sandcastle.sh — Parallel AFK agent runner using git worktrees
#
# Finds open issues whose blockers are all done (or empty), runs multiple
# Ralph agents simultaneously in isolated git worktrees, then merges.
#
# Usage:
#   ./sandcastle.sh             # Auto-detect runnable issues, run them
#   ./sandcastle.sh --dry-run   # Show what would run without executing

set -e
cd "$(dirname "$0")" || exit 1

ISSUES_DIR=".planning/issues"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKTREES_DIR="$SCRIPT_DIR/.planning/worktrees"
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

# Strip YAML frontmatter from ralph.md so the prompt doesn't start with ---
RALPH_COMMAND=$(awk 'BEGIN{in_fm=0; done=0} done{print; next} /^---$/{if(in_fm){done=1}else{in_fm=1}; next} !in_fm{print}' .claude/commands/ralph.md)

# Helper: check if an issue ID is marked done
is_done() {
  local id="$1"
  local file
  file=$(find "$ISSUES_DIR" -name "${id}-*.md" -not -name "TEMPLATE.md" 2>/dev/null | head -1)
  [ -z "$file" ] && file=$(find "$ISSUES_DIR" -name "0${id}-*.md" 2>/dev/null | head -1)
  if [ -z "$file" ]; then return 1; fi
  grep -q "status: done" "$file" 2>/dev/null
}

# Helper: check if all blockers for a file are done
blockers_resolved() {
  local file="$1"
  local blocked_by
  blocked_by=$(grep "^blocked_by:" "$file" | sed 's/blocked_by: //' | tr -d '[]' | tr ',' ' ')
  # Empty or only whitespace → no blockers → resolved
  if [ -z "$(echo "$blocked_by" | tr -d ' ')" ]; then return 0; fi
  for id in $blocked_by; do
    id=$(echo "$id" | tr -d ' ')
    [ -z "$id" ] && continue
    if ! is_done "$id"; then return 1; fi
  done
  return 0
}

# Find all open issues with all blockers resolved
PARALLEL_ISSUES=()
if [ -d "$ISSUES_DIR" ]; then
  while IFS= read -r -d '' file; do
    if grep -q "status: open" "$file" 2>/dev/null; then
      if blockers_resolved "$file"; then
        ISSUE_ID=$(grep "^id:" "$file" | awk '{print $2}' | tr -d '"')
        PARALLEL_ISSUES+=("$ISSUE_ID:$file")
      fi
    fi
  done < <(find "$ISSUES_DIR" -name "*.md" -not -name "TEMPLATE.md" -print0 | sort -z)
fi

if [ ${#PARALLEL_ISSUES[@]} -eq 0 ]; then
  echo "No runnable issues found (all have unresolved blockers or none open)."
  echo "Run ./ralph.sh to work through sequential issues first."
  exit 0
fi

echo "Runnable issues: ${#PARALLEL_ISSUES[@]}"
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
  ISSUE_CONTENT=$(cat "$FILE")
  RECENT_COMMITS=$(git log --oneline -5 2>/dev/null || echo "")

  echo "--- Starting agent for issue $ISSUE_ID on branch $BRANCH ---"

  # Create worktree
  if git worktree list | grep -q "$WORKTREE_PATH"; then
    echo "  Worktree exists, removing..."
    git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || true
  fi
  # Delete branch if it already exists
  git branch -D "$BRANCH" 2>/dev/null || true
  git worktree add "$WORKTREE_PATH" -b "$BRANCH"

  BRANCHES+=("$BRANCH:$WORKTREE_PATH")

  # Build ralph prompt — starts with # header (not ---) so CLI doesn't choke
  PROMPT="# Ralph — AFK Implementer (issue $ISSUE_ID)

$RALPH_COMMAND

## Target issue: $ISSUE_ID (work on this one only)

=== $(basename "$FILE") ===
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
echo "Next: run ./ralph.sh for sequential issues, then ./review.sh"
