import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  PLAYER_LEVELS,
  POWERUP_DROP_CHANCE,
  RUN_UPGRADES,
  seededRandom,
  DIFFICULTY_TIERS,
  DIFFICULTY_KEYS,
  DIFFICULTY_BY_ID,
  DEFAULT_DIFFICULTY,
  ENDLESS,
  computeEffectiveScaling,
} from "../src/core/config.js";
import { GameManager } from "../src/core/GameManager.js";
import { PlayerTank, EnemyTank } from "../src/entities/Tank.js";
import { RunUpgradeSystem } from "../src/systems/RunUpgradeSystem.js";

function gameWithUpgrades(entries = []) {
  const runUpgrades = new RunUpgradeSystem();
  for (const [id, stacks] of entries) runUpgrades.stacks.set(id, stacks);
  return {
    scene: new THREE.Scene(),
    runUpgrades,
    getRunUpgradeStacks(id) {
      return runUpgrades.get(id);
    },
    effects: {
      burst() {},
      explode() {},
      smoke() {},
      shake() {},
    },
    audio: { play() {} },
    showLevelBurst() {},
    syncRunUpgradeHud() {},
    flashDamage() {},
    onTankDestroyed() {},
  };
}

test("run upgrade catalog exposes six bounded build choices", () => {
  assert.equal(Object.keys(RUN_UPGRADES).length, 6);
  for (const upgrade of Object.values(RUN_UPGRADES)) {
    assert.ok(upgrade.label);
    assert.ok(upgrade.description);
    assert.ok(upgrade.maxStacks >= 1);
  }
});

test("RunUpgradeSystem rolls deterministic unique choices and excludes capped upgrades", () => {
  const a = new RunUpgradeSystem();
  const b = new RunUpgradeSystem();
  a.stacks.set("overdrive", RUN_UPGRADES.overdrive.maxStacks);
  b.stacks.set("overdrive", RUN_UPGRADES.overdrive.maxStacks);
  const first = a.roll(seededRandom(1990));
  const second = b.roll(seededRandom(1990));
  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.equal(new Set(first).size, 3);
  assert.equal(first.includes("overdrive"), false);
});

test("RunUpgradeSystem applies stacks up to the configured cap and resets between runs", () => {
  const system = new RunUpgradeSystem();
  assert.equal(system.apply("piercing"), true);
  assert.equal(system.apply("piercing"), true);
  assert.equal(system.apply("piercing"), false);
  assert.deepEqual(system.snapshot(), [{ id: "piercing", stacks: 2 }]);
  system.reset();
  assert.deepEqual(system.snapshot(), []);
});

test("player combat stats include persistent run upgrades", () => {
  const game = gameWithUpgrades([
    ["overdrive", 2],
    ["autoloader", 1],
    ["velocity", 2],
    ["piercing", 1],
    ["reactive", 2],
  ]);
  const player = new PlayerTank(game, 9.5, 23.5);
  assert.equal(player.speed, PLAYER_LEVELS[0].speed * 1.2);
  assert.equal(player.cooldown, PLAYER_LEVELS[0].cooldown * 0.88);
  assert.equal(player.bulletSpeedMultiplier, 1.3);
  assert.equal(player.damage, 2);
  assert.equal(player.armorCharges, 2);
  player.dispose();
});

test("reactive armor absorbs one hit per stack before player HP is damaged", () => {
  const game = gameWithUpgrades([["reactive", 2]]);
  const player = new PlayerTank(game, 9.5, 23.5);
  player.invincible = 0;
  player.hit();
  player.hit();
  assert.equal(player.alive, true);
  assert.equal(player.hp, 1);
  assert.equal(player.armorCharges, 0);
  player.hit();
  assert.equal(player.alive, false);
  player.dispose();
});

test("piercing and velocity upgrades are copied onto fired shells", () => {
  const game = gameWithUpgrades([
    ["velocity", 1],
    ["piercing", 1],
  ]);
  game.bullets = {
    fired: null,
    fire(tank) {
      this.fired = {
        damage: tank.damage,
        speed: 14 * tank.bulletSpeedMultiplier,
      };
    },
  };
  const player = new PlayerTank(game, 9.5, 23.5);
  player.cooldownLeft = 0;
  player.shoot();
  assert.equal(game.bullets.fired.damage, 2);
  assert.ok(Math.abs(game.bullets.fired.speed - 16.1) < 1e-9);
  player.dispose();
});

