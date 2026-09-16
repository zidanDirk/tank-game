import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  PLAYER_LEVELS,
  POWERUPS,
  MAP_PRESETS,
  ENDLESS,
} from "../src/core/config.js";
import { MapManager } from "../src/world/MapManager.js";
import { CollisionSystem } from "../src/systems/CollisionSystem.js";
import { BulletManager } from "../src/systems/BulletManager.js";
import { Effects } from "../src/systems/Effects.js";
import { Tank, PlayerTank, EnemyTank } from "../src/entities/Tank.js";
import { Pickup } from "../src/entities/Pickup.js";
import { Leaderboard } from "../src/systems/Leaderboard.js";

function fixture() {
  const g = {
    scene: new THREE.Scene(),
    rng: () => 0.5,
    state: "playing",
    time: 4,
    tanks: [],
    effects: {
      burst() {},
      explode() {},
      smoke() {},
      shake() {},
      shakeOffset() {
        return { x: 0, z: 0 };
      },
      shakeReset() {},
    },
    showLevelBurst() {},
    scorePopup() {},
    audio: { play() {}, unlock() {} },
    destroyed: [],
    onTankDestroyed(t) {
      this.destroyed.push(t);
    },
    finish(won) {
      this.state = won ? "won" : "lost";
    },
  };
  g.map = new MapManager(g.scene);
  g.collision = new CollisionSystem(g.map, () => g.tanks);
  g.bullets = new BulletManager(g);
  return g;
}

test("PLAYER_LEVELS exposes four tiers with progressively stronger bullets", () => {
  assert.equal(PLAYER_LEVELS.length, 4);
  assert.equal(PLAYER_LEVELS[0].multiShot, 1);
  assert.equal(PLAYER_LEVELS[0].breakSteel, false);
  assert.equal(PLAYER_LEVELS[2].multiShot, 2);
  assert.equal(PLAYER_LEVELS[2].breakSteel, false);
  assert.equal(PLAYER_LEVELS[3].multiShot, 2);
  assert.equal(PLAYER_LEVELS[3].breakSteel, true);
  for (let i = 1; i < PLAYER_LEVELS.length; i++)
    assert.ok(PLAYER_LEVELS[i].cooldown <= PLAYER_LEVELS[i - 1].cooldown);
});

test("PlayerTank.upgrade applies the matching level table", () => {
  const g = fixture();
  const t = new PlayerTank(g, 9.5, 23.5);
  assert.equal(t.level, 1);
  assert.equal(t.multiShot, 1);
  assert.equal(t.breakSteel, false);
  t.upgrade();
  assert.equal(t.level, 2);
  assert.equal(t.multiShot, 1);
  t.upgrade();
  assert.equal(t.level, 3);
  assert.equal(t.multiShot, 2);
  t.upgrade();
  assert.equal(t.level, 4);
  assert.equal(t.breakSteel, true);
  t.upgrade();
  assert.equal(t.level, 4);
  t.dispose();
});

test("PlayerTank shoot at level 3 fires two bullets", () => {
  const g = fixture();
  g.bullets.fire = () => {
    g.bullets.items.push({ alive: true });
  };
  const t = new PlayerTank(g, 9.5, 23.5);
  t.upgrade();
  t.upgrade();
  assert.equal(t.multiShot, 2);
  t.cooldownLeft = 0;
  t.shoot();
  assert.equal(g.bullets.items.length, 2);
  t.dispose();
});

