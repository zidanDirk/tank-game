#!/usr/bin/env node
// scripts/loop/orchestrator.mjs
// Tank 1990 loop orchestrator.
//   init   — capture baselines (one-time, then per major change)
//   next   — pick next pending item, emit spec for Claude to act on
//   verify — run all 3 gates against current code, output pass/fail
//   diff   — visual diff only (PNG + snapshot JSON)
//   status — print current state.json + backlog summary
//   commit — mark current cycle done, append to journal/, advance state
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { captureBaselines, captureState } from "./lib/capture.mjs";
import { runDiff, summarize } from "./lib/diff.mjs";
import {
  runHarvest,
  scoreRaw,
  renderQueue,
  applyHumanReview,
  parseReviewArgs,
  shouldHarvest,
  latestScoredPath,
} from "./lib/harvest.mjs";

const ROOT = process.cwd();
const LOOP_DIR = path.join(ROOT, "scripts/loop");
const STATE_PATH = path.join(LOOP_DIR, "state.json");
const BACKLOG_PATH = path.join(LOOP_DIR, "backlog.json");
const BASELINE_DIR = path.join(LOOP_DIR, "baselines");
const JOURNAL_DIR = path.join(LOOP_DIR, "journal");
const CURRENT_DIR = path.join(LOOP_DIR, "current");

async function readJSON(p) {
  return JSON.parse(await readFile(p, "utf8"));
}
async function writeJSON(p, obj) {
  await writeFile(p, JSON.stringify(obj, null, 2));
}
function ts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}
function sh(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  }).trim();
}

const cmd = process.argv[2] || "help";

async function cmdInit() {
  console.log("→ loop:init  capturing baselines…");
  await mkdir(path.join(BASELINE_DIR, "screenshots"), { recursive: true });
  await captureBaselines({ outDir: BASELINE_DIR });
  const state = await readJSON(STATE_PATH);
  state.next_action = "run_loop_next";
  state.last_init_at = new Date().toISOString();
  await writeJSON(STATE_PATH, state);
  console.log("✓ baselines captured under", BASELINE_DIR);
}

async function cmdNext() {
  const state = await readJSON(STATE_PATH);
  const backlog = await readJSON(BACKLOG_PATH);
  const pending = backlog.items.filter((it) => it.status === "pending");
  if (!pending.length) {
    // Both items[] and ideas[] empty → must harvest before triage has anything to pick.
    const decision = shouldHarvest({ state, backlog });
    if (decision.trigger) {
      console.log(
        `✓ backlog empty AND ideas[] empty — triggering harvest (${decision.reason}).`,
      );
      console.log(`  Run:  npm run loop:harvest`);
      state.next_action = "harvest_first";
      await writeJSON(STATE_PATH, state);
      return;
    }
    console.log("✓ backlog empty. Pick from backlog.json.ideas to grow it.");
    state.next_action = "triage_new_idea";
    await writeJSON(STATE_PATH, state);
    return;
  }
  const item = pending[0];
  state.current_item_id = item.id;
  state.current_cycle_id = ts();
  state.next_action = "implement_then_verify";
  state.cycle_started_at = new Date().toISOString();
  await writeJSON(STATE_PATH, state);

  console.log(
    [
      "",
      "═".repeat(72),
      ` NEXT CYCLE  ${state.current_cycle_id}`,
      ` ITEM        ${item.id} — ${item.title}`,
      ` TOUCH       ${item.touches.join(", ")}`,
      ` VERIFY      ${item.verify.join(" | ")}`,
      ` SKILL       .claude/skills/tank-implement/SKILL.md` +
        (item.skill ? ` + .claude/skills/${item.skill}/SKILL.md` : ""),
      ` CHECKER     .claude/agents/tank-checker.md (read after implementing)`,
      "═".repeat(72),
      "",
      " Steps for Claude:",
      " 1. Read tank-implement (+ tank-ui-juice if UI) skill.",
      " 2. Implement minimal change to items[].touches files.",
      " 3. Add a unit test if you added a public method.",
      " 4. Run:  npm test",
      " 5. Run:  npm run loop:verify",
      " 6. If pass: npm run loop:commit",
      " 7. If fail: read defects, fix or update journal/, retry on next loop tick.",
      "",
    ].join("\n"),
  );
}

