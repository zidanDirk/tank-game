import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChildIssuePlan } from "../scripts/issue-implementer/split-issue-plan.mjs";

const parent = {
  number: 42,
  title: "Add mobile aiming and accessible HUD",
  url: "https://github.com/example/game/issues/42",
};

test("an approved split plan produces deterministic unapproved child issues", () => {
  const plan = buildChildIssuePlan(parent, {
    classification: "needs_split",
    canAutoSplit: true,
    suggestedSlices: [
      {
        sliceIndex: 1,
        acceptanceCriteria: ["Update src/core/Input.js."],
        sourceCriterionNumbers: [1],
        referencedFiles: ["src/core/Input.js"],
        automatable: true,
      },
      {
        sliceIndex: 2,
        acceptanceCriteria: ["Update index.html."],
        sourceCriterionNumbers: [2],
        referencedFiles: ["index.html"],
        automatable: true,
      },
    ],
  });

  assert.equal(plan.children.length, 2);
  assert.equal(plan.children[0].marker, "issue-implementer-parent:42:slice:1");
  assert.match(plan.children[0].title, /^\[拆分 #42 1\/2\]/u);
  assert.match(
    plan.children[0].body,
    /<!-- issue-implementer-parent:42:slice:1 -->/u,
  );
  assert.match(plan.children[0].body, /- \[ \] Update src\/core\/Input\.js\./u);
  assert.match(plan.children[0].body, /需要人工添加 `同意实现` 标签/u);
});

test("a non-automatable assessment cannot create partial child issues", () => {
  assert.throws(
    () =>
      buildChildIssuePlan(parent, {
        classification: "needs_split",
        canAutoSplit: false,
        suggestedSlices: [],
      }),
    /cannot be split automatically/iu,
  );
});
