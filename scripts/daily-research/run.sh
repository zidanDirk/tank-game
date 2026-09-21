#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export REPO_DIR="${REPO_DIR:-$HOME/tank-game}"
set -a
source "${ENV_FILE:-$HOME/.config/tank-research.env}"
set +a
export PATH="/home/ubuntu/.local/bin:/usr/local/bin:/usr/bin:/bin"
planner_state="${TANK_RESEARCH_STATE_DIR:-$HOME/.local/state/tank-research-v2}"
mkdir -p "$planner_state"
exec 9>"$planner_state/run.lock"
flock -n 9 || exit 0
exec node "$REPO_DIR/scripts/daily-research/run.mjs" "${1:-research}" "${2:-}"