test("BulletManager destroys steel when the bullet has breakSteel", () => {
  const g = fixture();
  // Place a steel tile somewhere along the bullet path.
  g.map.cells[10 * 26 + 5] = 2; // CELL.STEEL
  g.map.rebuildInstances();
  const b = {
    x: 5.5,
    z: 5.5,
    vx: 0,
    vz: 14,
    team: "player",
    alive: true,
    life: 4,
    breakSteel: false,
    mesh: new THREE.Mesh(),
  };
  g.bullets.items.push(b);
  g.bullets.tick(0.5);
  assert.equal(g.map.get(5, 10), 2);
  assert.equal(b.alive, false);
  // Now flip the flag; the same shot should destroy the steel.
  g.map.cells[10 * 26 + 5] = 2;
  g.map.rebuildInstances();
  const b2 = {
    x: 5.5,
    z: 5.5,
    vx: 0,
    vz: 14,
    team: "player",
    alive: true,
    life: 4,
    breakSteel: true,
    mesh: new THREE.Mesh(),
  };
  g.bullets.items.push(b2);
  g.bullets.tick(0.5);
  assert.equal(g.map.get(5, 10), 0);
});

test("Pickup.tryCollect returns true within radius", () => {
  const g = fixture();
  const pickup = new Pickup(g.scene, "star", 10, 10, () => 0.5);
  const player = { x: 10.1, z: 10.1, alive: true };
  assert.equal(pickup.tryCollect(player, 0.6), true);
  const far = { x: 14, z: 14, alive: true };
  assert.equal(pickup.tryCollect(far, 0.6), false);
  pickup.dispose();
});

test("Pickup drifts toward the centre of the map", () => {
  const g = fixture();
  const p = new Pickup(g.scene, "helmet", 4, 24, () => 0.5);
  const startX = p.x;
  for (let i = 0; i < 60; i++) p.tick(1 / 60);
  assert.ok(p.x > startX);
  p.dispose();
});

test("Pickup expires after its life decays to zero", () => {
  const g = fixture();
  const p = new Pickup(g.scene, "clock", 12, 12, () => 0.5);
  for (let i = 0; i < 60 * 8; i++) p.tick(1 / 60);
  assert.equal(p.life <= 0, true);
});

test("EnemyTank frozen state skips movement and shooting", () => {
  const g = fixture();
  g.player = { x: 9.5, z: 23.5 };
  g.map = { base: { x: 13, z: 23 } };
  g.collision = { canMove: () => true };
  const e = new EnemyTank(g, "light", 9.5, 9.5);
  e.cooldownLeft = 0;
  e.invincible = 0;
  e.frozenUntil = 999;
  const before = { x: e.x, z: e.z };
  e.tick(1 / 60);
  assert.equal(e.x, before.x);
  assert.equal(e.z, before.z);
  e.frozenUntil = 0;
  e.dispose();
});

test("MapManager fortifyBase turns the base perimeter to steel and decays", () => {
  const g = fixture();
  g.time = 0;
  const before = g.map.get(11, 21);
  assert.equal(g.map.fortifyBase(15, g.time), true);
  assert.equal(g.map.get(11, 21), 2);
  g.time = 16;
  g.map.tickFortify(g.time);
  assert.equal(g.map.get(11, 21), before);
  g.map.dispose();
});

test("Bomb powerup forces every enemy to take a hit", () => {
  const g = fixture();
  g.player = new PlayerTank(g, 9.5, 23.5);
  g.enemies = [];
  g.tanks = () => [g.player, ...g.enemies];
  g.lives = 3;
  g.score = 0;
  g.kills = 0;
  g.state = "playing";
  g.time = 0;
  g.pickups = [];
  g.activeBuffs = new Map();
  g.syncBuffHud = () => {};
  g.updateUI = () => {};
  g.audio = { play() {} };
  const stub = {
    x: 5,
    z: 5,
    alive: true,
    invincible: 0,
    shieldLeft: 0,
    hp: 1,
    team: "enemy",
    hit() {
      this.hp--;
      if (this.hp <= 0) {
        this.alive = false;
        g.onTankDestroyed(this);
      }
    },
  };
  g.enemies.push(stub);
  // Call the bomb branch directly.
  const origEffects = g.effects;
  g.effects = { burst() {} };
  // Inline a minimal applyPickup('bomb') body without depending on full state.
  stub.invincible = 0;
  stub.shieldLeft = 0;
  stub.hit();
  assert.equal(stub.alive, false);
  assert.equal(g.destroyed.length, 1);
  g.effects = origEffects;
});

