#!/usr/bin/env bash
set -Eeuo pipefail
repo_dir="$(cd "$(dirname "$0")/../.." && pwd)"
[[ "$repo_dir" == /home/ubuntu/tank-game ]] || { echo 'Install from /home/ubuntu/tank-game'; exit 1; }
for unit in tank-research.service tank-issue-implementer.service; do
  state="$(systemctl show "$unit" -p ActiveState --value)"
  [[ "$state" != active && "$state" != activating ]] || { echo "$unit is running; wait before installation"; exit 1; }
done
mkdir -p /home/ubuntu/.local/state
backup="$(mktemp -d /home/ubuntu/.local/state/tank-systemd-backup.XXXXXX)"
for unit in "$repo_dir"/scripts/automation/systemd/*; do
  name="$(basename "$unit")"
  [[ ! -f "/etc/systemd/system/$name" ]] || cp "/etc/systemd/system/$name" "$backup/"
  sudo -n install -m 644 "$unit" "/etc/systemd/system/$name"
done
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now tank-research.timer tank-issue-implementer.timer tank-pr-merge.timer
printf 'Installed timers; previous units: %s\n' "$backup"
systemctl list-timers --all --no-pager | grep -E 'tank-(research|issue-implementer|pr-merge)'
