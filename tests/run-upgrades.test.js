import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  PLAYER_LEVELS,
  POWERUP_DROP_CHANCE,
  RUN_UPGRADES,
  seededRandom,
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
