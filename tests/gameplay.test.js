import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { MapManager } from "../src/world/MapManager.js";
import { CollisionSystem } from "../src/systems/CollisionSystem.js";
import { BulletManager } from "../src/systems/BulletManager.js";
import { Tank, EnemyTank } from "../src/entities/Tank.js";
import { CELL, seededRandom } from "../src/core/config.js";
function fixture() {
  const g = {
    scene: new THREE.Scene(),
    rng: seededRandom(1990),
    state: "playing",
    time: 4,
    tanks: [],
    effects: {
      burst() {},
      explode() {},
      smoke() {},
      shake() {},
      shakeOffset() {
        return { x: 0, z: 0 };
      },
      shakeReset() {},
    },
    scorePopup() {},
    audio: { play() {} },
    destroyed: [],
    onTankDestroyed(t) {
      this.destroyed.push(t);
    },
    finish(won) {
      this.state = won ? "won" : "lost";
    },
  };
  g.map = new MapManager(g.scene);
  g.collision = new CollisionSystem(g.map, () => g.tanks);
  g.bullets = new BulletManager(g);
  return g;
}
function shell(g, x, z, vx, vz, team = "player") {
  const b = {
    x,
    z,
    vx,
    vz,
    team,
    alive: true,
    life: 4,
    mesh: new THREE.Mesh(),
  };
  g.bullets.items.push(b);
  return b;
}
function tank(g, type, x, z) {
  const t = new Tank(g, type, x, z);
  t.invincible = 0;
  g.tanks.push(t);
  return t;
}
test("procedural map and eagle initialize; destroying brick opens exactly that cell", () => {
  const g = fixture();
  assert.equal(g.map.get(3, 5), CELL.BRICK);
  assert.ok(g.map.eagle.children.length);
  assert.equal(g.map.destroyBrick(3, 5), true);
  assert.equal(g.map.get(3, 5), CELL.EMPTY);
  assert.equal(g.map.get(4, 5), CELL.BRICK);
  assert.equal(g.map.destroyBrick(3, 5), false);
  g.map.dispose();
});
test("shell sweeps destroy a brick without penetrating the next row; steel survives", () => {
  const g = fixture();
  shell(g, 3.5, 4, 0, 14);
  g.bullets.tick(0.15);
  assert.equal(g.map.get(3, 5), CELL.EMPTY);
  assert.equal(g.map.get(3, 6), CELL.BRICK);
  assert.equal(g.bullets.items.length, 0);
  shell(g, 10.5, 10, 0, 14);
  g.bullets.tick(0.15);
  assert.equal(g.map.get(10, 11), CELL.STEEL);
  assert.equal(g.bullets.items.length, 0);
});
test("heavy tank survives two direct hits, is destroyed on the third, and scores once", () => {
  const g = fixture(),
    t = tank(g, "heavy", 9.5, 7.5);
  for (let i = 0; i < 3; i++) {
    shell(g, 9.5, 5.5, 0, 14);
    g.bullets.tick(0.15);
    assert.equal(t.hp, 2 - i);
    assert.equal(t.alive, i < 2);
  }
  assert.equal(g.destroyed.length, 1);
  t.hit();
  assert.equal(g.destroyed.length, 1);
});
test("spawn protection absorbs damage and an unprotected light tank dies in one hit", () => {
  const g = fixture(),
    t = tank(g, "light", 9.5, 7.5);
  t.invincible = 1;
  t.hit();
  assert.equal(t.hp, 1);
  t.invincible = 0;
  t.hit();
  assert.equal(t.alive, false);
});
test("opposing and same-team crossing shells cancel under relative swept collision", () => {
  for (const teams of [
    ["player", "enemy"],
    ["enemy", "enemy"],
  ]) {
    const g = fixture();
    shell(g, 9.5, 3.5, 14, 0, teams[0]);
    shell(g, 10.5, 3.5, -14, 0, teams[1]);
    g.bullets.tick(0.1);
    assert.equal(g.bullets.items.length, 0);
  }
});
test("water passes shells but a shell from either team destroys the base", () => {
  const g = fixture();
  const b = shell(g, 2.5, 11.5, 14, 0);
  g.bullets.tick(0.4);
  assert.equal(b.alive, true);
  assert.ok(b.x > 8);
  for (const team of ["player", "enemy"]) {
    const f = fixture();
    shell(f, 12.5, 24.5, 0, -14, team);
    f.bullets.tick(0.1);
    assert.equal(f.state, "lost");
    assert.equal(f.map.base.alive, false);
  }
});
test("a wall intercepts a bullet before a crossing bullet pair can cancel behind it", () => {
  const g = fixture();
  shell(g, 3.5, 4.5, 0, 14);
  shell(g, 3.5, 6.5, 0, -14, "enemy");
  g.bullets.tick(0.15);
  assert.equal(g.map.get(3, 5), CELL.EMPTY);
  assert.equal(g.bullets.items.length, 0);
});
test("AI patrol remains within free cells through long fixed-step simulation", () => {
  const g = fixture();
  g.player = { x: 9.5, z: 23.5 };
  g.bullets.fire = () => {};
  for (const [i, type] of ["light", "heavy", "rapid"].entries()) {
    const t = new EnemyTank(g, type, [2.5, 12.5, 23.5][i], 2.5);
    g.tanks.push(t);
  }
  const start = g.tanks.map((t) => ({ x: t.x, z: t.z }));
  let distance = 0;
  for (let i = 0; i < 3600; i++) {
    g.time += 1 / 60;
    for (const t of g.tanks) {
      const x = t.x,
        z = t.z;
      t.tick(1 / 60);
      distance += Math.hypot(t.x - x, t.z - z);
      assert.ok(g.collision.canMove(t, t.x, t.z));
    }
  }
  assert.ok(distance > 100);
  assert.ok(
    g.tanks.some((t, i) => Math.hypot(t.x - start[i].x, t.z - start[i].z) > 2),
  );
});

import { GameManager } from "../src/core/GameManager.js";
test("twelve scored kills win the mission; the third lost player life ends it", () => {
  const g = {
    score: 0,
    kills: 0,
    lives: 3,
    state: "playing",
    killStreak: 0,
    streakMult: 1,
    effects: {
      burst() {},
      shake() {},
      shakeOffset() {
        return { x: 0, z: 0 };
      },
    },
    scorePopup() {},
    updateUI() {},
    flashDeathGrayscale() {},
    finish(won) {
      this.state = won ? "won" : "lost";
    },
  };
  for (let i = 0; i < 12; i++)
    GameManager.prototype.onTankDestroyed.call(g, {
      team: "enemy",
      score: 100,
    });
  assert.equal(g.kills, 12);
  assert.equal(g.score, 1200);
  assert.equal(g.state, "won");
  g.state = "playing";
  for (let i = 0; i < 3; i++)
    GameManager.prototype.onTankDestroyed.call(g, { team: "player" });
  assert.equal(g.lives, 0);
  assert.equal(g.state, "lost");
  assert.equal(g.respawnTimer, 1.4);
});
test("turning aligns the tank with the next lane instead of teleporting through obstacles", () => {
  const g = fixture(),
    p = tank(g, "player", 9.5, 20.8);
  const before = { x: p.x, z: p.z };
  p.move(1, 1 / 60);
  assert.equal(p.x, before.x);
  assert.ok(Math.abs(p.z - before.z) <= p.speed / 60 + 1e-9);
  for (let i = 0; i < 30; i++) p.move(1, 1 / 60);
  assert.ok(p.x > 9.5);
  assert.equal(p.z, 20.5);
  assert.ok(g.collision.canMove(p, p.x, p.z));
});
