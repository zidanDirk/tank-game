#!/usr/bin/env bash
# Read-only inventory. Never print environment/configuration file contents.
set -uo pipefail
printf '\n## Runtime\n'
date -Is
uname -srmo
for tool in node npm claude gh git rg jq; do
  command -v "$tool" || true
  "$tool" --version 2>/dev/null | head -n 1 || true
done
free -h
df -h / /tmp
printf '\n## Service execution and timer configuration\n'
for unit in tank-research.service tank-issue-implementer.service; do
  systemctl show "$unit" \
    -p User -p WorkingDirectory -p FragmentPath -p EnvironmentFiles \
    -p ActiveState -p SubState -p Result -p ExecMainStatus \
    -p Restart -p RestartUSec -p StartLimitIntervalUSec \
    -p StartLimitBurst -p TimeoutStartUSec
done
systemctl list-timers --all --no-pager | rg 'tank-research|tank-issue-implementer' || true
printf '\n## Checkout\n'
git -C "$HOME/tank-game" status --short --branch
git -C "$HOME/tank-game" rev-parse HEAD
printf '\n## Browser locations (paths only)\n'
find "$HOME/.cache/ms-playwright" /opt/ms-playwright \
  -maxdepth 4 -type f \( -name chrome -o -name headless_shell \) -print 2>/dev/null || true
printf '\n## Latest Issue 9 browser evidence\n'
latest_issue9="$(find "$HOME/.local/state/tank-issue-implementer/runs" \
  -maxdepth 1 -type d -name '*-issue-9' -print 2>/dev/null | sort | tail -n 1)"
if [[ -n "$latest_issue9" ]]; then
  printf '%s\n' "$latest_issue9"
  for logfile in browser.log build.log; do
    if [[ -f "$latest_issue9/$logfile" ]]; then
      printf '\n## %s\n' "$logfile"
      tail -n 100 "$latest_issue9/$logfile"
    fi
  done
fi
