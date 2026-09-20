import * as THREE from "three";
import {
  LEVELS,
  STEP,
  TYPES,
  seededRandom,
  POWERUPS,
  POWERUP_KEYS,
  POWERUP_DROP_CHANCE,
  ENDLESS,
  MAP_PRESETS,
  dailySeed,
  CELL,
  SIZE,
  STREAK,
  RUN_UPGRADES,
  DIFFICULTY_TIERS,
  DIFFICULTY_BY_ID,
  DEFAULT_DIFFICULTY,
  difficultyFor,
  computeEffectiveScaling,
} from "./config.js";
import { Input } from "./Input.js";
import { MapManager } from "../world/MapManager.js";
import {
  PlayerTank,
  EnemyTank,
  BossTank,
  ArmorTank,
} from "../entities/Tank.js";
import { Pickup } from "../entities/Pickup.js";
import { CollisionSystem } from "../systems/CollisionSystem.js";
import { BulletManager } from "../systems/BulletManager.js";
import { Effects } from "../systems/Effects.js";
import { AudioSystem } from "../systems/AudioSystem.js";
import { Leaderboard } from "../systems/Leaderboard.js";
import { RunUpgradeSystem } from "../systems/RunUpgradeSystem.js";

const _tmpVec = new THREE.Vector3();

