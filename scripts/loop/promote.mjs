// scripts/loop/promote.mjs
// Promote one human-accepted idea from backlog.ideas[] into a fresh item[]
// entry so the next `loop:next` cycle has something concrete to implement.
//
// Why this lives in its own module:
//   - The /loop session is the only place the `tank-promoter` agent can
//     reason about an idea's feasibility. But the agent must mutate
//     backlog.json + state.json deterministically — putting the mutation
//     behind a small testable helper means we can dry-run and audit it.
//   - `loop:next` consumes items[] in id order. Promoted ideas get an id
//     derived from their idea-id so the chain of custody is preserved.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const LOOP_DIR = path.join(ROOT, "scripts/loop");
const BACKLOG_PATH = path.join(LOOP_DIR, "backlog.json");
const STATE_PATH = path.join(LOOP_DIR, "state.json");

async function readJSON(p) {
  return JSON.parse(await readFile(p, "utf8"));
}
async function writeJSON(p, obj) {
  await writeFile(p, JSON.stringify(obj, null, 2));
}
function nowISO() {
  return new Date().toISOString();
}

/**
 * Pick the next human-accepted idea to promote.
 *
 * Selection rule (deliberately simple, no ML):
 *   - Filter ideas[] where human_status === "accepted"
 *   - Among those, pick the lowest "estimate" (XS > S > M > L) so each day
 *     yields something small and shippable.
 *   - Tie-break by oldest human_decision_at (FIFO).
 *
 * Returns the chosen idea or null if none qualify.
 */
export async function pickNextAcceptedIdea({ backlogPath = BACKLOG_PATH } = {}) {
  const backlog = await readJSON(backlogPath);
  const accepted = (backlog.ideas || []).filter(
    (it) => it.human_status === "accepted",
  );
  if (!accepted.length) return null;

  const rank = { XS: 0, S: 1, M: 2, L: 3, XL: 4 };
  accepted.sort((a, b) => {
    const ra = rank[a.estimate] ?? 9;
    const rb = rank[b.estimate] ?? 9;
    if (ra !== rb) return ra - rb;
    return new Date(a.human_decision_at || 0) - new Date(b.human_decision_at || 0);
  });
  return accepted[0];
}

/**
 * Promote a specific idea (the chosen one) into a fresh items[] entry.
 *
 * The new item keeps the idea's id as a prefix so the lineage is traceable
 * in journal entries. Suggested file paths from the critic's `suggested_touches`
 * are passed through as `touches[]`. Verify criteria are derived from the
 * critic's score block + category so the verify gate has something concrete
 * to check.
 */
export async function promoteIdea({
  idea,
  backlogPath = BACKLOG_PATH,
  statePath = STATE_PATH,
} = {}) {
  if (!idea) throw new Error("promoteIdea requires an `idea` argument");

  const backlog = await readJSON(backlogPath);
  const state = await readJSON(statePath);

  // 1) Find the idea in ideas[] and switch it to "promoted" status.
  const idx = backlog.ideas.findIndex((it) => it.id === idea.id);
  if (idx === -1) {
    throw new Error(`idea ${idea.id} not found in backlog.ideas[]`);
  }
  backlog.ideas[idx].human_status = "promoted";
  backlog.ideas[idx].promoted_at = nowISO();

  // 2) Compute a fresh item id: keep the idea prefix, append a sequence
  //    number so multiple promotions of the same idea don't collide.
  const existingSamePrefix = (backlog.items || []).filter((it) =>
    it.id.startsWith(idea.id + "-"),
  ).length;
  const itemId = `${idea.id}-${String(existingSamePrefix + 1).padStart(2, "0")}`;

  // 3) Build the item. touches[] falls back to a single GameManager touch
  //    when the critic didn't suggest anything.
  const item = {
    id: itemId,
    title: idea.title,
    dimension: idea.category || "gameplay",
    touches:
      Array.isArray(idea.suggested_touches) && idea.suggested_touches.length
        ? idea.suggested_touches
        : ["src/core/GameManager.js"],
    verify: buildVerifyChecks(idea),
    estimate: idea.estimate || "M",
    status: "pending",
    skill: pickSkillForCategory(idea.category),
    source: {
      idea_id: idea.id,
      url: idea.source?.url,
      domain: idea.source?.domain,
      trust: idea.source?.trust,
    },
    created_at: nowISO(),
  };

  backlog.items.push(item);

  // 4) Update state.json — record the promotion so the next cycle knows
  //    where the item came from.
  state.last_promotion = {
    item_id: itemId,
    idea_id: idea.id,
    at: nowISO(),
    by: "tank-promoter",
  };
  // Bump next_action so loop:next picks up the new item immediately.
  state.next_action = "run_loop_next";

  await writeJSON(backlogPath, backlog);
  await writeJSON(statePath, state);

  return { item, itemId };
}

function buildVerifyChecks(idea) {
  const checks = [];
  if (idea.scores?.feasibility != null) {
    checks.push(
      `critic feasibility score ${idea.scores.feasibility}/5 reflects in shipped code`,
    );
  }
  if (idea.category === "ui-ux") {
    checks.push("visual diff stays within 1.5% pixel threshold");
  }
  if (idea.category === "gameplay") {
    checks.push("unit tests cover the new behavior path");
  }
  if (idea.category === "tech-debt") {
    checks.push("npm test pass count unchanged or higher");
  }
  checks.push(`idea ${idea.id} traceable in journal entry`);
  return checks;
}

function pickSkillForCategory(category) {
  if (category === "ui-ux") return "tank-ui-juice";
  if (category === "audio") return "tank-ui-juice";
  return null;
}

/**
 * Convenience: pick + promote in one call. The CLI entry point uses this.
 * Returns { skipped: true, reason } when there's nothing to promote.
 */
export async function pickAndPromote({
  backlogPath = BACKLOG_PATH,
  statePath = STATE_PATH,
} = {}) {
  const idea = await pickNextAcceptedIdea({ backlogPath });
  if (!idea) {
    return { skipped: true, reason: "no-accepted-ideas" };
  }
  const result = await promoteIdea({ idea, backlogPath, statePath });
  return { skipped: false, ...result, idea };
}

// Allow direct CLI: `node scripts/loop/promote.mjs`.
if (import.meta.url === `file://${process.argv[1]}`) {
  pickAndPromote()
    .then((out) => {
      if (out.skipped) {
        console.log(`✓ promote: skipped (${out.reason})`);
        console.log("  no human-accepted ideas to promote");
      } else {
        console.log(`✓ promote: ${out.itemId} — ${out.item.title}`);
        console.log(`  from idea ${out.idea.id} (${out.idea.category}, est ${out.idea.estimate})`);
        console.log(`  touches: ${out.item.touches.join(", ")}`);
        console.log("  next_action reset to run_loop_next");
      }
    })
    .catch((err) => {
      console.error("✗ promote failed:", err.message);
      process.exit(1);
    });
}
