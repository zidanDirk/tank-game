import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CELL, seededRandom } from "../src/core/config.js";
import { CollisionSystem } from "../src/systems/CollisionSystem.js";
import { BulletManager } from "../src/systems/BulletManager.js";
import { RunUpgradeSystem } from "../src/systems/RunUpgradeSystem.js";
import { activateEMP, EMP } from "../src/systems/EMPSystem.js";
import { Tank } from "../src/entities/Tank.js";
import { MapManager } from "../src/world/MapManager.js";

function fixture(tiles = []) {
  const cells = new Map(tiles.map(([x, z, t]) => [`${x},${z}`, t]));
  const game = {
    scene: new THREE.Scene(),
    state: "playing",
    mode: "endless",
    time: 10,
    empCooldownLeft: 0,
    player: { x: 2, z: 2, alive: true },
    enemies: [],
    effects: { burst() {}, pulse() {}, explode() {}, shake() {} },
    audio: { play() {} },
    map: {
      get: (x, z) => cells.get(`${x},${z}`) ?? CELL.EMPTY,
      destroySteel: (x, z) => cells.delete(`${x},${z}`),
      destroyBrick: (x, z) => cells.delete(`${x},${z}`),
      destroyBase() {
        this.destroyed = true;
      },
    },
    finish() {
      this.state = "lost";
    },
  };
  game.collision = new CollisionSystem(game.map, () => game.enemies);
  game.bullets = new BulletManager(game);
  return game;
}
function shell(game, x, z, vx, vz, opts = {}) {
  const b = {
    x,
    z,
    vx,
    vz,
    team: "player",
    ricochets: 1,
    alive: true,
    life: 3,
    mesh: new THREE.Mesh(),
    ...opts,
  };
  game.scene.add(b.mesh);
  game.bullets.items.push(b);
  return b;
}

test("ricochet consumes one reflection and spends the remaining step travelling away from steel", () => {
  const g = fixture([[4, 1, CELL.STEEL]]);
  const b = shell(g, 3, 1.5, 10, 0);
  g.bullets.tick(0.2);
  assert.equal(b.alive, true);
  assert.equal(b.ricochets, 0);
  assert.equal(b.vx, -10);
  assert.ok(Math.abs(b.x - 2.799) < 1e-6);
  assert.equal(g.map.get(4, 1), CELL.STEEL);
  g.bullets.clear();
});

test("ricochet reflects diagonal velocity using the struck face and handles corners", () => {
  const g = fixture([[4, 2, CELL.STEEL]]);
  const b = shell(g, 3, 2.2, 10, 2);
  g.bullets.tick(0.1);
  assert.equal(b.vx, -10);
  assert.equal(b.vz, 2);
  g.bullets.clear();
  const corner = fixture([[4, 4, CELL.STEEL]]);
  const c = shell(corner, 3, 3, 10, 10);
  corner.bullets.tick(0.1);
  assert.equal(c.vx, -10);
  assert.equal(c.vz, -10);
  corner.bullets.clear();
});

test("second steel impact absorbs the shell; upgraded steel destruction takes priority", () => {
  const g = fixture([
    [4, 1, CELL.STEEL],
    [1, 1, CELL.STEEL],
  ]);
  const b = shell(g, 3, 1.5, 10, 0);
  g.bullets.tick(0.3);
  assert.equal(b.alive, false);
  assert.equal(g.bullets.items.length, 0);
  const upgraded = shell(g, 3, 1.5, 10, 0, { breakSteel: true });
  g.bullets.tick(0.1);
  assert.equal(upgraded.alive, false);
  assert.equal(g.map.get(4, 1), CELL.EMPTY);
});

test("reflected shells still damage the base and ignore friendly tanks", () => {
  const g = fixture([
    [4, 1, CELL.STEEL],
    [1, 1, CELL.BASE],
  ]);
  let hit = false;
  g.enemies.push({
    team: "player",
    alive: true,
    x: 2.5,
    z: 1.5,
    radius: 0.46,
    hit() {
      hit = true;
    },
  });
  shell(g, 3, 1.5, 10, 0);
  g.bullets.tick(0.3);
  assert.equal(hit, false);
  assert.equal(g.map.destroyed, true);
  assert.equal(g.state, "lost");
});

test("bullet collisions are re-swept after a reflection within the same tick", () => {
  const g = fixture([[4, 1, CELL.STEEL]]);
  const a = shell(g, 3, 1.5, 10, 0);
  const b = shell(g, 2, 1.5, 8, 0, { team: "enemy", ricochets: 0 });
  g.bullets.tick(0.2);
  assert.equal(a.alive, false);
  assert.equal(b.alive, false);
  assert.equal(g.bullets.items.length, 0);
});

