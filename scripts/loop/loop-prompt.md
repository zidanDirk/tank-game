# /loop prompt for Tank 1990

Run this command (every 30 minutes is a good default — pick a frequency that matches how fast you want cycles to advance):

```
/loop 30m 你正在为 Tank 1990 推进 loop engineering 流水线。每次运行：1) npm run loop:next 读 spec；2) 阅读 .claude/skills/tank-implement/SKILL.md + (如 ui-ux) tank-ui-juice/SKILL.md；3) 改 touches[] 列出的文件，加单元测试若新增了 public 方法；4) npm test 跑通；5) npm run loop:verify 跑三道门；6) 通过 → npm run loop:commit；失败 → 读 verify-report.json 修缺陷再 verify。规则：不要改 touches[] 外的文件、不要改 snapshot() 字段、不要降阈值让 fail 变 pass、若 state.json.needs_human=true 立即停下报告用户。最后用一句话报告：✓ item_id done 或 ✗ item_id failed: reason。
```

## Why this prompt

- Starts each tick with `npm run loop:next` so the orchestrator picks the spec deterministically
- Cites the right skills so context loads fast
- Tells Claude to verify (not just implement) — `maker ≠ checker` per Addy Osmani
- Bakes in the safety rules from `tank-implement` and `tank-checker` skills
- Forces a one-line report so you can scan `/loop` history at a glance

## Other intervals

- `/loop 1h ...` — gentler, for when you're away
- `/loop 5m ...` — aggressive, only when you're watching and ready to intervene

To stop the loop: type `Shift+Tab` to toggle auto-mode off, or just `/exit`.

## Manual advance (without /loop)

If you don't want `/loop` running unattended:

1. Edit code per spec from `npm run loop:next`
2. Run `npm test`
3. Run `npm run loop:verify`
4. Run `npm run loop:commit` (only if verify passes)

This is the same flow `/loop` runs automatically.
