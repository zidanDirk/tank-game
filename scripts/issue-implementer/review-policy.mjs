#!/usr/bin/env node

import fs from "node:fs";
import { pathToFileURL } from "node:url";

const MAX_REVIEW_CHARACTERS = 50_000;
const ALLOWED_STATUSES = new Set(["pass", "fail", "unknown"]);

function parseModelResult(response) {
  if (!response || typeof response !== "object" || response.is_error === true) {
    throw new TypeError("model review response is an error");
  }
  if (response.subtype !== "success" || typeof response.result !== "string") {
    throw new TypeError("model review response did not complete successfully");
  }
  if (response.result.length > MAX_REVIEW_CHARACTERS) {
    throw new RangeError("model review result is too large");
  }
  try {
    return JSON.parse(response.result);
  } catch {
    throw new SyntaxError("model review result must be valid JSON");
  }
}

function assertShortString(value, field) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_000) {
    throw new TypeError(`${field} must be a non-empty bounded string`);
  }
}

export function validateReviewResponse(response, assessment) {
  const review = parseModelResult(response);
  const criteria = assessment?.acceptanceCriteria;
  if (!Array.isArray(criteria) || criteria.length === 0) {
    throw new TypeError("assessment must contain acceptance criteria");
  }
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    throw new TypeError("review must be an object");
  }
  if (!new Set(["approve", "request_changes"]).has(review.verdict)) {
    throw new TypeError("review verdict is invalid");
  }
  if (!Array.isArray(review.requirements) || !Array.isArray(review.risks)) {
    throw new TypeError("review requirements and risks must be arrays");
  }

  const byId = new Map();
  for (const requirement of review.requirements) {
    if (!requirement || typeof requirement !== "object") {
      throw new TypeError("review requirement must be an object");
    }
    assertShortString(requirement.id, "requirement id");
    assertShortString(requirement.evidence, "requirement evidence");
    if (!ALLOWED_STATUSES.has(requirement.status)) {
      throw new TypeError(`invalid status for ${requirement.id}`);
    }
    if (byId.has(requirement.id)) {
      throw new TypeError(`duplicate requirement ${requirement.id}`);
    }
    byId.set(requirement.id, requirement);
  }

  const normalizedRequirements = criteria.map((criterion, index) => {
    const id = `AC-${index + 1}`;
    const requirement = byId.get(id);
    if (!requirement) throw new TypeError(`review is missing ${id}`);
    return {
      id,
      criterion,
      status: requirement.status,
      evidence: requirement.evidence,
    };
  });

  if (byId.size !== normalizedRequirements.length) {
    throw new TypeError("review contains unknown acceptance requirement ids");
  }

  const risks = review.risks.map((risk, index) => {
    assertShortString(risk, `risk ${index + 1}`);
    return risk;
  });
  const allPassed = normalizedRequirements.every(
    ({ status }) => status === "pass",
  );
  const approved = review.verdict === "approve" && allPassed;

  return {
    schemaVersion: 1,
    approved,
    verdict: approved ? "approve" : "request_changes",
    requirements: normalizedRequirements,
    risks,
  };
}

function main(argv) {
  if (argv.length !== 2) {
    throw new Error("usage: review-policy.mjs RESPONSE_JSON ASSESSMENT_JSON");
  }
  const response = JSON.parse(fs.readFileSync(argv[0], "utf8"));
  const assessment = JSON.parse(fs.readFileSync(argv[1], "utf8"));
  process.stdout.write(
    `${JSON.stringify(validateReviewResponse(response, assessment), null, 2)}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`review-policy: ${error.message}\n`);
    process.exitCode = 2;
  }
}
