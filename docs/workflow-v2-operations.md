# 工作流 v2 运维

## 部署边界

PR 合并前仅在独立目录验证；不要直接覆盖服务器未跟踪的 `scripts/daily-research/`。
部署前确认 research/implementer 服务均未运行，把本机未跟踪研究目录和旧脚本备份到仓库外，再 `git pull --ff-only`。
备份必须保留，禁止用 `git clean` 清理这些文件。凭据仍保留于服务器配置目录，不进 Git。

合并后在 `/home/ubuntu/tank-game` 执行：

```bash
npm ci --ignore-scripts
PLAYWRIGHT_BROWSERS_PATH=/home/ubuntu/.cache/ms-playwright npx playwright install chromium
sudo /usr/bin/node node_modules/playwright/cli.js install-deps chromium
PLAYWRIGHT_BROWSERS_PATH=/home/ubuntu/.cache/ms-playwright bash scripts/issue-implementer/verify.sh full
bash scripts/automation/install.sh
```

安装器备份旧 systemd 单元，拒绝覆盖运行中的研究/实现服务。调度时间为北京时间 09:00 研究、10:00 实现，合并检查每五分钟一次。

## 审批

- Issue 只保留一个决定标签：`未审批`、`同意实现`、`拒绝`、`挂起`。
- 子 Issue 默认未审批；依赖的实现 PR 未合并时不会开始。
- PR 的最新提交需要人工试玩后添加 `已经试玩`。新提交会撤销标签。
- 合并器要求当前 SHA 的可信试玩记录、两项成功检查、非草稿且可合并；不会替你试玩或绕过分支保护。
- 首次部署需要人工完成工作流 PR 的审核合并；新试玩记录工作流必须先进入 master。

## 手动触发

```bash
sudo systemctl start --no-block tank-research.service
sudo systemctl reset-failed tank-issue-implementer.service
sudo systemctl start --no-block tank-issue-implementer.service
sudo journalctl -u tank-issue-implementer.service -n 80 -f -o cat
```

研究发布按北京时间日期幂等。`DRY_RUN=true bash scripts/daily-research/run.sh split 15` 仅生成并缓存拆分预览；正式运行复用校验通过的计划，创建未审批子 Issue。父 Issue 正文变化时停止，需保留旧计划后重新规划。

拆分发布前及模型完成后都会检查父 Issue 仍然开放且唯一标记“同意实现”；已关闭任务可以预览，但不会被重新发布。模型到达轮次上限时只额外恢复一次原会话（最多 12 轮），关闭所有工具收尾输出 JSON，不重新进行研究。已成功研究按日期缓存，规划重试可复用。运维恢复可使用 `RESEARCH_RESPONSE_FILE` 或 `PLAN_RESPONSE_FILE` 指向同一任务已归档的响应；这些变量只应临时设置，不写入长期服务配置。

## 失败证据

- 研究与规划：`~/.local/state/tank-research-v2/` 下的提示、结果、校验错误与发布记录。
- 实现：`~/.local/state/tank-issue-implementer/runs/` 下的 baseline/unit/build/browser 日志、修复记录、补丁和独立审查结果。
- 浏览器证据存放验证日志目录下的 `evidence/artifacts/`。
- `start-limit-hit` 先查失败日志，修复后再 reset-failed；不要反复启动消耗模型配额。
- 服务器 GitHub CLI 2.46 已支持所用显式分页，无需为 `--slurp` 升级 CLI。
