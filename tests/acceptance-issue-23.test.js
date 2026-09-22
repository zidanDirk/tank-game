import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIGHTING_PRESETS,
  pickLightingPreset,
} from "../src/core/config.js";

test("LIGHTING_PRESETS exposes noon / overcast / dusk / night keys", () => {
  assert.deepEqual(
    Object.keys(LIGHTING_PRESETS).sort(),
    ["dusk", "night", "noon", "overcast"],
  );
});

test("every preset contains the required lighting fields with numeric values", () => {
  const requiredTopLevel = ["envIntensity", "toneMappingExposure"];
  const requiredGroups = {
    sun: ["color", "intensity", "azimuth", "elevation"],
    hemi: ["skyColor", "groundColor", "intensity"],
    ambient: ["color", "intensity"],
    background: ["top", "bottom"],
  };
  for (const [name, preset] of Object.entries(LIGHTING_PRESETS)) {
    assert.ok(preset, `${name} preset must be defined`);
    for (const key of requiredTopLevel) {
      const value = preset[key];
      assert.ok(
        typeof value === "number" && Number.isFinite(value),
        `${name}.${key} must be a finite number, got ${typeof value} (${value})`,
      );
    }
    for (const [group, fields] of Object.entries(requiredGroups)) {
      assert.ok(preset[group], `${name}.${group} group must be defined`);
      for (const field of fields) {
        const value = preset[group][field];
        assert.ok(
          typeof value === "number" && Number.isFinite(value),
          `${name}.${group}.${field} must be a finite number, got ${typeof value} (${value})`,
        );
      }
    }
  }
});

test("pickLightingPreset maps campaign levels to noon / overcast / dusk", () => {
  assert.equal(pickLightingPreset("campaign", 0), "noon");
  assert.equal(pickLightingPreset("campaign", 1), "overcast");
  assert.equal(pickLightingPreset("campaign", 2), "dusk");
});

test("pickLightingPreset endless rotates across waves (noon at wave 1, differs by wave 6)", () => {
  const wave1 = pickLightingPreset("endless", 0, 1);
  const wave6 = pickLightingPreset("endless", 0, 6);
  assert.equal(wave1, "noon");
  assert.notEqual(wave6, wave1);
});

test("pickLightingPreset falls back to the first preset key for unknown modes without throwing", () => {
  const firstKey = Object.keys(LIGHTING_PRESETS)[0];
  assert.ok(typeof firstKey === "string" && firstKey.length > 0);
  let result;
  assert.doesNotThrow(() => {
    result = pickLightingPreset("not-a-real-mode", 7, 7);
  });
  assert.equal(result, firstKey);
});
