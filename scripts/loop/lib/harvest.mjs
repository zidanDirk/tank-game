// scripts/loop/lib/harvest.mjs
// Three sub-steps of the Harvest Intake stage:
//   runHarvest()      → write scripts/loop/harvest/raw/<date>.json
//   scoreRaw()        → write scripts/loop/harvest/scored/<date>.json
//   renderQueue()     → write scripts/loop/harvest/queue.md
//   applyHumanReview()→ mutate backlog.json + state.json
//
// Mirrors lib/capture.mjs style: ESM, node:fs/promises, named exports.

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// --- paths -----------------------------------------------------------------

const LOOP_DIR = path.join(process.cwd(), "scripts/loop");
const HARVEST_DIR = path.join(LOOP_DIR, "harvest");
const RAW_DIR = path.join(HARVEST_DIR, "raw");
const SCORED_DIR = path.join(HARVEST_DIR, "scored");
const STATE_PATH = path.join(LOOP_DIR, "state.json");
const BACKLOG_PATH = path.join(LOOP_DIR, "backlog.json");

async function readJSON(p) {
  return JSON.parse(await readFile(p, "utf8"));
}
async function writeJSON(p, obj) {
  await writeFile(p, JSON.stringify(obj, null, 2));
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function nowId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
function sha256(s) {
  return "sha256:" + crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
}

// --- Jaccard similarity for dedup ------------------------------------------

function normalize(s) {
  return (s || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

function shingles(s, k = 3) {
  const tokens = normalize(s).split(" ");
  const out = new Set();
  for (let i = 0; i + k <= tokens.length; i++) {
    out.add(tokens.slice(i, i + k).join(" "));
  }
  return out;
}

export function jaccard(a, b) {
  const A = shingles(a);
  const B = shingles(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const s of A) if (B.has(s)) inter++;
  return inter / (A.size + B.size - inter);
}

// --- runHarvest ----------------------------------------------------------
//
// Produces raw/<date>.json. In production this invokes the harvester agent
// (which uses WebSearch/WebFetch). For test/dev runs we accept a `seed` arg
// so the orchestrator can be exercised without live web access.
//
// Input shape:
//   { date?: "YYYY-MM-DD", sources: string[], seed?: RawIdea[],
//     existingTitles?: string[] }
// Output: writes raw/<date>.json, returns { count, outPath }.

const RAW_SCHEMA_VERSION = 1;

/**
 * @typedef {Object} RawIdea
 * @property {string} url
 * @property {string} title
 * @property {string} snippet
 * @property {string} fetched_at   // ISO
 * @property {string} source_domain
 * @property {number} trust        // 0..1
 */

export async function runHarvest({ date, sources, seed, existingTitles = [] }) {
  const d = date || today();
  await mkdir(RAW_DIR, { recursive: true });
  const outPath = path.join(RAW_DIR, `${d}.json`);

  /** @type {RawIdea[]} */
  let ideas;
  if (Array.isArray(seed)) {
    ideas = seed;
  } else {
    // In production, the orchestrator spawns the tank-harvester sub-agent.
    // We don't invoke agents from JS — Claude does that. This function
    // returns the shape the orchestrator expects to *write* once the agent
    // has returned. For headless use, callers pass `seed`.
    throw new Error(
      "runHarvest() requires `seed` in headless mode. In production, the tank-harvester sub-agent provides the array.",
    );
  }

  // Dedup vs existing ideas by Jaccard on title.
  const filtered = ideas.filter((idea) => {
    const sim = Math.max(0, ...existingTitles.map((t) => jaccard(idea.title, t)));
    return sim <= 0.85;
  });

  const payload = {
    schema: RAW_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    date: d,
    sources: sources || [],
    count: filtered.length,
    ideas: filtered,
  };
  await writeJSON(outPath, payload);
  return { count: filtered.length, outPath, dropped_duplicates: ideas.length - filtered.length };
}

// --- scoreRaw -------------------------------------------------------------

const SCORED_SCHEMA_VERSION = 1;

export async function scoreRaw({ rawPath, seed, topN = 5 }) {
  await mkdir(SCORED_DIR, { recursive: true });
  const raw = await readJSON(rawPath);

  let scored;
  if (Array.isArray(seed)) {
    scored = seed;
  } else {
    throw new Error(
      "scoreRaw() requires `seed` in headless mode. In production, the tank-critic sub-agent provides the array.",
    );
  }

  // Sort by total desc, take top N.
  scored.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  const top = scored.slice(0, topN);

  const outPath = path.join(SCORED_DIR, `${path.basename(rawPath, ".json")}.json`);
  const payload = {
    schema: SCORED_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    raw_ref: path.relative(LOOP_DIR, rawPath),
    top_count: top.length,
    total_scored: scored.length,
    ideas: top,
  };
  await writeJSON(outPath, payload);
  return { outPath, top, total: scored.length };
}

// --- renderQueue ----------------------------------------------------------

export async function renderQueue({ scoredPath, outPath }) {
  const data = await readJSON(scoredPath);
  const lines = [
    `# Harvest queue — ${data.generated_at?.slice(0, 10) || "today"}`,
    "",
    `Top ${data.top_count} of ${data.total_scored} scored. Pick what to seed into backlog.`,
    "",
    "| # | Score | Cat | Est | Title | Source | Trust | My call |",
    "|---|-------|-----|-----|-------|--------|-------|---------|",
  ];
  data.ideas.forEach((idea, i) => {
    const lowTrust = (idea.trust ?? 0) < 0.6 ? " ⚠" : "";
    const titleCell = (idea.title || "").replace(/\|/g, "\\|");
    const srcCell = (idea.source_domain || idea.url || "").replace(/\|/g, "\\|");
    lines.push(
      `| ${i + 1} | ${idea.total}/20 | ${idea.category || "?"} | ${idea.estimate || "?"} | ${titleCell} | ${srcCell}${lowTrust} | ${idea.trust ?? "?"} | [ ] accept  [ ] defer  [ ] drop |`,
    );
  });
  lines.push("");
  lines.push("## CLI");
  lines.push("");
  lines.push("```bash");
  lines.push(`npm run loop:harvest:review -- \\`);
  lines.push(`  --accept 1,4 \\`);
  lines.push(`  --defer 2,5 \\`);
  lines.push(`  --drop 3 --reason "already exists"`);
  lines.push("```");
  lines.push("");
  lines.push("## Default if you do nothing in 7 days");
  lines.push("");
  lines.push("→ All entries are marked `deferred` (kept in queue for next harvest).");
  lines.push("");
  await writeFile(outPath, lines.join("\n"));
  return { outPath, count: data.ideas.length };
}

// --- applyHumanReview -----------------------------------------------------

/**
 * Parse CLI args after the orchestrator's "--" delimiter.
 * Accepts:
 *   --accept <csv>
 *   --defer  <csv>
 *   --drop   <csv>
 *   --reason "<text>"     (applies to the most recent --drop)
 *
 * Returns { accepted: number[], deferred: number[], dropped: number[], reasons: { [idx]: string } }
 */
export function parseReviewArgs(argv) {
  const out = { accepted: [], deferred: [], dropped: [], reasons: {} };
  let lastDropIdx = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--accept") {
      out.accepted = (argv[++i] || "").split(",").map(Number).filter(Boolean);
    } else if (a === "--defer") {
      out.deferred = (argv[++i] || "").split(",").map(Number).filter(Boolean);
    } else if (a === "--drop") {
      const csv = argv[++i] || "";
      out.dropped = csv.split(",").map(Number).filter(Boolean);
      lastDropIdx = out.dropped[out.dropped.length - 1];
    } else if (a === "--reason") {
      const reason = argv[++i] || "";
      if (lastDropIdx != null) out.reasons[String(lastDropIdx)] = reason;
    }
  }
  return out;
}

/**
 * Apply human decisions to backlog.json + state.json.
 *
 * @param {object} args
 * @param {string} args.scoredPath   path to scripts/loop/harvest/scored/<date>.json
 * @param {object} args.review       output of parseReviewArgs()
 * @param {string} args.backlogPath  default BACKLOG_PATH
 * @param {string} args.statePath    default STATE_PATH
 * @returns {Promise<{accepted: object[], deferred: object[], dropped: object[]}>}
 */
export async function applyHumanReview({
  scoredPath,
  review,
  backlogPath = BACKLOG_PATH,
  statePath = STATE_PATH,
}) {
  const scored = await readJSON(scoredPath);
  const backlog = await readJSON(backlogPath);
  const state = await readJSON(statePath);

  const accepted = [];
  const deferred = [];
  const dropped = [];

  scored.ideas.forEach((idea, idx) => {
    const i = idx + 1; // 1-based as in queue.md
    const enriched = {
      id: `h-${scored.generated_at?.slice(0, 10) || today()}-${String(i).padStart(3, "0")}`,
      title: idea.title,
      category: idea.category,
      estimate: idea.estimate,
      source: {
        url: idea.url,
        domain: idea.source_domain,
        trust: idea.trust,
        fetched_at: new Date().toISOString(),
      },
      score: {
        feasibility: idea.scores?.feasibility ?? null,
        novelty: idea.scores?.novelty ?? null,
        effort_fit: idea.scores?.effort_fit ?? null,
        domain_fit: idea.scores?.domain_fit ?? null,
        total: idea.total ?? null,
      },
      suggested_touches: idea.suggested_touches || [],
      human_status: "pending",
      human_decision_at: null,
      fetched_at: new Date().toISOString(),
    };

    if (review.accepted.includes(i)) {
      enriched.human_status = "accepted";
      enriched.human_decision_at = new Date().toISOString();
      backlog.ideas.push(enriched);
      accepted.push(enriched);
    } else if (review.deferred.includes(i)) {
      enriched.human_status = "deferred";
      enriched.human_decision_at = new Date().toISOString();
      backlog.ideas.push(enriched);
      deferred.push(enriched);
    } else if (review.dropped.includes(i)) {
      enriched.human_status = "dropped";
      enriched.human_decision_at = new Date().toISOString();
      // Dropped ideas are not added to backlog.ideas — they're audit-only.
      dropped.push(enriched);
    } else {
      // Untouched entry — leave in queue.md, no mutation.
    }
  });

  // Update state.json
  if (!Array.isArray(state.harvest_runs)) state.harvest_runs = [];
  state.harvest_runs.push({
    id: nowId(),
    scored_ref: path.relative(LOOP_DIR, scoredPath),
    raw_count: scored.total_scored,
    scored_top_count: scored.top_count,
    human_decisions: {
      accepted: accepted.length,
      deferred: deferred.length,
      dropped: dropped.length,
      reasons: review.reasons || {},
    },
    fetched_urls_hash: sha256(
      scored.ideas.map((i) => i.url || "").join("\n"),
    ),
    at: new Date().toISOString(),
  });
  state.last_human_review_at = new Date().toISOString();
  state.next_action = "triage_new_idea";

  await writeJSON(backlogPath, backlog);
  await writeJSON(statePath, state);
  return { accepted, deferred, dropped };
}

// --- helpers used by orchestrator (state migration helpers) --------------

/**
 * Returns true if the harvest pipeline should trigger based on current state.
 * - empty items[] AND empty ideas[] → must harvest
 * - last harvest > 7 days ago → should harvest (but not blocking)
 */
export function shouldHarvest({ state, backlog }) {
  const itemsEmpty = !backlog.items?.some((it) => it.status === "pending");
  const ideasEmpty = !backlog.ideas?.length;
  if (itemsEmpty && ideasEmpty) return { trigger: true, reason: "both-empty" };

  const last = state.harvest_runs?.[state.harvest_runs.length - 1];
  if (!last) return { trigger: false, reason: "no-prior-runs" };
  const days = (Date.now() - new Date(last.at).getTime()) / 86400000;
  if (days > 7) return { trigger: false, reason: "stale", days_since: Math.floor(days) };
  return { trigger: false, reason: "fresh" };
}

// Find the most recent scored file (used by orchestrator to know what to review).
export async function latestScoredPath() {
  if (!existsSync(SCORED_DIR)) return null;
  const files = (await readdir(SCORED_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();
  if (!files.length) return null;
  return path.join(SCORED_DIR, files[0]);
}