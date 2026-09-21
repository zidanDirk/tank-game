#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validatePlan, renderTask, readContract, approved, APPROVAL_LABELS } from "./contract.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoDir = process.env.REPO_DIR || path.resolve(here, "../..");
const repo = process.env.GH_REPO || "zidanDirk/tank-game";
const state = process.env.TANK_RESEARCH_STATE_DIR || path.join(os.homedir(), ".local/state/tank-research-v2");
fs.mkdirSync(state, { recursive: true, mode: 0o700 });
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const mode = process.argv[2] || "research";
const runDir = fs.mkdtempSync(path.join(state, `${day}-${mode}-`));
const write = (name, value) => fs.writeFileSync(path.join(runDir, name), typeof value === "string" ? value : JSON.stringify(value, null, 2), { mode: 0o600 });

function exec(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: repoDir, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 120_000, ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || result.error?.message || "").slice(-3000)}`);
  return result.stdout;
}
function gh(args) { return exec("gh", args); }
function issue(n) { return JSON.parse(gh(["issue", "view", String(n), "--repo", repo, "--json", "number,title,body,url,labels,state"])); }
function listIssues() { return JSON.parse(gh(["api", "--paginate", "--slurp", `repos/${repo}/issues?state=all&per_page=100`])).flat().filter((i) => !i.pull_request); }

function model(name, settings, prompt, cwd, search = false, turns = 40) {
  const env = { ...process.env };
  for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "GH_REPO"]) delete env[key];
  const args = ["--bare", "--settings", settings, "--model", "sonnet", "--permission-mode", "dontAsk",
    "--allowedTools", search ? "Read,Glob,Grep,mcp__MiniMax__web_search" : "Read,Glob,Grep",
    "--disallowedTools", "Bash,Edit,Write,WebFetch,WebSearch,NotebookEdit,Task",
    "--max-turns", String(turns), "--output-format", "json", "-p", prompt];
  if (search) args.push("--strict-mcp-config", "--mcp-config", process.env.RESEARCH_MCP_CONFIG || path.join(os.homedir(), ".claude.json"));
  else args.push("--restricted");
  write(`${name}-prompt.md`, prompt);
  const result = spawnSync("claude", args, { cwd, env, encoding: "utf8", timeout: 1800_000, maxBuffer: 16 * 1024 * 1024 });
  write(`${name}-response.json`, result.stdout || "");
  write(`${name}-stderr.log`, result.stderr || result.error?.message || "");
  const response = JSON.parse(result.stdout || "{}");
  if (result.status !== 0 || response.is_error) throw new Error(`${name} model failed (${response.subtype || result.status}); evidence: ${runDir}`);
  if (response.structured_output) return response.structured_output;
  return JSON.parse(String(response.result || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
}

function planner(input, cwd, sourceCount = 0) {
  let feedback = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const plan = model(`plan-${attempt}`, process.env.SETTINGS_FILE || path.join(os.homedir(), ".claude/settings-minimax.json"),
        fs.readFileSync(path.join(here, "plan-prompt.md"), "utf8") + "\n<untrusted_input_json>\n" + JSON.stringify(input) + "\n</untrusted_input_json>\nValidation feedback: " + feedback,
        cwd);
      validatePlan(plan, sourceCount);
      write("plan.json", plan);
      return plan;
    } catch (error) {
      feedback = error.message;
      write(`plan-${attempt}-validation.log`, feedback);
      // Provider failures need retry/backoff, not three immediate paid retries.
      if (feedback.includes("model failed")) throw error;
    }
  }
  throw new Error(`planning failed after three attempts: ${feedback}; evidence: ${runDir}`);
}

function publish(plan, batch, sources, existing, parent) {
  for (const label of APPROVAL_LABELS) gh(["label", "create", label, "--repo", repo, "--color", "0E8A16", "--force"]);
  const numbers = new Map();
  for (const task of plan.tasks) {
    const marker = `tank-plan-v2:${batch}:${task.id}`;
    const found = existing.find((i) => i.body?.includes(`<!-- ${marker} -->`));
    if (found) {
      numbers.set(task.id, found.number);
      console.log(`复用 #${found.number}: ${task.title}`);
      continue;
    }
    const body = renderTask(task, marker, task.dependsOn.map((id) => numbers.get(id)), sources) +
      `\n研究建议：${plan.title}\n${parent ? `父 Issue：#${parent.number}` : `<!-- tank-research:${day} -->`}\n`;
    const bodyFile = path.join(runDir, `${task.id}.md`);
    fs.writeFileSync(bodyFile, body);
    const url = gh(["issue", "create", "--repo", repo, "--title", task.title, "--body-file", bodyFile, "--label", "未审批"]).trim();
    numbers.set(task.id, Number(url.split("/").at(-1)));
    console.log(url);
  }
  if (parent) gh(["issue", "edit", String(parent.number), "--repo", repo, "--remove-label", "同意实现", "--add-label", "挂起"]);
  return Object.fromEntries(numbers);
}

