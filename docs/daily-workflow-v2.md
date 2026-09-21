# Tank 每日研究与实现工作流 v2（设计稿）

状态：核心代码已实现，正在验证，尚未部署新版调度。下文为目标设计，不等于全部功能已交付。

## 当前实施范围（2026-09-21）

已实现：结构化任务合同、DeepSeek 研究与 MiniMax 规划、计划校验与最多两次修订、幂等发布与依赖检查；固定浏览器缓存、干净环境基线检查、Node/浏览器验收文件隔离、单测/构建/浏览器统一修复循环；试玩 SHA 记录和每五分钟检查的合并控制器；09:00/10:00 systemd 模板。

未实现的目标增强：跨日资源预算账本、供应商 retry-after 调度、合同修改自动撤销审批、独立操作系统沙箱、基线指纹缓存、统一 run.json 与状态评论、审查失败自动修复。当前推送前对比 Issue 正文与审批标签；这不等价于审批时的合同哈希。规划失败保留日志并退出，不自动发布不合格研究提案。reviewer 为独立会话，默认仍使用 MiniMax，并非异构模型。

服务器已核验：Ubuntu、2 CPU/约 2 GiB RAM、Node 22.22.1、Claude Code 2.1.276。Issue #9 的历史浏览器日志证实 Chromium 缓存路径不存在；安装后又发现缺少 Linux 动态库。已安装 Chromium 与其系统依赖，并在改写 HOME 的干净环境下成功启动。独立目录的服务器完整回归通过，后续新增控制器测试后的服务器单测为 185 项全部通过。固定浏览器缓存已写入现有服务的 drop-in，未重启任务。

真实模型验证：Issue #15 的 12 条原始验收要求映射为 10 个子任务，通过合同和覆盖校验；因父 Issue 已关闭，仅保留预览，没有发布。DeepSeek 研究结果已保存；MiniMax 规划达到 40 轮后，禁用工具恢复原会话，1 轮产出计划。该计划仍有一个四文件任务，被范围校验拒绝并进入受限修订；最终修订结果尚待重新连接服务器确认。正式研究发布、实现到 PR、人工试玩后自动合并以及新版定时器部署均未完成端到端验收。

## 目标与现状

北京时间每天 09:00 使用 DeepSeek Flash 联网研究、MiniMax M3 审查并拆分一个优化建议；10:00 使用 Claude Code + MiniMax M3 实现人工批准的小任务。PR 通过 CI，且人工对最新提交标记 `已经试玩` 后自动合并到 master。

服务器现有部署使用 ubuntu 用户、`$HOME/tank-game`、systemd、Claude Code、GitHub CLI、Node.js，以及用户目录下的模型配置与环境文件。已核验模型配置与 MiniMax 搜索 MCP；复用现有凭据，不复制到仓库。

2026-09-21 的 Issue #9 停在浏览器验收，已读取服务器 browser.log 确认当次失败为浏览器环境问题，而非游戏断言失败。

已从 master 代码确认的结构问题：

- 只有单元测试有修复循环，构建和浏览器失败直接退出。
- run_clean 改写 HOME；若没有显式 PLAYWRIGHT_BROWSERS_PATH，浏览器缓存发现可能受影响。必须在与服务一致的干净环境中验证，而非只在交互 shell 中验证。
- 浏览器脚本固定使用 5173/4173，开发服务器未使用 strictPort，可能误连接其他进程。
- 验收作者强制只写 Node 测试，对无法 Node 验证的 UI 功能要求生成一个必失败的断言。这会制造无法靠正确实现解决的门禁。
- 自动拆分仅按两条复选框分组；不理解依赖、修改文件与回归文件的区别，也未验证行数估算。
- 研究脚本和服务器 systemd 配置未纳入当前仓库。
- 已有“人工试玩通过”门禁，但没有用户要求的“已经试玩”自动合并闭环。

## 调度与资源

- `tank-research.timer`：`OnCalendar=*-*-* 09:00:00 Asia/Shanghai`。
- `tank-issue-implementer.timer`：`OnCalendar=*-*-* 10:00:00 Asia/Shanghai`。
- 两者 `Persistent=true`，补偿停机错过的运行；日期幂等避免重复产出。
- 实现 worker 从 10:00 起持续消费可执行队列，直到队列空、配额耗尽或达到每日资源预算；不是只尝试一个 Issue。
- 起步一个实现 worker。服务器 CPU/RAM/浏览器容量与模型并发核实后，允许两个不依赖且不修改相同文件的任务并行。浏览器独占锁和独立端口防止串扰。
- 重试记录 next_attempt_at；额度/限流按供应商 retry-after，缺失时指数退避并限制次数。调度唤醒恢复原 worktree，不从头再做。
- 确定性错误不通过 systemd 无限重启。启动限制以小时计算的低阈值改为短时间故障保护，业务重试由持久队列负责。
- 每日预算、每 Issue 调用次数、轮次、最长时间可配置。初始建议：实现 80 轮 + 两次 40 轮续跑，修复最多三次每次 40 轮，单 Issue 两小时、每日十二小时；依据实际用量再调整。