test("scavenger increases drop chance without exceeding the safety cap", () => {
  const runUpgrades = new RunUpgradeSystem();
  runUpgrades.stacks.set("scavenger", 2);
  const g = {
    mode: "campaign",
    runUpgrades,
    getRunUpgradeStacks: GameManager.prototype.getRunUpgradeStacks,
  };
  assert.equal(
    GameManager.prototype.powerupChance.call(g),
    POWERUP_DROP_CHANCE + 0.1,
  );
  runUpgrades.stacks.set("scavenger", 99);
  assert.equal(GameManager.prototype.powerupChance.call(g), 0.75);
});

test("selecting an offered upgrade applies it and continues the pending transition", () => {
  const runUpgrades = new RunUpgradeSystem();
  runUpgrades.choices = ["overdrive", "velocity", "reactive"];
  let continued = null;
  const g = {
    state: "upgrade-select",
    runUpgrades,
    pendingUpgradeTransition: { kind: "campaign", nextLevel: 1 },
    audio: { play() {} },
    syncRunUpgradeHud() {},
    continueAfterUpgrade(transition) {
      continued = transition;
    },
  };
  assert.equal(
    GameManager.prototype.selectRunUpgrade.call(g, "velocity"),
    true,
  );
  assert.equal(runUpgrades.get("velocity"), 1);
  assert.deepEqual(continued, { kind: "campaign", nextLevel: 1 });
  assert.equal(g.pendingUpgradeTransition, null);
});

test("endless mode pauses for an upgrade after every third completed wave", () => {
  let offered = null;
  let advanced = null;
  const g = {
    wave: 3,
    presentUpgradeChoices(transition) {
      offered = transition;
    },
    beginEndlessWave(next) {
      advanced = next;
    },
  };
  GameManager.prototype.advanceEndlessWave.call(g);
  assert.deepEqual(offered, { kind: "endless", nextWave: 4 });
  assert.equal(advanced, null);

  g.wave = 4;
  offered = null;
  GameManager.prototype.advanceEndlessWave.call(g);
  assert.equal(offered, null);
  assert.equal(advanced, 5);
});

test("upgraded shell damage reduces heavy tank HP by the carried amount", () => {
  const game = gameWithUpgrades();
  game.levelConfig = { speedMultiplier: 1, fireMultiplier: 1 };
  game.rng = () => 0.5;
  game.onTankDestroyed = () => {};
  const heavy = new EnemyTank(game, "heavy", 9.5, 7.5);
  heavy.invincible = 0;
  heavy.hit(2);
  assert.equal(heavy.hp, 1);
  heavy.dispose();
});

// ---- Difficulty presets (issue-3) ---------------------------------------

test("DIFFICULTY_TIERS exposes four presets with six independent axes", () => {
  assert.equal(DIFFICULTY_TIERS.length, 4);
  assert.deepEqual(DIFFICULTY_KEYS, [
    "cadet",
    "veteran",
    "iron-hand",
    "iron-curtain",
  ]);
  for (const tier of DIFFICULTY_TIERS) {
    assert.ok(tier.label);
    assert.ok(tier.english);
    assert.ok(tier.description);
    for (const axis of [
      "enemySpeedMul",
      "enemyFireMul",
      "spawnIntervalMul",
      "livesMul",
      "powerupDropMul",
      "hazardMul",
    ]) {
      assert.ok(
        typeof tier[axis] === "number" && tier[axis] > 0,
        `${tier.id}.${axis} must be a positive number`,
      );
    }
  }
  assert.equal(DEFAULT_DIFFICULTY, "veteran");
});

test("DIFFICULTY_BY_ID resolves each tier id and falls back to default", () => {
  for (const tier of DIFFICULTY_TIERS) {
    assert.equal(DIFFICULTY_BY_ID[tier.id].id, tier.id);
  }
  assert.equal(DIFFICULTY_BY_ID["unknown"].id, DEFAULT_DIFFICULTY);
});

