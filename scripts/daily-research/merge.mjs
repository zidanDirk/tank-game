#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function canMerge(pr, comments) {
  return pr.state === "OPEN" && !pr.isDraft && !pr.isCrossRepository && pr.baseRefName === "master" &&
    pr.mergeStateStatus === "CLEAN" && pr.labels.some((l) => l.name === "已经试玩") &&
    comments.some((c) => c.user?.login === "github-actions[bot]" &&
      c.body?.startsWith(`<!-- tank-playtest-v2:${pr.headRefOid} -->`)) &&
    ["Unit, build, and browser acceptance", "Human playtest approval"].every((name) => {
      const checks = pr.statusCheckRollup.filter((c) => c.name === name)
        .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
      return checks.length && checks[0].conclusion === "SUCCESS";
    });
}

function gh(args) {
  const r = spawnSync("gh", args, { encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr || r.error?.message || "GitHub request failed");
  return JSON.parse(r.stdout);
}
function main() {
  const repo = process.env.GH_REPO || "zidanDirk/tank-game";
  const prs = gh(["pr", "list", "--repo", repo, "--base", "master", "--state", "open", "--label", "已经试玩", "--limit", "100", "--json", "number"]);
  for (const { number } of prs) {
    const pr = gh(["pr", "view", String(number), "--repo", repo, "--json", "state,isDraft,isCrossRepository,baseRefName,mergeStateStatus,labels,headRefOid,statusCheckRollup"]);
    const comments = gh(["api", "--paginate", "--slurp", `repos/${repo}/issues/${number}/comments?per_page=100`]).flat();
    if (!canMerge(pr, comments)) { console.log(`#${number}: 等待 CI、当前 SHA 试玩记录或分支更新`); continue; }
    // REST merge checks the expected head SHA and repository protection again atomically.
    const result = gh(["api", `repos/${repo}/pulls/${number}/merge`, "--method", "PUT", "-f", `sha=${pr.headRefOid}`, "-f", "merge_method=squash"]);
    if (!result.merged) throw new Error(`#${number}: merge refused`);
    console.log(`#${number}: merged ${result.sha}`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
