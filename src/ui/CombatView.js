import { Vector3 } from "three";
import { LEVELS } from "../core/config.js";

// Fit the complete arena in camera space, independent of canvas aspect ratio.
export function fitArena(camera, width, height) {
  camera.updateMatrixWorld(true);
  const points = [];
  for (const x of [-1.2, 27.2])
    for (const y of [-0.9, 2])
      for (const z of [-1.2, 27.2])
        points.push(
          new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse),
        );
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const aspect = Math.max(1, width) / Math.max(1, height);
  const halfHeight =
    Math.max(
      (Math.max(...ys) - Math.min(...ys)) / 2,
      (Math.max(...xs) - Math.min(...xs)) / (2 * aspect),
    ) * 1.035;
  camera.left = cx - halfHeight * aspect;
  camera.right = cx + halfHeight * aspect;
  camera.top = cy + halfHeight;
  camera.bottom = cy - halfHeight;
  camera.updateProjectionMatrix();
}

export class CombatView {
  constructor(game) {
    this.game = game;
    this.shell = document.querySelector(".app-shell");
    this.shell.classList.add("immersive");
    document.body.classList.add("in-combat");
    this.hud = Object.fromEntries(
      ["hud-lives", "hud-base", "hud-score", "hud-objective", "hud-emp"].map(
        (id) => [id, document.getElementById(id)],
      ),
    );
    this.dialog = document.getElementById("tactics-dialog");
    this.shell.append(this.dialog);
    this.campaignSelect = document.getElementById("campaign-select");
    this.dialog
      .querySelector(".tactics-content")
      .append(document.querySelector(".mission-sidebar"));
    document.getElementById("tactics-btn").addEventListener("click", () => {
      if (game.state === "playing") game.togglePause();
      this.dialog.showModal();
    });
    document
      .getElementById("tactics-close")
      .addEventListener("click", () => this.dialog.close());
    document
      .getElementById("hud-emp")
      .addEventListener("click", () => game.activateEMP());
    this.fullscreen = document.getElementById("fullscreen-btn");
    this.fullscreen.hidden = !document.fullscreenEnabled;
    this.fullscreen.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await this.shell.requestFullscreen();
      } catch {
        this.fullscreen.textContent = "全屏不可用";
      }
    });
    document.addEventListener("fullscreenchange", () => {
      this.fullscreen.textContent = document.fullscreenElement
        ? "退出全屏"
        : "全屏";
      this.fullscreen.setAttribute(
        "aria-pressed",
        String(!!document.fullscreenElement),
      );
      game.resize();
    });
    document
      .getElementById("campaign-menu-btn")
      .addEventListener("click", () => {
        this.dialog.close();
        game.returnToMenu();
      });
  }
  renderCampaign(state = this.game.state) {
    const g = this.game,
      root = this.campaignSelect;
    root.hidden = state !== "ready" || g.mode !== "campaign";
    root.replaceChildren();
    if (root.hidden) return;
    ["01 / 边境防线", "02 / 霓虹封锁", "03 / 核心攻防"].forEach(
      (name, chapter) => {
        const section = document.createElement("section"),
          title = document.createElement("h2"),
          grid = document.createElement("div");
        title.textContent = name;
        grid.className = "chapter-stages";
        LEVELS.slice(chapter * 3, chapter * 3 + 3).forEach((level, i) => {
          const index = chapter * 3 + i,
            button = document.createElement("button");
          const record =
            g.campaignProgress.records[`${index + 1}:${g.difficulty}`];
          button.type = "button";
          button.dataset.level = index;
          button.disabled = index >= g.campaignProgress.unlocked;
          button.setAttribute("aria-pressed", String(index === g.levelIndex));
          const label = document.createElement("strong"),
            detail = document.createElement("small");
          label.textContent = `${String(index + 1).padStart(2, "0")} ${level.name}`;
          detail.textContent = button.disabled
            ? "通关上一关解锁"
            : record
              ? `${record.score} 分 · ${record.intact ? "无损 " : ""}${record.swift ? "速攻" : "已通关"}`
              : "待挑战";
          button.append(label, detail);
          button.addEventListener("click", () => g.selectCampaignLevel(index));
          grid.append(button);
        });
        section.append(title, grid);
        root.append(section);
      },
    );
    const hint = document.createElement("p");
    hint.className = "campaign-note";
    hint.textContent =
      "选关以初始坦克出击 · 成绩按难度保存至本机 · 无损：不损失生命 / 速攻：150 秒内歼灭";
    root.append(hint);
  }
  sync() {
    const g = this.game;
    this.hud["hud-lives"].textContent = `♥ ${g.lives}`;
    this.hud["hud-base"].textContent = g.map?.base.alive
      ? "核心在线"
      : "核心失守";
    this.hud["hud-score"].textContent =
      `${String(g.score).padStart(6, "0")} 分`;
    if (g.boss?.alive) {
      const action =
        g.boss.attackState === "windup"
          ? g.boss.charging
            ? "冲锋预警"
            : "扇形炮击预警"
          : g.boss.attackState === "recover"
            ? "恢复期 · 反击机会"
            : "核心守卫";
      document.querySelector(".boss-name").textContent =
        `阶段 ${g.boss.phase} / 2 · ${action}`;
    }
    const remain = Math.max(0, g.enemyTotal() - g.kills);
    const text =
      g.mode === "endless"
        ? `第 ${g.wave} 波 · 剩余 ${remain} 辆`
        : g.levelConfig.goal?.kind === "survive"
          ? `坚守 ${Math.max(0, Math.ceil(g.levelConfig.goal.seconds - g.time))} 秒 · 守住核心`
          : `${g.levelConfig.number} / 9 · ${g.levelConfig.name} · 剩余 ${remain} 辆`;
    if (this.hud["hud-objective"].textContent !== text)
      this.hud["hud-objective"].textContent = text;
    const emp = this.hud["hud-emp"];
    emp.disabled = !(
      g.empAvailable() &&
      g.state === "playing" &&
      g.player?.alive &&
      g.empCooldownLeft <= 0
    );
    emp.textContent = !g.empAvailable()
      ? "Q · 第 5 关解锁"
      : g.empCooldownLeft > 0
        ? `Q · ${Math.ceil(g.empCooldownLeft)}s`
        : "Q · EMP 就绪";
    document.querySelector(".operation-name strong").textContent =
      g.mode === "endless" ? "无尽防线" : g.levelConfig.name;
  }
}
