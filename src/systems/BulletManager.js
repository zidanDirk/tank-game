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
      player: new THREE.MeshBasicMaterial({ color: 0x86fff1 }),
      enemy: new THREE.MeshBasicMaterial({ color: 0xff9470 }),
      boss: new THREE.MeshBasicMaterial({ color: 0xffb48a }),
    };
    this.trailMaterial = new THREE.LineBasicMaterial({
      color: 0x86fff1,
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
    const speed = 14 * (tank.bulletSpeedMultiplier ?? 1);
    const offsetX = vz * lateral;
    const offsetZ = vx * lateral;
    const b = {
      x: tank.x + offsetX,
      z: tank.z + offsetZ,
      vx: vx * speed,
      vz: vz * speed,
      team: tank.team,
      alive: true,
      life: 3,
      breakSteel: tank.breakSteel === true,
      ricochets: tank.ricochets ?? 0,
      damage: tank.damage ?? 1,
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
    if (
      hit.kind === "tile" &&
      hit.type === CELL.STEEL &&
      !b.breakSteel &&
      b.ricochets > 0 &&
      (hit.normal?.x || hit.normal?.z)
    ) {
      b.ricochets--;
      if (hit.normal.x) b.vx *= -1;
      if (hit.normal.z) b.vz *= -1;
      b.x += hit.normal.x * 0.001;
      b.z += hit.normal.z * 0.001;
      this.disposeTrail(b);
      this.attachTrail(b);
      b.trailLife = 0;
      this.game.effects.burst(b.x, 0.87, b.z, 0x9d83fa, 10, 0.3);
      this.game.audio.play("shield");
      return;
    }
    b.alive = false;
    this.disposeTrail(b);
    if (hit.kind === "tank") hit.tank.hit(b.damage ?? 1);
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
    if (hit) {
      this.impact(b, hit);
      if (b.alive) {
        const remaining =
          (Math.hypot(dx, dz) * (1 - hit.time)) / Math.hypot(b.vx, b.vz);
        this.advance(b, b.vx * remaining, b.vz * remaining);
      }
    }
    b.mesh.position.set(b.x, 0.87, b.z);
  }
  tick(dt) {
    // Resolve events in time order, re-sweeping after a reflection. This also
    // catches bullet/bullet contacts on the reflected part of the same step.
    const map = this.game.map;
    for (const b of this.items) {
      b.life -= dt;
      if (b.life <= 0) b.alive = false;
    }
    let remaining = dt;
    for (let events = 0; remaining > 1e-8 && events < 128; events++) {
      const live = this.items.filter((b) => b.alive);
      let first = null;
      for (const b of live) {
        const hit = this.game.collision.trace(
          b,
          b.vx * remaining,
          b.vz * remaining,
        );
        if (hit && (!first || hit.time < first.time))
          first = { time: hit.time, a: b, hit };
      }
      for (let i = 0; i < live.length; i++)
        for (let j = i + 1; j < live.length; j++) {
          const a = live[i],
            b = live[j];
          const t = segmentBox(
            a.x - b.x,
            a.z - b.z,
            (a.vx - b.vx) * remaining,
            (a.vz - b.vz) * remaining,
            -0.22,
            -0.22,
            0.22,
            0.22,
          );
          if (t !== null && (!first || t < first.time))
            first = { time: t, a, b };
        }
      const elapsed = remaining * (first?.time ?? 1);
      for (const b of live) {
        b.x += b.vx * elapsed;
        b.z += b.vz * elapsed;
        b.mesh.position.set(b.x, 0.87, b.z);
      }
      remaining -= elapsed;
      if (!first) break;
      if (first.b) {
        first.a.alive = first.b.alive = false;
        this.game.effects.burst(first.a.x, 0.87, first.a.z, 0xffe8a6, 7, 0.4);
      } else this.impact(first.a, first.hit);
      if (this.game.state !== "playing" || this.game.map !== map) break;
    }
    this.items = this.items.filter((b) => {
      if (!b.alive) {
        b.mesh.removeFromParent();
        this.disposeTrail(b);
      } else {
        b.mesh.position.set(b.x, 0.87, b.z);
        if (b.team === "player") this.updateTrail(b, dt);
      }
      return b.alive;
    });
  }
  clearHostileInRadius(x, z, radius) {
    this.items = this.items.filter((b) => {
      if (b.team === "player" || Math.hypot(b.x - x, b.z - z) > radius)
        return true;
      b.alive = false;
      b.mesh.removeFromParent();
      this.disposeTrail(b);
      return false;
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
