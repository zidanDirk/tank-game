# Tank 1990 Loop Engineering

参考 [Addy Osmani — *Loop Engineering*](https://addyosmani.com/blog/loop-engineering/)。

> "You shouldn't be prompting coding agents anymore. You should be designing loops that prompt your agents." — Steinberger

## 目录结构

```
scripts/loop/
├── orchestrator.mjs       # 循环驱动器
├── state.json             # 状态脊柱（spine）
├── backlog.json           # 改进队列
├── lib/
│   ├── git.mjs            # worktree / commit helpers
│   ├── server.mjs         # 启停 vite dev
│   ├── capture.mjs        # snapshot JSON + 截图
│   └── diff.mjs           # pixelmatch + JSON deep-equal
├── baselines/             # 基线（git tracked）
│   ├── snapshots.json
│   └── screenshots/{ready,active,paused,buffs,boss,level-clear,lost}.png
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
npm run loop:init     # 捕获基线（首次或大改后）
npm run loop:next     # 从 backlog 选下一项，打印 spec 给 Claude 执行
npm run loop:verify   # 跑三道门（unit + capture + diff）
npm run loop:diff     # 只跑视觉 diff
npm run loop:status   # 打印状态
npm run loop:commit   # 把当前 cycle 标记为 done，写 journal
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

### Cron 触发（可选）

手动建一个每周一次的任务让 harvest 自动跑：

```
CronCreate: 0 9 * * 1  "npm run loop:harvest"   # 每周一 9:xx 跑
```

跑完后状态变 `await_human_review`，loop 主流程会停下来等人类决策，不会自动 commit。
