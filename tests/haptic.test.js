import test from "node:test";
import assert from "node:assert/strict";
import { AudioSystem } from "../src/systems/AudioSystem.js";

function setGlobal(name, value) {
  try {
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    });
  } catch {
    // Some Node builds expose these as read-only getters; fall back to a
    // delete-then-define so the override actually sticks for the test.
    try {
      delete globalThis[name];
    } catch {}
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
}

function withGlobals(overrides, fn) {
  const saved = {};
  for (const k of Object.keys(overrides)) {
    saved[k] = globalThis[k];
    setGlobal(k, overrides[k]);
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(saved)) setGlobal(k, saved[k]);
  }
}

test("AudioSystem.vibrate calls navigator.vibrate with the matching pattern", () => {
  let calls = [];
  withGlobals(
    {
      window: { matchMedia: () => ({ matches: false }) },
      navigator: { vibrate: (p) => calls.push(p) },
    },
    () => {
      const a = new AudioSystem();
      a.vibrate("hit");
      a.vibrate("explosion");
      a.vibrate("levelup");
      assert.deepEqual(calls, [45, 120, [50, 25, 50]]);
    },
  );
});

test("AudioSystem.vibrate is a no-op for kinds with pattern 0", () => {
  let calls = [];
  withGlobals(
    {
      window: { matchMedia: () => ({ matches: false }) },
      navigator: { vibrate: (p) => calls.push(p) },
    },
    () => {
      const a = new AudioSystem();
      a.vibrate("brick");
      a.vibrate("start");
      a.vibrate("pickup-spawn");
      assert.deepEqual(calls, []);
    },
  );
});

test("AudioSystem.vibrate skips when navigator.vibrate is unavailable", () => {
  withGlobals(
    { window: { matchMedia: () => ({ matches: false }) }, navigator: {} },
    () => {
      const a = new AudioSystem();
      // Should not throw.
      a.vibrate("hit");
      a.vibrate("explosion");
    },
  );
});

test("AudioSystem.vibrate respects prefers-reduced-motion", () => {
  let calls = [];
  withGlobals(
    {
      window: { matchMedia: (q) => ({ matches: q.includes("reduce") }) },
      navigator: { vibrate: (p) => calls.push(p) },
    },
    () => {
      const a = new AudioSystem();
      a.vibrate("hit");
      a.vibrate("explosion");
      assert.deepEqual(calls, []);
    },
  );
});

test("AudioSystem.play fires haptic even when audio is muted or context missing", () => {
  let calls = [];
  withGlobals(
    {
      window: { matchMedia: () => ({ matches: false }) },
      navigator: { vibrate: (p) => calls.push(p) },
    },
    () => {
      const a = new AudioSystem();
      // No audio context unlock — play() returns early but should still vibrate.
      a.play("hit");
      assert.deepEqual(calls, [45]);
      // Muting the audio system should NOT silence haptic.
      a.toggle();
      a.play("bomb");
      assert.deepEqual(calls, [45, 220]);
    },
  );
});

test("AudioSystem.vibrate swallows errors from insecure contexts", () => {
  withGlobals(
    {
      window: { matchMedia: () => ({ matches: false }) },
      navigator: {
        vibrate() {
          throw new Error("vibrate denied");
        },
      },
    },
    () => {
      const a = new AudioSystem();
      // Must not throw.
      a.vibrate("hit");
    },
  );
});
