export const SIZE = 26;
export const STEP = 1 / 60;
export const DIRS = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
];
export const CELL = { EMPTY: 0, BRICK: 1, STEEL: 2, WATER: 3, BASE: 4 };
export const TYPES = {
  player: { color: 0x749941, speed: 4.1, hp: 1, cooldown: 0.3, score: 0 },
  light: { color: 0xb65c48, speed: 2.9, hp: 1, cooldown: 2, score: 100 },
  heavy: { color: 0x66637d, speed: 1.45, hp: 3, cooldown: 2.5, score: 300 },
  rapid: { color: 0x995474, speed: 2.2, hp: 1, cooldown: 0.95, score: 200 },
};
export function seededRandom(seed = 1990) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
