export const APPROVAL_LABELS = ["未审批", "同意实现", "拒绝", "挂起"];
export const CHECKS = ["unit", "build", "browser", "levels", "upgrades"];

export function approved(labels) {
  const names = labels.map((l) => typeof l === "string" ? l : l.name);
  return names.includes("同意实现") &&
    APPROVAL_LABELS.filter((l) => names.includes(l)).length === 1;
}

function text(value, name, max = 1500) {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("-->")) {
    throw new Error(`invalid ${name}`);
  }
}

export function validateTask(task) {
  if (!task || typeof task !== "object") throw new Error("task must be an object");
  text(task.id, "id", 60);
  if (!/^[a-z][a-z0-9-]*$/.test(task.id)) throw new Error("invalid task id");
  text(task.title, "title", 100);
  text(task.goal, "goal");
  if (!Array.isArray(task.changeFiles) || task.changeFiles.length < 1 || task.changeFiles.length > 3) {
    throw new Error("changeFiles must contain 1–3 paths");
  }
  for (const file of task.changeFiles) {
    if (typeof file !== "string" || !/^(src\/[A-Za-z0-9_./-]+|tests\/[A-Za-z0-9_./-]+|index\.html)$/.test(file) ||
        file.split("/").some((s) => !s || s === "." || s === "..") || file.includes("acceptance-issue-")) {
      throw new Error(`forbidden change path: ${file}`);
    }
  }
  if (new Set(task.changeFiles).size !== task.changeFiles.length) throw new Error("duplicate paths");
  if (!Number.isInteger(task.estimatedChangedLines) || task.estimatedChangedLines < 1 || task.estimatedChangedLines > 350) {
    throw new Error("estimatedChangedLines must be 1–350");
  }
  for (const key of ["acceptance", "outOfScope", "manualPlaytest"]) {
    if (!Array.isArray(task[key]) || task[key].length < 1 || task[key].length > (key === "acceptance" ? 10 : 6)) {
      throw new Error(`invalid ${key} list`);
    }
    task[key].forEach((v) => text(v, key));
  }
  if (!["node", "browser"].includes(task.acceptanceKind)) throw new Error("acceptanceKind must be node or browser");
  if (!Array.isArray(task.dependsOn) || task.dependsOn.some((s) => typeof s !== "string")) throw new Error("invalid dependencies");
  return task;
}

export function validatePlan(plan, sourceCount = 0) {
  text(plan?.title, "plan title", 100);
  text(plan.summary, "summary", 3000);
  if (!Array.isArray(plan.tasks) || !plan.tasks.length || plan.tasks.length > 10) throw new Error("plan needs 1–10 small tasks");
  const seen = new Set();
  const coverage = new Set();
  for (const task of plan.tasks) {
    validateTask(task);
    if (seen.has(task.id)) throw new Error("duplicate task id");
    if (task.dependsOn.some((id) => !seen.has(id))) throw new Error("dependencies must point to earlier tasks");
    seen.add(task.id);
    if (sourceCount) {
      if (!Array.isArray(task.sourceCriteria) || !task.sourceCriteria.length) throw new Error("missing source criteria mapping");
      for (const n of task.sourceCriteria) {
        if (!Number.isInteger(n) || n < 1 || n > sourceCount) throw new Error("invalid source criterion");
        coverage.add(n);
      }
    }
  }
  if (sourceCount && coverage.size !== sourceCount) throw new Error("split omitted acceptance criteria");
  return plan;
}

export function readContract(body) {
  const matches = [...body.matchAll(/<!-- tank-task-v2\s*\n([\s\S]*?)\n-->/g)];
  if (!matches.length) return null;
  if (matches.length !== 1) throw new Error("multiple task contracts");
  const task = validateTask(JSON.parse(matches[0][1]));
  if (!Array.isArray(task.dependencyIssues) || task.dependencyIssues.some((n) => !Number.isSafeInteger(n) || n < 1)) {
    throw new Error("invalid dependency issue numbers");
  }
  return task;
}

export function renderTask(task, marker, dependencyIssues, sources = []) {
  const contract = { ...task, dependencyIssues };
  return `<!-- ${marker} -->\n\n## 目标\n${task.goal}\n\n## 修改范围\n${task.changeFiles.map((p) => `- \`${p}\``).join("\n")}\n\n预计改动 ${task.estimatedChangedLines} 行；只实现此切片。\n\n## 验收标准\n${task.acceptance.map((a) => `- [ ] ${a}`).join("\n")}\n\n## 不包含\n${task.outOfScope.map((s) => `- ${s}`).join("\n")}\n\n## 前置依赖\n${dependencyIssues.map((n) => `- #${n} 的实现 PR 必须先合并`).join("\n") || "无"}\n\n## 人工试玩\n${task.manualPlaytest.map((s) => `- ${s}`).join("\n")}\n\n## 回归门禁\nunit / build / browser / levels / upgrades；运行回归不意味着允许修改回归文件。\n\n## 资料\n${sources.map((s) => `- ${s.url} — ${s.finding}`).join("\n")}\n\n<!-- tank-task-v2\n${JSON.stringify(contract, null, 2)}\n-->\n`;
}
