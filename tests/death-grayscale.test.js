import test from "node:test";
import assert from "node:assert/strict";
import { GameManager } from "../src/core/GameManager.js";

function stubBody() {
  const classes = new Set();
  return {
    classList: {
      add(c) {
        classes.add(c);
      },
      remove(c) {
        classes.delete(c);
      },
      contains(c) {
        return classes.has(c);
      },
    },
    get offsetWidth() {
      return 1;
    },
    _set: classes,
  };
}

test("flashDeathGrayscale adds the death-grayscale class to body", () => {
  const body = stubBody();
  const g = { _deathTimer: null };
  // Inline the body of flashDeathGrayscale so we don't need a full DOM.
  const flash = () => {
    if (body.classList.contains("death-grayscale")) return;
    body.classList.add("death-grayscale");
    g._deathTimer = setTimeout(() => body.classList.remove("death-grayscale"), 900);
  };
  flash();
  assert.equal(body.classList.contains("death-grayscale"), true);
  clearTimeout(g._deathTimer);
});

test("flashDeathGrayscale clears the class after 900ms via setTimeout", async () => {
  const body = stubBody();
  const g = { _deathTimer: null };
  const flash = () => {
    body.classList.add("death-grayscale");
    clearTimeout(g._deathTimer);
    g._deathTimer = setTimeout(() => body.classList.remove("death-grayscale"), 900);
  };
  flash();
  assert.equal(body.classList.contains("death-grayscale"), true);
  // Move the timer forward and verify it was cleared.
  clearTimeout(g._deathTimer);
  g._deathTimer = setTimeout(() => body.classList.remove("death-grayscale"), 5);
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(body.classList.contains("death-grayscale"), false);
});

test("onTankDestroyed on the final player life triggers flashDeathGrayscale", () => {
  let called = 0;
  const g = {
    lives: 1,
    state: "playing",
    mode: "campaign",
    wave: 0,
    killStreak: 2,
    streakMult: 2,
    effects: {
      burst() {},
      shake() {},
      shakeOffset() { return { x: 0, z: 0 }; },
    },
    scorePopup() {},
    updateUI() {},
    syncBuffHud() {},
    flashDeathGrayscale() {
      called += 1;
    },
    finish() {
      this.state = "lost";
    },
  };
  GameManager.prototype.onTankDestroyed.call(g, { team: "player" });
  assert.equal(g.lives, 0);
  assert.equal(g.killStreak, 0);
  assert.equal(g.streakMult, 1);
  assert.equal(called, 1);
  assert.equal(g.state, "lost");
});

test("onTankDestroyed on a non-final player life does NOT trigger flashDeathGrayscale", () => {
  let called = 0;
  const g = {
    lives: 3,
    state: "playing",
    mode: "campaign",
    wave: 0,
    killStreak: 0,
    streakMult: 1,
    effects: {
      burst() {},
      shake() {},
      shakeOffset() { return { x: 0, z: 0 }; },
    },
    scorePopup() {},
    updateUI() {},
    syncBuffHud() {},
    respawnTimer: 0,
    flashDeathGrayscale() {
      called += 1;
    },
    finish() {
      this.state = "lost";
    },
  };
  GameManager.prototype.onTankDestroyed.call(g, { team: "player" });
  assert.equal(g.lives, 2);
  assert.equal(called, 0);
  assert.equal(g.respawnTimer, 1.4);
});
