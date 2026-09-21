import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyAcceptanceChanges } from "../scripts/issue-implementer/acceptance-policy.mjs";

test("missing acceptance output is classified separately and may be retried", () => {
  const result = classifyAcceptanceChanges(9, []);

  assert.equal(result.status, "missing");
  assert.equal(result.expectedPath, "tests/acceptance-issue-9.test.js");
  assert.deepEqual(result.actualPaths, []);
  assert.deepEqual(result.extraPaths, []);
  assert.equal(result.canContinueAfterMaxTurns, true);
});

test("the exact generated acceptance test is accepted without a retry", () => {
  const result = classifyAcceptanceChanges(9, [
    "tests/acceptance-issue-9.test.js",
  ]);

  assert.equal(result.status, "exact");
  assert.deepEqual(result.actualPaths, [
    "tests/acceptance-issue-9.test.js",
  ]);
  assert.deepEqual(result.extraPaths, []);
  assert.equal(result.canContinueAfterMaxTurns, false);
});

test("any path beyond the generated acceptance test is rejected", () => {
  const result = classifyAcceptanceChanges(9, [
    "src/core/GameManager.js",
    "tests/acceptance-issue-9.test.js",
  ]);

  assert.equal(result.status, "extra");
  assert.deepEqual(result.extraPaths, ["src/core/GameManager.js"]);
  assert.equal(result.canContinueAfterMaxTurns, false);
});

test("an unexpected file without the target is still an extra-file violation", () => {
  const result = classifyAcceptanceChanges(9, ["tests/briefing.test.js"]);

  assert.equal(result.status, "extra");
  assert.deepEqual(result.extraPaths, ["tests/briefing.test.js"]);
  assert.equal(result.canContinueAfterMaxTurns, false);
});

test("invalid issue numbers are rejected", () => {
  assert.throws(
    () => classifyAcceptanceChanges("9", []),
    /issue number/i,
  );
});
