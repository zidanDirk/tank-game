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

const levelOne = [
  "light",
  "light",
  "heavy",
  "light",
  "rapid",
  "light",
  "heavy",
  "rapid",
  "light",
  "heavy",
  "rapid",
  "heavy",
];

export const LEVELS = [
  {
    number: 1,
    name: "前线阵地",
    english: "HOLD THE LAST LINE.",
    subtitle: "清理砖墙，熟悉三条进攻走廊。",
    objective: "守住基地，清除第一波敌军。",
    briefing: "清理砖墙，熟悉三条进攻走廊。每一发炮弹，都为守护而战。",
    sequence: levelOne,
    maxConcurrent: 4,
    spawnInterval: 4.5,
    speedMultiplier: 1,
    fireMultiplier: 1,
    map: "training",
  },
  {
    number: 2,
    name: "交叉火力",
    english: "CROSS FIRE.",
    subtitle: "水面切断路线，钢墙逼迫你换线。",
    objective: "穿过交叉水域，拦截更密集的混编部队。",
    briefing: "水面切断路线，钢墙逼迫你换线。别让速射坦克穿过中线。",
    sequence: [
      "light",
      "rapid",
      "light",
      "heavy",
      "rapid",
      "light",
      "heavy",
      "rapid",
      "light",
      "heavy",
      "rapid",
      "light",
      "heavy",
      "rapid",
      "heavy",
    ],
    maxConcurrent: 5,
    spawnInterval: 3.8,
    speedMultiplier: 1.08,
    fireMultiplier: 0.9,
    map: "crossfire",
  },
  {
    number: 3,
    name: "钢铁堡垒",
    english: "STEEL CITADEL.",
    subtitle: "通道更窄，重型装甲与速射坦克同时压境。",
    objective: "守住核心堡垒，完成最终防线。",
    briefing: "通道更窄，重型装甲与速射坦克同时压境。优先清理靠近基地的威胁。",
    sequence: [
      "heavy",
      "rapid",
      "light",
      "heavy",
      "rapid",
      "heavy",
      "light",
      "rapid",
      "heavy",
      "rapid",
      "light",
      "heavy",
      "rapid",
      "heavy",
      "light",
      "rapid",
      "heavy",
      "rapid",
    ],
    maxConcurrent: 6,
    spawnInterval: 3.1,
    speedMultiplier: 1.18,
    fireMultiplier: 0.78,
    map: "citadel",
  },
];
export function seededRandom(seed = 1990) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
