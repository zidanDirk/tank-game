#!/usr/bin/env node
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { readContract } from "../daily-research/contract.mjs";

export function buildReviewContext(issue, assessment) {
  if (issue?.number !== assessment?.issueNumber)
    throw new Error("review issue identity mismatch");
  const contract = readContract(issue.body);
  const criteria = assessment.acceptanceCriteria;
  if (!Array.isArray(criteria) || !criteria.length)
    throw new Error("missing review criteria");
  if (
    contract &&
    JSON.stringify(contract.acceptance) !== JSON.stringify(criteria)
  ) {
    throw new Error("review acceptance criteria mismatch");
  }
  return {
    issueNumber: issue.number,
    title: issue.title,
    goal: contract?.goal ?? null,
    acceptanceCriteria: criteria,
    changeFiles: contract?.changeFiles ?? assessment.referencedFiles,
    outOfScope: contract?.outOfScope ?? [],
    dependencyIssues: contract?.dependencyIssues ?? [],
    acceptanceKind: contract?.acceptanceKind ?? null,
    // Preserve legacy scope too; source text remains untrusted, not instructions.
    issueBody: issue.body,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    if (process.argv.length !== 4)
      throw new Error("usage: review-context.mjs ISSUE_JSON ASSESSMENT_JSON");
    const [issue, assessment] = process.argv
      .slice(2)
      .map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
    process.stdout.write(
      JSON.stringify(buildReviewContext(issue, assessment), null, 2) + "\n",
    );
  } catch (error) {
    process.stderr.write("review-context: " + error.message + "\n");
    process.exitCode = 2;
  }
}
