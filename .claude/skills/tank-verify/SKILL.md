---
name: tank-verify
description: Verify a Tank 1990 cycle by running npm test, npm run test:browser, npm run loop:diff — interpret pixelmatch output and snapshot drift.
---

# tank-verify

Three gates must all pass:

**Gate 1 — Unit tests**
```bash
npm test 2>&1 | tail -20
```
Pass = `tests X` where X ≥ 22 (was 19 before loop started, +1 each ui-* item).

**Gate 2 — Browser smoke**
```bash
npm run test:browser 2>&1 | tail -30
```
Pass = `artifacts/browser-smoke.json` `pass === true` and `errors === []`.

**Gate 3 — Visual regression**
```bash
npm run loop:diff 2>&1 | tail -40
```
Pass = every baseline PNG diff < 1.5% pixels AND `snapshots.json` whitelist fields deep-equal.

**Whitelist fields for snapshots.json deep-equal** (other fields ignored as noise):
- `state`, `mode`, `wave`, `level`, `levelName`
- `score`, `kills`, `lives`
- `baseAlive`
- `render.{calls,triangles,geometries,textures}` (FPS excluded — it's noisy)

**If any gate fails:**
- Read the failure carefully
- If the new code introduced the regression → verdict `fail`, defects = [failure description]
- If the failure is flaky (timeout, pixel jitter) → retry once, then verdict `fail` if still bad
- Never lower thresholds to make a fail pass — that's how loops rot
