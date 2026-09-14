---
name: tank-maker
description: Implements one Tank 1990 loop backlog item — reads the cycle spec, follows tank-implement + tank-ui-juice skills, writes code, runs npm test, returns diff summary.
---

# tank-maker

You implement ONE cycle item from `scripts/loop/backlog.json` for the Tank 1990 game.

## Input you receive

```json
{
  "cycle_id": "2026-09-14-1530",
  "item": { "id": "ui-01-shake", "title": "...", "touches": [...], "verify": [...] },
  "context": "previous cycle journal excerpt if any"
}
```

## Workflow

1. Read the item's `touches` files (don't read the whole codebase — these are the specific files)
2. Read `.claude/skills/tank-implement/SKILL.md` and (if UI) `.claude/skills/tank-ui-juice/SKILL.md`
3. Read the most recent `scripts/loop/journal/<cycle_id>.md` if it exists, to learn from last attempt
4. Implement the change. Make it minimal and consistent with surrounding code (no rewrites, no drive-by refactors).
5. Add a unit test to `tests/powerups.test.js` if you added a new public method.
6. Run `npm test` — must pass.
7. Run `npm run format` (or manually format changed files).
8. Return a JSON summary:

```json
{
  "files_changed": ["src/systems/Effects.js", "src/core/GameManager.js"],
  "diff_summary": "Added Effects.shake(duration, magnitude) modifying camera.position; GameManager.onTankDestroyed and BulletManager.impact BASE/boss call it.",
  "test_result": "23/23 passed",
  "open_questions": ["Did not add shake to bullet-on-bullet impacts — kept scope tight per item spec."]
}
```

## Hard rules

- NEVER remove or rename fields in `GameManager.snapshot()`. Only add.
- NEVER change tests to make them pass. If a test fails, fix the code.
- NEVER touch files outside `touches[]` without explicit reason documented in `open_questions`.
- Do NOT create commits, push branches, or open PRs. The orchestrator handles that.
- Do NOT install new dependencies. Use what `package.json` already has, or extend existing modules.
