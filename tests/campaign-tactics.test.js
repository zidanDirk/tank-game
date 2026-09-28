import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEVELS, CELL } from "../src/core/config.js";
import { MapManager } from "../src/world/MapManager.js";
import { CollisionSystem } from "../src/systems/CollisionSystem.js";
import { BulletManager } from "../src/systems/BulletManager.js";
import {
  ArmorTank,
  SniperTank,
  BossTank,
  PlayerTank,
} from "../src/entities/Tank.js";
import {
  CampaignProgress,
  CAMPAIGN_KEY,
} from "../src/systems/CampaignProgress.js";
import { activateEMP } from "../src/systems/EMPSystem.js";
import { GameManager } from "../src/core/GameManager.js";
import { fitArena } from "../src/ui/CombatView.js";

function fixture(type = "sniper") {
  const g = {
    scene: new THREE.Scene(),
    mode: "campaign",
    state: "playing",
    time: 5,
    rng: () => 0.5,
    levelConfig: { abilities: { emp: true, ricochet: true } },
    effects: { burst() {}, smoke() {}, explode() {}, shake() {}, pulse() {} },
    audio: { play() {} },
    onTankDestroyed() {},
    flashDamage() {},
    empCooldownLeft: 0,
    empAvailable: GameManager.prototype.empAvailable,
  };
  g.map = new MapManager(g.scene, "commander");
  g.player = new PlayerTank(g, 12.5, 12.5);
  g.player.invincible = 0;
  const Class = { sniper: SniperTank, armor: ArmorTank, boss: BossTank }[type];
  const enemy = new Class(g, type, 12.5, 5.5);
  enemy.invincible = 0;
  g.enemies = [enemy];
  g.collision = new CollisionSystem(g.map, () => [g.player, ...g.enemies]);
  g.bullets = new BulletManager(g);
  return { g, enemy };
}
function step(g, enemy, seconds) {
  for (let t = 0; t < seconds - 1e-8; t += 1 / 60) {
    g.time += 1 / 60;
    enemy.tick(1 / 60);
  }
}

test("all nine authored arenas have safe spawn points and routes to the base approaches", () => {
  assert.equal(LEVELS.length, 9);
  assert.equal(new Set(LEVELS.map((l) => l.map)).size, 9);
  for (const level of LEVELS) {
    const map = new MapManager(new THREE.Scene(), level.map);
    for (const [x, z] of [
      [2, 2],
      [12, 2],
      [23, 2],
      [9, 23],
      [7, 23],
      [16, 23],
    ])
      assert.equal(map.get(x, z), CELL.EMPTY, `${level.name}: spawn ${x},${z}`);
    // Brick is destructible; the solid geometry must leave every entry connected.
    const seen = new Set(["9,23"]),
      queue = [[9, 23]];
    for (let i = 0; i < queue.length; i++) {
      const [x, z] = queue[i];
      for (const [nx, nz] of [
        [x - 1, z],
        [x + 1, z],
        [x, z - 1],
        [x, z + 1],
      ]) {
        const key = `${nx},${nz}`;
        if (
          !seen.has(key) &&
          [CELL.EMPTY, CELL.BRICK].includes(map.get(nx, nz))
        ) {
          seen.add(key);
          queue.push([nx, nz]);
        }
      }
    }
    for (const key of ["2,2", "12,2", "23,2", "13,20", "16,23"])
      assert.ok(seen.has(key), `${level.name}: unreachable ${key}`);
    map.dispose();
  }
});

test("camera keeps arena corners visible in desktop, portrait and landscape", () => {
  const camera = new THREE.OrthographicCamera(-17, 17, 17, -17, 0.1, 150);
  camera.position.set(13, 38, 35);
  camera.lookAt(13, 0, 13);
  for (const [w, h] of [
    [1440, 760],
    [360, 500],
    [560, 250],
  ]) {
    fitArena(camera, w, h);
    for (const x of [0, 26])
      for (const z of [0, 26])
        for (const y of [0, 2]) {
          const p = new THREE.Vector3(x, y, z).project(camera);
          assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1);
        }
  }
});

test("sniper locks aim for the full warning and EMP cancels the pending shot", () => {
  const { g, enemy } = fixture();
  enemy.attackTimer = 0;
  step(g, enemy, 1 / 60);
  assert.equal(enemy.attackState, "windup");
  const aim = enemy.aim;
  g.player.x = 15.5;
  step(g, enemy, 0.5);
  assert.equal(enemy.aim, aim);
  assert.equal(g.bullets.items.length, 0);
  assert.ok(enemy.telegraph.line.visible);
  step(g, enemy, 0.32);
  assert.equal(g.bullets.items.length, 1);
  assert.equal(enemy.attackState, "recover");
  enemy.attackState = "windup";
  enemy.attackTimer = 0.1;
  g.player.x = enemy.x + 2;
  g.player.z = enemy.z;
  assert.equal(activateEMP(g), true);
  assert.equal(enemy.attackState, "recover");
  assert.equal(enemy.telegraph.line.visible, false);
  const count = g.bullets.items.length;
  step(g, enemy, 2.1);
  assert.equal(g.bullets.items.length, count);
});

