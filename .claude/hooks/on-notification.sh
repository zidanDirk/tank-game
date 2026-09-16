#!/usr/bin/env bash
# .claude/hooks/on-notification.sh
# Logs every permission_prompt so the next session can see what blocked work.
set -euo pipefail

input="$(cat)"
REPO="$(git rev-parse --show-toplevel)"
LOG="$REPO/scripts/loop/journal/auto/permissions.log"
mkdir -p "$(dirname "$LOG")"

tool=$(echo "$input" | jq -r '.notification.tool_name // "unknown"')
ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "[$ts] permission_prompt tool=$tool" >> "$LOG"

exit 0