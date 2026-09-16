// tests/promote.test.js
// Unit tests for scripts/loop/promote.mjs — covers the bridge logic between
// human-accepted harvest ideas and pending implement-cycle items.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  pickNextAcceptedIdea,
  promoteIdea,
  pickAndPromote,
} from "../scripts/loop/promote.mjs";

function tmpBacklog(ideas, items = []) {
  const dir = mkdtempSync(path.join(tmpdir(), "tank-promote-"));
  const bp = path.join(dir, "backlog.json");
  const sp = path.join(dir, "state.json");
  writeFileSync(bp, JSON.stringify({ version: 1, items, ideas }, null, 2));
  writeFileSync(sp, JSON.stringify({ version: 2 }, null, 2));
  return { dir, bp, sp, cleanup: () => rmSync(dir, { recursive: true }) };
}

test("pickNextAcceptedIdea returns null when no accepted ideas exist", async () => {
  const t = tmpBacklog([{ id: "x", human_status: "deferred" }]);
  try {
    const got = await pickNextAcceptedIdea({ backlogPath: t.bp });
    assert.equal(got, null);
  } finally {
    t.cleanup();
  }
});

test("pickNextAcceptedIdea prefers XS estimate, then FIFO by decision time", async () => {
  const t = tmpBacklog([
    {
      id: "big",
      human_status: "accepted",
      estimate: "L",
      human_decision_at: "2026-09-16T08:00:00Z",
      title: "Bigger feature",
    },
    {
      id: "small",
      human_status: "accepted",
      estimate: "XS",
      human_decision_at: "2026-09-16T09:00:00Z",
      title: "Tiny improvement",
    },
    {
      id: "older-xs",
      human_status: "accepted",
      estimate: "XS",
      human_decision_at: "2026-09-15T09:00:00Z",
      title: "Older tiny improvement",
    },
  ]);
  try {
    const got = await pickNextAcceptedIdea({ backlogPath: t.bp });
    assert.equal(got.id, "older-xs");
  } finally {
    t.cleanup();
  }
});

test("promoteIdea flips human_status and creates a pending item with stable id", async () => {
  const t = tmpBacklog(
    [
      {
        id: "h-2026-09-16-001",
        title: "Add minimap overlay",
        category: "ui-ux",
        estimate: "S",
        human_status: "accepted",
        human_decision_at: "2026-09-16T09:30:00Z",
        source: { url: "https://example.com/x", domain: "example.com", trust: 0.9 },
        score: { feasibility: 4, novelty: 3, effort_fit: 4, domain_fit: 5, total: 16 },
        suggested_touches: ["src/core/GameManager.js", "index.html"],
      },
    ],
    [],
  );
  try {
    const idea = await pickNextAcceptedIdea({ backlogPath: t.bp });
    const out = await promoteIdea({ idea, backlogPath: t.bp, statePath: t.sp });
    assert.equal(out.itemId, "h-2026-09-16-001-01");
    assert.equal(out.item.status, "pending");
    assert.equal(out.item.dimension, "ui-ux");
    assert.equal(out.item.skill, "tank-ui-juice");
    assert.deepEqual(out.item.touches, [
      "src/core/GameManager.js",
      "index.html",
    ]);
    assert.ok(out.item.verify.length >= 2);

    const after = JSON.parse(readFileSync(t.bp, "utf8"));
    assert.equal(after.ideas[0].human_status, "promoted");
    assert.ok(after.ideas[0].promoted_at);
    assert.equal(after.items.length, 1);
    assert.equal(after.items[0].id, "h-2026-09-16-001-01");

    const state = JSON.parse(readFileSync(t.sp, "utf8"));
    assert.equal(state.last_promotion.item_id, "h-2026-09-16-001-01");
    assert.equal(state.last_promotion.idea_id, "h-2026-09-16-001");
    assert.equal(state.next_action, "run_loop_next");
  } finally {
    t.cleanup();
  }
});

test("promoteIdea uses GameManager as fallback touch when critic gave none", async () => {
  const t = tmpBacklog([
    {
      id: "h-x",
      title: "Bare idea",
      category: "gameplay",
      estimate: "M",
      human_status: "accepted",
      human_decision_at: "2026-09-16T09:00:00Z",
      source: {},
      score: {},
      suggested_touches: [],
    },
  ]);
  try {
    const idea = await pickNextAcceptedIdea({ backlogPath: t.bp });
    const out = await promoteIdea({ idea, backlogPath: t.bp, statePath: t.sp });
    assert.deepEqual(out.item.touches, ["src/core/GameManager.js"]);
    assert.equal(out.item.skill, null); // gameplay category → no UI juice skill
  } finally {
    t.cleanup();
  }
});

test("promoteIdea appends sequence suffix when an item with the same prefix already exists", async () => {
  const t = tmpBacklog(
    [
      {
        id: "h-y",
        title: "Second pass",
        category: "gameplay",
        estimate: "S",
        human_status: "accepted",
        human_decision_at: "2026-09-16T10:00:00Z",
        source: {},
        score: {},
        suggested_touches: ["src/entities/Tank.js"],
      },
    ],
    [
      {
        id: "h-y-01",
        title: "First pass",
        status: "done",
        touches: ["src/entities/Tank.js"],
      },
    ],
  );
  try {
    const idea = await pickNextAcceptedIdea({ backlogPath: t.bp });
    const out = await promoteIdea({ idea, backlogPath: t.bp, statePath: t.sp });
    assert.equal(out.itemId, "h-y-02");
  } finally {
    t.cleanup();
  }
});

test("pickAndPromote is a no-op when no accepted ideas exist", async () => {
  const t = tmpBacklog([{ id: "h-z", human_status: "deferred" }]);
  try {
    const out = await pickAndPromote({ backlogPath: t.bp, statePath: t.sp });
    assert.equal(out.skipped, true);
    assert.equal(out.reason, "no-accepted-ideas");
    const after = JSON.parse(readFileSync(t.bp, "utf8"));
    assert.equal(after.items.length, 0);
  } finally {
    t.cleanup();
  }
});
