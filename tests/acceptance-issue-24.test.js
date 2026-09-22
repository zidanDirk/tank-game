import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LightingRig } from "../src/world/LightingRig.js";

function makeRig() {
  const scene = new THREE.Scene();
  const rig = new LightingRig(scene);
  return { scene, rig };
}

function findLight(scene, predicate) {
  return scene.children.find(predicate);
}

test("LightingRig adds exactly 3 light objects (DirectionalLight + HemisphereLight + AmbientLight)", () => {
  const { scene } = makeRig();
  const lights = scene.children.filter((c) => c && c.isLight);
  assert.equal(
    lights.length,
    3,
    `expected exactly 3 lights, got ${lights.length}`,
  );
  const types = lights.map((l) => l.type).slice().sort();
  assert.deepEqual(types, [
    "AmbientLight",
    "DirectionalLight",
    "HemisphereLight",
  ]);
});

test("first apply('noon') sets scene.environment to a PMREMTexture", () => {
  const { scene, rig } = makeRig();
  rig.apply("noon");
  assert.notEqual(scene.environment, null, "scene.environment should not be null");
  assert.equal(scene.environment.type, "PMREMTexture");
});

test("apply('dusk') yields a lower sun.intensity than apply('noon')", () => {
  const { scene: sceneNoon, rig: rigNoon } = makeRig();
  rigNoon.apply("noon");
  const sunNoon = findLight(sceneNoon, (c) => c.isDirectionalLight);
  assert.ok(sunNoon, "noon rig should expose a DirectionalLight");
  const noonIntensity = sunNoon.intensity;

  const { scene: sceneDusk, rig: rigDusk } = makeRig();
  rigDusk.apply("dusk");
  const sunDusk = findLight(sceneDusk, (c) => c.isDirectionalLight);
  assert.ok(sunDusk, "dusk rig should expose a DirectionalLight");
  const duskIntensity = sunDusk.intensity;

  assert.ok(
    duskIntensity < noonIntensity,
    `dusk sun.intensity (${duskIntensity}) must be less than noon sun.intensity (${noonIntensity})`,
  );
});

test("apply('overcast') ambient.intensity is at least apply('noon') ambient.intensity", () => {
  const { scene: sceneNoon, rig: rigNoon } = makeRig();
  rigNoon.apply("noon");
  const ambientNoon = findLight(sceneNoon, (c) => c.isAmbientLight);
  assert.ok(ambientNoon, "noon rig should expose an AmbientLight");
  const noonAmbientIntensity = ambientNoon.intensity;

  const { scene: sceneOvercast, rig: rigOvercast } = makeRig();
  rigOvercast.apply("overcast");
  const ambientOvercast = findLight(sceneOvercast, (c) => c.isAmbientLight);
  assert.ok(ambientOvercast, "overcast rig should expose an AmbientLight");
  const overcastAmbientIntensity = ambientOvercast.intensity;

  assert.ok(
    overcastAmbientIntensity >= noonAmbientIntensity,
    `overcast ambient.intensity (${overcastAmbientIntensity}) must be >= noon ambient.intensity (${noonAmbientIntensity})`,
  );
});

test("fitShadow frames the directional light shadow camera within the bounded box", () => {
  const { scene, rig } = makeRig();
  rig.apply("noon");
  const arenaHalfDiag = 18;
  const maxCasterHeight = 1.6;
  const elevation = Math.PI / 3;
  rig.fitShadow(arenaHalfDiag, maxCasterHeight, elevation);

  const sun = findLight(scene, (c) => c.isDirectionalLight);
  assert.ok(sun, "rig should expose a DirectionalLight after apply");
  const cam = sun.shadow.camera;
  const limit =
    arenaHalfDiag + maxCasterHeight * Math.tan(elevation) + 0.5;

  assert.ok(
    Math.abs(cam.left) <= limit,
    `|shadow.camera.left| (${Math.abs(cam.left)}) must be <= ${limit}`,
  );
  assert.ok(
    Math.abs(cam.right) <= limit,
    `|shadow.camera.right| (${Math.abs(cam.right)}) must be <= ${limit}`,
  );
  assert.ok(
    Math.abs(cam.top) <= limit,
    `|shadow.camera.top| (${Math.abs(cam.top)}) must be <= ${limit}`,
  );
  assert.ok(
    Math.abs(cam.bottom) <= limit,
    `|shadow.camera.bottom| (${Math.abs(cam.bottom)}) must be <= ${limit}`,
  );
});

test("snapshot() returns {preset, sunIntensity, shadowTexelsPerUnit, hemi:true}", () => {
  const { rig } = makeRig();
  rig.apply("noon");
  const snap = rig.snapshot();
  assert.ok(snap && typeof snap === "object", "snapshot() must return an object");
  assert.ok("preset" in snap, "snapshot must expose a 'preset' field");
  assert.ok(
    "sunIntensity" in snap,
    "snapshot must expose a 'sunIntensity' field",
  );
  assert.ok(
    "shadowTexelsPerUnit" in snap,
    "snapshot must expose a 'shadowTexelsPerUnit' field",
  );
  assert.equal(snap.hemi, true, "snapshot.hemi must be true");
  assert.equal(snap.preset, "noon");
});

test("shadow.mapSize.width and shadow.mapSize.height stay at 2048 across apply/fitShadow", () => {
  const { scene, rig } = makeRig();
  rig.apply("noon");
  rig.fitShadow(18, 1.6, Math.PI / 3);
  let sun = findLight(scene, (c) => c.isDirectionalLight);
  assert.ok(sun, "rig should expose a DirectionalLight after apply");
  assert.equal(sun.shadow.mapSize.width, 2048);
  assert.equal(sun.shadow.mapSize.height, 2048);

  rig.apply("dusk");
  sun = findLight(scene, (c) => c.isDirectionalLight);
  assert.equal(sun.shadow.mapSize.width, 2048);
  assert.equal(sun.shadow.mapSize.height, 2048);
});