import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("split controller resumes publishing without duplicating issues or approving children", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tank-controller-test-"));
  try {
    const bin = path.join(dir, "bin");
    fs.mkdirSync(bin);
    const fixture = path.join(dir, "fixture.json");
    const task = {
      id: "logic", title: "Focused logic", goal: "One behavior",
      changeFiles: ["src/core/briefing.js"], estimatedChangedLines: 50,
      acceptance: ["Behavior works"], outOfScope: ["UI"],
      manualPlaytest: ["No regression"], acceptanceKind: "node",
      dependsOn: [], sourceCriteria: [1],
    };
    fs.writeFileSync(fixture, JSON.stringify({ issues: [], calls: [], plan: {
      title: "Small plan", summary: "Split by dependency",
      tasks: [task, { ...task, id: "ui", title: "Focused UI", dependsOn: ["logic"] }],
    } }));
    const stub = `#!${process.execPath}
import fs from 'node:fs';
import path from 'node:path';
const name = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const file = process.env.FIXTURE;
const state = JSON.parse(fs.readFileSync(file));
state.calls.push([name, ...args.filter((_, i) => i === 0 || args[i - 1] !== '-p')]);
let out = '';
if (name === 'git' && args[0] === 'worktree' && args[1] === 'add') fs.mkdirSync(args[3], {recursive:true});
if (name === 'claude') out = JSON.stringify({structured_output:state.plan});
if (name === 'gh') {
  if (args[0] === 'api') out = JSON.stringify(state.issues);
  if (args[0] === 'issue' && args[1] === 'view') out = JSON.stringify({number:15,title:'Parent',body:'- [ ] Behavior works',state:'OPEN',labels:[{name:'同意实现'}]});
  if (args[0] === 'issue' && args[1] === 'create') {
    const body = fs.readFileSync(args[args.indexOf('--body-file') + 1], 'utf8');
    const number = 100 + state.issues.length;
    state.issues.push({number,body,label:args[args.indexOf('--label') + 1]});
    out = 'https://github.com/a/b/issues/' + number;
  }
}
fs.writeFileSync(file, JSON.stringify(state));
process.stdout.write(out);
`;
    for (const name of ["gh", "git", "claude"]) {
      fs.writeFileSync(path.join(bin, name), stub, { mode: 0o755 });
    }
    fs.writeFileSync(path.join(bin, "package.json"), '{"type":"module"}');
    const script = fileURLToPath(new URL("../scripts/daily-research/run.mjs", import.meta.url));
    const invoke = () => spawnSync(process.execPath, [script, "split", "15"], {
      env: { PATH: bin, HOME: dir, REPO_DIR: dir, FIXTURE: fixture, TANK_RESEARCH_STATE_DIR: path.join(dir, "state") },
      encoding: "utf8",
    });
    const first = invoke();
    assert.equal(first.status, 0, first.stderr);
    const second = invoke();
    assert.equal(second.status, 0, second.stderr);
    const result = JSON.parse(fs.readFileSync(fixture));
    assert.equal(result.issues.length, 2);
    assert.ok(result.issues.every((i) => i.label === "未审批"));
    assert.match(result.issues[1].body, /#100 的实现 PR 必须先合并/);
    assert.equal(result.calls.filter(([name]) => name === "claude").length, 1);
    assert.ok(result.calls.some((args) => args.includes("挂起")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