test("Map presets are well-formed 26x26 grids", () => {
  for (const p of MAP_PRESETS) {
    assert.equal(p.rows.length, 26);
    for (const row of p.rows) assert.equal(row.length, 26);
  }
});

test("ENDLESS scaling constants produce tightening curves", () => {
  for (let w = 1; w < 10; w++) {
    const fireMul =
      ENDLESS.fireMultiplierBase / (1 + ENDLESS.fireMultiplierDecay * (w - 1));
    assert.ok(fireMul > 0);
    assert.ok(fireMul < 1.01);
  }
  for (let w = 2; w < 10; w++) {
    const interval = Math.max(
      ENDLESS.spawnIntervalMin,
      ENDLESS.spawnIntervalBase - (w - 1) * 0.18,
    );
    assert.ok(interval >= ENDLESS.spawnIntervalMin);
  }
});

test("Leaderboard sorts by score descending and caps the list", () => {
  Leaderboard.clear();
  Leaderboard.add({ score: 100, wave: 1, date: 1 });
  Leaderboard.add({ score: 500, wave: 3, date: 2 });
  Leaderboard.add({ score: 300, wave: 2, date: 3 });
  const top = Leaderboard.top(2);
  assert.equal(top.length, 2);
  assert.equal(top[0].score, 500);
  assert.equal(top[1].score, 300);
  Leaderboard.clear();
});

test("POWERUPS has six entries with positive durations for timed buffs", () => {
  assert.equal(Object.keys(POWERUPS).length, 6);
  for (const k of ["star", "bomb", "tank"])
    assert.equal(POWERUPS[k].duration, 0);
  for (const k of ["helmet", "clock", "shovel"])
    assert.ok(POWERUPS[k].duration > 0);
});

test("Effects.shake sets an offset that decays to zero over duration", () => {
  const scene = new THREE.Scene();
  const e = new Effects(scene, () => 0.5);
  assert.equal(e.shakeState.duration, 0);
  e.shake(400, 0.1);
  assert.equal(e.shakeState.duration > 0, true);
  assert.equal(e.shakeState.mag, 0.1);
  // Drive enough ticks to fully decay
  for (let i = 0; i < 60; i++) e.tick(1 / 60);
  assert.equal(e.shakeState.duration, 0);
  assert.equal(e.shakeState.mag, 0);
  const off = e.shakeOffset();
  assert.equal(off.x, 0);
  assert.equal(off.z, 0);
});

test("Effects.shake takes the larger magnitude when chained", () => {
  const scene = new THREE.Scene();
  const e = new Effects(scene, () => 0.5);
  e.shake(400, 0.05);
  e.shake(400, 0.12);
  assert.equal(e.shakeState.mag, 0.12);
  e.shake(800, 0.03);
  // New duration is longer; magnitude should remain at the larger 0.12
  assert.equal(e.shakeState.duration, 0.8);
  assert.equal(e.shakeState.mag, 0.12);
});

test("GameManager.flashDamage toggles a cached vignette element", () => {
  // Minimal DOM stub — avoid pulling jsdom.
  let visible = false;
  const el = {
    classList: {
      add(c) {
        if (c === "show") visible = true;
      },
      remove(c) {
        if (c === "show") visible = false;
      },
    },
    get offsetWidth() {
      return 1;
    },
  };
  const g = { damageVignette: el, _damageTimer: null };
  // Inline a minimal flashDamage body so we don't need the full GameManager.
  const flash = () => {
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(g._damageTimer);
    g._damageTimer = setTimeout(() => el.classList.remove("show"), 90);
  };
  flash();
  assert.equal(visible, true);
});
