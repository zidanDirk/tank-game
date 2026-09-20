#!/usr/bin/env node

import fs from "node:fs";
import { pathToFileURL } from "node:url";

const MAX_TITLE_CHARACTERS = 180;

function assertParent(parent) {
  if (!Number.isSafeInteger(parent?.number) || parent.number <= 0) {
    throw new TypeError("parent issue number must be a positive integer");
  }
  if (typeof parent.title !== "string" || typeof parent.url !== "string") {
    throw new TypeError("parent issue title and URL must be strings");
  }
}

export function buildChildIssuePlan(parent, assessment) {
  assertParent(parent);
  if (
    assessment?.classification !== "needs_split" ||
    assessment.canAutoSplit !== true ||
    !Array.isArray(assessment.suggestedSlices) ||
    assessment.suggestedSlices.length === 0
  ) {
    throw new TypeError("assessment cannot be split automatically");
  }

  const cleanTitle = parent.title.replace(/[\r\n]+/gu, " ").trim();
  const total = assessment.suggestedSlices.length;
  const children = assessment.suggestedSlices.map((slice, index) => {
    if (
      slice?.automatable !== true ||
      !Array.isArray(slice.acceptanceCriteria) ||
      slice.acceptanceCriteria.length === 0
    ) {
      throw new TypeError("assessment contains a non-automatable slice");
    }

    const sliceIndex = index + 1;
    const marker = `issue-implementer-parent:${parent.number}:slice:${sliceIndex}`;
    const prefix = `[拆分 #${parent.number} ${sliceIndex}/${total}] `;
    const title = `${prefix}${cleanTitle}`.slice(0, MAX_TITLE_CHARACTERS);
    const criteria = slice.acceptanceCriteria
      .map((criterion) => `- [ ] ${String(criterion).trim()}`)
      .join("\n");
    const sourceCriteria = (slice.sourceCriterionNumbers ?? []).join(", ");
    const referencedFiles = (slice.referencedFiles ?? [])
      .map((file) => `- \`${file}\``)
      .join("\n");

    const body = `<!-- ${marker} -->

## 来源

- 父 Issue：#${parent.number}（${parent.url}）
- 原验收条目：${sourceCriteria || "未标注"}
- 此 Issue 由范围策略自动拆分，尚未获准自动实现。

## 验收标准

${criteria}

## 预计涉及文件

${referencedFiles || "- 未明确；实现前必须保持在 3 个文件以内"}

## 审批

请先独立审查此切片的边界；确认后需要人工添加 \`同意实现\` 标签。
`;

    return { sliceIndex, marker, title, body };
  });

  return {
    schemaVersion: 1,
    parentIssueNumber: parent.number,
    children,
  };
}

function main(argv) {
  if (argv.length !== 2) {
    throw new Error("usage: split-issue-plan.mjs ISSUE_JSON ASSESSMENT_JSON");
  }
  const parent = JSON.parse(fs.readFileSync(argv[0], "utf8"));
  const assessment = JSON.parse(fs.readFileSync(argv[1], "utf8"));
  process.stdout.write(
    `${JSON.stringify(buildChildIssuePlan(parent, assessment), null, 2)}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`split-issue-plan: ${error.message}\n`);
    process.exitCode = 2;
  }
}
