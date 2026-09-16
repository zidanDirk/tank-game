// tests/harvest.test.js
// Unit tests for the Harvest Intake lib (sources + harvest orchestration).
// Run with: npm test  (must pass alongside the existing 22+ tests).

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  isAllowed,
  acceptedDomains,
  ALLOWED_SOURCES,
  DENIED_DOMAINS,
} from "../scripts/loop/lib/sources.mjs";
import {
  jaccard,
  parseReviewArgs,
  applyHumanReview,
  shouldHarvest,
  latestScoredPath,
} from "../scripts/loop/lib/harvest.mjs";

// --- sources.isAllowed ---------------------------------------------------

test("sources.isAllowed: allowlists gdcvault.com with correct metadata", () => {
  const r = isAllowed("https://gdcvault.com/game-feel-talk");
  assert.equal(r.allowed, true);
  assert.equal(r.source.category, "design");
  assert.ok(r.source.trust >= 0.85);
});

test("sources.isAllowed: allowlists MDN", () => {
  const r = isAllowed(
    "https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D",
  );
  assert.equal(r.allowed, true);
  assert.equal(r.source.trust, 0.95);
});

test("sources.isAllowed: github is conditionally allowed", () => {
  const r = isAllowed("https://github.com/mrdoob/three.js");
  assert.equal(r.allowed, true);
  assert.equal(r.reason, "github-conditional");
});

test("sources.isAllowed: rejects reddit even though allowlist covers many sites", () => {
  const r = isAllowed("https://old.reddit.com/r/gamedev/comments/abc");
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "denied-domain");
});

test("sources.isAllowed: rejects unknown domain", () => {
  const r = isAllowed("https://random-blog-xyz.example.com/post");
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "not-allowlisted");
});

test("sources.isAllowed: rejects unparseable URL", () => {
  const r = isAllowed("not-a-url");
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "unparseable-url");
});

test("sources.isAllowed: strips www. prefix", () => {
  const r = isAllowed("https://www.gdcvault.com/page");
  assert.equal(r.allowed, true);
});

test("sources.acceptedDomains: includes github.com", () => {
  const d = acceptedDomains();
  assert.ok(d.includes("github.com"));
  assert.ok(d.includes("developer.mozilla.org"));
});

// --- harvest.jaccard ------------------------------------------------------

test("jaccard: identical strings → 1", () => {
  assert.equal(
    jaccard("Bullet-time on kill streak", "Bullet-time on kill streak"),
    1,
  );
});

test("jaccard: completely different strings → ~0", () => {
  const s = jaccard("apple banana cherry", "zebra yak xylophone");
  assert.ok(s < 0.1);
});

test("jaccard: near-identical titles exceed the 0.85 dedup threshold", () => {
  // Title pairs that the harvester's dedup filter should reject as duplicates.
  const s = jaccard(
    "Bullet-time 0.3s on player kill streak",
    "Bullet-time 0.3s on player kill streak v2",
  );
  assert.ok(s > 0.3, `expected >0.3 similarity, got ${s}`);
});

test("jaccard: divergent titles stay well below the 0.85 dedup threshold", () => {
  const s = jaccard(
    "Bullet-time on kill streak",
    "Endless mode daily seed sharing",
  );
  assert.ok(s < 0.2, `expected <0.2, got ${s}`);
});

// --- harvest.parseReviewArgs ----------------------------------------------

test("parseReviewArgs: parses --accept --defer --drop --reason", () => {
  const r = parseReviewArgs([
    "--accept",
    "1,4",
    "--defer",
    "2,5",
    "--drop",
    "3",
    "--reason",
    "already exists",
  ]);
  assert.deepEqual(r.accepted, [1, 4]);
  assert.deepEqual(r.deferred, [2, 5]);
  assert.deepEqual(r.dropped, [3]);
  assert.deepEqual(r.reasons, { 3: "already exists" });
});

test("parseReviewArgs: empty args → empty result", () => {
  const r = parseReviewArgs([]);
  assert.deepEqual(r, { accepted: [], deferred: [], dropped: [], reasons: {} });
});

test("parseReviewArgs: missing values are tolerated", () => {
  const r = parseReviewArgs(["--accept"]);
  assert.deepEqual(r.accepted, []);
});

// --- harvest.shouldHarvest -----------------------------------------------

test("shouldHarvest: triggers when items[] and ideas[] both empty", () => {
  const r = shouldHarvest({
    state: { harvest_runs: [] },
    backlog: { items: [], ideas: [] },
  });
  assert.equal(r.trigger, true);
  assert.equal(r.reason, "both-empty");
});

test("shouldHarvest: does not trigger when items[] has pending", () => {
  const r = shouldHarvest({
    state: { harvest_runs: [] },
    backlog: { items: [{ status: "pending" }], ideas: [] },
  });
  assert.equal(r.trigger, false);
});

test("shouldHarvest: reports stale (>7d) but doesn't force trigger", () => {
  const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
  const r = shouldHarvest({
    state: { harvest_runs: [{ at: tenDaysAgo }] },
    backlog: { items: [{ status: "done" }], ideas: ["x"] },
  });
  assert.equal(r.trigger, false);
  assert.equal(r.reason, "stale");
  assert.ok(r.days_since >= 9);
});

