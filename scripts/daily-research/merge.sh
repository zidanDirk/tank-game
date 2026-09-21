#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
set -a
source "${ENV_FILE:-$HOME/.config/tank-research.env}"
set +a
export PATH="/home/ubuntu/.local/bin:/usr/local/bin:/usr/bin:/bin"
exec node "${REPO_DIR:-$HOME/tank-game}/scripts/daily-research/merge.mjs"
