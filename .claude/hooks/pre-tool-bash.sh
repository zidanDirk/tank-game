#!/usr/bin/env bash
# .claude/hooks/pre-tool-bash.sh
# Defensive guard against destructive Bash commands in this repo.
# PreToolUse contract: exit 2 + stderr message blocks the tool call.
set -euo pipefail

input="$(cat)"
cmd=$(echo "$input" | jq -r '.tool_input.command // ""')
REPO="$(git rev-parse --show-toplevel)"

deny=0
reason=""

case "$cmd" in
  *"rm -rf"*)
    if echo "$cmd" | grep -qE "(^|\s)rm\s+-rf\s+(/|\$HOME|\.\s|~|$REPO)"; then
      deny=1
      reason="rm -rf against $REPO / home / root blocked by PreToolUse hook"
    fi
    ;;
  *"git push --force"*|*"git push -f"*|*"git push --force-with-lease"*)
    deny=1
    reason="force push blocked by PreToolUse hook; use a normal push or amend"
    ;;
  *"git reset --hard"*)
    deny=1
    reason="git reset --hard blocked by PreToolUse hook"
    ;;
esac

if [ "$deny" = "1" ]; then
  echo "$reason" >&2
  exit 2
fi

exit 0