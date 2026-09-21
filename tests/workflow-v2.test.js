import { test } from "node:test";
import assert from "node:assert/strict";
import { approved, validatePlan, renderTask, readContract } from "../scripts/daily-research/contract.mjs";
import { assessIssue } from "../scripts/issue-implementer/issue-policy.mjs";
import { canMerge } from "../scripts/daily-research/merge.mjs";

const task = () => ({ id: "predict", title: "Predict threats", goal: "Predict one impact", changeFiles: ["src/systems/ThreatWarning.js", "tests/threat-warning.test.js"], estimatedChangedLines: 160, acceptance: ["Walls block prediction"], acceptanceKind: "node", dependsOn: [], outOfScope: ["HUD"], manualPlaytest: ["Start a game"], sourceCriteria: [1] });
test("regression-only file references do not consume modification budget", () => {
  const t = task();
  t.acceptance = ["Keep tests/powerups.test.js, tests/briefing.test.js, tests/streak.test.js, tests/gameplay.test.js passing"];
  const body = renderTask(t, "test", []);
  const result = assessIssue({ number: 15, title: t.title, body });
  assert.equal(result.classification, "eligible");
  assert.deepEqual(result.referencedFiles, t.changeFiles);
  assert.equal(readContract(body).dependencyIssues.length, 0);
});
test("a semantic split must preserve every original criterion", () => {
  const plan = { title: "Warnings", summary: "Predict hazards", tasks: [task()] };
  assert.throws(() => validatePlan(plan, 2), /omitted/);
  plan.tasks[0].sourceCriteria.push(2);
  assert.equal(validatePlan(plan, 2), plan);
});
test("edge-case coverage does not inflate the modification budget", () => {
  const t = task();
  t.acceptance = Array.from({ length: 7 }, (_, i) => `Prediction edge case ${i}`);
  const result = assessIssue({ number: 15, title: t.title, body: renderTask(t, "test", []) });
  assert.equal(result.classification, "eligible");
  t.acceptance = Array.from({ length: 11 }, (_, i) => `Case ${i}`);
  assert.throws(() => validatePlan({ title: "Plan", summary: "One feature", tasks: [t] }), /acceptance/);
});
test("unknown, circular or forward dependencies and excessive changes are rejected", () => {
  const plan = { title: "Warnings", summary: "Predict hazards", tasks: [task()] };
  plan.tasks[0].dependsOn = ["predict"];
  assert.throws(() => validatePlan(plan), /dependencies/);
  plan.tasks[0].dependsOn = [];
  plan.tasks[0].estimatedChangedLines = 351;
  assert.throws(() => validatePlan(plan), /350/);
  plan.tasks[0].estimatedChangedLines = 150;
  plan.tasks[0].changeFiles = ["src/../.env"];
  assert.throws(() => validatePlan(plan), /forbidden/);
});
test("approval requires exactly one decision label", () => {
  assert.equal(approved(["同意实现"]), true);
  for (const other of ["未审批", "拒绝", "挂起"]) assert.equal(approved(["同意实现", other]), false);
  assert.equal(approved(["未审批"]), false);
});
function pr() {
  return { state: "OPEN", isDraft: false, isCrossRepository: false, baseRefName: "master", mergeStateStatus: "CLEAN", labels: [{ name: "已经试玩" }], headRefOid: "new-sha", statusCheckRollup: ["Unit, build, and browser acceptance", "Human playtest approval"].map((name) => ({ name, conclusion: "SUCCESS", startedAt: "2026-09-21" })) };
}
const record = (sha = "new-sha", login = "github-actions[bot]") => [{ user: { login }, body: `<!-- tank-playtest-v2:${sha} -->\nApproved` }];
test("merge requires trusted approval for this SHA and both successful checks", () => {
  assert.equal(canMerge(pr(), record()), true);
  assert.equal(canMerge(pr(), record("old-sha")), false);
  assert.equal(canMerge(pr(), record("new-sha", "some-user")), false);
  assert.equal(canMerge({ ...pr(), labels: [] }, record()), false);
  assert.equal(canMerge({ ...pr(), isCrossRepository: true }, record()), false);
  assert.equal(canMerge({ ...pr(), mergeStateStatus: "BEHIND" }, record()), false);
  const p = pr();
  p.statusCheckRollup.push({ name: "Unit, build, and browser acceptance", conclusion: "FAILURE", startedAt: "2026-09-22" });
  assert.equal(canMerge(p, record()), false);
});