async function cmdVerify() {
  const state = await readJSON(STATE_PATH);
  console.log("→ loop:verify  gate 1: unit tests");
  let testOut = "";
  let testPass = false;
  try {
    testOut = sh("npm test 2>&1 | tail -30");
    const m = testOut.match(/# tests\s+(\d+)/);
    testPass = m && Number(m[1]) >= 22;
    console.log(`  ${testPass ? "✓" : "✗"} unit tests: ${m ? m[1] : "?"}/22+`);
  } catch (e) {
    testOut = e.stdout || e.message;
    console.log("  ✗ unit tests failed:", e.message);
  }

  console.log("→ loop:verify  gate 2: capture + diff");
  await mkdir(path.join(CURRENT_DIR, "screenshots"), { recursive: true });
  const { SHOTS } = await import("./lib/capture.mjs");
  await captureState({ outDir: CURRENT_DIR, scenarios: SHOTS });

  const result = await runDiff({
    baselineDir: BASELINE_DIR,
    currentDir: CURRENT_DIR,
    snapshotBaseline: path.join(BASELINE_DIR, "snapshots.json"),
    snapshotCurrent: path.join(CURRENT_DIR, "snapshots.json"),
  });
  const summary = summarize(result);
  console.log(`  ${summary.pass ? "✓" : "✗"} visual diff: ${summary.totalPngs} PNGs, ${summary.totalSnaps} snaps`);
  for (const f of summary.pngFails) {
    console.log(`    - ${f.file} ${f.status} ${(f.diff_ratio * 100).toFixed(2)}%`);
  }
  for (const f of summary.snapFails) {
    console.log(`    - snap ${f.id} ${f.status} ${f.fieldDiffs ? JSON.stringify(f.fieldDiffs) : ""}`);
  }

  const verdict = testPass && summary.pass;
  const report = {
    cycle_id: state.current_cycle_id,
    item_id: state.current_item_id,
    at: new Date().toISOString(),
    verdict: verdict ? "pass" : "fail",
    test: { pass: testPass, output: testOut.slice(-500) },
    diff: summary,
  };
  await writeJSON(path.join(CURRENT_DIR, "verify-report.json"), report);
  console.log("");
  console.log(verdict ? "✓ VERIFY PASS" : "✗ VERIFY FAIL");
  console.log(`  report → scripts/loop/current/verify-report.json`);
  if (!verdict) process.exit(1);
}

async function cmdDiff() {
  await mkdir(path.join(CURRENT_DIR, "screenshots"), { recursive: true });
  // Reuse latest current capture if exists, otherwise re-capture
  if (!existsSync(path.join(CURRENT_DIR, "snapshots.json"))) {
    console.log("→ no current/ capture found, re-running capture");
    await cmdVerify();
    return;
  }
  const result = await runDiff({
    baselineDir: BASELINE_DIR,
    currentDir: CURRENT_DIR,
    snapshotBaseline: path.join(BASELINE_DIR, "snapshots.json"),
    snapshotCurrent: path.join(CURRENT_DIR, "snapshots.json"),
  });
  const summary = summarize(result);
  console.log(JSON.stringify(summary, null, 2));
}

async function cmdHarvest() {
  const state = await readJSON(STATE_PATH);
  const backlog = await readJSON(BACKLOG_PATH);

  // Sub-step 1: harvest (delegated to tank-harvester agent in production).
  // For headless / test runs we accept a HARVEST_SEED env var with a JSON array.
  const existingTitles = (backlog.ideas || []).map((it) => it.title || "");
  let seed;
  if (process.env.HARVEST_SEED) {
    try {
      seed = JSON.parse(process.env.HARVEST_SEED);
    } catch (e) {
      console.error("✗ HARVEST_SEED is not valid JSON:", e.message);
      process.exit(1);
    }
  }
  let rawResult;
  try {
    rawResult = await runHarvest({
      sources: process.env.HARVEST_SOURCES?.split(",").filter(Boolean) || [],
      seed,
      existingTitles,
    });
  } catch (e) {
    console.error("✗ harvest failed:", e.message);
    if (/requires `seed`/.test(e.message)) {
      console.error(
        "  hint: provide HARVEST_SEED (JSON array) for headless runs,\n" +
          "        or invoke this command from a /loop tick where the tank-harvester\n" +
          "        agent supplies the array.",
      );
    }
    process.exit(1);
  }
  console.log(`→ loop:harvest  step 1 fetch: ${rawResult.count} ideas (dropped ${rawResult.dropped_duplicates} duplicates)`);
  console.log(`  ${rawResult.outPath}`);

  // Sub-step 2: score (delegated to tank-critic agent in production).
  let scoredSeed;
  if (process.env.SCORE_SEED) {
    try {
      scoredSeed = JSON.parse(process.env.SCORE_SEED);
    } catch (e) {
      console.error("✗ SCORE_SEED is not valid JSON:", e.message);
      process.exit(1);
    }
  }
  let scoreResult;
  try {
    scoreResult = await scoreRaw({
      rawPath: rawResult.outPath,
      seed: scoredSeed,
      topN: 5,
    });
  } catch (e) {
    console.error("✗ scoring failed:", e.message);
    process.exit(1);
  }
  console.log(`→ loop:harvest  step 2 score: ${scoreResult.top.length} top of ${scoreResult.total}`);
  console.log(`  ${scoreResult.outPath}`);

  // Sub-step 3: render queue for human.
  const queuePath = path.join(LOOP_DIR, "harvest", "queue.md");
  await renderQueue({ scoredPath: scoreResult.outPath, outPath: queuePath });
  console.log(`→ loop:harvest  step 3 render: ${queuePath}`);

  // Update state — halt here, wait for human.
  state.harvest_runs = state.harvest_runs || [];
  state.harvest_runs.push({
    id: (() => {
      const d = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    })(),
    raw_ref: path.relative(LOOP_DIR, rawResult.outPath),
    scored_ref: path.relative(LOOP_DIR, scoreResult.outPath),
    raw_count: rawResult.count,
    scored_top_count: scoreResult.top.length,
    human_decisions: null,
    at: new Date().toISOString(),
  });
  state.next_action = "await_human_review";
  await writeJSON(STATE_PATH, state);
  console.log("");
  console.log("✓ HARVEST READY — awaiting human review");
  console.log(`  Read:    ${queuePath}`);
  console.log(`  Apply:   npm run loop:harvest:review -- --accept 1,4 --drop 3 --reason "..."`);
}

async function cmdHarvestReview() {
  // Args after "--" are parsed by parseReviewArgs (--accept, --defer, --drop --reason).
  const argv = process.argv.slice(3);
  // strip a leading "--" if the user passed it
  if (argv[0] === "--") argv.shift();
  const review = parseReviewArgs(argv);

  if (
    !review.accepted.length &&
    !review.deferred.length &&
    !review.dropped.length
  ) {
    console.error(
      "✗ no decisions. Pass at least one of --accept, --defer, --drop.",
    );
    console.error(
      '  example: npm run loop:harvest:review -- --accept 1 --drop 2 --reason "no"',
    );
    process.exit(1);
  }

  const scoredPath = await latestScoredPath();
  if (!scoredPath) {
    console.error("✗ no scored file in scripts/loop/harvest/scored/. Run `npm run loop:harvest` first.");
    process.exit(1);
  }

  const out = await applyHumanReview({
    scoredPath,
    review,
    backlogPath: BACKLOG_PATH,
    statePath: STATE_PATH,
  });
  console.log(
    `✓ review applied: accepted=${out.accepted.length}, deferred=${out.deferred.length}, dropped=${out.dropped.length}`,
  );
  for (const a of out.accepted) console.log(`  ✓ accept ${a.id}  ${a.title}`);
  for (const d of out.deferred) console.log(`  ⏸ defer  ${d.id}  ${d.title}`);
  for (const d of out.dropped) console.log(`  ✗ drop   ${d.title}  (${review.reasons && Object.entries(review.reasons).find(([, v]) => v)?.[1] || ""})`);
  console.log(`  state.next_action reset to "triage_new_idea"`);
}

async function cmdStatus() {
  const state = await readJSON(STATE_PATH);
  const backlog = await readJSON(BACKLOG_PATH);
  const journalFiles = existsSync(JOURNAL_DIR)
    ? (await readdir(JOURNAL_DIR)).filter((f) => f.endsWith(".md")).sort()
    : [];
  console.log("state:", JSON.stringify(state, null, 2));
  console.log("\nbacklog items:");
  for (const it of backlog.items) {
    console.log(`  [${it.status === "pending" ? " " : "x"}] ${it.id}  ${it.title}`);
  }
  console.log(`\njournal: ${journalFiles.length} entries`);
  if (journalFiles.length) {
    console.log("  latest:", journalFiles.slice(-3).join(", "));
  }
}

async function cmdCommit() {
  const state = await readJSON(STATE_PATH);
  const backlog = await readJSON(BACKLOG_PATH);
  const itemId = state.current_item_id;
  const cycleId = state.current_cycle_id;
  if (!itemId || !cycleId) {
    console.error("✗ no active cycle. Run `npm run loop:next` first.");
    process.exit(1);
  }
  const item = backlog.items.find((it) => it.id === itemId);
  if (!item) {
    console.error(`✗ item ${itemId} not found in backlog.`);
    process.exit(1);
  }
  // Read verify report
  const reportPath = path.join(CURRENT_DIR, "verify-report.json");
  if (!existsSync(reportPath)) {
    console.error("✗ no verify report at", reportPath);
    process.exit(1);
  }
  const report = JSON.parse(await readFile(reportPath, "utf8"));

  // Write journal entry
  const journalPath = path.join(JOURNAL_DIR, `${cycleId}.md`);
  const commit = sh("git rev-parse HEAD").slice(0, 7);
  const journal = [
    `# Cycle ${cycleId}`,
    "",
    `**Item:** \`${itemId}\` — ${item.title}`,
    `**Verdict:** ${report.verdict}`,
    `**Commit:** ${commit}`,
    `**At:** ${new Date().toISOString()}`,
    "",
    "## Verification summary",
    `- Unit tests: ${report.test.pass ? "pass" : "FAIL"}`,
    `- Visual diff: ${report.diff.pass ? "pass" : "FAIL"} (${report.diff.totalPngs} PNGs)`,
    "",
    "## Files changed",
    "```",
    sh("git diff --stat HEAD~1 HEAD 2>/dev/null || git diff --stat --cached"),
    "```",
    "",
  ].join("\n");
  await writeFile(journalPath, journal);

  // Update backlog
  item.status = "done";
  item.done_at = new Date().toISOString();
  item.commit = commit;
  await writeJSON(BACKLOG_PATH, backlog);

  // Update state
  state.cycles.push({
    id: cycleId,
    item_id: itemId,
    verdict: report.verdict,
    commit,
    journal: path.relative(ROOT, journalPath),
    at: new Date().toISOString(),
  });
  state.completed_items = state.cycles.filter((c) => c.verdict === "pass").length;
  state.current_item_id = null;
  state.current_cycle_id = null;
  state.cycle_started_at = null;
  state.next_action = "run_loop_next";
  if (report.verdict === "fail") {
    state.failed_cycles_in_row = (state.failed_cycles_in_row ?? 0) + 1;
    if (state.failed_cycles_in_row >= 3) state.needs_human = true;
  } else {
    state.failed_cycles_in_row = 0;
  }
  await writeJSON(STATE_PATH, state);
  console.log(`✓ cycle ${cycleId} ${report.verdict}; backlog item ${itemId} marked done`);
}

const commands = {
  init: cmdInit,
  next: cmdNext,
  verify: cmdVerify,
  diff: cmdDiff,
  harvest: cmdHarvest,
  "harvest:review": cmdHarvestReview,
  status: cmdStatus,
  commit: cmdCommit,
};

if (!commands[cmd]) {
  console.log(
    [
      "Tank 1990 loop orchestrator",
      "",
      "Usage: node scripts/loop/orchestrator.mjs <command>",
      "",
      "Commands:",
      "  init            capture initial baselines (one-time)",
      "  next            pick next pending item, emit spec for Claude",
      "  verify          run all 3 gates (unit + capture + diff)",
      "  diff            visual diff only (PNG + snapshot JSON)",
      "  harvest         run web fetcher + scorer, render queue.md",
      "  harvest:review  apply human accept/defer/drop to backlog.json",
      "  status          print state + backlog + journal summary",
      "  commit          mark cycle done, write journal/, advance state",
    ].join("\n"),
  );
  process.exit(cmd === "help" ? 0 : 1);
}

commands[cmd]().catch((err) => {
  console.error("error:", err);
  process.exit(1);
});
