#!/usr/bin/env bash
# .claude/hooks/session-start.sh
# Inject Tank 1990 loop state into the new Claude session's context.
# Claude Code parses our stdout JSON for hookSpecificOutput.additionalContext
# on SessionStart.
set -euo pipefail
REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
STATE="$REPO/scripts/loop/state.json"

if [ ! -f "$STATE" ]; then
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"[tank-loop] no state.json found — run npm run loop:init"}}'
  exit 0
fi

next_action=$(jq -r '.next_action // "unknown"' "$STATE")
needs_human=$(jq -r '.needs_human // false' "$STATE")
current_item=$(jq -r '.current_item_id // "none"' "$STATE")
last_completed=$(jq -r '.last_completed_at // "never"' "$STATE")
failed_in_row=$(jq -r '.failed_cycles_in_row // 0' "$STATE")
recent=$(jq -c '.cycles[-3:] | map({id,item_id,verdict,commit})' "$STATE" 2>/dev/null || echo '[]')

ctx="[tank-loop] SessionStart injection
- next_action: ${next_action}
- needs_human: ${needs_human}
- current_item_id: ${current_item}
- last_completed_at: ${last_completed}
- failed_cycles_in_row: ${failed_in_row}
- recent_cycles: ${recent}
If next_action is \"run_loop_next\", run npm run loop:next. If needs_human, summarize for the user and stop."

jq -nc --arg ctx "$ctx" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$ctx}}'