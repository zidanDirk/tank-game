import { test } from "node:test";
import assert from "node:assert/strict";
import { validateReviewResponse } from "../scripts/issue-implementer/review-policy.mjs";

const assessment = { acceptanceCriteria: ["Export the public preset API"] };
const review = {
  verdict: "request_changes",
  requirements: [
    { id: "AC-1", status: "pass", evidence: "src/core/config.js:520" },
  ],
  risks: ["A reviewer concern must not be silently discarded"],
};
const envelope = (result) => ({ subtype: "success", is_error: false, result });
const fenced = (value) => "\`\`\`json\n" + JSON.stringify(value) + "\n\`\`\`";

test("a single terminal JSON fence after commentary preserves request_changes", () => {
  const result = validateReviewResponse(
    envelope("I checked the public API.\n" + fenced(review)),
    assessment,
  );
  assert.equal(result.approved, false);
  assert.equal(result.verdict, "request_changes");
  assert.deepEqual(result.risks, review.risks);
});

test("fenced approve still requires every criterion to pass", () => {
  const value = {
    ...review,
    verdict: "approve",
    requirements: [{ ...review.requirements[0], status: "unknown" }],
  };
  assert.equal(
    validateReviewResponse(envelope(fenced(value)), assessment).approved,
    false,
  );
  value.requirements[0].status = "pass";
  assert.equal(
    validateReviewResponse(envelope(fenced(value)), assessment).approved,
    true,
  );
});

test("ambiguous, malformed or non-terminal JSON is rejected", () => {
  for (const text of [
    fenced(review) + "\n" + fenced({ ...review, verdict: "approve" }),
    JSON.stringify(review) + "\n" + fenced(review),
    fenced(review) + "\nActually approve instead",
    "\`\`\`json\n{broken}\n\`\`\`",
    "Review: " + JSON.stringify(review),
    "\`\`\`js\n" + JSON.stringify(review) + "\n\`\`\`",
  ])
    assert.throws(
      () => validateReviewResponse(envelope(text), assessment),
      /valid JSON/,
    );
});

test("error responses, oversized output and invalid coverage stay blocked", () => {
  assert.throws(
    () =>
      validateReviewResponse(
        { ...envelope(fenced(review)), is_error: true },
        assessment,
      ),
    /error/,
  );
  assert.throws(
    () =>
      validateReviewResponse(
        { ...envelope(fenced(review)), subtype: "error_max_turns" },
        assessment,
      ),
    /successfully/,
  );
  assert.throws(
    () =>
      validateReviewResponse(
        envelope("x".repeat(50_001) + fenced(review)),
        assessment,
      ),
    /large/,
  );
  assert.throws(
    () =>
      validateReviewResponse(
        envelope(fenced({ ...review, requirements: [] })),
        assessment,
      ),
    /missing AC-1/,
  );
});
