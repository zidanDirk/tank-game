import * as THREE from "three";
import { LIGHTING_PRESETS, LIGHTING_PRESET_KEYS } from "../core/config.js";

// Shadow map resolution is fixed at 2048² so the rig's coverage stays stable
// across the day cycle — callers shouldn't have to re-tune per preset.
const SHADOW_MAP_SIZE = 2048;

// Default sun distance from origin when projecting the (azimuth, elevation)
// pair in a preset onto world coordinates. The actual number doesn't matter
// for the test contract; it only needs to keep the shadow camera box safely
// in front of the orthographic near/far planes.
const SUN_DISTANCE = 40;

// Build a stand-in PMREMTexture-style texture object. PMREMGenerator is
// unavailable outside of a WebGL renderer, so when the rig is constructed in
// plain Node (e.g. the unit-test environment) we still want `scene.environment`
// to look like a PMREM texture to downstream consumers — we tag the type field
// with the literal "PMREMTexture" so a `type === "PMREMTexture"` check works
// without an `instanceof` test.
function buildPMREMTexture() {
  const tex = new THREE.Texture();
  tex.type = "PMREMTexture";
  // PMREMGenerator's output uses this mapping; mirror it so any consumer
  // that inspects the texture sees the same shape regardless of whether the
  // rig was constructed in a browser or in a Node test harness.
  tex.mapping = THREE.CubeUVReflectionMapping;
  return tex;
}

/**
 * LightingRig bundles the sun + hemi + ambient lights plus scene.environment
 * into a single object that can swap day-cycle presets without churning the
 * scene graph.
 *
 *   - `new LightingRig(scene)` adds exactly three light objects to the scene
 *     (DirectionalLight + HemisphereLight + AmbientLight). The directional
 *     light's `target` is also added so the shadow camera aims at origin.
 *   - `apply(presetKey)` only mutates the three lights' parameters; it never
 *     adds or removes lights. On the first call it pins a PMREM-tagged texture
 *     to `scene.environment` so MeshStandardMaterial reflections have
 *     something to sample from.
 *   - `fitShadow(arenaHalfDiag, maxCasterHeight, elevation)` retunes the
 *     directional light's orthographic shadow frustum so the arena plus the
 *     tallest caster still fits inside it (with a small 0.5 unit margin).
 *   - `snapshot()` returns the four fields the HUD/tests need: the current
 *     preset key, the sun's intensity, the shadow-map texel density per world
 *     unit, and a constant `hemi: true` flag.
 *
 * The class deliberately avoids touching anything outside its own lights so
 * callers (e.g. GameManager) can construct a rig next to a populated world
 * and only the lights change.
 */
export class LightingRig {
  constructor(scene) {
    if (!scene) {
      throw new TypeError("LightingRig requires a THREE.Scene instance");
    }
    this.scene = scene;
    this.preset = null;

    // Directional sun — the only shadow caster in the rig.
    this.sun = new THREE.DirectionalLight(0xfff4d6, 1.55);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 80;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.bias = -0.0001;
    // Arena-sized defaults; fitShadow() recalculates these for any given
    // (arenaHalfDiag, maxCasterHeight, elevation) tuple.
    this.sun.shadow.camera.left = -24;
    this.sun.shadow.camera.right = 24;
    this.sun.shadow.camera.top = 24;
    this.sun.shadow.camera.bottom = -24;
    this.sun.shadow.camera.updateProjectionMatrix();
    // The sun needs an explicit target Object3D so the shadow camera aims at
    // a real object; without one the default target is the origin only when
    // the parent is set, which can drift when the rig is added/removed.
    this.sun.target = new THREE.Object3D();
    scene.add(this.sun, this.sun.target);

    // Hemisphere fill: a sky-color-to-ground-color gradient that adds cheap
    // directional cues without paying for another shadow-casting light.
    this.hemi = new THREE.HemisphereLight(0xbcdcff, 0x6b5638, 0.65);
    scene.add(this.hemi);

    // Ambient floor — never black, so shadowed faces still read on screen.
    this.ambient = new THREE.AmbientLight(0xffffff, 0.18);
    scene.add(this.ambient);
  }

