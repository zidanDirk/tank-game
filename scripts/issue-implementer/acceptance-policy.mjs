#!/usr/bin/env node

import fs from "node:fs";
import { pathToFileURL } from "node:url";

function assertIssueNumber(issueNumber) {
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
    throw new TypeError("issue number must be a positive integer");
  }
}

function normalizePaths(paths) {
  if (!Array.isArray(paths)) {
    throw new TypeError("changed paths must be an array");
  }

  return [
    ...new Set(
      paths.map((value) => {
        if (typeof value !== "string") {
          throw new TypeError("changed paths must contain only strings");
        }
        return value.replace(/\r$/u, "");
      }).filter(Boolean),
    ),
  ].sort();
}

export function classifyAcceptanceChanges(issueNumber, paths, kind = "node") {
  assertIssueNumber(issueNumber);
  if (!["node", "browser"].includes(kind)) throw new Error("invalid acceptance kind");

  const expectedPath = `tests/acceptance-issue-${issueNumber}.${kind === "browser" ? "browser.mjs" : "test.js"}`;
  const actualPaths = normalizePaths(paths);
  const extraPaths = actualPaths.filter((value) => value !== expectedPath);
  let status = "extra";

  if (actualPaths.length === 0) {
    status = "missing";
  } else if (actualPaths.length === 1 && actualPaths[0] === expectedPath) {
    status = "exact";
  }

  return {
    schemaVersion: 1,
    status,
    expectedPath,
    actualPaths,
    extraPaths,
    canContinueAfterMaxTurns: status === "missing",
  };
}

function main(argv) {
  if (argv.length < 2 || argv.length > 3) {
    throw new Error(
      "usage: acceptance-policy.mjs ISSUE_NUMBER CHANGED_PATHS_FILE",
    );
  }

  const issueNumber = Number(argv[0]);
  const paths = fs.readFileSync(argv[1], "utf8").split(/\n/u);
  process.stdout.write(
    `${JSON.stringify(classifyAcceptanceChanges(issueNumber, paths, argv[2] || "node"), null, 2)}\n`,
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