## 09:00：研究 → 小任务 → 发布

1. 固定最新 master SHA，读取代码结构和最近建议、待办、开放 PR、已合并功能，排除重复建议。
2. DeepSeek Flash 使用服务器已验证的搜索工具查找资料，轮换可玩性、3D 视觉、UI/交互、年轻化等主题；每日只选一个目标。保存查询、实际搜索结果 URL 和引用摘要。
3. MiniMax M3 读取相关代码与研究结果，审查可行性、定义最小版本，生成结构化小任务计划。必要时使用同一受限搜索工具核验资料。
4. 确定性校验计划。不合格时把明确原因回传规划模型，最多两次修订；依然不合格只发布“未审批”的研究提案并明确标记不能进入实现，不产生无效任务队列。
5. 通过校验的小任务逐个发布 GitHub Issue，默认 `未审批`；以日期、建议 ID、切片 ID 实现幂等。中途失败按发布记录补齐，不重复创建。

小 Issue 合同：

```json
{
  "schemaVersion": 2,
  "id": "threat-predictor",
  "title": "预测直达基地的敌方炮弹",
  "goal": "给定炮弹和碰撞查询，返回命中基地的预计时间",
  "dependsOn": [],
  "changeFiles": ["src/systems/ThreatWarning.js", "tests/threat-warning.test.js"],
  "readOnlyFiles": ["src/systems/CollisionSystem.js"],
  "regressionChecks": ["unit", "build", "browser", "levels", "upgrades"],
  "estimatedChangedLines": 160,
  "acceptance": ["墙体阻挡时不预警", "命中时间在阈值内时返回预警"],
  "acceptanceKind": "node",
  "outOfScope": ["HUD", "音效", "计分", "持久化"],
  "manualPlaytest": ["本任务无新 UI，检查原有战斗流程未回归"]
}
```

目标为 1–3 个修改文件、100–250 行有效改动；默认硬上限 350 行。只对 changeFiles 计数，回归检查不算修改文件。每项交付单一行为，允许 1–10 条验收条件以完整列出边界情况，不以验收条数代替工作量估算。每个切片自身必须可测试，不把所有测试留到最后一个切片。验证路径、字段类型、依赖无环、估算与范围；缺失完整路径不能视为零文件或自动通过。最终 diff 再次检查真实范围。

大型建议拆成依赖图，不按复选框机械截段。先实现纯逻辑与测试，再接线，最后逐个接入视觉、声音或计分。前置 PR 未合并时，后置 Issue 保留批准状态但等待；每次执行从最新 master 开始。

## Issue 审批语义

四个审批标签互斥：`未审批`、`同意实现`、`拒绝`、`挂起`。仅当明确、唯一为 `同意实现` 且依赖均已合并时允许实现；冲突标签阻塞并说明原因。

研究大提案作为说明记录，只有结构化小任务进入 worker。旧版大 Issue 走同一规划器并发布未审批子 Issue；不得通过删除验收要求来绕过范围门禁。

实现运行状态独立记录在状态文件和幂等 Issue 状态评论中，不复用审批标签表达“正在运行/失败”。人工批准后若正文或结构化合同变化，合同哈希失效，重新进入未审批。worker 在开始与推送前复核审批状态和合同哈希。

## 10:00：实现状态机

`approved → dependency-ready → preflight → baseline-green → acceptance-ready → implementing → verifying ↔ repairing → reviewed → pr-open → awaiting-playtest → merged`

- **preflight**：检查真实 service PATH、Node 版本、CLI 版本、模型路由、GitHub 必要权限、磁盘、浏览器路径及 Linux 动态库；使用与测试相同的 HOME、PATH、浏览器环境执行 Chromium 启动与 WebGL smoke。
- **baseline-green**：对固定 master SHA 跑基线验证；同 SHA 与同运行时指纹复用已通过结果。基线失败停止该队列并报告环境或主干问题，避免每个 Issue 都消耗模型修复同一个故障。
- **acceptance-ready**：按 node/browser/manual 选择验证方式。独立作者冻结新增验收测试、验收清单及哈希。Node 或浏览器断言必须证明确实缺少目标行为；模块缺失可作为明确的预期红灯，但语法错误/浏览器未启动不算行为证据。视觉主观项保留人工验收，禁止生成永远失败的占位测试。
- **implementing**：MiniMax 读取精简代码上下文、合同、依赖接口与冻结测试，完成垂直切片。达到轮次上限后先看产物与验证结果，有进展才续原 session；没有产物只给一次明确收尾机会。
- **verifying**：依次跑 unit、build、browser、levels、upgrades；失败一律记录具体阶段、命令退出码、断言、截图/trace 路径，不用一个“浏览器失败”覆盖所有原因。
- **repairing**：环境错误暂停等待环境修复；实现断言失败将有限日志和证据回传模型；可疑不稳定测试仅允许一次不修改代码的复跑，并保留两次结果。冻结验收错误交还独立测试作者修订并重新检查基线，不能让实现模型改门槛。每次修复后重跑受影响检查，最终全量验证。
- **reviewed**：独立只读审查会话逐条核对验收、实际 diff 与证据。单独会话不宣称是不同模型；默认仍是 MiniMax M3，可显式配置独立 reviewer 模型。具体遗漏进入预算内修复。
- **pr-open**：推送并创建 PR，写明来源 Issue、完成项、CI、试玩步骤与失败风险。CI 为最终权威校验；工作未完成不创建伪装成功的 PR。