test("armor absorbs half of frontal projectile damage, but not flank or area damage", () => {
  const { enemy } = fixture("armor");
  enemy.direction = 2;
  enemy.hit(1, { vx: 0, vz: -14 });
  assert.equal(enemy.hp, 5.5);
  enemy.hit(1, { vx: 14, vz: 0 });
  assert.equal(enemy.hp, 4.5);
  enemy.hit(1, { vx: 0, vz: 14 });
  assert.equal(enemy.hp, 3.5);
  enemy.hit(2);
  assert.equal(enemy.hp, 1.5);
});

test("boss fires a warned fan, enters phase two, and charges only after a second warning", () => {
  const { g, enemy } = fixture("boss");
  enemy.attackTimer = 0;
  step(g, enemy, 1 / 60);
  assert.equal(enemy.attackState, "windup");
  step(g, enemy, 0.5);
  assert.equal(g.bullets.items.length, 0);
  step(g, enemy, 0.32);
  assert.equal(g.bullets.items.length, 3);
  assert.equal(enemy.attackState, "recover");
  g.bullets.tick(1 / 60);
  assert.equal(
    g.bullets.items.length,
    3,
    "fan shells must not cancel each other",
  );
  enemy.hp = 6;
  enemy.attackState = "patrol";
  enemy.attackTimer = 0;
  step(g, enemy, 1 / 60);
  assert.equal(enemy.phase, 2);
  assert.equal(enemy.charging, true);
  const z = enemy.z;
  step(g, enemy, 0.8);
  assert.equal(enemy.z, z);
  step(g, enemy, 0.3);
  assert.ok(enemy.z > z);
  // A wall stops the charge without tunneling, then a clear recovery window.
  g.map.set(12, Math.ceil(enemy.z + 0.5), CELL.STEEL);
  step(g, enemy, 0.3);
  assert.equal(enemy.attackState, "recover");
  assert.ok(enemy.attackTimer > 1);
});

test("campaign unlocks persist and medals merge per difficulty; corrupt storage is harmless", () => {
  const data = new Map();
  const storage = {
    getItem: (k) => data.get(k),
    setItem: (k, v) => data.set(k, v),
  };
  let p = new CampaignProgress(storage);
  p.record(1, "veteran", 100, 140, 0);
  p.record(1, "veteran", 80, 170, 2);
  p = new CampaignProgress(storage);
  assert.equal(p.unlocked, 2);
  assert.deepEqual(p.records["1:veteran"], {
    score: 100,
    seconds: 140,
    intact: true,
    swift: true,
  });
  p.record(8, "cadet", 80, 90, 0);
  assert.equal(p.records["8:cadet"].swift, false);
  p.record(9, "iron-hand", 200, 180, 1);
  assert.equal(new CampaignProgress(storage).unlocked, 9);
  data.set(CAMPAIGN_KEY, "invalid");
  assert.equal(new CampaignProgress(storage).unlocked, 1);
  data.set(
    CAMPAIGN_KEY,
    JSON.stringify({
      version: 1,
      unlocked: 999,
      records: { "1:bad": {}, "1:cadet": { score: -5, seconds: 10 } },
    }),
  );
  p = new CampaignProgress(storage);
  assert.equal(p.unlocked, 9);
  assert.deepEqual(p.records, {});
});

test("campaign abilities unlock gradually and endless boss waves count the commander", () => {
  for (const [index, ricochet, emp] of [
    [2, 0, false],
    [3, 1, false],
    [4, 1, true],
  ]) {
    const { g } = fixture();
    g.levelConfig = LEVELS[index];
    g.player.applyLevelStats();
    assert.equal(g.player.ricochets, ricochet);
    assert.equal(g.empAvailable(), emp);
  }
  assert.equal(
    GameManager.prototype.enemyTotal.call({
      mode: "endless",
      wave: 5,
      levelConfig: { sequence: Array(18) },
    }),
    19,
  );
});

test("paired shells remain separate when the turret aims diagonally", () => {
  const { g } = fixture();
  g.player.level = 3;
  g.player.applyLevelStats();
  g.player.aim = Math.PI / 4;
  g.player.shoot();
  assert.equal(g.bullets.items.length, 2);
  g.bullets.tick(1 / 60);
  assert.equal(g.bullets.items.length, 2);
});