test("EMP respects range, team, cooldown, mode and game state; boss stun is reduced", () => {
  const g = fixture();
  const near = shell(g, 3, 2, 1, 0, { team: "enemy" });
  const far = shell(g, 7, 2, 1, 0, { team: "enemy" });
  const friendly = shell(g, 2, 2, 1, 0);
  g.enemies = [
    { x: 3, z: 2, alive: true, type: "light", frozenUntil: 0 },
    { x: 2, z: 3, alive: true, type: "boss", frozenUntil: 0 },
    { x: 8, z: 2, alive: true, type: "heavy", frozenUntil: 0 },
  ];
  assert.equal(activateEMP(g), true);
  assert.equal(near.alive, false);
  assert.deepEqual(g.bullets.items, [far, friendly]);
  assert.equal(g.enemies[0].frozenUntil, 12);
  assert.equal(g.enemies[1].frozenUntil, 10 + EMP.bossStun);
  assert.equal(g.enemies[2].frozenUntil, 0);
  assert.equal(g.empCooldownLeft, 12);
  assert.equal(activateEMP(g), false);
  g.empCooldownLeft = 0;
  g.state = "paused";
  assert.equal(activateEMP(g), false);
  g.state = "playing";
  g.mode = "campaign";
  assert.equal(activateEMP(g), false);
  g.mode = "endless";
  g.player.alive = false;
  assert.equal(activateEMP(g), false);
  g.player.alive = true;
  g.enemies[0].frozenUntil = 20;
  assert.equal(activateEMP(g), true);
  assert.equal(
    g.enemies[0].frozenUntil,
    20,
    "EMP must not shorten a clock freeze",
  );
  g.bullets.clear();
});

test("the new module is offered only in endless and disappears after selection", () => {
  const upgrades = new RunUpgradeSystem();
  assert.equal(
    upgrades.roll(seededRandom(42), 99, "campaign").includes("ricochet"),
    false,
  );
  assert.equal(
    upgrades.roll(seededRandom(42), 99, "endless").includes("ricochet"),
    true,
  );
  assert.equal(upgrades.apply("ricochet"), true);
  assert.equal(
    upgrades.roll(seededRandom(42), 99, "endless").includes("ricochet"),
    false,
  );
  upgrades.reset();
  assert.equal(upgrades.get("ricochet"), 0);
});

test("body animation does not change collision coordinates or instant firing direction", () => {
  const g = fixture();
  g.collision.canMove = () => true;
  const tank = new Tank(g, "player", 2.5, 2.5);
  tank.move(1, 1 / 60);
  tank.tick(1 / 60);
  assert.equal(tank.direction, 1);
  assert.equal(tank.z, 2.5);
  assert.ok(tank.x > 2.5);
  assert.ok(
    tank.model.hull.rotation.y < 0 && tank.model.hull.rotation.y > -Math.PI / 2,
  );
  g.reducedMotion = true;
  tank.tick(1 / 60);
  assert.equal(tank.model.hull.rotation.y, -Math.PI / 2);
  assert.equal(tank.pitch, 0);
  tank.dispose();
});

test("rebuilt procedural maps render water and reserve capacity for base fortification", () => {
  const map = new MapManager(new THREE.Scene(), "endless");
  map.set(3, 3, CELL.WATER);
  map.rebuildInstances();
  assert.ok(map.waterMesh);
  assert.ok(map.steelsMesh.instanceMatrix.count >= map.steelsMesh.count + 6);
  map.dispose();
});

test("procedural spawn lanes connect fixed gates and respawns without removing base protection", () => {
  const map = new MapManager(new THREE.Scene(), "endless");
  map.cells.fill(CELL.STEEL);
  map.rectangle(12, 22, 2, 2, CELL.BASE);
  map.rectangle(11, 21, 4, 1, CELL.BRICK);
  map.reserveSpawnLanes();
  for (const x of [2, 12, 23]) assert.equal(map.get(x, 2), CELL.EMPTY);
  for (const x of [7, 9, 16]) assert.equal(map.get(x, 23), CELL.EMPTY);
  for (let z = 3; z <= 24; z++) assert.equal(map.get(9, z), CELL.EMPTY);
  assert.equal(map.get(12, 22), CELL.BASE);
  assert.equal(map.get(12, 21), CELL.BRICK);
  assert.equal(map.get(0, 2), CELL.STEEL);
  map.dispose();
});
