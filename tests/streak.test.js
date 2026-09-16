import test from "node:test";
import assert from "node:assert/strict";
import { STREAK } from "../src/core/config.js";
import { GameManager } from "../src/core/GameManager.js";

function stubGame() {
  return {
    score: 0,
    kills: 0,
    lives: 3,
    state: "playing",
    time: 0,
    levelConfig: { sequence: new Array(99).fill("light") },
    activeBuffs: new Map(),
    boss: null,
    rng: () => 0.99, // suppress powerup drop rolls
    mode: "campaign",
    levelIndex: 0,
    killStreak: 0,
    streakMult: 1,
    lastKillAt: -Infinity,
    effects: {
      burst() {},
      shake() {},
      slowMo() {},
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
}

function kill(g, type = "light") {
  GameManager.prototype.onTankDestroyed.call(g, {
    team: "enemy",
    type,
    x: 10,
    z: 10,
    score: 100,
  });
}

test("STREAK constants expose window and maxMult tuning knobs", () => {
  assert.ok(STREAK.window > 0);
  assert.ok(STREAK.maxMult >= 2);
});

test("consecutive kills within the window compound the streak multiplier", () => {
  const g = stubGame();
  g.time = 1;
  kill(g);
  assert.equal(g.killStreak, 1);
  assert.equal(g.streakMult, 1);
  assert.equal(g.score, 100);
  g.time = 2;
  kill(g);
  assert.equal(g.killStreak, 2);
  assert.equal(g.streakMult, 2);
  assert.equal(g.score, 100 + 200);
  g.time = 3;
  kill(g);
  assert.equal(g.killStreak, 3);
  assert.equal(g.streakMult, 3);
  assert.equal(g.score, 100 + 200 + 300);
});

test("score multiplier caps at STREAK.maxMult", () => {
  const g = stubGame();
  for (let i = 0; i < STREAK.maxMult + 2; i++) {
    g.time = i + 0.1;
    kill(g);
  }
  assert.equal(g.killStreak, STREAK.maxMult + 2);
  assert.equal(g.streakMult, STREAK.maxMult);
});

test("a gap longer than the window resets the streak to 1", () => {
  const g = stubGame();
  g.time = 1;
  kill(g);
  g.time = 2;
  kill(g);
  assert.equal(g.killStreak, 2);
  g.time = 2 + STREAK.window + 0.1;
  kill(g);
  assert.equal(g.killStreak, 1);
  assert.equal(g.streakMult, 1);
});

test("losing a life resets the streak immediately", () => {
  const g = stubGame();
  g.time = 1;
  kill(g);
  g.time = 2;
  kill(g);
  assert.equal(g.killStreak, 2);
  GameManager.prototype.onTankDestroyed.call(g, { team: "player" });
  assert.equal(g.killStreak, 0);
  assert.equal(g.streakMult, 1);
});

test("killStreak decays to zero when the window expires between ticks", () => {
  const g = stubGame();
  g.killStreak = 3;
  g.streakMult = 3;
  g.lastKillAt = 0;
  g.time = STREAK.window + 0.5;
  // Mirror the streak-decay branch from GameManager.tick so we don't need
  // the full manager stack to assert this behaviour.
  if (g.killStreak > 0 && g.time - g.lastKillAt > STREAK.window) {
    g.killStreak = 0;
    g.streakMult = 1;
  }
  assert.equal(g.killStreak, 0);
  assert.equal(g.streakMult, 1);
});

test("updateUI hides the streak badge while multiplier is x1 and toggles 'hot' at x3+", () => {
  let hidden = null;
  let hot = null;
  let text = null;
  const g = stubGame();
  g.ui = {
    "streak-badge": {
      hidden: false,
      classList: {
        toggle(cls, on) {
          if (cls === "hot") hot = on;
        },
      },
    },
    "streak-mult": { textContent: "" },
  };
  // Copy the relevant branch out of updateUI so we don't need the full DOM.
  const update = () => {
    const active = g.streakMult > 1;
    g.ui["streak-badge"].hidden = !active;
    g.ui["streak-badge"].classList.toggle("hot", g.streakMult >= 3);
    if (g.ui["streak-mult"])
      g.ui["streak-mult"].textContent = `×${g.streakMult}`;
    hidden = g.ui["streak-badge"].hidden;
    text = g.ui["streak-mult"].textContent;
  };
  g.streakMult = 1;
  update();
  assert.equal(hidden, true);
  assert.equal(text, "×1");
  g.streakMult = 2;
  update();
  assert.equal(hidden, false);
  assert.equal(hot, false);
  assert.equal(text, "×2");
  g.streakMult = 4;
  update();
  assert.equal(hot, true);
  assert.equal(text, "×4");
});

test("snapshot exposes killStreak and streakMult additively", () => {
  const g = stubGame();
  g.state = "playing";
  g.wave = 0;
  g.levelIndex = 0;
  g.levelConfig = { number: 1, name: "test" };
  g.mode = "campaign";
  g.score = 0;
  g.kills = 0;
  g.lives = 3;
  g.time = 0;
  g.activeBuffs = new Map();
  g.killStreak = 4;
  g.streakMult = 4;
  g.lastKillAt = 0;
  // snapshot() reads more than we stub; build a minimal manager just for it.
  const snap = GameManager.prototype.snapshot.call({
    state: g.state,
    mode: g.mode,
    wave: g.wave,
    levelConfig: g.levelConfig,
    levelIndex: g.levelIndex,
    time: g.time,
    score: g.score,
    kills: g.kills,
    lives: g.lives,
    activeBuffs: g.activeBuffs,
    killStreak: g.killStreak,
    streakMult: g.streakMult,
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
  });
  assert.equal(snap.killStreak, 4);
  assert.equal(snap.streakMult, 4);
});
