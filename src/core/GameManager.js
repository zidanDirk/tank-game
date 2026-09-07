import * as THREE from "three";
import { LEVELS, STEP, seededRandom } from "./config.js";
import { Input } from "./Input.js";
import { MapManager } from "../world/MapManager.js";
import { PlayerTank, EnemyTank } from "../entities/Tank.js";
import { CollisionSystem } from "../systems/CollisionSystem.js";
import { BulletManager } from "../systems/BulletManager.js";
import { Effects } from "../systems/Effects.js";
import { AudioSystem } from "../systems/AudioSystem.js";

export class GameManager {
  constructor(container) {
    this.container = container;
    this.state = "ready";
    this.levelIndex = 0;
    this.levelConfig = LEVELS[0];
    this.levelScoreStart = 0;
    this.rng = seededRandom();
    this.time = 0;
    this.accumulator = 0;
    this.lastTime = 0;
    this.fps = 60;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe9ecdf);
    this.camera = new THREE.OrthographicCamera(-17, 17, 17, -17, 0.1, 150);
    this.camera.position.set(13, 38, 35);
    this.camera.lookAt(13, 0, 13);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    container.appendChild(this.renderer.domElement);
    const sun = new THREE.DirectionalLight(0xfff4db, 3);
    sun.position.set(-7, 28, 5);
    sun.target.position.set(13, 0, 13);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -23,
      right: 23,
      top: 23,
      bottom: -23,
      near: 1,
      far: 80,
    });
    sun.shadow.normalBias = 0.04;
    sun.shadow.bias = -0.0001;
    this.scene.add(sun, sun.target, new THREE.AmbientLight(0xe8eee0, 1.5));
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ opacity: 0.12 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.86;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.audio = new AudioSystem();
    this.effects = new Effects(this.scene, () => this.rng());
    this.bullets = new BulletManager(this);
    this.input = new Input(this, this.renderer.domElement);
    this.ui = Object.fromEntries(
      [
        "score",
        "kills",
        "remaining",
        "lives",
        "base-status",
        "wave",
        "elapsed",
        "mission-title",
        "mission-copy",
        "enemy-roster",
        "status-label",
        "pause-btn",
        "sound-btn",
        "restart-btn",
        "overlay",
        "overlay-title",
        "overlay-copy",
        "primary-btn",
      ].map((id) => [id, document.getElementById(id)]),
    );
    this.ui["primary-btn"].addEventListener("click", () => {
      this.audio.unlock();
      if (this.state === "ready") this.start();
      else if (this.state === "paused") this.togglePause();
      else if (this.state === "level-clear") this.advanceLevel();
      else if (this.state === "won") this.newCampaign();
      else this.restart();
    });
    this.ui["pause-btn"].addEventListener("click", () => this.togglePause());
    this.ui["restart-btn"].addEventListener("click", () => {
      this.audio.unlock();
      this.restart();
    });
    this.ui["sound-btn"].addEventListener("click", () => {
      this.audio.unlock();
      const muted = this.audio.toggle();
      this.ui["sound-btn"].setAttribute("aria-pressed", String(muted));
      this.ui["sound-btn"].title = muted ? "开启音效" : "关闭音效";
      this.ui["sound-btn"].setAttribute(
        "aria-label",
        muted ? "开启音效" : "关闭音效",
      );
      this.ui["sound-btn"].style.opacity = muted ? ".45" : "1";
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.reset();
    this.setOverlay("ready");
    this.resize();
    requestAnimationFrame((t) => this.frame(t));
  }
  get tanks() {
    return [this.player, ...this.enemies].filter((t) => t && t.alive);
  }
  reset(levelIndex = this.levelIndex, preserveCampaign = true) {
    const nextLevel = Math.max(0, Math.min(levelIndex, LEVELS.length - 1));
    this.levelIndex = nextLevel;
    this.levelConfig = LEVELS[nextLevel];
    this.input.clear();
    this.input.mouseAim = false;
    this.input.target = null;
    this.bullets.clear();
    this.effects.clear();
    if (this.player) this.player.dispose();
    for (const e of this.enemies || []) e.dispose();
    if (this.map) this.map.dispose();
    this.rng = seededRandom(1990 + nextLevel * 997);
    this.map = new MapManager(this.scene, this.levelConfig.map);
    this.enemies = [];
    this.collision = new CollisionSystem(this.map, () => this.tanks);
    this.player = new PlayerTank(this, 9.5, 23.5);
    this.lives = 3;
    this.score = preserveCampaign ? this.levelScoreStart : 0;
    this.kills = 0;
    this.spawned = 0;
    this.spawnTimer = 1.8;
    this.respawnTimer = 0;
    this.time = 0;
    this.accumulator = 0;
    // A readable initial enemy presence, frozen until the commander starts.
    this.spawnEnemy(0);
    this.spawnEnemy(2);
    this.updateUI();
  }
  spawnEnemy(gate) {
    if (this.spawned >= this.levelConfig.sequence.length) return false;
    const gates = [2.5, 12.5, 23.5];
    const order =
      gate === undefined
        ? [this.spawned % 3, (this.spawned + 1) % 3, (this.spawned + 2) % 3]
        : [gate];
    for (const i of order) {
      const x = gates[i],
        z = 2.5;
      if (
        this.tanks.some(
          (t) => Math.abs(t.x - x) < 1.5 && Math.abs(t.z - z) < 1.5,
        )
      )
        continue;
      this.enemies.push(
        new EnemyTank(this, this.levelConfig.sequence[this.spawned], x, z),
      );
      this.spawned++;
      return true;
    }
    return false;
  }
  start() {
    if (this.state !== "ready") return;
    this.state = "playing";
    this.audio.play("start");
    this.setOverlay();
    this.updateUI();
  }
  restart() {
    this.reset(this.levelIndex, true);
    this.state = "playing";
    this.setOverlay();
    this.audio.play("start");
    this.updateUI();
  }
  togglePause() {
    if (this.state !== "playing" && this.state !== "paused") return;
    this.state = this.state === "playing" ? "paused" : "playing";
    this.input.clear();
    this.accumulator = 0;
    this.setOverlay(this.state === "paused" ? "paused" : undefined);
    this.updateUI();
  }
  finish(won, reason) {
    if (this.state !== "playing") return;
    this.state = won ? "won" : "lost";
    this.input.clear();
    this.setOverlay(this.state, reason);
    this.updateUI();
  }
  completeLevel() {
    this.state = "level-clear";
    this.input.clear();
    this.setOverlay(
      "level-clear",
      `第 ${this.levelConfig.number} 关已清除。准备进入 ${this.levelIndex + 2} 关。`,
    );
    this.updateUI();
  }
  advanceLevel() {
    if (this.levelIndex >= LEVELS.length - 1) return;
    this.levelScoreStart = this.score;
    this.reset(this.levelIndex + 1, true);
    this.state = "playing";
    this.audio.play("start");
    this.setOverlay();
    this.updateUI();
  }
  newCampaign() {
    this.levelScoreStart = 0;
    this.reset(0, false);
    this.state = "playing";
    this.audio.play("start");
    this.setOverlay();
    this.updateUI();
  }
  onTankDestroyed(tank) {
    if (tank.team === "player") {
      this.lives--;
      if (this.lives <= 0)
        this.finish(false, "作战坦克已全部损失。调整路线，再次守住防线。");
      else this.respawnTimer = 1.4;
    } else {
      this.score += tank.score;
      this.kills++;
      const total = this.levelConfig?.sequence.length ?? 12;
      if (this.kills >= total) {
        if (this.levelConfig && this.levelIndex < LEVELS.length - 1)
          this.completeLevel();
        else
          this.finish(true, "敌军已全部清除，基地安全。指挥官，阵地守住了。");
      }
    }
    this.updateUI();
  }
  setOverlay(state, reason) {
    this.ui.overlay.hidden = !state;
    if (!state) return;
    const content = {
      ready: [
        "指挥官，准备出击",
        `第 ${this.levelConfig.number} 关 · ${this.levelConfig.objective} 你有 3 次机会，守住这片阵地。`,
        "开始战役 ↗",
      ],
      paused: [
        "战役已暂停",
        "喘口气，观察战场。准备好后继续守护基地。",
        "继续战役 ↗",
      ],
      "level-clear": [
        `第 ${this.levelConfig.number} 关完成`,
        "",
        `进入第 ${this.levelIndex + 2} 关 ↗`,
      ],
      won: ["阵地守住了", "", "再次出击 ↗"],
      lost: ["防线失守", "", "重新部署 ↗"],
    }[state];
    this.ui["overlay-title"].textContent = content[0];
    this.ui["overlay-copy"].textContent = reason || content[1];
    this.ui["primary-btn"].textContent = content[2];
  }
  updateUI() {
    const total = this.levelConfig.sequence.length;
    this.ui.score.textContent = String(this.score).padStart(6, "0");
    this.ui.kills.textContent = this.kills;
    this.ui.remaining.textContent = total - this.kills;
    this.ui.lives.textContent =
      "♥ ".repeat(this.lives) + "♡ ".repeat(3 - this.lives);
    this.ui["base-status"].textContent = this.map.base.alive
      ? "完好"
      : "已摧毁";
    this.ui["base-status"].style.color = this.map.base.alive ? "" : "#a24e38";
    this.ui.wave.textContent = String(this.levelConfig.number).padStart(2, "0");
    this.ui["status-label"].textContent = {
      ready: "待命",
      playing: "作战中",
      paused: "已暂停",
      "level-clear": "关卡完成",
      won: "任务完成",
      lost: "防线失守",
    }[this.state];
    this.ui["mission-title"].childNodes[0].textContent = this.levelConfig.name;
    this.ui["mission-title"].querySelector("span").textContent =
      this.levelConfig.english;
    this.ui["mission-copy"].textContent = this.levelConfig.briefing;
    this.ui["pause-btn"].setAttribute(
      "aria-label",
      this.state === "paused" ? "继续游戏" : "暂停游戏",
    );
    this.ui["pause-btn"].setAttribute(
      "aria-pressed",
      String(this.state === "paused"),
    );
    this.ui["enemy-roster"].innerHTML = Array.from(
      { length: total },
      (_, i) =>
        `<i class="roster-tank${i < this.kills ? " destroyed" : ""}" aria-hidden="true"></i>`,
    ).join("");
    this.ui["enemy-roster"].setAttribute(
      "aria-label",
      `第 ${this.levelConfig.number} 关剩余 ${total - this.kills} 辆敌军`,
    );
  }
  tick(dt) {
    this.time += dt;
    if (this.player.alive) this.player.tick(dt);
    for (const enemy of this.enemies) if (enemy.alive) enemy.tick(dt);
    this.bullets.tick(dt);
    if (this.state !== "playing") return;
    this.enemies = this.enemies.filter((e) => {
      if (!e.alive) {
        e.dispose();
        return false;
      }
      return true;
    });
    if (!this.player.alive && this.lives > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        for (const [x, z] of [
          [9.5, 23.5],
          [7.5, 23.5],
          [16.5, 23.5],
        ])
          if (this.collision.canMove(this.player, x, z)) {
            this.player.dispose();
            this.player = new PlayerTank(this, x, z);
            break;
          }
      }
    }
    this.spawnTimer -= dt;
    if (
      this.spawnTimer <= 0 &&
      this.enemies.length < this.levelConfig.maxConcurrent
    ) {
      if (this.spawnEnemy()) this.spawnTimer = this.levelConfig.spawnInterval;
      else this.spawnTimer = 0.6;
    }
    this.effects.tick(dt);
    this.map.tick(this.time);
    this.ui.elapsed.textContent = `${String(Math.floor(this.time / 60)).padStart(2, "0")}:${String(Math.floor(this.time % 60)).padStart(2, "0")}`;
  }
  resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    const height = Math.max(28.5, 29.5 / aspect);
    this.camera.left = (-height * aspect) / 2;
    this.camera.right = (height * aspect) / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.updateProjectionMatrix();
  }
  frame(ms) {
    const dt = this.lastTime ? Math.min((ms - this.lastTime) / 1000, 0.1) : 0;
    this.lastTime = ms;
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    if (this.state === "playing") {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= STEP && steps++ < 6) {
        this.tick(STEP);
        this.accumulator -= STEP;
        if (this.state !== "playing") {
          this.accumulator = 0;
          break;
        }
      }
    } else if (
      this.state === "won" ||
      this.state === "lost" ||
      this.state === "level-clear"
    )
      this.effects.tick(dt);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame((t) => this.frame(t));
  }
  snapshot() {
    return {
      state: this.state,
      level: this.levelConfig.number,
      levelName: this.levelConfig.name,
      levelIndex: this.levelIndex,
      levelTotal: LEVELS.length,
      time: this.time,
      score: this.score,
      kills: this.kills,
      lives: this.lives,
      baseAlive: this.map.base.alive,
      player: {
        x: this.player.x,
        z: this.player.z,
        alive: this.player.alive,
        aim: this.player.aim,
      },
      enemies: this.enemies.map((e) => ({
        type: e.type,
        x: e.x,
        z: e.z,
        hp: e.hp,
      })),
      bullets: this.bullets.items.length,
      spawned: this.spawned,
      render: {
        calls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        geometries: this.renderer.info.memory.geometries,
        textures: this.renderer.info.memory.textures,
        fps: Math.round(this.fps),
      },
    };
  }
}
