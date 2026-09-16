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
  # Match rm -rf as a real command — must be preceded by a shell operator
  # (start, ;, &&, ||, |, (, or backtick) and target a dangerous path.
  # Embedding `rm -rf` inside quotes/heredoc (e.g. commit messages, echo,
  # cat <<EOF) is allowed.
  *"rm -rf"*)
    if printf '%s\n' "$cmd" | grep -qE '(^|[;&|(])\s*rm\s+-rf\s+(/|\$HOME|\.\s|~|"'"$REPO"'")'; then
      deny=1
      reason="rm -rf against $REPO / home / root blocked by PreToolUse hook"
    fi
    ;;
  # Match git push --force / -f as a real command — must be the leading token,
  # not embedded in a string literal.
  *"git push"*)
    if printf '%s\n' "$cmd" | grep -qE '(^|[;&|(])\s*git\s+push\s+(--force|-f|--force-with-lease)\b'; then
      deny=1
      reason="force push blocked by PreToolUse hook; use a normal push or amend"
    fi
    ;;
  *"git reset --hard"*)
    if printf '%s\n' "$cmd" | grep -qE '(^|[;&|(])\s*git\s+reset\s+--hard\b'; then
      deny=1
      reason="git reset --hard blocked by PreToolUse hook"
    fi
    ;;
esac

if [ "$deny" = "1" ]; then
  echo "$reason" >&2
  exit 2
fi

exit 0