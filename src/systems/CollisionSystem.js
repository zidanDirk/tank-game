import { CELL } from "../core/config.js";
export function overlaps(ax, az, ah, bx, bz, bh) {
  return Math.abs(ax - bx) < ah + bh && Math.abs(az - bz) < ah + bh;
}
// Earliest segment vs expanded AABB entry, including an origin already inside.
export function segmentBox(x, z, dx, dz, minX, minZ, maxX, maxZ) {
  let enter = 0,
    exit = 1;
  for (const [p, d, min, max] of [
    [x, dx, minX, maxX],
    [z, dz, minZ, maxZ],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (p < min || p > max) return null;
      continue;
    }
    let a = (min - p) / d,
      b = (max - p) / d;
    if (a > b) [a, b] = [b, a];
    enter = Math.max(enter, a);
    exit = Math.min(exit, b);
    if (enter > exit) return null;
  }
  return enter;
}
export class CollisionSystem {
  constructor(map, getTanks) {
    this.map = map;
    this.getTanks = getTanks;
  }
  canMove(tank, x, z) {
    const r = tank.radius;
    for (let j = Math.floor(z - r); j <= Math.floor(z + r - 1e-6); j++)
      for (let i = Math.floor(x - r); i <= Math.floor(x + r - 1e-6); i++)
        if (this.map.get(i, j) !== CELL.EMPTY) return false;
    return !this.getTanks().some(
      (other) =>
        other !== tank &&
        other.alive &&
        overlaps(x, z, r, other.x, other.z, other.radius),
    );
  }
  trace(b, dx, dz) {
    const r = 0.1;
    let best = null;
    const take = (time, hit) => {
      if (time !== null && (!best || time < best.time)) best = { time, ...hit };
    };
    for (
      let z = Math.floor(Math.min(b.z, b.z + dz) - r);
      z <= Math.floor(Math.max(b.z, b.z + dz) + r);
      z++
    )
      for (
        let x = Math.floor(Math.min(b.x, b.x + dx) - r);
        x <= Math.floor(Math.max(b.x, b.x + dx) + r);
        x++
      ) {
        const type = this.map.get(x, z);
        if (type === CELL.EMPTY || type === CELL.WATER) continue;
        take(segmentBox(b.x, b.z, dx, dz, x - r, z - r, x + 1 + r, z + 1 + r), {
          kind: "tile",
          type,
          x,
          z,
        });
      }
    for (const tank of this.getTanks())
      if (tank.alive && tank.team !== b.team) {
        const h = tank.radius + r;
        take(
          segmentBox(
            b.x,
            b.z,
            dx,
            dz,
            tank.x - h,
            tank.z - h,
            tank.x + h,
            tank.z + h,
          ),
          { kind: "tank", tank },
        );
      }
    return best;
  }
}