export class GameManager {
  constructor(container) {
    this.container = container;
    this.state = "ready";
    this.mode = "campaign";
    this.levelIndex = 0;
    this.levelConfig = LEVELS[0];
    this.levelScoreStart = 0;
    this.rng = seededRandom();
    this.time = 0;
    this.accumulator = 0;
    this.lastTime = 0;
    this.fps = 60;
    this.pickups = [];
    this.activeBuffs = new Map();
    this.wave = 0;
    this.modifiers = [];
    this.runUpgrades = new RunUpgradeSystem();
    this.pendingUpgradeTransition = null;
    this.endlessSeed = dailySeed();
    this.attempt = 1;
    this.boss = null;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe9ecdf);
    this.camera = new THREE.OrthographicCamera(-17, 17, 17, -17, 0.1, 150);
    this.camera.position.set(13, 38, 35);
    this.cameraBase = { x: 13, z: 35 };
    this.camera.lookAt(13, 0, 13);
    this.difficulty = DEFAULT_DIFFICULTY;
    this._briefingTimer = 0;
    this._briefingTone = "polite";
    this._lastBriefingAt = -Infinity;
    this._threatBannerEl = null;
    this._briefingAriaEl = null;
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
        "mode-campaign",
        "mode-endless",
        "buff-tray",
        "run-upgrade-tray",
        "boss-hp",
        "boss-hp-fill",
        "leaderboard",
        "streak-badge",
        "streak-mult",
        "upgrade-choices",
        "mode-toggle",
        "overlay-panel",
        "overlay-hint",
        "difficulty-tier",
        "threat-badge",
        "threat-badge-label",
        "threat-badge-mult",
        "threat-banner",
      ].map((id) => [id, document.getElementById(id)]),
    );
    this._threatBannerEl =
      this.ui["threat-banner"] ||
      this.container?.querySelector?.("#threat-banner") ||
      null;
    this._briefingAriaEl =
      document.getElementById("briefing-aria") ||
      this.container?.querySelector?.("#briefing-aria") ||
      null;
    // Damage vignette lives outside the ui map because it is queried lazily.
    this.damageVignette =
      this.container?.querySelector?.(".damage-vignette") ?? null;
    this.scoreLayer =
      this.container?.querySelector?.(".score-popup-layer") ?? null;
    this.ui["primary-btn"].addEventListener("click", () => {
      this.audio.unlock();
      if (this.state === "ready") {
        if (this.mode === "campaign") this.start();
        else this.startEndless();
      } else if (this.state === "paused") this.togglePause();
      else if (this.state === "level-clear")
        this.presentUpgradeChoices({
          kind: "campaign",
          nextLevel: this.levelIndex + 1,
        });
      else if (this.state === "upgrade-select") return;
      else if (this.state === "won") this.newCampaign();
      else if (this.state === "lost" && this.mode === "endless")
        this.retryEndless();
      else this.restart();
    });
    this.ui["mode-campaign"].addEventListener("click", () => {
      if (this.state !== "ready") return;
      this.mode = "campaign";
      this.ui["mode-campaign"].setAttribute("aria-pressed", "true");
      this.ui["mode-endless"].setAttribute("aria-pressed", "false");
      this.updateUI();
    });
    this.ui["mode-endless"].addEventListener("click", () => {
      if (this.state !== "ready") return;
      this.mode = "endless";
      this.ui["mode-campaign"].setAttribute("aria-pressed", "false");
      this.ui["mode-endless"].setAttribute("aria-pressed", "true");
      this.updateUI();
    });
    this.renderDifficultyTier();
    this._difficultyButtons = this.ui["difficulty-tier"]
      ? Array.from(this.ui["difficulty-tier"].querySelectorAll("button"))
      : [];
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
    // Auto-pause when the tab/window goes hidden mid-battle — otherwise the
    // player comes back to a lost base. Only triggers from `playing`; other
    // states (ready / won / lost / level-clear / upgrade-select) stay as-is.
    this._onVisibilityChange = () => this.handleVisibilityChange();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this._onVisibilityChange);
    }
    this.reset();
    this.setOverlay("ready");
    this.resize();
    requestAnimationFrame((t) => this.frame(t));
  }
  get tanks() {
    return [this.player, ...this.enemies].filter((t) => t && t.alive);
  }
  getRunUpgradeStacks(id) {
    return this.runUpgrades.get(id);
  }
  resetRunUpgrades() {
    this.runUpgrades.reset();
    this.pendingUpgradeTransition = null;
    this.syncRunUpgradeHud();
  }
  renderDifficultyTier() {
    const root = this.ui["difficulty-tier"];
    if (!root) return;
    root.replaceChildren();
    for (const tier of DIFFICULTY_TIERS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "difficulty-btn";
      button.dataset.tier = tier.id;
      button.setAttribute("role", "radio");
      button.setAttribute(
        "aria-label",
        `${tier.label} · ${tier.summary}。${tier.description}`,
      );
      button.setAttribute(
        "aria-pressed",
        String(tier.id === this.difficulty),
      );
      const label = document.createElement("strong");
      label.textContent = tier.label;
      const english = document.createElement("small");
      english.textContent = `${tier.english} · ${tier.summary}`;
      button.append(label, english);
      button.addEventListener("click", () => this.setDifficulty(tier.id));
      root.appendChild(button);
    }
    this._difficultyButtons = Array.from(
      root.querySelectorAll("button"),
    );
  }
  setDifficulty(id) {
    const tier = DIFFICULTY_BY_ID[id];
    if (!tier) return false;
    if (this.state !== "ready") {
      // Persist preference but don't perturb a live run. Reset triggers later.
      this.difficulty = tier.id;
      this.syncDifficultyButtons();
      return true;
    }
    if (this.difficulty === tier.id) {
      this.syncDifficultyButtons();
      return true;
    }
    this.difficulty = tier.id;
    this.syncDifficultyButtons();
    if (this.audio?.play) this.audio.play("pickup-spawn");
    return true;
  }
  syncDifficultyButtons() {
    const root = this.ui["difficulty-tier"];
    if (!root) return;
    const buttons = this._difficultyButtons || root.querySelectorAll("button");
    for (const btn of buttons) {
      const isCurrent = btn.dataset.tier === this.difficulty;
      btn.setAttribute("aria-pressed", String(isCurrent));
    }
  }
  applyDifficultyToLevelConfig(levelConfig) {
    if (!levelConfig) return levelConfig;
    const tier = difficultyFor(this.difficulty);
    const base = levelConfig.__base ?? null;
    if (!base) {
      levelConfig.__base = {
        speedMultiplier: levelConfig.speedMultiplier,
        fireMultiplier: levelConfig.fireMultiplier,
        spawnInterval: levelConfig.spawnInterval,
      };
    }
    const src = levelConfig.__base;
    levelConfig.difficulty = tier.id;
    levelConfig.speedMultiplier = src.speedMultiplier * tier.enemySpeedMul;
    levelConfig.fireMultiplier = src.fireMultiplier * tier.enemyFireMul;
    levelConfig.spawnInterval = src.spawnInterval * tier.spawnIntervalMul;
    return levelConfig;
  }
  presentThreatBriefing(opts = {}) {
    const tone = opts.tone ?? "polite";
    const wave = opts.wave ?? this.wave ?? this.levelConfig?.number ?? 1;
    const events = Array.isArray(opts.events) ? opts.events : [];
    const tier = difficultyFor(this.difficulty);
    const scaling =
      this.mode === "endless"
        ? computeEffectiveScaling(this.difficulty, wave)
        : {
            fireMul: (this.levelConfig?.fireMultiplier ?? 1) * tier.enemyFireMul,
            speedMul:
              (this.levelConfig?.speedMultiplier ?? 1) * tier.enemySpeedMul,
          };
    const stage =
      this.mode === "endless" ? `第 ${wave} 波` : `第 ${wave} 关`;
    const headline = `${stage} · 速 ×${scaling.speedMul.toFixed(2)} · 射 ×${(
      1 / scaling.fireMul
    ).toFixed(2)}`;
    const subBits = [];
    if (this.mode === "endless") {
      if (wave >= ENDLESS.armorUnlockWave) subBits.push("装甲解锁");
      if (wave > 0 && wave % ENDLESS.bossEvery === 0) subBits.push("Boss 出现");
      if (this.wave === wave && wave > 0 && wave % 3 === 0)
        subBits.push("三选一改装");
    }
    for (const ev of events) {
      if (!subBits.includes(ev)) subBits.push(ev);
    }
    const subline = subBits.length ? subBits.join(" · ") : tier.description;
    const bannerTone = tone === "assertive" ? "alert" : "info";
    this._showThreatBanner(headline, subline, bannerTone);
    this._announceBriefing(`${stage} · ${tier.label} · ${headline} · ${subline}`, tone);
    this._lastBriefingAt = this.time ?? 0;
  }
  _showThreatBanner(headline, subline, tone) {
    const el = this._threatBannerEl || this.ui["threat-banner"];
    if (!el) return;
    el.textContent = "";
    const title = document.createElement("strong");
    title.textContent = headline;
    el.appendChild(title);
    if (subline) {
      const sub = document.createElement("small");
      sub.textContent = subline;
      el.appendChild(sub);
    }
    el.dataset.tone = tone === "alert" ? "alert" : tone;
    el.setAttribute("aria-hidden", "false");
    el.classList.add("show");
    clearTimeout(this._briefingTimer);
    this._briefingTimer = setTimeout(() => {
      el.classList.remove("show");
      el.setAttribute("aria-hidden", "true");
    }, 1400);
  }
  _announceBriefing(text, politeness) {
    const node =
      this._briefingAriaEl ||
      (typeof document !== "undefined"
        ? document.getElementById("briefing-aria")
        : null);
    if (!node) return;
    // Screen readers ignore updates that don't change text. Clear-then-set
    // inside a microtask keeps the announcement queued reliably.
    node.textContent = "";
    const useTone = politeness === "assertive" ? "assertive" : "polite";
    if (node.getAttribute("aria-live") !== useTone)
      node.setAttribute("aria-live", useTone);
    this._briefingTone = useTone;
    const restore = politeness === "assertive";
    Promise.resolve().then(() => {
      node.textContent = text;
      if (restore) {
        setTimeout(() => {
          if (!node) return;
          node.setAttribute("aria-live", "polite");
          this._briefingTone = "polite";
        }, 800);
      }
    });
  }
  syncBriefingAriaState(state) {
    const node = this._briefingAriaEl;
    if (!node) return;
    const silent = state !== "ready" && state !== "playing";
    node.setAttribute("aria-hidden", String(silent));
  }
  syncThreatBadge() {
    const badge = this.ui["threat-badge"];
    if (!badge) return;
    if (this.state !== "playing" && this.state !== "ready") {
      badge.hidden = true;
      return;
    }
    badge.hidden = false;
    const tier = difficultyFor(this.difficulty);
    const scaling =
      this.mode === "endless" && this.wave > 0
        ? computeEffectiveScaling(this.difficulty, this.wave)
        : {
            speedMul:
              (this.levelConfig?.speedMultiplier ?? 1) * tier.enemySpeedMul,
            fireMul:
              (this.levelConfig?.fireMultiplier ?? 1) * tier.enemyFireMul,
          };
    const ratio = (scaling.speedMul / Math.max(0.01, scaling.fireMul)) * tier.hazardMul;
    let tone = "calm";
    if (ratio >= 1.35) tone = "intense";
    else if (ratio >= 1.1) tone = "hot";
    badge.dataset.tone = tone === "calm" ? "" : tone;
    if (this.ui["threat-badge-label"])
      this.ui["threat-badge-label"].textContent = tier.english;
    if (this.ui["threat-badge-mult"])
      this.ui["threat-badge-mult"].textContent = `×${ratio.toFixed(2)}`;
  }
  buildDifficultySummary() {
    const tier = difficultyFor(this.difficulty);
    const scaling =
      this.mode === "endless" && this.wave > 0
        ? computeEffectiveScaling(this.difficulty, this.wave)
        : {
            speedMul:
              (this.levelConfig?.speedMultiplier ?? 1) * tier.enemySpeedMul,
            fireMul:
              (this.levelConfig?.fireMultiplier ?? 1) * tier.enemyFireMul,
          };
    const stage =
      this.mode === "endless"
        ? `第 ${this.wave} 波`
        : `第 ${this.levelConfig?.number ?? 1} 关`;
    const fireShown = (1 / scaling.fireMul).toFixed(2);
    const speedShown = scaling.speedMul.toFixed(2);
    return `难度 ${tier.label} · ${stage} · 终速 ×${speedShown} · 终射 ×${fireShown}`;
  }
  presentUpgradeChoices(transition) {
    const choices = this.runUpgrades.roll(this.rng, 3);
    if (!choices.length) {
      this.continueAfterUpgrade(transition);
      return;
    }
    this.pendingUpgradeTransition = transition;
    this.state = "upgrade-select";
    this.input.clear();
    this.accumulator = 0;
    this.setOverlay("upgrade-select");
    this.renderUpgradeChoices();
    this.updateUI();
  }
  renderUpgradeChoices() {
    const root = this.ui["upgrade-choices"];
    if (!root) return;
    root.replaceChildren();
    for (const [index, id] of this.runUpgrades.choices.entries()) {
      const upgrade = RUN_UPGRADES[id];
      const current = this.runUpgrades.get(id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "upgrade-choice";
      button.dataset.upgrade = id;
      button.setAttribute(
        "aria-label",
        `${upgrade.label}，${upgrade.description}，当前 ${current} 级，选择后 ${current + 1} 级`,
      );

      const key = document.createElement("span");
      key.className = "upgrade-choice-key";
      key.textContent = String(index + 1).padStart(2, "0");
      const icon = document.createElement("span");
      icon.className = "upgrade-choice-icon";
      icon.textContent = upgrade.icon;
      const label = document.createElement("strong");
      label.textContent = upgrade.label;
      const description = document.createElement("small");
      description.textContent = upgrade.description;
      const level = document.createElement("span");
      level.className = "upgrade-choice-level";
      level.textContent = `LV ${current + 1} / ${upgrade.maxStacks}`;

      button.append(key, icon, label, description, level);
      button.addEventListener("click", () => this.selectRunUpgrade(id));
      root.appendChild(button);
    }
    root.querySelector("button")?.focus();
  }
  selectRunUpgrade(id) {
    if (this.state !== "upgrade-select") return false;
    if (!this.runUpgrades.choices.includes(id)) return false;
    if (!this.runUpgrades.apply(id)) return false;
    const transition = this.pendingUpgradeTransition;
    this.pendingUpgradeTransition = null;
    this.audio.play("powerup");
    this.syncRunUpgradeHud();
    this.continueAfterUpgrade(transition);
    return true;
  }
  continueAfterUpgrade(transition) {
    if (!transition) return;
    if (transition.kind === "campaign") this.advanceLevel();
    else if (transition.kind === "endless")
      this.beginEndlessWave(transition.nextWave);
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
    for (const p of this.pickups || []) p.dispose();
    this.pickups = [];
    this.activeBuffs.clear();
    this.boss = null;
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
    this.killStreak = 0;
    this.lastKillAt = -Infinity;
    this.streakMult = 1;
    this.spawnEnemy(0);
    this.spawnEnemy(2);
    this.updateUI();
    this.syncBuffHud();
    this.syncRunUpgradeHud();
  }
  resetEndless(wave = 1) {
    this.input.clear();
    this.input.mouseAim = false;
    this.input.target = null;
    this.bullets.clear();
    this.effects.clear();
    if (this.player) this.player.dispose();
    for (const e of this.enemies || []) e.dispose();
    if (this.map) this.map.dispose();
    for (const p of this.pickups || []) p.dispose();
    this.pickups = [];
    this.activeBuffs.clear();
    this.boss = null;
    this.wave = wave;
    this.enemies = [];
    this.tuningForWave(wave);
    const preset = MAP_PRESETS[(wave - 1) % MAP_PRESETS.length];
    this.rng = seededRandom(this.endlessSeed + this.attempt * 31 + wave * 7);
    this.map = buildPresetMap(this.scene, preset, this.rng);
    this.collision = new CollisionSystem(this.map, () => this.tanks);
    this.player = new PlayerTank(this, 9.5, 23.5);
    this.lives = this.modifiers.find((m) => m.id === "iron")
      ? 1
      : Math.min(
          ENDLESS.livesMax,
          computeEffectiveScaling(this.difficulty, this.wave).lives,
        );
    this.score = 0;
    this.kills = 0;
    this.spawned = 0;
    this.spawnTimer = 1.4;
    this.respawnTimer = 0;
    this.time = 0;
    this.accumulator = 0;
    this.killStreak = 0;
    this.lastKillAt = -Infinity;
    this.streakMult = 1;
    this.spawnEnemy(0);
    this.spawnEnemy(2);
    this.updateUI();
    this.syncBuffHud();
    this.syncRunUpgradeHud();
  }
  tuningForWave(wave) {
    const scaling = computeEffectiveScaling(this.difficulty, wave);
    this.levelConfig = {
      number: wave,
      name: `无尽模式 · 第 ${wave} 波`,
      english: "ENDLESS FRONTLINE.",
      subtitle: "程序化地形 · 难度递增",
      objective: "守住基地，记录最远波次。",
      briefing: "程序化生成的阵地，敌人越来越快。每过 5 波出现 Boss。",
      sequence: this.buildEndlessSequence(wave),
      maxConcurrent: ENDLESS.startEnemies + Math.floor(wave / 3),
      spawnInterval: scaling.spawnInterval,
      speedMultiplier: scaling.speedMul,
      fireMultiplier: scaling.fireMul,
        difficulty: scaling.tier.id,
      map: "endless",
      allowPowerups: true,
      wave,
    };
    this.levelScoreStart = 0;
  }
  buildEndlessSequence(wave) {
    const pool = ["light", "rapid"];
    if (wave >= 2) pool.push("heavy");
    if (wave >= ENDLESS.armorUnlockWave) pool.push("armor");
    const sequence = [];
    const total = 8 + wave * 2;
    for (let i = 0; i < total; i++)
      sequence.push(pool[Math.floor(this.rng() * pool.length)]);
    return sequence;
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
      const type = this.levelConfig.sequence[this.spawned];
      const Class =
        type === "boss" ? BossTank : type === "armor" ? ArmorTank : EnemyTank;
      this.enemies.push(new Class(this, type, x, z));
      this.spawned++;
      return true;
    }
    return false;
  }
  spawnBoss() {
    if (this.boss && this.boss.alive) return;
    const boss = new BossTank(this, "boss", 12.5, 2.5);
    boss.maxHp = boss.hp;
    this.boss = boss;
    this.enemies.push(boss);
    this.audio.play("explosion");
    this.effects.burst(13, 1.6, 2.5, 0xffb48a, 30, 1.2);
    this.updateUI();
  }
  start() {
    if (this.state !== "ready") return;
    this.resetRunUpgrades();
    // Refresh difficulty multipliers in case the player picked a different
    // preset on the Ready screen since the constructor built the level.
    this.state = "playing";
    this.audio.play("start");
    this.setOverlay();
    this.updateUI();
    this.presentThreatBriefing({
      tone: "polite",
      wave: this.levelConfig.number,
      events: ["战役开始"],
    });
  }
  startEndless() {
    if (this.state !== "ready") return;
    this.resetRunUpgrades();
    this.audio.play("start");
    this.resetEndless(1);
    this.state = "playing";
    this.setOverlay();
    this.updateUI();
    this.presentThreatBriefing({
      tone: "polite",
      wave: 1,
      events: ["无尽开始"],
    });
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
    this.syncBriefingAriaState(this.state);
    this.updateUI();
  }
  handleVisibilityChange() {
    // Auto-pause when the tab goes hidden. We deliberately don't auto-resume
    // on visibility return — the player may be mid-thought and a sudden un-
    // pause mid-bullet is worse than requiring one click to resume.
    if (typeof document === "undefined") return;
    if (document.visibilityState !== "hidden") return;
    if (this.state !== "playing") return;
    this.togglePause();
  }
  _tickBriefing(dt) {
    if (this._briefingTone === "assertive") {
      const since = this.time - this._lastBriefingAt;
      if (since > 0.8 && this._briefingAriaEl) {
        this._briefingAriaEl.setAttribute("aria-live", "polite");
        this._briefingTone = "polite";
      }
    }
  }
  flashDamage() {
    if (typeof window !== "undefined" && window.matchMedia) {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    }
    const el = this.damageVignette;
    if (!el) return;
    el.classList.remove("show");
    // Force a reflow so the transition re-triggers on rapid hits.
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(this._damageTimer);
    this._damageTimer = setTimeout(() => el.classList.remove("show"), 90);
  }
  flashDeathGrayscale() {
    if (typeof window !== "undefined" && window.matchMedia) {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    }
    if (typeof document === "undefined") return;
    const body = document.body;
    if (!body) return;
    body.classList.remove("death-grayscale");
    void body.offsetWidth; // restart the transition on rapid deaths
    body.classList.add("death-grayscale");
    clearTimeout(this._deathTimer);
    this._deathTimer = setTimeout(
      () => body.classList.remove("death-grayscale"),
      900,
    );
  }
  showLevelBurst(x, z, from, to) {
    const layer = this.scoreLayer;
    if (!layer) return;
    const v = _tmpVec.set(x, 1.2, z);
    v.project(this.camera);
    const cw = this.container.clientWidth;
    const ch = this.container.clientHeight;
    const sx = (v.x * 0.5 + 0.5) * cw;
    const sy = (1 - (v.y * 0.5 + 0.5)) * ch;
    const el = document.createElement("span");
    el.className = "level-burst";
    el.textContent = `★ ${from} → ${to}`;
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 650);
  }
  scorePopup(x, z, text, color = "#f3d65a") {
    const layer = this.scoreLayer;
    if (!layer) return;
    const v = _tmpVec.set(x, 0.8, z);
    v.project(this.camera);
    const cw = this.container.clientWidth;
    const ch = this.container.clientHeight;
    const sx = (v.x * 0.5 + 0.5) * cw;
    const sy = (1 - (v.y * 0.5 + 0.5)) * ch;
    // Evict oldest if we have too many popups on screen.
    while (layer.childElementCount >= 8) layer.firstElementChild?.remove();
    const el = document.createElement("span");
    el.className = "score-popup";
    el.textContent = text;
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    el.style.setProperty("--popup-color", color);
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1250);
  }
  finish(won, reason) {
    if (this.state !== "playing") return;
    this.state = won ? "won" : "lost";
    this.input.clear();
    this.setOverlay(this.state, reason);
    if (!won && this.mode === "endless") {
      Leaderboard.add({
        score: this.score,
        wave: this.wave,
        seed: this.endlessSeed,
        date: Date.now(),
        modifiers: this.modifiers.map((m) => m.id),
        difficulty: this.difficulty,
        upgrades: this.runUpgrades.snapshot(),
      });
      this.renderLeaderboard();
    }
    this.updateUI();
    this.syncBriefingAriaState(this.state);
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
    this.presentThreatBriefing({
      tone: "polite",
      wave: this.levelConfig.number,
      events: ["下一关"],
    });
  }
  newCampaign() {
    this.mode = "campaign";
    this.levelScoreStart = 0;
    this.resetRunUpgrades();
    this.reset(0, false);
    this.state = "playing";
    this.audio.play("start");
    this.setOverlay();
    this.updateUI();
  }
  retryEndless() {
    this.attempt++;
    this.endlessSeed = dailySeed();
    this.resetRunUpgrades();
    this.resetEndless(1);
    this.state = "playing";
    this.audio.play("start");
    this.setOverlay();
    this.updateUI();
  }
  staggerEnemies(durationSeconds) {
    const until = this.time + durationSeconds;
    for (const e of this.enemies) {
      if (e && e.alive) e.frozenUntil = Math.max(e.frozenUntil ?? 0, until);
    }
    if (this.boss && this.boss.alive) {
      this.boss.frozenUntil = Math.max(this.boss.frozenUntil ?? 0, until);
    }
  }

  onTankDestroyed(tank) {
    if (tank.team === "player") {
      this.lives--;
      this.effects.shake(350, 0.1);
      // A lost life breaks the streak — punish the player for taking a hit.
      this.killStreak = 0;
      this.streakMult = 1;
      if (this.lives === 1) {
        // The threat-briefing fan-out is UI sugar; older callers (and stripped
        // test contexts) don't carry the helper, so guard the call rather than
        // force every caller to mock the whole briefing surface.
        this.presentThreatBriefing?.({
          tone: "assertive",
          wave: this.wave,
          events: ["最后一条命"],
        });
      }
      if (this.lives <= 0) {
        this.flashDeathGrayscale();
        const reason =
          this.mode === "endless"
            ? `第 ${this.wave} 波阵亡。记住这条路线，重新来过。`
            : "作战坦克已全部损失。调整路线，再次守住防线。";
        this.finish(false, reason);
      } else this.respawnTimer = 1.4;
    } else {
      // Streak: extend if the gap is within the window, otherwise restart at 1.
      if (this.time - this.lastKillAt <= STREAK.window) this.killStreak += 1;
      else this.killStreak = 1;
      this.lastKillAt = this.time;
      this.streakMult = Math.min(this.killStreak, STREAK.maxMult);
      const award = tank.score * this.streakMult;
      this.score += award;
      this.kills++;
      const colorByType = {
        light: "#f3d65a",
        heavy: "#e3602a",
        rapid: "#ffb48a",
        armor: "#a24e38",
        boss: "#ffd700",
      };
      const label =
        this.streakMult > 1 ? `+${award} ×${this.streakMult}` : `+${award}`;
      // Peak streak (×3 / ×4) kicks in a brief bullet-time so the kill feels
      // heavy. The streak window naturally gates re-triggers to once per 4s.
      if (this.streakMult >= 3) this.effects.slowMo(300, 0.3);
      this.scorePopup(
        tank.x,
        tank.z,
        label,
        colorByType[tank.type] ?? "#f3d65a",
      );
      if (tank === this.boss) {
        this.boss = null;
        this.effects.shake(600, 0.18);
      } else if (tank.type === "heavy" || tank.type === "armor") {
        this.effects.shake(200, 0.08);
      } else {
        this.effects.shake(120, 0.04);
      }
      const total = this.levelConfig?.sequence.length ?? 12;
      if (this.kills >= total) {
        if (this.mode === "endless") this.advanceEndlessWave();
        else if (this.levelIndex < LEVELS.length - 1) this.completeLevel();
        else
          this.finish(true, "敌军已全部清除，基地安全。指挥官，阵地守住了。");
      }
      if (
        this.levelConfig?.allowPowerups &&
        this.rng() < this.powerupChance()
      ) {
        this.dropPickup(tank.x, tank.z);
      }
    }
    this.updateUI();
  }
  powerupChance() {
    const base =
      this.mode === "endless" ? ENDLESS.powerupDropChance : POWERUP_DROP_CHANCE;
    return Math.min(0.75, base + this.getRunUpgradeStacks("scavenger") * 0.05);
  }
  dropPickup(x, z) {
    const type = POWERUP_KEYS[Math.floor(this.rng() * POWERUP_KEYS.length)];
    this.pickups.push(new Pickup(this.scene, type, x, z, this.rng));
    this.audio.play("pickup-spawn");
  }
  advanceEndlessWave() {
    const next = this.wave + 1;
    if (this.wave > 0 && this.wave % 3 === 0) {
      this.presentUpgradeChoices({ kind: "endless", nextWave: next });
      return;
    }
    this.beginEndlessWave(next);
  }
  beginEndlessWave(next) {
    const events = [];
    const isBossWave = next % ENDLESS.bossEvery === 0;
    const armorUnlock = next === ENDLESS.armorUnlockWave;
    if (isBossWave) events.push("Boss 出现");
    if (armorUnlock) events.push("装甲解锁");
    this.resetEndless(next);
    this.state = "playing";
    this.audio.play("start");
    if (isBossWave) this.spawnBoss();
    this.setOverlay();
    this.updateUI();
    this.presentThreatBriefing({
      tone: isBossWave ? "assertive" : "polite",
      wave: next,
      events,
    });
  }
  applyPickup(type) {
    const player = this.player;
    switch (type) {
      case "star":
        player.upgrade();
        this.audio.play("powerup");
        break;
      case "helmet":
        player.shieldLeft = POWERUPS.helmet.duration;
        this.activeBuffs.set("helmet", this.time + POWERUPS.helmet.duration);
        this.audio.play("powerup");
        break;
      case "clock":
        for (const e of this.enemies) {
          if (e.alive) e.frozenUntil = this.time + POWERUPS.clock.duration;
        }
        this.activeBuffs.set("clock", this.time + POWERUPS.clock.duration);
        this.audio.play("clock");
        break;
      case "bomb":
        for (const e of [...this.enemies]) {
          if (e.alive) {
            e.invincible = 0;
            e.shieldLeft = 0;
            e.hit();
          }
        }
        this.effects.burst(13, 1.4, 13, 0xff7a4a, 60, 1.6);
        this.audio.play("bomb");
        break;
      case "tank":
        this.lives = Math.min(ENDLESS.livesMax, this.lives + 1);
        this.audio.play("powerup");
        break;
      case "shovel":
        this.map.fortifyBase(POWERUPS.shovel.duration, this.time);
        this.activeBuffs.set("shovel", this.time + POWERUPS.shovel.duration);
        this.audio.play("shovel");
        break;
    }
    this.syncBuffHud();
  }
  syncBuffHud() {
    if (!this.ui["buff-tray"]) return;
    const tray = this.ui["buff-tray"];
    tray.innerHTML = "";
    const order = ["helmet", "clock", "shovel"];
    for (const key of order) {
      const expiresAt = this.activeBuffs.get(key);
      if (!expiresAt) continue;
      const remaining = Math.max(0, expiresAt - this.time);
      const slot = document.createElement("span");
      slot.className = "buff-slot" + (remaining < 2 ? " expiring" : "");
      const colorHex = POWERUPS[key].color.toString(16).padStart(6, "0");
      slot.style.setProperty("--buff-color", `#${colorHex}`);
      slot.style.setProperty(
        "--buff-progress",
        `${(remaining / POWERUPS[key].duration) * 360}deg`,
      );
      slot.textContent = POWERUPS[key].glyph;
      slot.title = `${key.toUpperCase()} ${remaining.toFixed(1)}s`;
      tray.appendChild(slot);
    }
    const lvl = this.player?.level ?? 1;
    if (lvl > 1) {
      const slot = document.createElement("span");
      slot.className = "buff-slot level";
      slot.textContent = `★${lvl}`;
      slot.title = `升级等级 ${lvl}`;
      tray.appendChild(slot);
    }
  }
  syncRunUpgradeHud() {
    const tray = this.ui?.["run-upgrade-tray"];
    if (!tray) return;
    tray.replaceChildren();
    for (const { id, stacks } of this.runUpgrades.snapshot()) {
      const upgrade = RUN_UPGRADES[id];
      const slot = document.createElement("span");
      slot.className = "run-upgrade-slot";
      slot.dataset.upgrade = id;
      slot.textContent = upgrade.icon;
      const count = document.createElement("b");
      const available =
        id === "reactive" ? (this.player?.armorCharges ?? stacks) : stacks;
      count.textContent = `×${available}`;
      slot.appendChild(count);
      slot.title = `${upgrade.label} · ${upgrade.description}`;
      tray.appendChild(slot);
    }
  }
  renderLeaderboard() {
    if (!this.ui["leaderboard"]) return;
    const top = Leaderboard.top(ENDLESS.leaderboardSize);
    const list = this.ui["leaderboard"];
    list.innerHTML = "";
    list.hidden = false;
    if (!top.length) {
      const empty = document.createElement("li");
      empty.className = "leaderboard-empty";
      empty.textContent = "暂无记录。勇敢出击！";
      list.appendChild(empty);
      return;
    }
    top.forEach((entry, idx) => {
      const li = document.createElement("li");
      const d = new Date(entry.date);
      const date = `${d.getMonth() + 1}/${d.getDate()}`;
      li.innerHTML = `<span class="rank">${idx + 1}</span><span class="score">${entry.score}</span><span class="wave">W${entry.wave}</span><span class="date">${date}</span>`;
      list.appendChild(li);
    });
  }
  setOverlay(state, reason) {
    this.ui.overlay.hidden = !state;
    const selecting = state === "upgrade-select";
    this.ui.overlay.classList.toggle("choosing-upgrade", selecting);
    if (this.ui["upgrade-choices"])
      this.ui["upgrade-choices"].hidden = !selecting;
    if (this.ui["overlay-panel"])
      this.ui["overlay-panel"].classList.toggle("choosing-upgrade", selecting);
    if (this.ui["mode-toggle"])
      this.ui["mode-toggle"].hidden = state !== "ready";
    if (this.ui["difficulty-tier"])
      this.ui["difficulty-tier"].hidden = state !== "ready";
    if (this.ui["primary-btn"]) this.ui["primary-btn"].hidden = selecting;
    if (this.ui["overlay-hint"]) {
      this.ui["overlay-hint"].textContent = selecting
        ? "选择后立即进入下一战区 · 改装仅在本局生效"
        : "WASD 移动 · SPACE 射击 · 吃道具升级";
    }
    if (this.ui["leaderboard"]) {
      this.ui["leaderboard"].hidden =
        state !== "lost" || this.mode !== "endless";
    }
    if (!state) {
      this.syncBriefingAriaState(null);
      return;
    }
    this.syncBriefingAriaState(state);
    const content = {
      ready: [
        "指挥官，准备出击",
        `${this.mode === "endless" ? "无尽模式" : "战役模式"} · ${this.levelConfig.objective}`,
        this.mode === "endless" ? "开始无尽 ↗" : "开始战役 ↗",
      ],
      paused: [
        "战役已暂停",
        "喘口气，观察战场。准备好后继续守护基地。",
        "继续战役 ↗",
      ],
      "level-clear": [
        `第 ${this.levelConfig.number} 关完成`,
        "战场补给已经抵达。选择一项改装，强化本次战役构筑。",
        "选择战地改装 ↗",
      ],
      "upgrade-select": [
        "选择战地改装",
        this.mode === "endless"
          ? `第 ${this.wave} 波完成 · 三选一永久强化本次无尽挑战。`
          : `第 ${this.levelConfig.number} 关完成 · 三选一永久强化本次战役。`,
        "",
      ],
      won: ["阵地守住了", "", "再次出击 ↗"],
      lost: [
        "防线失守",
        reason || "重新部署。",
        this.mode === "endless" ? "再来一次 ↗" : "重新部署 ↗",
      ],
    }[state];
    this.ui["overlay-title"].textContent = content[0];
    this.ui["overlay-copy"].textContent = "";
    const copyNode = this.ui["overlay-copy"];
    copyNode.replaceChildren();
    const main = document.createElement("span");
    main.textContent = content[1];
    copyNode.appendChild(main);
    if (state === "lost") {
      const summary = document.createElement("span");
      summary.className = "difficulty-summary";
      summary.textContent = this.buildDifficultySummary();
      copyNode.appendChild(summary);
    }
    this.ui["primary-btn"].textContent = content[2];
  }
  updateUI() {
    const total = this.levelConfig.sequence.length;
    this.ui.score.textContent = String(this.score).padStart(6, "0");
    this.ui.kills.textContent = this.kills;
    this.ui.remaining.textContent = Math.max(0, total - this.kills);
    this.ui.lives.textContent =
      "♥ ".repeat(Math.max(0, this.lives)) +
      "♡ ".repeat(Math.max(0, ENDLESS.livesMax - this.lives));
    this.ui["base-status"].textContent = this.map.base.alive
      ? "完好"
      : "已摧毁";
    this.ui["base-status"].style.color = this.map.base.alive ? "" : "#a24e38";
    const stage =
      this.mode === "endless"
        ? `W${String(this.wave).padStart(2, "0")}`
        : String(this.levelConfig.number).padStart(2, "0");
    this.ui.wave.textContent = stage;
    const stateText = {
      ready: "待命",
      playing: "作战中",
      paused: "已暂停",
      "level-clear": "关卡完成",
      "upgrade-select": "选择改装",
      won: "任务完成",
      lost: "防线失守",
    }[this.state];
    this.ui["status-label"].textContent = stateText;
    const titleNode = this.ui["mission-title"];
    titleNode.childNodes[0].textContent = this.levelConfig.name;
    titleNode.querySelector("span").textContent = this.levelConfig.english;
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
      { length: Math.min(total, 12) },
      (_, i) =>
        `<i class="roster-tank${i < this.kills ? " destroyed" : ""}" aria-hidden="true"></i>`,
    ).join("");
    this.ui["enemy-roster"].setAttribute(
      "aria-label",
      `${this.mode === "endless" ? "无尽" : `第 ${this.levelConfig.number} 关`}剩余 ${Math.max(0, total - this.kills)} 辆敌军`,
    );
    if (this.ui["mode-campaign"]) {
      this.ui["mode-campaign"].setAttribute(
        "aria-pressed",
        String(this.mode === "campaign"),
      );
      this.ui["mode-endless"].setAttribute(
        "aria-pressed",
        String(this.mode === "endless"),
      );
    }
    if (this.ui["boss-hp"]) {
      const visible = this.boss && this.boss.alive && this.mode === "endless";
      this.ui["boss-hp"].hidden = !visible;
      if (visible) {
        const maxHp = this.boss.maxHp ?? TYPES.boss.hp;
        const fill = Math.max(0, this.boss.hp / maxHp);
        this.ui["boss-hp-fill"].style.width = `${fill * 100}%`;
      }
    }
    if (this.ui["streak-badge"]) {
      const active = this.streakMult > 1;
      this.ui["streak-badge"].hidden = !active;
      this.ui["streak-badge"].classList.toggle("hot", this.streakMult >= 3);
      if (this.ui["streak-mult"])
        this.ui["streak-mult"].textContent = `×${this.streakMult}`;
    }
    this.syncThreatBadge();
  }
  tick(dt) {
    this.time += dt;
    if (this.player.alive) this.player.tick(dt);
    for (const enemy of this.enemies) if (enemy.alive) enemy.tick(dt);
    this.bullets.tick(dt);
    this._tickBriefing(dt);
    if (this.state !== "playing") return;
    this.enemies = this.enemies.filter((e) => {
      if (!e.alive) {
        e.dispose();
        return false;
      }
      return true;
    });
    for (const p of this.pickups) p.tick(dt);
    this.pickups = this.pickups.filter((p) => {
      if (p.life <= 0) {
        p.dispose();
        return false;
      }
      if (p.tryCollect(this.player)) {
        this.applyPickup(p.type);
        p.dispose();
        return false;
      }
      return true;
    });
    for (const [key, expires] of this.activeBuffs)
      if (this.time >= expires) this.activeBuffs.delete(key);
    // Decay the kill-streak when no enemy has been killed for STREAK.window.
    if (this.killStreak > 0 && this.time - this.lastKillAt > STREAK.window) {
      this.killStreak = 0;
      this.streakMult = 1;
    }
    this.syncBuffHud();
    if (this.boss && this.boss.alive && this.ui["boss-hp"]) {
      const maxHp = this.boss.maxHp ?? TYPES.boss.hp;
      const fill = Math.max(0, this.boss.hp / maxHp);
      this.ui["boss-hp-fill"].style.width = `${fill * 100}%`;
    }
    this.map.tickFortify?.(this.time);
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
    const rawDt = this.lastTime
      ? Math.min((ms - this.lastTime) / 1000, 0.1)
      : 0;
    this.lastTime = ms;
    // Bullet-time scales the simulation rate, not wall-clock; multiply
    // before the accumulator so the fixed-step loop naturally runs slower.
    const dt = rawDt * this.effects.slowMoScale();
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
    // Apply camera shake offset before render; restore after.
    const shake = this.effects.shakeOffset();
    this.camera.position.x = this.cameraBase.x + shake.x;
    this.camera.position.z = this.cameraBase.z + shake.z;
    this.renderer.render(this.scene, this.camera);
    this.camera.position.x = this.cameraBase.x;
    this.camera.position.z = this.cameraBase.z;
    requestAnimationFrame((t) => this.frame(t));
  }
  snapshot() {
    const tier = difficultyFor(this.difficulty);
    const scaling =
      this.mode === "endless" && this.wave > 0
        ? computeEffectiveScaling(this.difficulty, this.wave)
        : {
            speedMul:
              (this.levelConfig?.speedMultiplier ?? 1) * tier.enemySpeedMul,
            fireMul:
              (this.levelConfig?.fireMultiplier ?? 1) * tier.enemyFireMul,
          };
    const ratio = scaling.speedMul / Math.max(0.01, scaling.fireMul);
    const badge =
      ratio >= 1.35 ? "intense" : ratio >= 1.1 ? "hot" : "calm";
    return {
      state: this.state,
      mode: this.mode,
      wave: this.wave,
      level: this.levelConfig.number,
      levelName: this.levelConfig.name,
      levelIndex: this.levelIndex,
      levelTotal: LEVELS.length,
      difficulty: this.difficulty,
      difficultyLabel: tier.label,
      effectiveSpeedMul: scaling.speedMul,
      effectiveFireMul: scaling.fireMul,
      threatBadge: badge,
      briefingTone: this._briefingTone ?? "polite",
      threatRatio: ratio,
      time: this.time,
      score: this.score,
      kills: this.kills,
      lives: this.lives,
      baseAlive: this.map.base.alive,
      killStreak: this.killStreak ?? 0,
      streakMult: this.streakMult ?? 1,
      buffs: [...this.activeBuffs.keys()],
      runUpgrades: this.runUpgrades?.snapshot?.() ?? [],
      upgradeChoices: [...(this.runUpgrades?.choices ?? [])],
      player: {
        x: this.player.x,
        z: this.player.z,
        alive: this.player.alive,
        aim: this.player.aim,
        level: this.player.level,
      },
      enemies: this.enemies.map((e) => ({
        type: e.type,
        x: e.x,
        z: e.z,
        hp: e.hp,
      })),
      bullets: this.bullets.items.length,
      pickups: this.pickups.length,
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

function buildPresetMap(scene, preset, rng) {
  const m = new MapManager(scene, "endless");
  m.cells.fill(0);
  m.brickInstances.clear();
  m.steelInstances.clear();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  if (m.bricks) {
    for (let i = 0; i < m.bricks.count; i++) m.bricks.setMatrixAt(i, zero);
    m.bricks.count = 0;
    m.bricks.instanceMatrix.needsUpdate = true;
  }
  if (m.steelsMesh) {
    for (let i = 0; i < m.steelsMesh.count; i++)
      m.steelsMesh.setMatrixAt(i, zero);
    m.steelsMesh.count = 0;
    m.steelsMesh.instanceMatrix.needsUpdate = true;
  }
  const rows = preset.rows;
  const rotation = Math.floor(rng() * 4);
  const mirror = rng() < 0.5;
  for (let z = 0; z < SIZE; z++) {
    for (let x = 0; x < SIZE; x++) {
      const ch = rows[z][x];
      if (ch === " ") continue;
      let nx = x;
      let nz = z;
      for (let r = 0; r < rotation; r++) {
        const tmp = nx;
        nx = SIZE - 1 - nz;
        nz = tmp;
      }
      if (mirror) nx = SIZE - 1 - nx;
      if (nx < 0 || nx >= SIZE || nz < 0 || nz >= SIZE) continue;
      let type = 0;
      if (ch === "#") type = CELL.BRICK;
      else if (ch === "S") type = CELL.STEEL;
      else if (ch === "~") type = CELL.WATER;
      if (type) m.cells[nz * SIZE + nx] = type;
    }
  }
  // Re-stamp the outer wall so endless maps always have a steel perimeter.
  for (let n = 0; n < SIZE; n++) {
    m.cells[n] = CELL.STEEL;
    m.cells[(SIZE - 1) * SIZE + n] = CELL.STEEL;
    m.cells[n * SIZE] = CELL.STEEL;
    m.cells[n * SIZE + (SIZE - 1)] = CELL.STEEL;
  }
  // Always keep base protected.
  m.rectangle(12, 22, 2, 2, CELL.BASE);
  m.rectangle(11, 21, 4, 1, CELL.BRICK);
  m.rectangle(11, 22, 1, 2, CELL.BRICK);
  m.rectangle(14, 22, 1, 2, CELL.BRICK);
  // Resize instance meshes if the preset has more cells than the initial capacity.
  const needBricks = m.cells.filter((t) => t === CELL.BRICK).length * 6;
  const needSteel = m.cells.filter((t) => t === CELL.STEEL).length;
  if (needBricks > m.bricks.instanceMatrix.count) {
    const bigger = new THREE.InstancedMesh(
      m.bricks.geometry,
      m.bricks.material,
      needBricks,
    );
    bigger.copy(m.bricks);
    m.root.remove(m.bricks);
    m.bricks.dispose?.();
    m.bricks = bigger;
    m.root.add(bigger);
  }
  if (needSteel > m.steelsMesh.instanceMatrix.count) {
    const bigger = new THREE.InstancedMesh(
      m.steelsMesh.geometry,
      m.steelsMesh.material,
      needSteel,
    );
    bigger.copy(m.steelsMesh);
    m.root.remove(m.steelsMesh);
    m.steelsMesh.dispose?.();
    m.steelsMesh = bigger;
    m.root.add(bigger);
  }
  m.rebuildInstances();
  return m;
}
