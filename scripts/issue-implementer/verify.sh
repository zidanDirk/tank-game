#!/usr/bin/env bash
set -Eeuo pipefail

mode="${1:-}"
acceptance_target="${2:-}"
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
  printf 'usage: %s {unit|build|browser|core|full|acceptance TARGET}\n' "$0" >&2
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
  # Lock fixed ports for this small server; refuse accidental fallback ports.
  if command -v flock >/dev/null; then
    exec 8>"${TMPDIR:-/tmp}/tank-browser-verify.lock"
    flock -w 600 8 || return 1
  fi
  node --input-type=module -e '
    import net from "node:net";
    for (const port of [5173, 4173]) {
      await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => server.close(resolve));
      });
    }
  ' || return 1
  node "$repo_dir/node_modules/vite/bin/vite.js" --host 127.0.0.1 --strictPort > "$log_dir/vite-dev.log" 2>&1 &
  dev_pid=$!
  node "$repo_dir/node_modules/vite/bin/vite.js" preview --host 127.0.0.1 --strictPort > "$log_dir/vite-preview.log" 2>&1 &
  preview_pid=$!
  trap cleanup EXIT INT TERM
  wait_for_url "http://127.0.0.1:5173/"
  wait_for_url "http://127.0.0.1:4173/"
  kill -0 "$dev_pid" "$preview_pid" || return 1
  # Generated evidence must never become implementation diff or consume file budget.
  mkdir -p "$log_dir/evidence/artifacts"
  if [[ -n "$acceptance_target" ]]; then
    (cd "$log_dir/evidence"; node "$repo_dir/$acceptance_target") || return 1
    cleanup
    trap - EXIT INT TERM
    return 0
  fi
  (cd "$log_dir/evidence"; node "$repo_dir/tests/browser-check.mjs") || return 1
  (cd "$log_dir/evidence"; node "$repo_dir/tests/levels-check.mjs") || return 1
  (cd "$log_dir/evidence"; node "$repo_dir/tests/upgrades-check.mjs") || return 1
  for browser_test in "$repo_dir"/tests/acceptance-issue-*.browser.mjs; do
    [[ -f "$browser_test" ]] || continue
    (cd "$log_dir/evidence"; node "$browser_test") || return 1
  done
  cleanup
  trap - EXIT INT TERM
}

cd "$repo_dir"
assert_node_version

case "$mode" in
  acceptance)
    if [[ "$acceptance_target" =~ ^tests/acceptance-issue-[0-9]+\.test\.js$ ]]; then
      node --test "$acceptance_target"
    elif [[ "$acceptance_target" =~ ^tests/acceptance-issue-[0-9]+\.browser\.mjs$ ]]; then
      run_build
      run_browser
    else
      printf 'Invalid acceptance target\n' >&2
      exit 2
    fi
    ;;
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