test("computeEffectiveScaling returns the veteran baseline unchanged", () => {
  const base = computeEffectiveScaling("veteran", 1);
  assert.equal(base.fireMul, ENDLESS.fireMultiplierBase);
  assert.equal(base.speedMul, 1);
  assert.equal(
    base.lives,
    ENDLESS.livesStart + Math.floor((1 - 1) / 3),
  );
});

test("computeEffectiveScaling shrinks enemy fire rate for harder tiers", () => {
  const v = computeEffectiveScaling("veteran", 5);
  const iron = computeEffectiveScaling("iron-curtain", 5);
  // Smaller fireMul means enemies fire faster (we divide by it for cooldown).
  assert.ok(iron.fireMul < v.fireMul);
  assert.ok(iron.speedMul > v.speedMul);
  assert.ok(iron.lives <= v.lives);
});

test("computeEffectiveScaling gives cadet more breathing room", () => {
  const v = computeEffectiveScaling("veteran", 8);
  const cadet = computeEffectiveScaling("cadet", 8);
  assert.ok(cadet.speedMul < v.speedMul);
  assert.ok(cadet.lives >= v.lives);
  assert.ok(cadet.spawnInterval > v.spawnInterval);
  assert.ok(cadet.dropChance >= v.dropChance);
});

test("applyDifficultyToLevelConfig multiplies enemySpeedMul into levelConfig", () => {
  const g = { difficulty: "iron-curtain" };
  const cfg = { speedMultiplier: 1, fireMultiplier: 1, spawnInterval: 3.8 };
  GameManager.prototype.applyDifficultyToLevelConfig.call(g, cfg);
  const tier = DIFFICULTY_BY_ID["iron-curtain"];
  assert.equal(cfg.difficulty, "iron-curtain");
  assert.equal(cfg.speedMultiplier, 1 * tier.enemySpeedMul);
  assert.equal(cfg.fireMultiplier, 1 * tier.enemyFireMul);
  assert.equal(cfg.spawnInterval, 3.8 * tier.spawnIntervalMul);
  // Idempotent — second call should not stack on top of itself.
  GameManager.prototype.applyDifficultyToLevelConfig.call(g, cfg);
  assert.equal(cfg.speedMultiplier, 1 * tier.enemySpeedMul);
});

test("applyDifficultyToLevelConfig keeps the original baseline on the __base handle", () => {
  const g = { difficulty: "veteran" };
  const cfg = { speedMultiplier: 1.18, fireMultiplier: 0.78, spawnInterval: 3.1 };
  GameManager.prototype.applyDifficultyToLevelConfig.call(g, cfg);
  assert.deepEqual(cfg.__base, {
    speedMultiplier: 1.18,
    fireMultiplier: 0.78,
    spawnInterval: 3.1,
  });
  g.difficulty = "cadet";
  GameManager.prototype.applyDifficultyToLevelConfig.call(g, cfg);
  assert.equal(cfg.__base.speedMultiplier, 1.18);
  assert.equal(
    cfg.speedMultiplier,
    1.18 * DIFFICULTY_BY_ID["cadet"].enemySpeedMul,
  );
});

test("tuningForWave respects the selected difficulty multiplier", () => {
  const g = {
    difficulty: "iron-hand",
    rng: () => 0.5,
    buildEndlessSequence() {
      return ["light", "rapid"];
    },
    applyDifficultyToLevelConfig: GameManager.prototype.applyDifficultyToLevelConfig,
  };
  GameManager.prototype.tuningForWave.call(g, 3);
  const tier = DIFFICULTY_BY_ID["iron-hand"];
  const fireMul =
    ENDLESS.fireMultiplierBase /
    (1 + ENDLESS.fireMultiplierDecay * 2);
  assert.ok(Math.abs(g.levelConfig.fireMultiplier - fireMul * tier.enemyFireMul) < 1e-9);
  assert.equal(
    g.levelConfig.speedMultiplier,
    (1 + ENDLESS.speedGrowth * 2) * tier.enemySpeedMul,
  );
  assert.equal(g.levelConfig.difficulty, "iron-hand");
});

