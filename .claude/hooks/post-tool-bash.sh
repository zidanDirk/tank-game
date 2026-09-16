#!/usr/bin/env bash
# .claude/hooks/post-tool-bash.sh
# Fires after every Bash tool invocation. Recognises the loop's npm scripts and
# advances state.json accordingly.
set -euo pipefail

input="$(cat)"
cmd=$(echo "$input" | jq -r '.tool_input.command // ""')
exit_code=$(echo "$input" | jq -r '.tool_result.exit_code // 0')

REPO="$(git rev-parse --show-toplevel)"
STATE="$REPO/scripts/loop/state.json"
LOG_DIR="$REPO/scripts/loop/journal/auto"
mkdir -p "$LOG_DIR"

ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
day=$(date -u +"%Y-%m-%d")

case "$cmd" in
  *"npm run loop:commit"*)
    tmp=$(mktemp)
    if [ "$exit_code" = "0" ]; then
      jq --arg ts "$ts" '.last_completed_at=$ts | .next_action="run_loop_next"' "$STATE" > "$tmp"
      echo "[$ts] loop:commit ok -> next_action=run_loop_next" >> "$LOG_DIR/$day.log"
    else
      jq --arg ts "$ts" '.needs_human=true' "$STATE" > "$tmp"
      echo "[$ts] loop:commit FAIL exit=$exit_code -> needs_human=true" >> "$LOG_DIR/$day.log"
    fi
    mv "$tmp" "$STATE"
    ;;
  *"npm run loop:verify"*)
    if [ "$exit_code" != "0" ]; then
      tmp=$(mktemp)
      jq '.needs_human=true' "$STATE" > "$tmp"
      mv "$tmp" "$STATE"
      echo "[$ts] loop:verify FAIL exit=$exit_code -> needs_human=true" >> "$LOG_DIR/$day.log"
    fi
    ;;
esac

exit 0