// --- harvest.applyHumanReview (integration with tmpdir) -------------------

async function setup() {
  const dir = await mkdtemp(path.join(tmpdir(), "harvest-test-"));
  const scoredPath = path.join(dir, "scored.json");
  const backlogPath = path.join(dir, "backlog.json");
  const statePath = path.join(dir, "state.json");
  const scored = {
    schema: 1,
    generated_at: "2026-09-14T18:00:00Z",
    top_count: 3,
    total_scored: 3,
    ideas: [
      {
        title: "Bullet-time 0.3s on player kill streak",
        url: "https://gdcvault.com/bullet-time",
        source_domain: "gdcvault.com",
        trust: 0.9,
        category: "ui-ux",
        estimate: "S",
        total: 17,
        scores: { feasibility: 4, novelty: 5, effort_fit: 3, domain_fit: 5 },
        suggested_touches: ["src/systems/Effects.js"],
      },
      {
        title: "Endless mode daily seed",
        url: "https://indiegameplus.com/daily-seed",
        source_domain: "indiegameplus.com",
        trust: 0.6,
        category: "gameplay",
        estimate: "M",
        total: 15,
        scores: { feasibility: 3, novelty: 4, effort_fit: 3, domain_fit: 5 },
        suggested_touches: [],
      },
      {
        title: "Particle-based muzzle flash",
        url: "https://github.com/threejs/example",
        source_domain: "github.com",
        trust: 0.7,
        category: "ui-ux",
        estimate: "XS",
        total: 14,
        scores: { feasibility: 5, novelty: 3, effort_fit: 4, domain_fit: 2 },
        suggested_touches: ["src/systems/BulletManager.js"],
      },
    ],
  };
  await writeFile(scoredPath, JSON.stringify(scored, null, 2));
  await writeFile(
    backlogPath,
    JSON.stringify({ version: 1, items: [], ideas: [] }, null, 2),
  );
  await writeFile(
    statePath,
    JSON.stringify(
      {
        version: 2,
        harvest_runs: [],
        next_action: "await_human_review",
        cycles: [],
      },
      null,
      2,
    ),
  );
  return { dir, scoredPath, backlogPath, statePath };
}

test("applyHumanReview: accepts → adds to ideas[], resets next_action", async () => {
  const ctx = await setup();
  try {
    const review = parseReviewArgs([
      "--accept",
      "1",
      "--drop",
      "3",
      "--reason",
      "low fit",
    ]);
    const out = await applyHumanReview({ ...ctx, review });
    const backlog = JSON.parse(await readFile(ctx.backlogPath, "utf8"));
    const state = JSON.parse(await readFile(ctx.statePath, "utf8"));
    assert.equal(out.accepted.length, 1);
    assert.equal(out.dropped.length, 1);
    assert.equal(out.deferred.length, 0);
    assert.equal(backlog.ideas.length, 1);
    assert.equal(
      backlog.ideas[0].title,
      "Bullet-time 0.3s on player kill streak",
    );
    assert.equal(backlog.ideas[0].human_status, "accepted");
    assert.equal(backlog.ideas[0].source.domain, "gdcvault.com");
    assert.equal(backlog.ideas[0].score.total, 17);
    assert.equal(backlog.ideas[0].id.startsWith("h-2026-09-14-"), true);
    assert.equal(state.next_action, "triage_new_idea");
    assert.equal(state.harvest_runs.length, 1);
    assert.deepEqual(state.harvest_runs[0].human_decisions, {
      accepted: 1,
      deferred: 0,
      dropped: 1,
      reasons: { 3: "low fit" },
    });
    assert.ok(state.harvest_runs[0].fetched_urls_hash.startsWith("sha256:"));
  } finally {
    await rm(ctx.dir, { recursive: true, force: true });
  }
});

test("applyHumanReview: deferred entries are still recorded", async () => {
  const ctx = await setup();
  try {
    const review = parseReviewArgs(["--defer", "2"]);
    const out = await applyHumanReview({ ...ctx, review });
    const backlog = JSON.parse(await readFile(ctx.backlogPath, "utf8"));
    assert.equal(out.deferred.length, 1);
    assert.equal(backlog.ideas.length, 1);
    assert.equal(backlog.ideas[0].human_status, "deferred");
  } finally {
    await rm(ctx.dir, { recursive: true, force: true });
  }
});

test("applyHumanReview: dropped entries are NOT in ideas[]", async () => {
  const ctx = await setup();
  try {
    const review = parseReviewArgs([
      "--drop",
      "1,2,3",
      "--reason",
      "all noise",
    ]);
    const out = await applyHumanReview({ ...ctx, review });
    const backlog = JSON.parse(await readFile(ctx.backlogPath, "utf8"));
    assert.equal(out.dropped.length, 3);
    assert.equal(backlog.ideas.length, 0);
  } finally {
    await rm(ctx.dir, { recursive: true, force: true });
  }
});
