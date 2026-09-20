#!/usr/bin/env bash
set -Eeuo pipefail

mode="${1:-}"
repo_dir="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
log_dir="${VERIFY_LOG_DIR:-$repo_dir/artifacts/verify}"
dev_pid=""
preview_pid=""

assert_node_version() {
  if ! node -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    const supported =
      (major === 20 && minor >= 19) ||
      (major === 22 && minor >= 12) ||
      major > 22;
    process.exit(supported ? 0 : 1);
  '; then
    printf 'Node.js 20.19+ or 22.12+ is required; found %s\n' \
      "$(node --version)" >&2
    return 1
  fi
}

usage() {
  printf 'usage: %s {unit|build|browser|core|full}\n' "$0" >&2
}

cleanup() {
  [[ -n "$dev_pid" ]] && kill "$dev_pid" >/dev/null 2>&1 || true
  [[ -n "$preview_pid" ]] && kill "$preview_pid" >/dev/null 2>&1 || true
}

wait_for_url() {
  local url="$1"
  local attempt
  for attempt in {1..60}; do
    if curl --fail --silent --show-error "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  printf 'verification server did not become ready: %s\n' "$url" >&2
  return 1
}

run_unit() {
  npm test
}

run_build() {
  npm run build
}

run_browser() {
  mkdir -p "$log_dir" "$repo_dir/artifacts"
  npm run dev -- --host 127.0.0.1 > "$log_dir/vite-dev.log" 2>&1 &
  dev_pid=$!
  npm run preview -- --host 127.0.0.1 > "$log_dir/vite-preview.log" 2>&1 &
  preview_pid=$!
  trap cleanup EXIT INT TERM
  wait_for_url "http://127.0.0.1:5173/"
  wait_for_url "http://127.0.0.1:4173/"
  npm run test:browser
  npm run test:levels
  npm run test:upgrades
  cleanup
  trap - EXIT INT TERM
}

cd "$repo_dir"
assert_node_version

case "$mode" in
  unit) run_unit ;;
  build) run_build ;;
  browser) run_browser ;;
  core)
    run_unit
    run_build
    ;;
  full)
    run_unit
    run_build
    run_browser
    ;;
  *)
    usage
    exit 2
    ;;
esac
