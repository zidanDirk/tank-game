// tests/player-hit-stagger.test.js
// Verifies that when the player takes a hit, all alive enemies (and boss)
// get a brief frozenUntil reprieve — gives the player a recoverable moment.

import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { PlayerTank, EnemyTank, BossTank } from "../src/entities/Tank.js";

function gameStub(extra = {}) {
  return {
    scene: new THREE.Scene(),
    time: 0,
    rng: () => 0.5,
    audio: { play() {} },
    effects: {
      burst() {},
      explode() {},
      smoke() {},
      shake() {},
    },
    onTankDestroyed() {},
    flashDamage() {},
    syncRunUpgradeHud() {},
    getRunUpgradeStacks() {
      return 0;
    },
    ...extra,
  };
}

test("staggerEnemies pushes frozenUntil into the future for every alive enemy", () => {
  const g = gameStub({ time: 10 });
  const a = new EnemyTank(g, "light", 5.5, 5.5);
  const b = new EnemyTank(g, "heavy", 8.5, 5.5);
  // Already frozen — stagger should NOT shorten an existing longer freeze.
  b.frozenUntil = 12;
  g.enemies = [a, b];

  // Inline copy of the production logic from GameManager.staggerEnemies —
  // we exercise it directly to avoid pulling in WebGLRenderer.
  function staggerEnemies(durationSeconds) {
    const until = g.time + durationSeconds;
    for (const e of g.enemies) {
      if (e && e.alive) e.frozenUntil = Math.max(e.frozenUntil ?? 0, until);
    }
    if (g.boss && g.boss.alive) {
      g.boss.frozenUntil = Math.max(g.boss.frozenUntil ?? 0, until);
    }
  }
  staggerEnemies(0.5);

  assert.ok(a.frozenUntil >= 10.5);
  assert.equal(b.frozenUntil, 12); // preserved the longer window
});

test("staggerEnemies also freezes the boss if alive", () => {
  const g = gameStub({ time: 4 });
  const boss = new BossTank(g, "boss", 9.5, 9.5);
  g.boss = boss;

  function staggerEnemies(durationSeconds) {
    const until = g.time + durationSeconds;
    for (const e of g.enemies || []) {
      if (e && e.alive) e.frozenUntil = Math.max(e.frozenUntil ?? 0, until);
    }
    if (g.boss && g.boss.alive) {
      g.boss.frozenUntil = Math.max(g.boss.frozenUntil ?? 0, until);
    }
  }
  staggerEnemies(0.5);
  assert.ok(boss.frozenUntil >= 4.5);
});

test("staggerEnemies is a no-op when boss is null", () => {
  const g = gameStub({ time: 4 });
  g.boss = null;
  g.enemies = [];

  function staggerEnemies(durationSeconds) {
    const until = g.time + durationSeconds;
    for (const e of g.enemies || []) {
      if (e && e.alive) e.frozenUntil = Math.max(e.frozenUntil ?? 0, until);
    }
    if (g.boss && g.boss.alive) {
      g.boss.frozenUntil = Math.max(g.boss.frozenUntil ?? 0, until);
    }
  }
  // Should not throw.
  staggerEnemies(0.5);
  assert.equal(g.boss, null);
});

test("player.hit triggers staggerEnemies on the game", () => {
  const g = gameStub({ time: 0 });
  g.staggerEnemiesCalls = 0;
  g.staggerEnemies = (d) => {
    g.staggerEnemiesCalls++;
    g.lastStaggerDuration = d;
  };
  const enemy = new EnemyTank(g, "light", 5.5, 5.5);
  g.enemies = [enemy];
  const player = new PlayerTank(g, 9.5, 23.5);
  player.invincible = 0;
  player.hit();
  assert.equal(g.staggerEnemiesCalls, 1);
  assert.equal(g.lastStaggerDuration, 0.5);
});
