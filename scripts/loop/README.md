# Tank 1990 Loop Engineering

参考 [Addy Osmani — *Loop Engineering*](https://addyosmani.com/blog/loop-engineering/)。

> "You shouldn't be prompting coding agents anymore. You should be designing loops that prompt your agents." — Steinberger

## 目录结构

```
scripts/loop/
├── orchestrator.mjs       # 循环驱动器
├── promote.mjs            # 把 ideas[] 升格到 items[]
├── state.json             # 状态脊柱（spine）
├── backlog.json           # 改进队列
├── lib/
│   ├── git.mjs            # worktree / commit helpers
│   ├── server.mjs         # 启停 vite dev
│   ├── capture.mjs        # snapshot JSON + 截图
│   ├── diff.mjs           # pixelmatch + JSON deep-equal
│   ├── harvest.mjs        # fetch + score + review primitives
│   └── sources.mjs        # harvest domain allowlist
├── baselines/             # 基线（git tracked）
│   ├── snapshots.json
│   └── screenshots/{ready,active,paused,buffs,boss,level-clear,lost,upgrade-select}.png
├── current/               # 最新一次 verify 的产物（gitignored）
│   ├── snapshots.json
│   ├── screenshots/...
│   └── verify-report.json
└── journal/               # 每轮日志（git tracked）
    └── YYYY-MM-DD-HHMM.md
```

## 5 件套 + 状态

| 原语 | 落地 |
|---|---|
| Automations | `npm run loop:*` 命令 + Claude `/loop 30m` 周期调度 |
| Worktrees | 每个 cycle 在独立 worktree 实现（可选，详见 plan） |
| Skills | `.claude/skills/tank-{triage,implement,verify,ui-juice,checker}/SKILL.md` |
| Connectors | MCP GitHub server（`mcp__github-server__create_pull_request` 等） |
| Sub-agents | `.claude/agents/tank-{maker,checker}.md` —— maker 写、checker 审 |
| State | `scripts/loop/state.json` + `journal/` + `backlog.json` |

## 命令

```bash
npm run loop:init            # 捕获基线（首次或大改后）
npm run loop:next            # 从 backlog 选下一项，打印 spec 给 Claude 执行
npm run loop:verify          # 跑三道门（unit + capture + diff）
npm run loop:diff            # 只跑视觉 diff
npm run loop:harvest         # 跑 fetch + score + 渲染 queue.md
npm run loop:harvest:review  # 应用人类 accept/defer/drop
npm run loop:promote         # 把一条 human-accepted idea 升格成 pending items[]
npm run loop:daily           # harvest + promote（一次性跑两步）
npm run loop:status          # 打印状态
npm run loop:commit          # 把当前 cycle 标记为 done，写 journal
```

## 典型一轮

1. `npm run loop:next` —— 输出 cycle spec
2. Claude 按 spec 实现：在 `touches[]` 文件里加代码，跑 `npm test`
3. `npm run loop:verify` —— 跑三道门；输出 `verify-report.json`
4. 若 pass：`npm run loop:commit` —— 更新 backlog、state、journal
5. 若 fail：读 `verify-report.json` 的 defects，修复后回到步骤 2

## 接 Claude `/loop`

```
/loop 30m /loop:tank
```

每 30 分钟 Claude 自动跑一轮。/loop:tank 是 prompt：让 Claude 跑 `npm run loop:next`，按 spec 实现，跑 `npm run loop:verify`，通过就跑 `npm run loop:commit`，再回到 next。

## 三道门

1. **单元测试** — `npm test` ≥ 22/22
2. **视觉基线** — 重跑 capture，对比 `baselines/screenshots/`（≤ 1.5% 像素差异）+ `baselines/snapshots.json` 白名单字段 deep-equal
3. **失败则停** — 三道门任一不通过即 `verdict: fail`，不 commit

## Maker ≠ Checker

文章原话：**"split the one who writes from the one who checks."**

- `tank-maker`（`.claude/agents/tank-maker.md`）—— 实现改动，跑 npm test
- `tank-checker`（`.claude/agents/tank-checker.md`）—— 用 critic-mode prompt 审查 diff，必须跑 `loop:verify`，返回 `{verdict, defects}`，**不修代码只报缺陷**

## 不在本次范围（写进 `backlog.json.ideas`）

- 启用 fog/iron/rapid/siege MODIFIERS
- 连击 / 击杀 streak 倍率
- 关卡结算统计面板
- 移动端 haptic feedback
- Web Audio 程序化 BGM
- 每日 seed 分享

## Harvest Intake（自动从网络打捞 idea）

让 loop 不会再卡在"等人类写 idea"。每个 cycle 之前（当 `items[]` 和 `ideas[]` 都空，或上次 harvest >7 天），触发三步流水线：

```
harvester  →  critic  →  queue.md  →  🧑 human  →  backlog.json.ideas[]
```

### 命令

```bash
npm run loop:harvest             # 跑 fetch + score + 渲染 queue.md
npm run loop:harvest:review -- \ # 应用人类决策
  --accept 1,4 \
  --defer 2,5 \
  --drop 3 --reason "already exists"
```

### 三步协议

| 步 | 角色 | 工具 | 写 |
|---|---|---|---|
| 1. fetch | `tank-harvester` agent | WebSearch + WebFetch | `scripts/loop/harvest/raw/<date>.json` |
| 2. score | `tank-critic` agent | Read only | `scripts/loop/harvest/scored/<date>.json` |
| 3. review | 🧑 人类 | 任意编辑器 + 上面那条 CLI | `backlog.json.ideas[]` + `state.harvest_runs[]` |

**硬约束**：
- harvester ≠ critic ≠ reviewer（写 ≠ 审 ≠ 决策）
- 任何 idea 都必须人类 accept 才能进 `backlog.json.ideas[]`
- 进了 `ideas[]` 之后才由 `tank-triage` 在下次 `loop:next` 时挑进 `items[]`
- 没有任何路径自动把 harvested idea 提升成 `items[]` entry

### Allowlist

写在 `scripts/loop/lib/sources.mjs`。白名单制：
- Tier 1（trust ≥ 0.85）：gdcvault.com, developer.mozilla.org, web.dev, threejs.org
- Tier 2（trust 0.7–0.85）：discourse.threejs.org, github.com（需 topic ∈ {three.js, webgame, webgl, gamedev}）, playdate.com
- Tier 3（trust < 0.7，必须打 `low_trust` 标记）：indiegameplus.com
- ❌ 明确拒绝：reddit.com, twitter.com, x.com, medium.com

### Cron 触发（Claude Code CronCreate）

在 Claude Code 会话里用 `CronCreate` 工具创建定时任务：

```
CronCreate:
  cron:    "30 10 * * *"          # 每天 10:30 本地时间
  prompt:  "Run npm run loop:harvest, then check if any human-accepted ideas need promoting. If so run npm run loop:promote, then npm run loop:next."
  recurring: true
```

CronCreate 是 Claude Code 的内置定时器,只在 Claude Code 会话**运行时**触发。
如果 10:30 时 Claude Code 关闭或电脑睡眠,当天的 tick 会丢失。

落地清单：
- `scripts/loop/promote.mjs` —— promotion 核心逻辑
- `.claude/agents/tank-promoter.md` —— bridge agent（跑 promote.mjs）
- CronCreate 调用方在 Claude Code 会话里

如果以后想换成无人值守的 launchd,把 `promote.mjs` 和 `tank-promoter.md`
留着即可,只需要再加一份 plist + 包装脚本。

### Promotion：把 accepted idea 推进到实现队列

`harvest:review` 之后，accepted idea 进 `backlog.ideas[]` 但还**不能**被
`loop:next` 选中（`loop:next` 只看 `items[]`）。`tank-promoter` 是个 bridge agent，
它跑 `node scripts/loop/promote.mjs` 把一条 accepted idea 升格成 `items[]` 中的
pending 条目，再把 `state.next_action` 重置为 `run_loop_next`。`/loop` 提示词
的第一步就是在每个 tick 检查是否需要 promote。

选择规则（见 `promote.mjs`）：
- 只升 `human_status === "accepted"` 的 idea
- 优先 `XS > S > M > L` 的小活
- 同 estimate 时按 `human_decision_at` 早优先（FIFO）

### Daily flow（10:30 CronCreate + /loop 配合）

```
10:30 CronCreate 触发 (Claude Code 必须在跑)
        ↓
npm run loop:harvest  ──→ queue.md 渲染
        ↓
你跑 harvest:review -- --accept 1 --drop 2
        ↓
backlog.ideas[] 增加 accepted 条目
        ↓
/loop tick
   ① tank-promoter: promoteIdea ──→ backlog.items[] pending
   ② tank-triage:   loop:next   ──→ spec
   ③ tank-maker:    改 touches 文件 + npm test
   ④ loop:verify    ──→ 三道门
   ⑤ loop:commit (pass) ──→ journal/, advance state
```

### CronCreate 触发的 prompt 模板

```
/loop 30m 你正在为 Tank 1990 推进 loop engineering 流水线。优先检查是否有 idea 待升格
（state.next_action === "triage_new_idea" 且 ideas[] 有 accepted）→ 跑
node scripts/loop/promote.mjs 升格；没有就跳过。然后 npm run loop:next 读 spec →
阅读 tank-implement skill → 改 touches[] 文件加测试 → npm test → npm run loop:verify
三道门 → 通过 npm run loop:commit；失败读 verify-report.json 修缺陷再 verify。规则：
不要改 touches[] 外的文件、不要改 snapshot() 字段、不要降阈值、若 state.json.needs_human=true
立即停下报告用户。如果 next_action === "harvest_first" → 跑 npm run loop:harvest 然后
停下来等人类跑 npm run loop:harvest:review 后再回到 next。最后一句话报告：
✓ item_id done / ✓ promoted idea_id / ✗ item_id failed: reason。
```
