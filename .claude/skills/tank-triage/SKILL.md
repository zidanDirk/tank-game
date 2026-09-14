---
name: tank-triage
description: Triage Tank 1990 loop backlog — read state.json, recent journal/, npm run loop:verify output, and open issues to pick the next cycle item.
---

# tank-triage

Decide what the next loop cycle should do.

**Read in this order:**
1. `scripts/loop/state.json` — current item, last cycle verdict, `needs_human` flag
2. `scripts/loop/journal/` — most recent 3 entries to understand last attempts
3. `scripts/loop/backlog.json` — `items[].status === "pending"` are candidates
4. `git log --oneline -10` — recent commits for context
5. Run `npm run loop:verify 2>&1 | head -40` if `needs_human === true`

**Decision tree:**
- If `state.json.current_item_id` is null OR the current item has 3+ failed cycles → pick the next `pending` item by `id` order.
- If 3+ consecutive `verdict: "fail"` for same item → set `needs_human: true` and stop. Don't auto-retry.
- If `backlog.json.items` all `done` → look at `backlog.json.ideas`, pick the lowest-effort one and create a new item with `estimate: XS`.

**Output:** Return one item id, e.g. `ui-02-damage-flash`. The orchestrator uses this id.
