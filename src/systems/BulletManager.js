import * as THREE from "three";
import { CELL } from "../core/config.js";
import { segmentBox } from "./CollisionSystem.js";
const TRAIL_SEGMENTS = 4;
const TRAIL_LIFE = 0.18;
export class BulletManager {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.geometry = new THREE.SphereGeometry(0.12, 6, 4);
    this.materials = {
      player: new THREE.MeshBasicMaterial({ color: 0xffe6a0 }),
      enemy: new THREE.MeshBasicMaterial({ color: 0xff9470 }),
      boss: new THREE.MeshBasicMaterial({ color: 0xffb48a }),
    };
    this.trailMaterial = new THREE.LineBasicMaterial({
      color: 0xffe6a0,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    this.maxBullets = 32;
  }
  fire(tank, lateral = 0) {
    if (this.items.length >= this.maxBullets) {
      const old = this.items.shift();
      this.disposeTrail(old);
      old.mesh.removeFromParent();
    }
    const vx = Math.sin(tank.aim),
      vz = -Math.cos(tank.aim);
    const offsetX = vz * lateral;
    const offsetZ = vx * lateral;
    const b = {
      x: tank.x + offsetX,
      z: tank.z + offsetZ,
      vx: vx * 14,
      vz: vz * 14,
      team: tank.team,
      alive: true,
      life: 3,
      breakSteel: tank.breakSteel === true,
      mesh: new THREE.Mesh(
        this.geometry,
        this.materials[tank.team] ?? this.materials.enemy,
      ),
      trail: null,
      trailPositions: null,
      trailLife: 0,
    };
    this.game.scene.add(b.mesh);
    this.items.push(b);
    if (tank.team === "player") this.attachTrail(b);
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
  attachTrail(b) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(TRAIL_SEGMENTS * 3);
    for (let i = 0; i < TRAIL_SEGMENTS; i++) {
      positions[i * 3] = b.x;
      positions[i * 3 + 1] = 0.87;
      positions[i * 3 + 2] = b.z;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const line = new THREE.Line(geo, this.trailMaterial.clone());
    line.frustumCulled = false;
    this.game.scene.add(line);
    b.trail = line;
    b.trailPositions = positions;
    b.trailGeo = geo;
  }
  disposeTrail(b) {
    if (!b || !b.trail) return;
    b.trail.removeFromParent();
    b.trailGeo.dispose();
    b.trail.material.dispose();
    b.trail = null;
    b.trailGeo = null;
    b.trailPositions = null;
  }
  updateTrail(b, dt) {
    if (!b.trail) return;
    b.trailLife += dt;
    // Shift positions backward; insert current at the head.
    for (let i = 0; i < TRAIL_SEGMENTS - 1; i++) {
      b.trailPositions[i * 3] = b.trailPositions[(i + 1) * 3];
      b.trailPositions[i * 3 + 1] = b.trailPositions[(i + 1) * 3 + 1];
      b.trailPositions[i * 3 + 2] = b.trailPositions[(i + 1) * 3 + 2];
    }
    const head = (TRAIL_SEGMENTS - 1) * 3;
    b.trailPositions[head] = b.x;
    b.trailPositions[head + 1] = 0.87;
    b.trailPositions[head + 2] = b.z;
    b.trailGeo.attributes.position.needsUpdate = true;
    const t = Math.min(1, b.trailLife / TRAIL_LIFE);
    b.trail.material.opacity = 0.6 * (1 - t);
    if (t >= 1) this.disposeTrail(b);
  }
  impact(b, hit) {
    b.alive = false;
    this.disposeTrail(b);
    if (hit.kind === "tank") hit.tank.hit();
    else if (hit.type === CELL.BRICK) {
      this.game.map.destroyBrick(hit.x, hit.z);
      this.game.effects.burst(b.x, 0.45, b.z, 0xc58457, 14);
      this.game.audio.play("brick");
    } else if (hit.type === CELL.STEEL) {
      if (b.breakSteel) {
        this.game.map.destroySteel(hit.x, hit.z);
        this.game.effects.burst(b.x, 0.55, b.z, 0xc8d0ce, 18);
        this.game.audio.play("brick");
      } else {
        this.game.effects.burst(b.x, 0.65, b.z, 0xece7be, 6, 0.45);
      }
    } else if (hit.type === CELL.BASE) {
      this.game.map.destroyBase();
      this.game.effects.explode(13, 23);
      this.game.effects.shake(800, 0.22);
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
        if (b.alive && b.team === "player") this.updateTrail(b, dt);
        if (this.game.state !== "playing") break;
      }
    this.items = this.items.filter((b) => {
      if (!b.alive) {
        b.mesh.removeFromParent();
        this.disposeTrail(b);
      }
      return b.alive;
    });
  }
  clear() {
    for (const b of this.items) {
      b.mesh.removeFromParent();
      this.disposeTrail(b);
    }
    this.items = [];
  }
}