try {
  if (mode === "check-deps") {
    const current = issue(Number(process.argv[3]));
    if (!approved(current.labels) || current.state !== "OPEN") throw new Error("approval labels conflict or issue is not approved/open");
    const task = readContract(current.body);
    for (const n of task?.dependencyIssues || []) {
      const prs = JSON.parse(gh(["pr", "list", "--repo", repo, "--state", "merged", "--head", `claude/issue-${n}`, "--json", "number"]));
      if (!prs.length) throw new Error(`dependency #${n} has no merged implementation PR`);
    }
    if (process.argv[4]) write("approved-contract.json", task);
    process.exit(0);
  }
  if (!["research", "split"].includes(mode)) throw new Error("usage: run.mjs research|split ISSUE_NUMBER|check-deps ISSUE_NUMBER");
  const existing = listIssues();
  const parent = mode === "split" ? issue(Number(process.argv[3])) : null;
  const batch = parent ? `issue-${parent.number}` : day;
  const checkpoint = path.join(state, `plan-${batch}.json`);
  if (!parent && existing.some((i) => i.body?.includes(`<!-- tank-research:${day} -->`)) && !fs.existsSync(checkpoint)) {
    console.log("今天已有研究 Issue；跳过重复研究");
    process.exit(0);
  }
  let saved;
  if (fs.existsSync(checkpoint)) {
    saved = JSON.parse(fs.readFileSync(checkpoint));
    if (parent && saved.parentBody !== parent.body) throw new Error("parent changed after planning; archive the checkpoint and plan again");
    validatePlan(saved.plan, saved.sourceCount);
  } else {
    exec("git", ["fetch", "origin", "master"]);
    const checkout = path.join(runDir, "repo");
    exec("git", ["worktree", "add", "--detach", checkout, "origin/master"]);
    const themes = ["年轻化视觉与表达", "可玩性与即时反馈", "3D 场景与光照", "关卡与重玩性", "UI 交互", "移动端操作", "无障碍与性能"];
    const theme = themes[new Date(`${day}T12:00:00+08:00`).getUTCDay()];
    let research = parent;
    if (!parent) {
      research = model("research", process.env.RESEARCH_SETTINGS_FILE || path.join(os.homedir(), ".claude/settings.json"),
        fs.readFileSync(path.join(here, "research-prompt.md"), "utf8") + "\n<untrusted_context_json>\n" + JSON.stringify({ day, theme, recentIssues: existing.slice(0, 100).map(({ number, title, body }) => ({ number, title, body: body?.slice(0, 2000) })) }) + "\n</untrusted_context_json>", checkout, true, 30);
      if (!Array.isArray(research.sources) || research.sources.length < 2 || research.sources.length > 5 || research.sources.some((s) => !/^https:\/\//.test(s.url) || typeof s.finding !== "string")) throw new Error("research must provide 2–5 HTTPS sources with findings");
    }
    const criteria = parent ? [...parent.body.matchAll(/^\s*[-*]\s*\[[ xX]\]\s+(.+)$/gm)].map((m) => m[1]) : [];
    if (parent && !criteria.length) throw new Error("parent has no acceptance criteria; needs human clarification");
    const plan = planner({ research, sourceCriteria: criteria.map((value, i) => ({ number: i + 1, value })) }, checkout, criteria.length);
    saved = { plan, sources: research.sources || [], sourceCount: criteria.length, parentBody: parent?.body };
    fs.writeFileSync(`${checkpoint}.tmp`, JSON.stringify(saved), { mode: 0o600 });
    fs.renameSync(`${checkpoint}.tmp`, checkpoint);
    exec("git", ["worktree", "remove", checkout]);
  }
  if (process.env.DRY_RUN === "true") console.log(JSON.stringify(saved.plan, null, 2));
  else write("published.json", publish(saved.plan, batch, saved.sources, existing, parent));
} catch (error) {
  write("failure.txt", error.message);
  console.error(error.message);
  process.exitCode = 1;
}
