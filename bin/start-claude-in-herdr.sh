#!/usr/bin/env bash
# bin/start-claude-in-herdr.sh
# Idempotently start Claude Code inside Herdr workspace w5 pane 5.
# Re-running this script just reattaches if Claude is already running.
set -euo pipefail
REPO="/Users/zidanzhang/work/hy/tank-game"
PANE_ID="${HERDR_TANK_PANE:-w5:p5}"
HERDR="${HERDR_BIN:-/Users/zidanzhang/.local/bin/herdr}"

cd "$REPO"

# Make sure the Herdr server is up; start it if not.
"$HERDR" status >/dev/null 2>&1 || "$HERDR" server start >/dev/null 2>&1 || true

# Confirm the pane exists. If it doesn't, the user needs to open Herdr and split
# to $REPO first — we can't create that pane from this script.
state_json="$("$HERDR" pane get "$PANE_ID" --json 2>/dev/null || true)"
if [ -z "$state_json" ]; then
  echo "Pane $PANE_ID not found. Open Herdr, split to $REPO, then re-run." >&2
  exit 1
fi

# If Claude is already the agent in this pane, just attach.
current_agent="$("$HERDR" agent list --pane "$PANE_ID" --json 2>/dev/null | jq -r '.[0].name // empty' || true)"
if [ -n "$current_agent" ]; then
  exec "$HERDR" agent attach "$current_agent"
fi

# First-time spawn: Claude Code with --continue so it inherits the prior
# transcript (and therefore the same session UUID that herdr-agent-state.sh
# already registered).
HERDR_AGENT=claude "$HERDR" agent start tank-claude \
  --kind claude \
  --pane "$PANE_ID" \
  -- claude --continue

exec "$HERDR" agent attach tank-claude