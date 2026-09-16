# /loop prompt for Tank 1990

Run this command (every 30 minutes is a good default — pick a frequency that matches how fast you want cycles to advance):

```
/loop 30m 你正在为 Tank 1990 推进 loop engineering 流水线。每次运行：
1) **优先检查是否有 idea 待升格** — 如果 state.json.next_action === "triage_new_idea" 且 backlog.ideas[] 里有 human_status === "accepted" 的条目，运行 `node scripts/loop/promote.mjs`（或 .claude/agents/tank-promoter.md）把它升格成 items[] 中的 pending 条目；没有就跳过。
2) `npm run loop:next` 读 spec;
3) 阅读 .claude/skills/tank-implement/SKILL.md + (如 ui-ux) tank-ui-juice/SKILL.md；
4) 改 touches[] 列出的文件，加单元测试若新增了 public 方法；
5) `npm test` 跑通；
6) `npm run loop:verify` 跑三道门；
7) 通过 → `npm run loop:commit`；失败 → 读 verify-report.json 修缺陷再 verify。
规则：不要改 touches[] 外的文件、不要改 snapshot() 字段、不要降阈值让 fail 变 pass、若 state.json.needs_human=true 立即停下报告用户。
如果 state.json.next_action === "harvest_first" → 改跑 `npm run loop:harvest`（参考 .claude/skills/tank-harvest/SKILL.md），停下来等人类跑 `npm run loop:harvest:review` 后再回到 next。
最后用一句话报告：✓ item_id done / ✓ promoted idea_id / ✗ item_id failed: reason。
```

## Daily flow overview

```
   10:30 CronCreate                         /loop tick (every 30m)
       │                                            │
       ▼                                            ▼
  npm run loop:harvest ──→ queue.md ──review──→ tank-promoter ──→ npm run loop:next
       │                       (human)              │                  │
       ▼                                            │                  ▼
  (Claude: 等人类跑完 review)                          │           tank-maker
                                                    │                  │
                                                    │                  ▼
                                            backlog.items[]         npm test
                                                                       │
                                                                       ▼
                                                                loop:verify (3 gates)
                                                                       │
                                                            pass ──────┴────── fail
                                                              │                  │
                                                              ▼                  ▼
                                                       loop:commit         (retry 3x, then needs_human=true)
```

## Why this prompt

- **Step 1 is the daily-build bridge.** When the human accepts ideas from
  yesterday's harvest, the first /loop tick of the day promotes them into
  implementable items. Without this step the backlog fills up with
  `accepted` ideas that never get implemented.
- The rest mirrors the old prompt — Claude still drives the maker/checker
  loop, the 3-gate verify, and the commit-and-advance pattern.
- Forces a one-line report so you can scan `/loop` history at a glance:
  `✓ done`, `✓ promoted`, or `✗ failed: reason`.

## Other intervals

- `/loop 1h ...` — gentler, for when you're away
- `/loop 5m ...` — aggressive, only when you're watching and ready to intervene

To stop the loop: type `Shift+Tab` to toggle auto-mode off, or just `/exit`.

## Daily 10:30 timer (Claude Code CronCreate)

Use the built-in `CronCreate` tool from inside a Claude Code session
(preferred — needs Claude Code to be running at the trigger time):

```
CronCreate:
  cron:    "30 10 * * *"
  prompt:  "/loop:tank"          # or: "Run npm run loop:harvest"
  recurring: true
```

The cron string `30 10 * * *` means **10:30 local time every day**.
`CronCreate` enqueues the prompt at fire time and the Claude session
runs `npm run loop:harvest` + (if there are accepted ideas) `npm run loop:promote`,
then drives the implement cycle.

CronCreate works **only while the Claude session is alive** — if the
machine is asleep or Claude Code is closed at 10:30, that day's tick is
missed. If you need guaranteed-firewall-timer execution, swap in a
`launchd` LaunchAgent that calls `node scripts/loop/promote.mjs` directly;
for now CronCreate is the lightest option and matches the rest of the
loop, which is already Claude-driven.

See `scripts/loop/README.md` for the full daily flow.

## Manual advance (without /loop)

If you don't want `/loop` running unattended:

1. (Optional) `node scripts/loop/promote.mjs` to promote any accepted ideas
2. Edit code per spec from `npm run loop:next`
3. Run `npm test`
4. Run `npm run loop:verify`
5. Run `npm run loop:commit` (only if verify passes)

This is the same flow `/loop` runs automatically.