test("resetEndless honours the difficulty tier when computing lives budget", () => {
  // Mirror the lives block from resetEndless so the test doesn't need to spin
  // up the full input/bullet/map stack just to assert the difficulty scaling.
  const computeLives = (g) =>
    g.modifiers.find((m) => m.id === "iron")
      ? 1
      : Math.min(
          ENDLESS.livesMax,
          computeEffectiveScaling(g.difficulty, g.wave).lives,
        );
  const curtain = { difficulty: "iron-curtain", wave: 1, modifiers: [] };
  assert.equal(computeLives(curtain), 2);
  const ironHand = { difficulty: "iron-hand", wave: 1, modifiers: [] };
  assert.equal(computeLives(ironHand), 3);
  const veteran = { difficulty: "veteran", wave: 4, modifiers: [] };
  // wave 4 with veteran: 3 + floor(3/3) = 4
  assert.equal(computeLives(veteran), 4);
});

test("snapshot exposes difficulty, threatBadge, briefingTone and effective multipliers", () => {
  const g = {
    state: "playing",
    mode: "endless",
    wave: 6,
    levelConfig: { number: 6, name: "无尽模式 · 第 6 波" },
    levelIndex: 0,
    difficulty: "iron-hand",
    _briefingTone: "assertive",
    time: 12,
    score: 0,
    kills: 0,
    lives: 3,
    activeBuffs: new Map(),
    killStreak: 0,
    streakMult: 1,
    runUpgrades: { snapshot: () => [], choices: [] },
    player: { x: 0, z: 0, alive: true, aim: 0, level: 1 },
    enemies: [],
    bullets: { items: [] },
    pickups: [],
    spawned: 0,
    map: { base: { alive: true } },
    renderer: {
      info: {
        render: { calls: 0, triangles: 0 },
        memory: { geometries: 0, textures: 0 },
      },
    },
    fps: 60,
  };
  const snap = GameManager.prototype.snapshot.call(g);
  assert.equal(snap.difficulty, "iron-hand");
  assert.equal(snap.difficultyLabel, DIFFICULTY_BY_ID["iron-hand"].label);
  assert.equal(snap.briefingTone, "assertive");
  assert.ok(["calm", "hot", "intense"].includes(snap.threatBadge));
  assert.equal(
    snap.effectiveSpeedMul,
    (1 + ENDLESS.speedGrowth * 5) *
      DIFFICULTY_BY_ID["iron-hand"].enemySpeedMul,
  );
});

test("setDifficulty persists the choice but defers activation until the next reset", () => {
  const pressedStates = [];
  const root = {
    querySelectorAll() {
      return [
        {
          dataset: { tier: "veteran" },
          setAttribute(k, v) {
            if (k === "aria-pressed") pressedStates.push(v);
          },
        },
        {
          dataset: { tier: "iron-curtain" },
          setAttribute(k, v) {
            if (k === "aria-pressed") pressedStates.push(v);
          },
        },
      ];
    },
  };
  const g = {
    state: "playing",
    difficulty: "veteran",
    ui: { "difficulty-tier": root },
    audio: { play: () => {} },
    syncDifficultyButtons: GameManager.prototype.syncDifficultyButtons,
  };
  assert.equal(GameManager.prototype.setDifficulty.call(g, "iron-curtain"), true);
  assert.equal(g.difficulty, "iron-curtain");
  assert.ok(pressedStates.includes("false"));
});

test("presentThreatBriefing marks the aria-live node assertive for boss + last life", () => {
  const toneHistory = [];
  const node = {
    textContent: "",
    setAttribute(k, v) {
      if (k === "aria-live") toneHistory.push(v);
    },
    getAttribute(k) {
      return k === "aria-live" ? "polite" : null;
    },
  };
  const banner = {
    textContent: "",
    children: [],
    classList: {
      _set: new Set(),
      add(c) {
        this._set.add(c);
      },
      remove(c) {
        this._set.delete(c);
      },
      contains(c) {
        return this._set.has(c);
      },
    },
    dataset: {},
    setAttribute() {},
    appendChild(child) {
      this.children.push(child);
    },
  };
  banner.replaceChildren = function () {
    this.children = [];
    this.textContent = "";
  };
  const g = {
    mode: "endless",
    wave: 5,
    time: 10,
    difficulty: "veteran",
    levelConfig: { number: 5 },
    _threatBannerEl: banner,
    _briefingAriaEl: node,
    _briefingTone: "polite",
    _lastBriefingAt: -Infinity,
    _briefingTimer: null,
    _showThreatBanner() {},
      _announceBriefing: GameManager.prototype._announceBriefing,
  };
  GameManager.prototype.presentThreatBriefing.call(g, {
    tone: "assertive",
    wave: 5,
    events: ["Boss 出现"],
  });
  assert.ok(toneHistory.includes("assertive"));
  assert.equal(g._briefingTone, "assertive");
});

