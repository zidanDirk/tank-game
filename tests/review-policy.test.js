import { test } from "node:test";
import assert from "node:assert/strict";
import { validateReviewResponse } from "../scripts/issue-implementer/review-policy.mjs";

const assessment = {
  acceptanceCriteria: ["First behavior works", "Second behavior works"],
};

function response(result) {
  return {
    subtype: "success",
    is_error: false,
    result: JSON.stringify(result),
  };
}

test("an evidenced review covering every acceptance item is approved", () => {
  const result = validateReviewResponse(
    response({
      verdict: "approve",
      requirements: [
        { id: "AC-1", status: "pass", evidence: "tests/a.test.js:12" },
        { id: "AC-2", status: "pass", evidence: "src/a.js:44" },
      ],
      risks: [],
    }),
    assessment,
  );

  assert.equal(result.approved, true);
  assert.equal(result.verdict, "approve");
});

test("missing acceptance coverage cannot approve", () => {
  assert.throws(
    () =>
      validateReviewResponse(
        response({
          verdict: "approve",
          requirements: [
            { id: "AC-1", status: "pass", evidence: "tests/a.test.js:12" },
          ],
          risks: [],
        }),
        assessment,
      ),
    /AC-2/,
  );
});

test("unknown or failed requirements force request_changes", () => {
  const result = validateReviewResponse(
    response({
      verdict: "approve",
      requirements: [
        { id: "AC-1", status: "pass", evidence: "tests/a.test.js:12" },
        { id: "AC-2", status: "unknown", evidence: "Not exercised" },
      ],
      risks: ["Needs browser verification"],
    }),
    assessment,
  );

  assert.equal(result.approved, false);
  assert.equal(result.verdict, "request_changes");
});

test("non-JSON model output is rejected and never executed", () => {
  assert.throws(
    () =>
      validateReviewResponse(
        {
          subtype: "success",
          is_error: false,
          result: "approve; touch /tmp/reviewer-output-must-not-run",
        },
        assessment,
      ),
    /valid JSON/,
  );
});
