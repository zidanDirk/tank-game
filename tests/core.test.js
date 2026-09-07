import test from "node:test";
import assert from "node:assert/strict";
import {
  CollisionSystem,
  overlaps,
  segmentBox,
} from "../src/systems/CollisionSystem.js";
import { CELL } from "../src/core/config.js";

function fixture(entries = [], tanks = []) {
  const cells = new Map(entries.map(([x, z, type]) => [`${x},${z}`, type]));
  return new CollisionSystem(
    { get: (x, z) => cells.get(`${x},${z}`) ?? CELL.EMPTY },
    () => tanks,
  );
}

test("segment sweep detects thin obstacles even when both endpoints lie outside", () => {
  assert.equal(segmentBox(0, 2, 10, 0, 4, 1, 5, 3), 0.4);
  assert.equal(segmentBox(10, 2, -10, 0, 4, 1, 5, 3), 0.5);
});

test("segment sweep rejects parallel misses and objects beyond the segment", () => {
  assert.equal(segmentBox(0, 0, 10, 0, 4, 1, 5, 3), null);
  assert.equal(segmentBox(0, 2, 2, 0, 4, 1, 5, 3), null);
  assert.equal(segmentBox(8, 2, 2, 0, 4, 1, 5, 3), null);
});

test("segment sweep handles an origin inside a box and stationary trajectories", () => {
  assert.equal(segmentBox(4.5, 2, 0, 0, 4, 1, 5, 3), 0);
  assert.equal(segmentBox(0, 2, 0, 0, 4, 1, 5, 3), null);
});

test("AABB contact permits touching edges but rejects interior overlap", () => {
  assert.equal(overlaps(0, 0, 0.5, 1, 0, 0.5), false);
  assert.equal(overlaps(0, 0, 0.5, 0.99, 0.99, 0.5), true);
});

test("a tank fits a one-cell corridor and cannot clip adjacent solid cells", () => {
  const collision = fixture([
    [0, 1, CELL.STEEL],
    [2, 1, CELL.BRICK],
  ]);
  const tank = { x: 1.5, z: 1.5, radius: 0.46, alive: true };
  assert.equal(collision.canMove(tank, 1.5, 1.5), true);
  assert.equal(collision.canMove(tank, 1.55, 1.5), false);
  assert.equal(collision.canMove(tank, 1.45, 1.5), false);
});

test("water and the base block tanks; dead tanks do not block movement", () => {
  const tank = { x: 1.5, z: 1.5, radius: 0.46, alive: true };
  const other = { x: 4.5, z: 1.5, radius: 0.46, alive: false };
  const collision = fixture(
    [
      [2, 1, CELL.WATER],
      [3, 1, CELL.BASE],
    ],
    [tank, other],
  );
  assert.equal(collision.canMove(tank, 1.5, 1.5), true);
  assert.equal(collision.canMove(tank, 2.5, 1.5), false);
  assert.equal(collision.canMove(tank, 3.5, 1.5), false);
  assert.equal(collision.canMove(tank, 4.5, 1.5), true);
  other.alive = true;
  assert.equal(collision.canMove(tank, 4.5, 1.5), false);
});

test("bullets pass through water and hit the nearest solid tile", () => {
  const collision = fixture([
    [2, 1, CELL.WATER],
    [4, 1, CELL.BRICK],
    [6, 1, CELL.STEEL],
  ]);
  const hit = collision.trace({ x: 0.5, z: 1.5, team: "player" }, 8, 0);
  assert.equal(hit.kind, "tile");
  assert.equal(hit.type, CELL.BRICK);
  assert.equal(hit.x, 4);
  assert.ok(Math.abs(hit.time - 0.425) < 1e-10);
});

test("a wall shields a tank and a closer hostile tank intercepts a bullet", () => {
  const enemy = { x: 6.5, z: 1.5, radius: 0.46, team: "enemy", alive: true };
  const collision = fixture([[4, 1, CELL.STEEL]], [enemy]);
  const bullet = { x: 0.5, z: 1.5, team: "player" };
  assert.equal(collision.trace(bullet, 8, 0).kind, "tile");
  enemy.x = 2.5;
  assert.equal(collision.trace(bullet, 8, 0).tank, enemy);
});

test("friendly and dead tanks do not intercept projectiles; either team can hit the base", () => {
  const collision = fixture(
    [[4, 1, CELL.BASE]],
    [
      { x: 1.5, z: 1.5, radius: 0.46, team: "player", alive: true },
      { x: 2.5, z: 1.5, radius: 0.46, team: "enemy", alive: false },
    ],
  );
  assert.equal(
    collision.trace({ x: 0.5, z: 1.5, team: "player" }, 6, 0).type,
    CELL.BASE,
  );
  assert.equal(
    collision.trace({ x: 3, z: 1.5, team: "enemy" }, 3, 0).type,
    CELL.BASE,
  );
});