test("presentThreatBriefing throttles aria-live updates so rapid waves do not spam", () => {
  const ariaUpdates = [];
  const node = {
    textContent: "",
    setAttribute(k, v) {
      if (k === "aria-live") ariaUpdates.push(v);
    },
    getAttribute(k) {
      return k === "aria-live" ? "polite" : null;
    },
  };
  const banner = {
    textContent: "",
    children: [],
    classList: {
      _set: new Set(),
      add(c) {
        this._set.add(c);
      },
      remove(c) {
        this._set.delete(c);
      },
      contains(c) {
        return this._set.has(c);
      },
    },
    dataset: {},
    setAttribute() {},
    appendChild() {},
    replaceChildren() {
      this.children = [];
    },
  };
  const g = {
    mode: "endless",
    wave: 1,
    time: 0,
    difficulty: "veteran",
    levelConfig: { number: 1 },
    _threatBannerEl: banner,
    _briefingAriaEl: node,
    _briefingTone: "polite",
    _lastBriefingAt: -Infinity,
    _briefingTimer: null,
    _showThreatBanner() {},
      _announceBriefing: GameManager.prototype._announceBriefing,
  };
  GameManager.prototype.presentThreatBriefing.call(g, { tone: "polite", wave: 2 });
  const assertiveCount = ariaUpdates.filter((v) => v === "assertive").length;
  assert.equal(assertiveCount, 0);
  assert.equal(g._briefingTone, "polite");
});

test("syncBriefingAriaState hides the live region in non-playing overlays", () => {
  const hiddenHistory = [];
  const node = {
    setAttribute(k, v) {
      if (k === "aria-hidden") hiddenHistory.push(v);
    },
  };
  const g = { _briefingAriaEl: node };
  GameManager.prototype.syncBriefingAriaState.call(g, "ready");
  assert.deepEqual(hiddenHistory[hiddenHistory.length - 1], "false");
  GameManager.prototype.syncBriefingAriaState.call(g, "paused");
  assert.deepEqual(hiddenHistory[hiddenHistory.length - 1], "true");
  GameManager.prototype.syncBriefingAriaState.call(g, "lost");
  assert.deepEqual(hiddenHistory[hiddenHistory.length - 1], "true");
});

test("_tickBriefing restores aria-live politeness 0.8s after an assertive event", () => {
  const ariaUpdates = [];
  const node = {
    setAttribute(k, v) {
      if (k === "aria-live") ariaUpdates.push(v);
    },
  };
  const g = {
    time: 6,
    _lastBriefingAt: 5,
    _briefingTone: "assertive",
    _briefingAriaEl: node,
  };
  GameManager.prototype._tickBriefing.call(g, 0.1);
  assert.deepEqual(ariaUpdates[ariaUpdates.length - 1], "polite");
  assert.equal(g._briefingTone, "polite");
});

test("buildDifficultySummary mentions tier, wave and final multipliers", () => {
  const g = {
    mode: "endless",
    wave: 12,
    difficulty: "iron-hand",
    levelConfig: { number: 12 },
  };
  const text = GameManager.prototype.buildDifficultySummary.call(g);
  assert.ok(text.includes(DIFFICULTY_BY_ID["iron-hand"].label));
  assert.ok(text.includes("第 12 波"));
  assert.ok(/终速 ×\d+\.\d{2}/.test(text));
  assert.ok(/终射 ×\d+\.\d{2}/.test(text));
});
