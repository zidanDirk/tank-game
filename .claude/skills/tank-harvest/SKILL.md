---
name: tank-harvest
description: Run the Tank 1990 harvest intake stage — orchestrator dispatches harvester + critic agents, renders a human review queue, applies accept/defer/drop decisions to backlog.json. Use when state.json.next_action is "harvest_first" or "await_human_review".
---

# tank-harvest

Three sequential sub-steps. **Each sub-step is owned by a different agent** — do not let one agent do another's job.

## Step 1 — fetch (`tank-harvester` agent)

- Invoked by the orchestrator (`npm run loop:harvest`)
- Allowed tools: `WebSearch`, `WebFetch`, `Read` (only on allowlist domain results)
- Writes: `scripts/loop/harvest/raw/<YYYY-MM-DD>.json`
- Inputs: `allowlist`, `github_required_topics`, `existing_titles`, `cursor`
- Outputs: see `tank-harvester.md`

## Step 2 — score (`tank-critic` agent)

- Invoked by the orchestrator immediately after Step 1 returns
- Allowed tools: `Read` (only `raw/<date>.json` + `backlog.json`'s `ideas[]`)
- Writes: `scripts/loop/harvest/scored/<YYYY-MM-DD>.json`
- Inputs: `raw_path`, `backlog_path`, `top_n` (default 5)
- Outputs: see `tank-critic.md`

## Step 3 — review (`/loop` or human, NEVER auto-promote)

The orchestrator renders `queue.md` and sets `state.next_action = "await_human_review"`, then **halts**. A human (not an agent) runs:

```bash
npm run loop:harvest:review -- \
  --accept 1,4 \
  --defer 2,5 \
  --drop 3 --reason "already exists in ideas[]"
```

The orchestrator's `applyHumanReview()`:
- Accepts → adds enriched idea to `backlog.json.ideas[]` with `human_status: "accepted"`
- Defers → adds to `backlog.json.ideas[]` with `human_status: "deferred"` (keeps it for next harvest)
- Drops → records in `state.harvest_runs[].human_decisions.reasons` only (audit), nothing in `ideas[]`
- Then resets `state.next_action = "triage_new_idea"` so the existing `tank-triage` flow can promote ideas

## Hard rules

- **No agent ever auto-promotes a harvested idea into `items[]`.** Only human accept → `ideas[]`, then `tank-triage` chooses one from `ideas[]` to become an `item` on the next `loop:next` call.
- **The harvester cannot score.** The critic cannot fetch. The reviewer cannot implement. Three roles, zero overlap.
- **Trust < 0.6 sources get a `low_trust: true` flag** in scored output — never silently passed through.
- **Rate limits** are advisory (≤20 fetches, ≥2s spacing) but the harvester must honor them. If it doesn't, the next orchestrator invocation re-runs from scratch.
- **GitHub repos require topic match** (`three.js`, `webgame`, `webgl`, or `gamedev`). Repos without those topics are silently dropped at fetch time.

## When to trigger this skill

Use when `state.json.next_action === "harvest_first"` (loop is empty AND no ideas left) or `state.json.harvest_runs` is empty / >7 days stale. Otherwise the existing `tank-triage` flow handles things.

## What this skill does NOT do

- It does not run `npm test`, `npm run loop:verify`, or `npm run loop:commit`. Those belong to the implement / verify cycle, not intake.
- It does not create PRs or branches. Git ops happen at `commit` time on accepted items, not on raw ideas.
- It does not touch `snapshots.json` or baselines. Visual regression gates only fire after a real code change.