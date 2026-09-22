import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LightingRig } from "../src/world/LightingRig.js";
import { LIGHTING_PRESETS } from "../src/core/config.js";

function makeRig() {
  const scene = new THREE.Scene();
  const rig = new LightingRig(scene);
  return { scene, rig };
}

function lightByPredicate(scene, predicate) {
  return scene.children.find(predicate);
}

test("constructor registers the directional light's target so the shadow camera aims at a real object", () => {
  const { scene, rig } = makeRig();
  // The target is an Object3D (not a Light), so it lives in scene.children
  // but is excluded from the lights filter. Verify it's there so the shadow
  // camera doesn't drift when other scene roots move.
  const target = scene.children.find((c) => c === rig.sun.target);
  assert.ok(target, "DirectionalLight.target must be added to the scene");
  assert.equal(target.isLight, undefined);
  // Target sits at the world origin so the shadow camera box centers over
  // the playfield after fitShadow widens it.
  assert.equal(rig.sun.target.position.x, 0);
  assert.equal(rig.sun.target.position.y, 0);
  assert.equal(rig.sun.target.position.z, 0);
});

test("apply does not add or remove lights — the scene stays at exactly 3 lights across presets", () => {
  const { scene, rig } = makeRig();
  const before = scene.children.filter((c) => c && c.isLight).length;
  assert.equal(before, 3);
  for (const key of Object.keys(LIGHTING_PRESETS)) {
    rig.apply(key);
    const after = scene.children.filter((c) => c && c.isLight).length;
    assert.equal(
      after,
      3,
      `apply('${key}') must keep the light count at 3 (was ${before}, now ${after})`,
    );
  }
  // The sun object identity is also preserved — apply mutates the same
  // DirectionalLight rather than swapping in a new one.
  const sun = lightByPredicate(scene, (c) => c.isDirectionalLight);
  assert.equal(sun, rig.sun);
});

test("apply writes preset colors, intensities, and sun position from LIGHTING_PRESETS", () => {
  const { scene, rig } = makeRig();
  rig.apply("noon");
  const noon = LIGHTING_PRESETS.noon;
  assert.equal(rig.sun.intensity, noon.sun.intensity);
  assert.equal(rig.sun.color.getHex(), noon.sun.color);
  assert.equal(rig.hemi.intensity, noon.hemi.intensity);
  assert.equal(rig.hemi.color.getHex(), noon.hemi.skyColor);
  assert.equal(rig.hemi.groundColor.getHex(), noon.hemi.groundColor);
  assert.equal(rig.ambient.intensity, noon.ambient.intensity);
  assert.equal(rig.ambient.color.getHex(), noon.ambient.color);
  // Sun is placed along the (azimuth, elevation) ray at SUN_DISTANCE.
  const cosEl = Math.cos(noon.sun.elevation);
  const sinEl = Math.sin(noon.sun.elevation);
  const sinAz = Math.sin(noon.sun.azimuth);
  const cosAz = Math.cos(noon.sun.azimuth);
  // Coordinates are deterministic to within FP noise.
  assert.ok(Math.abs(rig.sun.position.x - 40 * cosEl * sinAz) < 1e-9);
  assert.ok(Math.abs(rig.sun.position.y - 40 * sinEl) < 1e-9);
  assert.ok(Math.abs(rig.sun.position.z - 40 * cosEl * cosAz) < 1e-9);
});

test("apply('noon') writes a fresh PMREM-tagged environment and re-apply leaves it in place", () => {
  const { scene, rig } = makeRig();
  rig.apply("noon");
  const firstEnv = scene.environment;
  assert.ok(firstEnv, "scene.environment must be set after first apply");
  assert.equal(firstEnv.type, "PMREMTexture");
  // Re-applying the same (or a different) preset must NOT touch the env —
  // apply only flips light parameters, never the scene.environment handle.
  rig.apply("dusk");
  assert.equal(scene.environment, firstEnv);
  rig.apply("overcast");
  assert.equal(scene.environment, firstEnv);
});

test("fitShadow frames the orthographic frustum symmetrically and recomputes shadow texel density", () => {
  const { rig } = makeRig();
  rig.apply("noon");
  rig.fitShadow(18, 1.6, Math.PI / 3);
  const cam = rig.sun.shadow.camera;
  const limit = 18 + 1.6 * Math.tan(Math.PI / 3) + 0.5;
  // Symmetric box centered on the origin.
  assert.equal(cam.left, -limit);
  assert.equal(cam.right, limit);
  assert.equal(cam.top, limit);
  assert.equal(cam.bottom, -limit);
  // shadowTexelsPerUnit = mapSize.width / (right - left).
  const snap = rig.snapshot();
  assert.ok(
    Math.abs(snap.shadowTexelsPerUnit - 2048 / (2 * limit)) < 1e-9,
    `shadowTexelsPerUnit must equal 2048/(2*limit), got ${snap.shadowTexelsPerUnit}`,
  );
});

test("shadow.mapSize stays pinned at 2048 across apply/fitShadow/preset swaps", () => {
  const { scene, rig } = makeRig();
  rig.apply("noon");
  rig.fitShadow(18, 1.6, Math.PI / 3);
  const sun = lightByPredicate(scene, (c) => c.isDirectionalLight);
  assert.equal(sun.shadow.mapSize.width, 2048);
  assert.equal(sun.shadow.mapSize.height, 2048);
  rig.apply("dusk");
  assert.equal(sun.shadow.mapSize.width, 2048);
  assert.equal(sun.shadow.mapSize.height, 2048);
  rig.fitShadow(10, 0.5, Math.PI / 4);
  assert.equal(sun.shadow.mapSize.width, 2048);
  assert.equal(sun.shadow.mapSize.height, 2048);
});

test("snapshot exposes preset, sunIntensity, shadowTexelsPerUnit, and a constant hemi:true flag", () => {
  const { rig } = makeRig();
  // Before any apply, preset is null but the contract still holds.
  const initial = rig.snapshot();
  assert.equal(initial.preset, null);
  assert.equal(initial.hemi, true);
  assert.ok(typeof initial.sunIntensity === "number");
  assert.ok(typeof initial.shadowTexelsPerUnit === "number");
  // After apply the preset name and sunIntensity reflect the chosen preset.
  rig.apply("overcast");
  const after = rig.snapshot();
  assert.equal(after.preset, "overcast");
  assert.equal(after.sunIntensity, LIGHTING_PRESETS.overcast.sun.intensity);
  assert.equal(after.hemi, true);
});

test("fitShadow uses the exact tan(elevation) budget when shaping the orthographic bounds", () => {
  const { rig } = makeRig();
  rig.apply("noon");
  const arenaHalfDiag = 12;
  const maxCasterHeight = 2.5;
  const elevation = Math.PI / 6;
  rig.fitShadow(arenaHalfDiag, maxCasterHeight, elevation);
  const cam = rig.sun.shadow.camera;
  const expectedLimit =
    arenaHalfDiag + maxCasterHeight * Math.tan(elevation) + 0.5;
  assert.ok(Math.abs(cam.right - expectedLimit) < 1e-9);
  assert.ok(Math.abs(cam.top - expectedLimit) < 1e-9);
});

test("apply throws when the preset key is not in LIGHTING_PRESETS", () => {
  const { rig } = makeRig();
  assert.throws(
    () => rig.apply("midnight"),
    /Unknown lighting preset: midnight/,
  );
});