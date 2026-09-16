#!/usr/bin/env bash
# .claude/hooks/loop-post-cycle.sh
# Fires on Stop (main agent finished). Advances state.next_action based on the
# last cycle's verdict, and appends a one-line entry to the auto journal so the
# loop can be tail'd from outside Herdr.
set -euo pipefail
REPO="$(git rev-parse --show-toplevel)"
STATE="$REPO/scripts/loop/state.json"
LOG_DIR="$REPO/scripts/loop/journal/auto"
mkdir -p "$LOG_DIR"

ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
day=$(date -u +"%Y-%m-%d")

verdict=$(jq -r '.cycles[-1].verdict // "unknown"' "$STATE")
fir=$(jq -r '.failed_cycles_in_row // 0' "$STATE")

if [ "$verdict" = "pass" ]; then
  next="run_loop_next"
  fir=0
elif [ "$verdict" = "fail" ]; then
  next="needs_human"
  fir=$((fir + 1))
else
  next=$(jq -r '.next_action // "run_loop_next"' "$STATE")
fi

tmp=$(mktemp)
jq --arg ts "$ts" --arg n "$next" --argjson f "$fir" \
  '.last_completed_at = $ts | .next_action = $n | .failed_cycles_in_row = $f' \
  "$STATE" > "$tmp"
mv "$tmp" "$STATE"

echo "[$ts] stop fired; next_action=$next; failed_in_row=$fir; last_verdict=$verdict" \
  >> "$LOG_DIR/$day.log"

exit 0