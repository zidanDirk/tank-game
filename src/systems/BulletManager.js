import * as THREE from "three";
import { CELL } from "../core/config.js";
import { segmentBox } from "./CollisionSystem.js";
export class BulletManager {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.geometry = new THREE.SphereGeometry(0.12, 6, 4);
    this.materials = {
      player: new THREE.MeshBasicMaterial({ color: 0xffe6a0 }),
      enemy: new THREE.MeshBasicMaterial({ color: 0xff9470 }),
    };
  }
  fire(tank) {
    const vx = Math.sin(tank.aim),
      vz = -Math.cos(tank.aim);
    // Start within the hull and sweep to the muzzle on this same simulation step.
    const b = {
      x: tank.x,
      z: tank.z,
      vx: vx * 14,
      vz: vz * 14,
      team: tank.team,
      alive: true,
      life: 3,
      mesh: new THREE.Mesh(this.geometry, this.materials[tank.team]),
    };
    this.game.scene.add(b.mesh);
    this.items.push(b);
    this.advance(b, vx * 0.94, vz * 0.94);
    this.game.effects.burst(
      tank.x + vx * 0.95,
      0.87,
      tank.z + vz * 0.95,
      0xffd68b,
      4,
      0.3,
    );
  }
  impact(b, hit) {
    b.alive = false;
    if (hit.kind === "tank") hit.tank.hit();
    else if (hit.type === CELL.BRICK) {
      this.game.map.destroyBrick(hit.x, hit.z);
      this.game.effects.burst(b.x, 0.45, b.z, 0xc58457, 14);
      this.game.audio.play("brick");
    } else if (hit.type === CELL.BASE) {
      this.game.map.destroyBase();
      this.game.effects.explode(13, 23);
      this.game.audio.play("explosion");
      this.game.finish(false, "基地被击毁。下次请优先拦截通往老鹰的炮弹。");
    } else this.game.effects.burst(b.x, 0.65, b.z, 0xece7be, 6, 0.45);
  }
  advance(b, dx, dz) {
    const hit = this.game.collision.trace(b, dx, dz);
    b.x += dx * (hit ? hit.time : 1);
    b.z += dz * (hit ? hit.time : 1);
    if (hit) this.impact(b, hit);
    b.mesh.position.set(b.x, 0.87, b.z);
  }
  tick(dt) {
    // Resolve simultaneous bullet trajectories by relative sweep, before advancing either projectile.
    const contacts = [];
    const terrain = new Map();
    for (const b of this.items)
      if (b.alive)
        terrain.set(b, this.game.collision.trace(b, b.vx * dt, b.vz * dt));
    for (let i = 0; i < this.items.length; i++)
      for (let j = i + 1; j < this.items.length; j++) {
        const a = this.items[i],
          b = this.items[j];
        if (!a.alive || !b.alive) continue;
        const t = segmentBox(
          a.x - b.x,
          a.z - b.z,
          (a.vx - b.vx) * dt,
          (a.vz - b.vz) * dt,
          -0.22,
          -0.22,
          0.22,
          0.22,
        );
        if (
          t !== null &&
          t < (terrain.get(a)?.time ?? Infinity) &&
          t < (terrain.get(b)?.time ?? Infinity)
        )
          contacts.push({ a, b, t });
      }
    contacts.sort((a, b) => a.t - b.t);
    for (const { a, b, t } of contacts)
      if (a.alive && b.alive) {
        a.alive = b.alive = false;
        this.game.effects.burst(
          a.x + a.vx * dt * t,
          0.87,
          a.z + a.vz * dt * t,
          0xffe8a6,
          7,
          0.4,
        );
      }
    for (const b of this.items)
      if (b.alive) {
        b.life -= dt;
        if (b.life <= 0) b.alive = false;
        else this.advance(b, b.vx * dt, b.vz * dt);
        if (this.game.state !== "playing") break;
      }
    this.items = this.items.filter((b) => {
      if (!b.alive) b.mesh.removeFromParent();
      return b.alive;
    });
  }
  clear() {
    for (const b of this.items) b.mesh.removeFromParent();
    this.items = [];
  }
}
