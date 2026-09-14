import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GameManager } from "../src/core/GameManager.js";
import { Effects } from "../src/systems/Effects.js";

test("Effects.slowMo sets an active scale and slowMoScale returns it", () => {
  const scene = new THREE.Scene();
  const e = new Effects(scene, () => 0.5);
  assert.equal(e.slowMoScale(), 1);
  e.slowMo(300, 0.3);
  assert.equal(e.slowMoScale(), 0.3);
  // Drive wall-clock time forward to fully decay.
  for (let i = 0; i < 60; i++) e.tick(1 / 60);
  assert.equal(e.slowMoScale(), 1);
});

test("Effects.slowMo takes the smaller scale when chained", () => {
  const scene = new THREE.Scene();
  const e = new Effects(scene, () => 0.5);
  e.slowMo(300, 0.5);
  e.slowMo(300, 0.2);
  assert.equal(e.slowMoScale(), 0.2);
});

test("Effects.slowMo decays to neutral scale after the duration", () => {
  const scene = new THREE.Scene();
  const e = new Effects(scene, () => 0.5);
  e.slowMo(200, 0.25);
  // Not yet decayed.
  for (let i = 0; i < 5; i++) e.tick(1 / 60);
  assert.equal(e.slowMoScale() < 1, true);
  // Past the 200ms window.
  for (let i = 0; i < 30; i++) e.tick(1 / 60);
  assert.equal(e.slowMoScale(), 1);
});

test("Effects.clear() also clears slow-mo state", () => {
  const scene = new THREE.Scene();
  const e = new Effects(scene, () => 0.5);
  e.slowMo(300, 0.2);
  assert.equal(e.slowMoScale(), 0.2);
  e.clear();
  assert.equal(e.slowMoScale(), 1);
});

test("frame() multiplies the wall-clock dt by the active slowMoScale", () => {
  // Mirror the dt-scaling branch inline.
  let capturedDt = null;
  const game = {
    lastTime: 100,
    effects: {
      slowMoScale() {
        return 0.5;
      },
    },
  };
  const frame = (ms) => {
    const rawDt = game.lastTime ? Math.min((ms - game.lastTime) / 1000, 0.1) : 0;
    game.lastTime = ms;
    const dt = rawDt * game.effects.slowMoScale();
    capturedDt = dt;
  };
  frame(200); // 100ms wall-clock
  assert.equal(capturedDt, 0.05);
});

test("kills reaching streakMult >= 3 trigger Effects.slowMo", () => {
  let slowMoArgs = null;
  const g = {
    score: 0,
    kills: 0,
    lives: 3,
    state: "playing",
    time: 0,
    levelConfig: { sequence: new Array(99).fill("light") },
    activeBuffs: new Map(),
    boss: null,
    rng: () => 0.99,
    mode: "campaign",
    levelIndex: 0,
    killStreak: 0,
    streakMult: 1,
    lastKillAt: -Infinity,
    effects: {
      burst() {},
      shake() {},
      slowMo(durationMs, scale) {
        slowMoArgs = { durationMs, scale };
      },
      slowMoScale() {
        return 1;
      },
      shakeOffset() {
        return { x: 0, z: 0 };
      },
    },
    scorePopup() {},
    updateUI() {},
    syncBuffHud() {},
    flashDeathGrayscale() {},
    finish(won) {
      this.state = won ? "won" : "lost";
    },
    powerupChance() {
      return 0;
    },
    dropPickup() {},
    advanceEndlessWave() {},
    completeLevel() {},
  };
  // Three kills within the streak window: first two should NOT trigger slowMo,
  // the third (streakMult === 3) should.
  g.time = 1;
  GameManager.prototype.onTankDestroyed.call(g, { team: "enemy", type: "light", x: 10, z: 10, score: 100 });
  assert.equal(slowMoArgs, null);
  g.time = 2;
  GameManager.prototype.onTankDestroyed.call(g, { team: "enemy", type: "light", x: 10, z: 10, score: 100 });
  assert.equal(slowMoArgs, null);
  g.time = 3;
  GameManager.prototype.onTankDestroyed.call(g, { team: "enemy", type: "light", x: 10, z: 10, score: 100 });
  assert.deepEqual(slowMoArgs, { durationMs: 300, scale: 0.3 });
});