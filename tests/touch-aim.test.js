import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { Input } from "../src/core/Input.js";
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

before(() => {
  globalThis.window = {
    addEventListener() {},
  };
});

after(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;

  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
});


// Minimal canvas shim with event listener registry.
function makeCanvas() {
  const listeners = {};
  return {
    width: 1000,
    height: 800,
    style: {},
    classList: {
      add() {},
      remove() {},
      contains() {
        return false;
      },
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 1000, height: 800 };
    },
    addEventListener(type, fn, opts) {
      (listeners[type] ||= []).push({ fn, opts });
    },
    removeEventListener() {},
    dispatch(type, evt) {
      for (const { fn } of listeners[type] || []) fn(evt);
    },
    _listeners: listeners,
  };
}

function makeGame() {
  return {
    state: "playing",
    audio: { unlock() {} },
    camera: {
      isCamera: true,
      isPerspectiveCamera: true,
      matrixWorld: {
        elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      },
      position: { x: 0, y: 0, z: 0 },
      projectionMatrix: {
        elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      },
      projectionMatrixInverse: {
        elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      },
    },
    togglePause() {},
    restart() {},
    start() {},
  };
}

const dpadButtons = (controls) => ({
  addEventListener() {},
  querySelectorAll: () =>
    controls.map((control) => ({
      dataset: { control },
      classList: { add() {}, remove() {} },
      addEventListener() {},
    })),
});

test("touch aim: pointerdown in right half activates mouseAim and writes target", () => {
  globalThis.document = dpadButtons([]);
  const game = makeGame();
  const canvas = makeCanvas();
  const input = new Input(game, canvas);
  assert.equal(input.mouseAim, false, "starts off");
  canvas.dispatch("pointerdown", {
    pointerType: "touch",
    pointerId: 7,
    clientX: 800,
    clientY: 200,
    preventDefault() {},
  });
  assert.equal(input.mouseAim, true, "mouseAim should activate");
  assert.ok(input.target, "target should be set");
  assert.equal(input.activeTouchAim, true);
  assert.ok(input.touchAim.has(7));
});

test("touch aim: pointermove updates target and preserves mouseAim=true", () => {
  globalThis.document = dpadButtons([]);
  const game = makeGame();
  const canvas = makeCanvas();
  const input = new Input(game, canvas);
  canvas.dispatch("pointerdown", {
    pointerType: "touch",
    pointerId: 11,
    clientX: 800,
    clientY: 200,
    preventDefault() {},
  });
  canvas.dispatch("pointermove", {
    pointerType: "touch",
    pointerId: 11,
    clientX: 900,
    clientY: 300,
    preventDefault() {},
  });
  assert.equal(input.mouseAim, true);
  assert.ok(input.target, "target should be set after move");
  assert.ok(input.touchAim.has(11));
});

test("touch aim: pointerup starts decay timer; mouseAim returns to false", () => {
  globalThis.document = dpadButtons([]);
  const game = makeGame();
  const canvas = makeCanvas();
  const input = new Input(game, canvas);
  canvas.dispatch("pointerdown", {
    pointerType: "touch",
    pointerId: 1,
    clientX: 800,
    clientY: 200,
    preventDefault() {},
  });
  canvas.dispatch("pointerup", {
    pointerType: "touch",
    pointerId: 1,
    clientX: 800,
    clientY: 200,
    target: canvas,
    preventDefault() {},
  });
  assert.equal(input.touchAim.size, 0);
  assert.equal(input.mouseAim, false);
  assert.equal(input.activeTouchAim, false);
  // decay not yet fired
  assert.equal(input.touchAimDecayed, false);
});

test("touch aim: pointerdown outside the right half keeps touchAim empty", () => {
  globalThis.document = dpadButtons([]);
  const game = makeGame();
  const canvas = makeCanvas();
  const input = new Input(game, canvas);
  canvas.dispatch("pointerdown", {
    pointerType: "touch",
    pointerId: 2,
    clientX: 200,
    clientY: 200,
    preventDefault() {},
  });
  assert.equal(input.touchAim.size, 0);
  assert.equal(input.mouseAim, false);
});

test("dpad direction does NOT clobber aim while touchAim active", () => {
  globalThis.document = dpadButtons(["left"]);
  const game = makeGame();
  const canvas = makeCanvas();
  const input = new Input(game, canvas);
  canvas.dispatch("pointerdown", {
    pointerType: "touch",
    pointerId: 5,
    clientX: 800,
    clientY: 200,
    preventDefault() {},
  });
  // Simulate d-pad left being pressed alongside the touch aim pointer.
  input.touch.set(99, "left");
  input.applyTouch();
  assert.equal(input.mouseAim, true, "d-pad must not override active touch aim");
  assert.equal(input.touchAim.size, 1);
  assert.equal(input.direction, 3, "left = 3");
});

test("dpad alone still clears mouseAim when touchAim inactive", () => {
  globalThis.document = dpadButtons(["left"]);
  const game = makeGame();
  const canvas = makeCanvas();
  const input = new Input(game, canvas);
  input.touch.set(50, "left");
  input.applyTouch();
  assert.equal(input.mouseAim, false);
  assert.equal(input.firing, false);
  assert.equal(input.direction, 3);
});

test("clear() resets touchAim state and cancels timer", () => {
  globalThis.document = dpadButtons([]);
  const game = makeGame();
  const canvas = makeCanvas();
  const input = new Input(game, canvas);
  canvas.dispatch("pointerdown", {
    pointerType: "touch",
    pointerId: 9,
    clientX: 800,
    clientY: 200,
    preventDefault() {},
  });
  input.clear();
  assert.equal(input.touchAim.size, 0);
  assert.equal(input.activeTouchAim, false);
  assert.equal(input.touchAimDecayed, true);
});

test("touch event fallback: touchstart in right zone populates touchAim", () => {
  globalThis.document = dpadButtons([]);
  const game = makeGame();
  const canvas = makeCanvas();
  const input = new Input(game, canvas);
  const touch = { identifier: 21, clientX: 800, clientY: 200 };
  canvas.dispatch("touchstart", { changedTouches: [touch] });
  assert.ok(input.touchAim.has(21));
  assert.equal(input.mouseAim, true);
  canvas.dispatch("touchend", { changedTouches: [touch] });
  assert.equal(input.touchAim.size, 0);
  assert.equal(input.mouseAim, false);
});
