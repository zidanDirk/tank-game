#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export REPO_DIR="${REPO_DIR:-$HOME/tank-game}"
set -a
source "${ENV_FILE:-$HOME/.config/tank-research.env}"
set +a
export PATH="/home/ubuntu/.local/bin:/usr/local/bin:/usr/bin:/bin"
mkdir -p "$HOME/.local/state/tank-research-v2"
exec 9>"$HOME/.local/state/tank-research-v2/run.lock"
flock -n 9 || exit 0
exec node "$REPO_DIR/scripts/daily-research/run.mjs" "${1:-research}" "${2:-}"
