#!/usr/bin/env bash
# bin/start-claude-in-herdr.sh
# Idempotently start Claude Code inside the existing Herdr workspace w5
# pane 1, or reattach if it's already running. Re-running this script
# just reattaches.
#
# The pane id is `w5:p1` (workspace w5, first pane). If your layout has
# changed, set HERDR_TANK_PANE explicitly, e.g.
#   HERDR_TANK_PANE=w5:p2 bin/start-claude-in-herdr.sh
set -euo pipefail
REPO="/Users/zidanzhang/work/hy/tank-game"
PANE_ID="${HERDR_TANK_PANE:-w5:p1}"
HERDR="${HERDR_BIN:-/Users/zidanzhang/.local/bin/herdr}"

cd "$REPO"

# Make sure the Herdr server is up; start it if not.
"$HERDR" status >/dev/null 2>&1 || "$HERDR" server start >/dev/null 2>&1 || true

# Confirm the pane exists. If it doesn't, the user needs to open Herdr and
# split to $REPO first — we can't create that pane from this script.
if ! "$HERDR" pane get "$PANE_ID" >/dev/null 2>&1; then
  echo "Pane $PANE_ID not found. Open Herdr, split to $REPO, then re-run." >&2
  exit 1
fi

# If Claude (or any agent) is already running in this pane, just attach.
# `agent list` returns one entry per pane that currently has an agent;
# we look up our pane_id in the array.
existing="$("$HERDR" agent list 2>/dev/null | jq -r --arg p "$PANE_ID" '.result.agents[] | select(.pane_id == $p) | .agent' | head -n1 || true)"
if [ -n "$existing" ]; then
  # The pane already has an agent (e.g. claude). Open the Herdr TUI on it.
  exec "$HERDR"
fi

# First-time spawn: Claude Code with --continue so it inherits the prior
# transcript (and therefore the same session UUID that herdr-agent-state.sh
# already registered).
HERDR_AGENT=claude "$HERDR" agent start tank-claude \
  --kind claude \
  --pane "$PANE_ID" \
  -- claude --continue

exec "$HERDR" agent attach tank-claude