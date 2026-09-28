import * as THREE from "three";

// One reusable line buffer per enemy; warning paths obey projectile collision.
export class AttackTelegraph {
  constructor(game, color) {
    this.game = game;
    this.positions = new Float32Array(30);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3),
    );
    this.material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    this.line = new THREE.LineSegments(this.geometry, this.material);
    this.line.frustumCulled = false;
    this.line.renderOrder = 6;
    this.line.visible = false;
    game.scene.add(this.line);
  }
  show(tank, angles, distance = 22) {
    angles.forEach((angle, i) => {
      const dx = Math.sin(angle) * distance,
        dz = -Math.cos(angle) * distance;
      const hit = this.game.collision.trace(
        { x: tank.x, z: tank.z, team: "enemy" },
        dx,
        dz,
      );
      this.positions.set(
        [
          tank.x,
          0.1,
          tank.z,
          tank.x + dx * (hit?.time ?? 1),
          0.1,
          tank.z + dz * (hit?.time ?? 1),
        ],
        i * 6,
      );
    });
    this.geometry.setDrawRange(0, angles.length * 2);
    this.geometry.attributes.position.needsUpdate = true;
    this.material.opacity = this.game.reducedMotion
      ? 0.9
      : 0.65 + 0.3 * Math.sin(this.game.time * 14) ** 2;
    this.line.visible = true;
  }
  hide() {
    this.line.visible = false;
  }
  dispose() {
    this.line.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
