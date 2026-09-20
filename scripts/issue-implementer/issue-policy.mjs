#!/usr/bin/env node

import fs from "node:fs";
import { pathToFileURL } from "node:url";

const LIMITS = Object.freeze({
  bodyCharacters: 50_000,
  acceptanceItems: 5,
  referencedFiles: 4,
  concernGroups: 4,
  criteriaPerSlice: 2,
});

const CONCERNS = Object.freeze({
  input:
    /\b(touch|pointer|keyboard|mouse|input|d-?pad|gesture)\b|触屏|触控|输入|手势/iu,
  visual:
    /\b(css|hud|canvas|layout|banner|cursor|animation|responsive)\b|样式|视觉|布局|动画/iu,
  accessibility:
    /\b(aria|accessibility|screen\s*reader|axe|reduced.motion)\b|无障碍|屏读/iu,
  persistence:
    /\b(localStorage|persist|history|save|storage)\b|持久化|存储|保存/iu,
  gameplay:
    /\b(gameplay|difficulty|enemy|boss|wave|level|life|powerup|combat)\b|玩法|难度|敌人|关卡|生命|道具/iu,
  testing: /\b(test|playwright|lighthouse|coverage|snapshot)\b|测试|覆盖率/iu,
});

function assertIssue(issue) {
  if (!issue || typeof issue !== "object" || Array.isArray(issue)) {
    throw new TypeError("issue must be an object");
  }
  if (!Number.isSafeInteger(issue.number) || issue.number <= 0) {
    throw new TypeError("issue number must be a positive integer");
  }
  if (typeof issue.title !== "string" || typeof issue.body !== "string") {
    throw new TypeError("issue title and body must be strings");
  }
  if (issue.body.length > LIMITS.bodyCharacters) {
    throw new RangeError(
      `issue body exceeds ${LIMITS.bodyCharacters} characters`,
    );
  }
}

function extractAcceptanceCriteria(body) {
  return body
    .split(/\r?\n/u)
    .map((line) => line.match(/^\s*[-*]\s*\[[ xX]\]\s+(.+?)\s*$/u)?.[1])
    .filter(Boolean);
}

function extractReferencedFiles(text) {
  const matches = text.match(
    /(?:src|tests|scripts)\/[A-Za-z0-9_.\/-]+|(?:index\.html|package\.json|vite\.config\.js)/gu,
  );
  return [
    ...new Set((matches ?? []).map((value) => value.replace(/[),.;:]+$/u, ""))),
  ].sort();
}

function detectConcernGroups(text) {
  return Object.entries(CONCERNS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name)
    .sort();
}

function chunkCriteria(criteria) {
  const slices = [];
  for (
    let index = 0;
    index < criteria.length;
    index += LIMITS.criteriaPerSlice
  ) {
    slices.push({
      title: `Issue slice ${slices.length + 1}`,
      acceptanceCriteria: criteria.slice(
        index,
        index + LIMITS.criteriaPerSlice,
      ),
    });
  }
  return slices;
}

export function assessIssue(issue) {
  assertIssue(issue);

  const acceptanceCriteria = extractAcceptanceCriteria(issue.body);
  const referencedFiles = extractReferencedFiles(
    `${issue.title}\n${issue.body}`,
  );
  const concernGroups = detectConcernGroups(`${issue.title}\n${issue.body}`);
  const reasons = [];

  if (acceptanceCriteria.length === 0) {
    reasons.push({
      code: "missing_acceptance_criteria",
      actual: 0,
      limit: LIMITS.acceptanceItems,
    });
  }
  if (acceptanceCriteria.length > LIMITS.acceptanceItems) {
    reasons.push({
      code: "too_many_acceptance_items",
      actual: acceptanceCriteria.length,
      limit: LIMITS.acceptanceItems,
    });
  }
  if (referencedFiles.length > LIMITS.referencedFiles) {
    reasons.push({
      code: "too_many_files",
      actual: referencedFiles.length,
      limit: LIMITS.referencedFiles,
    });
  }
  if (concernGroups.length > LIMITS.concernGroups) {
    reasons.push({
      code: "too_many_concerns",
      actual: concernGroups.length,
      limit: LIMITS.concernGroups,
    });
  }

  const classification = reasons.length ? "needs_split" : "eligible";

  return {
    schemaVersion: 1,
    issueNumber: issue.number,
    classification,
    acceptanceCriteria,
    referencedFiles,
    concernGroups,
    reasons,
    suggestedSlices:
      classification === "needs_split" ? chunkCriteria(acceptanceCriteria) : [],
  };
}

function main(argv) {
  if (argv.length !== 1) {
    throw new Error("usage: issue-policy.mjs ISSUE_JSON");
  }
  const issue = JSON.parse(fs.readFileSync(argv[0], "utf8"));
  process.stdout.write(`${JSON.stringify(assessIssue(issue), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`issue-policy: ${error.message}\n`);
    process.exitCode = 2;
  }
}
