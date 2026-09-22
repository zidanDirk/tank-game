import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIGHTING_PRESETS,
  pickLightingPreset,
} from "../src/core/config.js";

test("pickLightingPreset cycles through all four presets in endless mode", () => {
  const keys = Object.keys(LIGHTING_PRESETS);
  // wave 1..4 cover the full cycle
  assert.equal(pickLightingPreset("endless", 0, 1), keys[0]);
  assert.equal(pickLightingPreset("endless", 0, 2), keys[1]);
  assert.equal(pickLightingPreset("endless", 0, 3), keys[2]);
  assert.equal(pickLightingPreset("endless", 0, 4), keys[3]);
  // wave 5 wraps back to the first
  assert.equal(pickLightingPreset("endless", 0, 5), keys[0]);
});

test("pickLightingPreset normalises invalid wave input in endless mode", () => {
  const wave1 = pickLightingPreset("endless", 0, 1);
  // NaN / zero / negative should all clamp to wave >= 1 and behave like wave 1
  assert.equal(pickLightingPreset("endless", 0, NaN), wave1);
  assert.equal(pickLightingPreset("endless", 0, 0), wave1);
  assert.equal(pickLightingPreset("endless", 0, -3), wave1);
});

test("pickLightingPreset campaign returns night for level 3+", () => {
  assert.equal(pickLightingPreset("campaign", 3), "night");
  assert.equal(pickLightingPreset("campaign", 9), "night");
});