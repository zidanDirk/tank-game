import { test } from "node:test";
import assert from "node:assert/strict";
import { readPages } from "../scripts/daily-research/github-pages.mjs";

test("GitHub pagination handles multiple pages without newer gh flags", () => {
  const calls = [];
  const result = readPages((args) => {
    calls.push(args);
    return calls.length === 1 ? Array.from({ length: 100 }, (_, i) => i) : [100];
  }, "repos/a/b/issues?state=all");
  assert.equal(result.length, 101);
  assert.deepEqual(calls[1], ["api", "repos/a/b/issues?state=all&per_page=100&page=2"]);
});

test("GitHub pagination rejects unexpected API results", () => {
  assert.throws(() => readPages(() => ({}), "repos/a/b/issues"), /expected an array/);
});