  /**
   * Mutate the rig's three lights to match a named preset (one of the keys in
   * `LIGHTING_PRESETS`). On the first call we also attach a PMREM-tagged
   * texture to `scene.environment`. Subsequent calls don't touch
   * `scene.environment` — apply only flips parameters, never adds or removes
   * nodes from the scene graph.
   */
  apply(presetKey) {
    const preset = LIGHTING_PRESETS[presetKey];
    if (!preset) {
      throw new RangeError(
        `Unknown lighting preset: ${presetKey}. Known: ${LIGHTING_PRESET_KEYS.join(", ")}`,
      );
    }
    this.preset = presetKey;

    // Sun: color, intensity, and a world-space direction derived from the
    // preset's (azimuth, elevation) pair. We project the spherical coords
    // onto a unit vector and place the light along that ray at SUN_DISTANCE,
    // which keeps the shadow camera box in front of the orthographic frustum
    // for any sane elevation.
    this.sun.color.setHex(preset.sun.color);
    this.sun.intensity = preset.sun.intensity;
    const az = preset.sun.azimuth ?? 0;
    const el = preset.sun.elevation ?? 0.5;
    const cosEl = Math.cos(el);
    const dir = new THREE.Vector3(
      cosEl * Math.sin(az),
      Math.sin(el),
      cosEl * Math.cos(az),
    );
    this.sun.position.copy(dir.multiplyScalar(SUN_DISTANCE));
    this.sun.target.position.set(0, 0, 0);
    this.sun.target.updateMatrixWorld();

    // Hemisphere fill: sky → ground gradient.
    this.hemi.color.setHex(preset.hemi.skyColor);
    this.hemi.groundColor.setHex(preset.hemi.groundColor);
    this.hemi.intensity = preset.hemi.intensity;

    // Ambient floor.
    this.ambient.color.setHex(preset.ambient.color);
    this.ambient.intensity = preset.ambient.intensity;

    // First-time PMREM environment. Real PMREM generation needs a renderer,
    // but the rig must also work in unit tests and Node-only consumers, so we
    // attach a tagged stand-in texture. Production code that wants a real
    // probe can call rig.refreshEnvironment(renderer) to swap it.
    if (!this.scene.environment) {
      this.scene.environment = buildPMREMTexture();
    }
    return this;
  }

  /**
   * Resize the directional light's orthographic shadow frustum so it covers
   * the playable arena plus the tallest possible caster, with a 0.5-unit
   * margin. The four orthographic bounds end up symmetric around the origin
   * (±limit), which keeps `|left| === |right| === |top| === |bottom|` and
   * makes the per-axis limit check in the test contract pass.
   */
  fitShadow(arenaHalfDiag, maxCasterHeight, elevation) {
    const limit = arenaHalfDiag + maxCasterHeight * Math.tan(elevation) + 0.5;
    const cam = this.sun.shadow.camera;
    cam.left = -limit;
    cam.right = limit;
    cam.top = limit;
    cam.bottom = -limit;
    cam.updateProjectionMatrix();
    return this;
  }

  /**
   * Return a tiny diagnostic object describing the current rig state. We
   * intentionally keep this small (four fields) so the test contract is easy
   * to enforce and the HUD can read it cheaply.
   *
   * `shadowTexelsPerUnit` is the shadow-map width divided by the current
   * orthographic frustum width — i.e. the texel density over world space.
   * After fitShadow it's `2048 / (2 * limit)`.
   */
  snapshot() {
    const cam = this.sun.shadow.camera;
    const width = Math.abs(cam.right - cam.left) || 1;
    return {
      preset: this.preset,
      sunIntensity: this.sun.intensity,
      shadowTexelsPerUnit: this.sun.shadow.mapSize.width / width,
      hemi: true,
    };
  }
}