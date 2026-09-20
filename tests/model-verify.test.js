import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVerificationInvocation } from "../scripts/issue-implementer/model-verify.mjs";

test("the model verification tool exposes only fixed unit and build modes", () => {
  const unit = buildVerificationInvocation("unit", {
    repoDir: "/repo",
    trustedVerifier: "/trusted/automation/verify.sh",
    sourceEnv: {
      PATH: "/usr/bin:/bin",
      GH_TOKEN: "secret-github-token",
      ANTHROPIC_AUTH_TOKEN: "secret-model-token",
    },
  });
  const build = buildVerificationInvocation("build", {
    repoDir: "/repo",
    trustedVerifier: "/trusted/automation/verify.sh",
    sourceEnv: { PATH: "/usr/bin:/bin" },
  });

  assert.equal(unit.command, "/trusted/automation/verify.sh");
  assert.deepEqual(unit.args, ["unit"]);
  assert.deepEqual(build.args, ["build"]);
  assert.equal(unit.options.cwd, "/repo");
  assert.equal(unit.options.env.REPO_DIR, "/repo");
  assert.equal(unit.options.shell, false);
  assert.equal(unit.options.timeout, 300_000);
});

test("the model verification environment never inherits credentials", () => {
  const invocation = buildVerificationInvocation("unit", {
    repoDir: "/repo",
    sourceEnv: {
      PATH: "/trusted/bin",
      GH_TOKEN: "secret-github-token",
      ANTHROPIC_AUTH_TOKEN: "secret-model-token",
      MINIMAX_API_KEY: "secret-minimax-token",
      RANDOM_UNSAFE_VALUE: "do-not-copy",
    },
  });

  assert.deepEqual(invocation.options.env, {
    CI: "true",
    HOME: "/tmp",
    PATH: "/trusted/bin",
    REPO_DIR: "/repo",
  });
});

test("browser, full, arbitrary, and missing modes are rejected", () => {
  for (const mode of ["browser", "full", "rm -rf /", "", undefined]) {
    assert.throws(
      () => buildVerificationInvocation(mode, { repoDir: "/repo" }),
      /mode must be unit or build/iu,
    );
  }
});
