import { Vector2 } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// One persistent pipeline; flow mode releases all postprocessing GPU buffers.
export class NeonRenderer {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = "low";
    this.composer = null;
  }
  setQuality(quality) {
    const next = quality === "high" ? "high" : "low";
    if (next === this.quality) return;
    this.quality = next;
    if (next === "low") {
      for (const pass of this.composer.passes) pass.dispose?.();
      this.composer.dispose();
      this.composer = null;
      return;
    }
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new UnrealBloomPass(new Vector2(1, 1), 0.42, 0.35, 1.1),
    );
    this.composer.addPass(new OutputPass());
    const size = this.renderer.getSize(new Vector2());
    this.resize(size.x, size.y);
  }
  resize(width, height) {
    this.composer?.setSize(width, height);
  }
  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