配额耗尽保存 worktree、session、base SHA、合同哈希、阶段、消耗与下次时间。普通失败同样归档补丁、未跟踪文件、模型输出和摘要；不先删除唯一产物。重跑前检查审批、代码基线和恢复状态。重复相同失败达到预算后暂停当前 Issue，继续不依赖它的队列。

## 模型与工具权限

GitHub 写入、标签变更、合并、队列管理由确定性控制器执行。研究模型可读代码并搜索，不能获得 GitHub token；实现模型仅可修改批准路径并调用固定 verifier，禁止任意 Bash 与网络。凭据文件不得位于模型可读目录。

Claude 工具白名单只是工具限制，不等同于文件系统或网络隔离。部署需要独立用户/目录权限或容器、文件路径拦截，以及 Git diff 后验检查；不能声称 prompt 与 --restricted 本身已经提供完整沙箱。网页、Issue、日志均作为不可信数据输入，结构化输出须校验后使用。

实现工具可选固定 unit/build/browser/levels/upgrades；命令、目录与端口由控制器决定。浏览器缓存使用明确的稳定路径，不随每个 sandbox HOME 改变；证据输出到独立 run 目录，不把测试截图当作代码改动。

## “已经试玩”与自动合并

统一新标签为 `已经试玩`。迁移时同步修改现有 Human playtest approval 的标签检查、文档和重置逻辑，不能同时留下两个互相矛盾的必须标签。

可信的标签工作流只读取 GitHub API，不 checkout/执行 PR 代码。添加标签者必须有仓库 write/maintain/admin 权限；记录批准的当前 head SHA 和操作者。push 新提交、移除标签或 PR 关闭时撤销批准。审批记录绑定 SHA，避免并发标签/新提交导致旧试玩结果被错误复用。

自动合并由受保护的控制器执行，触发于标签变更或当前 SHA 的 CI 完成；只允许本仓库到 master 的目标 PR，要求非 draft、无冲突、最新 head SHA 等于批准 SHA、所有 required checks 通过、分支保护允许。调用带 expectedHeadOid 的合并/auto-merge API；发生竞态则停止，重新评估。不得管理员绕过 CI。

优先使用 GitHub 内置 auto-merge 并保持 strict 分支保护。如果仓库不支持 auto-merge，由可信控制器在同样条件下调用 squash merge。需实测机器人合并后 master 的部署工作流仍被触发；不能假设 GITHUB_TOKEN 的动作会自动触发后续工作流，必要时使用最小权限 GitHub App token 或显式派发可信 master 部署。

## 运行记录与失败分类

每次运行有 run.json：issue、base/head SHA、合同哈希、阶段、attempt、模型/session、开始/结束时间、轮次/可得用量、失败类别、next_attempt_at、证据路径。不得记录 token 值。Issue 用一条可更新的机器人评论显示状态，避免重复失败刷屏。

分类至少包括：contract_invalid、dependency_wait、environment_failure、baseline_failure、model_quota、model_no_progress、acceptance_invalid、implementation_failure、scope_violation、review_rejected、github_failure。未知失败保留原错误，不能强行判为模型能力不足。

## 实施与验收顺序

1. 收集服务器只读诊断和 Issue #9 browser.log，建立部署基线；将研究脚本、模型配置模板和 systemd 单元版本化。
2. 实现结构化任务合同、研究规划器、可验证拆分、幂等发布与依赖调度；用 #15 离线复现验证，禁止机械拆分造成漏项。
3. 实现统一验证/修复状态机、稳定浏览器环境、断点恢复与报告；覆盖缺 Chromium、主干失败、额度恢复、构建失败修复、浏览器断言修复、重复发布等场景。
4. 实现已经试玩的 SHA 绑定与自动合并；测试旧 SHA 批准、标签撤销、CI 失败、未授权用户、fork、head 竞态、成功合并及部署触发。
5. 服务器安装预检通过后部署 timer；先手动跑一个研究计划和一个小 Issue 的完整链路，再启用每日计划。

完成标准必须是服务器实跑研究 → 未审批 Issue → 人工批准 → 实现与修复 → PR CI → 人工已经试玩 → 自动合并 → master 部署。仅本地测试或文档完成不得标记部署完成。
