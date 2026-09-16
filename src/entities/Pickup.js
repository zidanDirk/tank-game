import * as THREE from "three";
import { POWERUP_LIFE, POWERUP_PULL_SPEED } from "../core/config.js";
import { PICKUP_FACTORIES } from "../world/models.js";

const CENTER = new THREE.Vector3(13, 0.9, 13);
const HIDDEN_Y = -10;

export class Pickup {
  constructor(scene, type, x, z, rng) {
    this.type = type;
    this.x = x;
    this.z = z;
    this.life = POWERUP_LIFE;
    this.maxLife = POWERUP_LIFE;
    this.rng = rng;
    this.root = PICKUP_FACTORIES[type]();
    this.root.position.set(x, 0.9, z);
    scene.add(this.root);
    this.spark = this.root.userData.spark ?? null;
    this.spin = this.root.userData.spin ?? 0.5;
  }
  tick(dt) {
    this.life -= dt;
    // Drift toward map centre as time runs out.
    const dx = CENTER.x - this.x;
    const dz = CENTER.z - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.01) {
      const step = Math.min(dist, POWERUP_PULL_SPEED * dt);
      this.x += (dx / dist) * step;
      this.z += (dz / dist) * step;
    }
    this.root.position.set(this.x, 0.9, this.z);
    this.root.rotation.y += this.spin * dt;
    if (this.spark) {
      this.spark.scale.setScalar(0.7 + Math.sin(this.life * 12) * 0.4);
      this.spark.material.opacity = 0.7 + Math.sin(this.life * 12) * 0.3;
    }
    const fade = this.life < 1.5 ? this.life / 1.5 : 1;
    this.root.scale.setScalar(0.9 + fade * 0.1);
    this.root.traverse((o) => {
      if (o.material && o.material.transparent !== true && fade < 1) {
        o.material.transparent = true;
      }
      if (o.material && "opacity" in o.material) {
        o.material.opacity = Math.min(o.material.opacity ?? 1, fade);
      }
    });
  }
  tryCollect(player, radius = 0.6) {
    if (!player || !player.alive) return false;
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    if (Math.abs(dx) < radius && Math.abs(dz) < radius) return true;
    return false;
  }
  dispose() {
    this.root.traverse((o) => {
      if (o.material && o.material !== this.spark?.material) {
        // MeshStandardMaterial etc. belong to this pickup only;
        // MeshBasicMaterial on the spark may be shared elsewhere.
        o.material.dispose();
      }
      if (o.geometry) o.geometry.dispose();
    });
    this.root.position.y = HIDDEN_Y;
    this.root.removeFromParent();
  }
}
