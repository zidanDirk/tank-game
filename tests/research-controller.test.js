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
if (name === 'claude') {
  if (state.exhaustOnce) {
    state.exhaustOnce = false;
    out = JSON.stringify({is_error:true,subtype:'error_max_turns',session_id:'a6e91ac4-3824-411e-9b6d-175dacd946ed'});
  } else {
    const draft = JSON.parse(JSON.stringify(state.plan));
    if (state.invalidOnce) {
      state.invalidOnce = false;
      draft.tasks[0].changeFiles = ['src/a.js','src/b.js','src/c.js','src/d.js'];
    }
    out = JSON.stringify({structured_output:draft,session_id:'a6e91ac4-3824-411e-9b6d-175dacd946ed'});
  }
}
if (name === 'gh') {
  if (args[0] === 'api') out = JSON.stringify(state.issues);
  if (args[0] === 'issue' && args[1] === 'view') out = JSON.stringify({number:15,title:'Parent',body:'- [ ] Behavior works',state:state.closed ? 'CLOSED' : 'OPEN',labels:[{name:'同意实现'}]});
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
    fs.writeFileSync(fixture, JSON.stringify({ ...result, closed: true }));
    const closed = invoke();
    assert.equal(closed.status, 1);
    assert.match(closed.stderr, /open approved parent/);
    assert.equal(JSON.parse(fs.readFileSync(fixture)).issues.length, 2);

    const responseFile = path.join(dir, "research-response.json");
    const research = { title: "Research", summary: "One finding", sources: [
      { url: "http://example.org/reference", finding: "Public reference" },
      { url: "https://example.org/other", finding: "Second reference" },
    ] };
    fs.writeFileSync(responseFile, JSON.stringify({ result: JSON.stringify(research) }));
    const beforePreview = JSON.parse(fs.readFileSync(fixture));
    fs.writeFileSync(fixture, JSON.stringify({ ...beforePreview, exhaustOnce: true, invalidOnce: true }));
    const preview = spawnSync(process.execPath, [script, "research"], {
      env: { PATH: bin, HOME: dir, REPO_DIR: dir, FIXTURE: fixture,
        TANK_RESEARCH_STATE_DIR: path.join(dir, "research-state"),
        RESEARCH_RESPONSE_FILE: responseFile, DRY_RUN: "true" },
      encoding: "utf8",
    });
    assert.equal(preview.status, 0, preview.stderr);
    const afterPreview = JSON.parse(fs.readFileSync(fixture));
    assert.equal(afterPreview.issues.length, 2, "preview never publishes");
    assert.equal(afterPreview.calls.filter(([name]) => name === "claude").length, 4,
      "resume reuses research, finalizes once, then repairs an oversized plan without rereading");
    const finalization = afterPreview.calls.filter(([name]) => name === "claude").at(-1);
    assert.equal(finalization[finalization.indexOf("--tools") + 1], "");
    assert.ok(finalization.includes("--resume"));
    research.sources[0].url = "javascript:alert(1)";
    fs.writeFileSync(responseFile, JSON.stringify({ result: JSON.stringify(research) }));
    const invalid = spawnSync(process.execPath, [script, "research"], {
      env: { PATH: bin, HOME: dir, REPO_DIR: dir, FIXTURE: fixture,
        TANK_RESEARCH_STATE_DIR: path.join(dir, "invalid-state"),
        RESEARCH_RESPONSE_FILE: responseFile, DRY_RUN: "true" },
      encoding: "utf8",
    });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /HTTP\(S\) sources/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
