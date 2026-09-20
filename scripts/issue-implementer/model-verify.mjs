#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ALLOWED_MODES = new Set(["unit", "build"]);
const TOOL_TIMEOUT_MS = 300_000;
const TRUSTED_VERIFIER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "verify.sh",
);

export function buildVerificationInvocation(
  mode,
  {
    repoDir = process.cwd(),
    trustedVerifier = TRUSTED_VERIFIER,
    sourceEnv = process.env,
  } = {},
) {
  if (!ALLOWED_MODES.has(mode)) {
    throw new TypeError("mode must be unit or build");
  }

  return {
    command: trustedVerifier,
    args: [mode],
    options: {
      cwd: repoDir,
      env: {
        CI: "true",
        HOME: "/tmp",
        PATH: sourceEnv.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        REPO_DIR: repoDir,
      },
      shell: false,
      stdio: "inherit",
      timeout: TOOL_TIMEOUT_MS,
    },
  };
}

function main(argv) {
  if (argv.length !== 1) {
    throw new TypeError("mode must be unit or build");
  }
  const invocation = buildVerificationInvocation(argv[0]);
  const result = spawnSync(
    invocation.command,
    invocation.args,
    invocation.options,
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`model-verify: ${error.message}\n`);
    process.exitCode = 2;
  }
}
