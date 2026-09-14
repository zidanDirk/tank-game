// scripts/loop/lib/git.mjs
// Git + worktree helpers used by the loop orchestrator.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function sh(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  }).trim();
}

export function gitRoot() {
  return sh("git rev-parse --show-toplevel");
}

export function currentBranch() {
  return sh("git rev-parse --abbrev-ref HEAD");
}

export function isDirty() {
  return sh("git status --porcelain").length > 0;
}

export function worktreeCreate(branch, targetDir) {
  const abs = path.resolve(repoRoot, "..", targetDir);
  if (existsSync(abs)) {
    throw new Error(`worktree path already exists: ${abs}`);
  }
  sh(`git worktree add -b ${branch} "${abs}"`);
  return abs;
}

export function worktreeRemove(targetDir) {
  const abs = path.resolve(repoRoot, "..", targetDir);
  if (!existsSync(abs)) return;
  sh(`git worktree remove --force "${abs}"`);
}

export function commitAll(message, cwd = repoRoot) {
  sh("git add -A", { cwd });
  return sh(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd });
}

export function lastCommit(cwd = repoRoot) {
  return sh("git rev-parse HEAD", { cwd });
}

export function logOneline(n = 10, cwd = repoRoot) {
  return sh(`git log --oneline -${n}`, { cwd }).split("\n");
}

export function diff(cwd = repoRoot) {
  return sh("git diff", { cwd });
}

export function stash() {
  return sh("git stash push -u -m loop-auto-stash");
}

export function stashPop() {
  return sh("git stash pop");
}
