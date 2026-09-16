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
  armor: {
    color: 0x8a6a5a,
    speed: 1.6,
    hp: 6,
    cooldown: 1.5,
    score: 400,
    multiShot: 2,
  },
  boss: {
    color: 0x4a3a2a,
    speed: 0.9,
    hp: 12,
    cooldown: 1.6,
    score: 1500,
    multiShot: 3,
  },
};

// Player tank upgrade levels (Battle City classic).
// Index 0 = Lv1 (initial), index 3 = Lv4 (max).
// At Lv3+ the tank fires two bullets side by side; at Lv4 its bullets can
// destroy steel walls.
export const PLAYER_LEVELS = [
  { speed: 4.1, cooldown: 0.3, multiShot: 1, breakSteel: false },
  { speed: 4.4, cooldown: 0.22, multiShot: 1, breakSteel: false },
  { speed: 4.7, cooldown: 0.22, multiShot: 2, breakSteel: false },
  { speed: 5.0, cooldown: 0.18, multiShot: 2, breakSteel: true },
];
export const PLAYER_MAX_LEVEL = PLAYER_LEVELS.length;
export const POWERUP_DROP_CHANCE = 0.22;
export const POWERUP_LIFE = 6;
export const POWERUP_PULL_SPEED = 2.5;
// Power-up visual glyphs and durations. The handler is dispatched in
// GameManager.applyPickup using the same key.
export const POWERUPS = {
  star: { glyph: "★", color: 0xf3d65a, duration: 0 },
  helmet: { glyph: "🪖", color: 0xb4d8ff, duration: 10 },
  clock: { glyph: "⏱", color: 0x6080ff, duration: 7 },
  bomb: { glyph: "💣", color: 0xff7a4a, duration: 0 },
  tank: { glyph: "🚜", color: 0x9bbf5a, duration: 0 },
  shovel: { glyph: "🧱", color: 0xc98a5b, duration: 15 },
};
export const POWERUP_KEYS = Object.keys(POWERUPS);

// Persistent upgrades chosen between campaign stages and every three endless
// waves. Effects stack for the current run only and are applied whenever a new
// player tank is spawned.
export const RUN_UPGRADES = {
  overdrive: {
    id: "overdrive",
    icon: "⇧",
    label: "履带超频",
    description: "移动速度 +10%",
    maxStacks: 3,
  },
  autoloader: {
    id: "autoloader",
    icon: "↻",
    label: "自动装填",
    description: "射击冷却 -12%",
    maxStacks: 3,
  },
  velocity: {
    id: "velocity",
    icon: "➤",
    label: "高速弹",
    description: "炮弹速度 +15%",
    maxStacks: 3,
  },
  piercing: {
    id: "piercing",
    icon: "◆",
    label: "穿甲弹",
    description: "炮弹伤害 +1",
    maxStacks: 2,
  },
  scavenger: {
    id: "scavenger",
    icon: "✦",
    label: "战场回收",
    description: "道具掉率 +5%",
    maxStacks: 3,
  },
  reactive: {
    id: "reactive",
    icon: "⬡",
    label: "反应装甲",
    description: "每次出生抵挡 1 次伤害",
    maxStacks: 2,
  },
};
export const RUN_UPGRADE_KEYS = Object.keys(RUN_UPGRADES);

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
    allowPowerups: false,
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
    allowPowerups: true,
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
    allowPowerups: true,
  },
];

// Procedural map presets for endless mode. Each preset is a 26x26 ASCII grid.
// Symbols: '.' empty, '#' brick, 'S' steel, '~' water, 'B' base, ' ' empty
// Base spawns always at row 22 columns 12-13 (matching campaign maps).
function presetFromRows(rows) {
  return rows.map((row) => {
    if (row.length === SIZE) return row;
    if (row.length > SIZE) return row.slice(0, SIZE);
    return row + " ".repeat(SIZE - row.length);
  });
}

export const MAP_PRESETS = [
  {
    id: "corridor",
    label: "六道走廊",
    rows: presetFromRows([
      "..........................",
      ".####.####.####.####.####..",
      ".####.####.####.####.####..",
      ".####.####.####.####.####..",
      "..........................",
      "..........................",
      "..####..####..####..####...",
      "..####..####..####..####...",
      "..........................",
      "..........................",
      "...####...####...####...#..",
      "...####...####...####...#..",
      "..........................",
      "..........................",
      "....####....####....####...",
      "....####....####....####...",
      "..........................",
      "..........................",
      ".....####.....####.....#...",
      ".....####.....####.....#...",
      "..........................",
      ".S..S.............S..S.....",
      "..#####..#.#..#####........",
      "..##..##..#.#..##..##......",
      "....BB.....................",
      "..........................",
    ]),
  },
  {
    id: "maze",
    label: "钢墙迷宫",
    rows: presetFromRows([
      "..........................",
      ".S.S.S.S.S.S.S.S.S.S.S.S..",
      "..........................",
      ".####.####.####.####.####..",
      ".####.####.####.####.####..",
      ".####.####.####.####.####..",
      "..........................",
      "..S.S..S.S.S.S..S.S..S.S..",
      "..........................",
      ".####.####.####.####.####..",
      ".####.####.####.####.####..",
      ".####.####.####.####.####..",
      "..........................",
      "..S.S..S.S.S.S..S.S..S.S..",
      "..........................",
      ".####.####.####.####.####..",
      ".####.####.####.####.####..",
      ".####.####.####.####.####..",
      "..........................",
      "..S.S..S.S.S.S..S.S..S.S..",
      "..........................",
      ".S..S.............S..S.....",
      "..#####..#.#..#####........",
      "..##..##..#.#..##..##......",
      "....BB.....................",
      "..........................",
    ]),
  },
  {
    id: "water",
    label: "水域阻击",
    rows: presetFromRows([
      "..........................",
      ".####.####.####.####.####..",
      ".####.####.####.####.####..",
      "..........................",
      "..~~~~~........~~~~~......",
      "..~~~~~........~~~~~......",
      "..........................",
      ".####.####.####.####.####..",
      ".####.####.####.####.####..",
      "..........................",
      "........~~~......~~~.......",
      "........~~~......~~~.......",
      "..........................",
      ".####.####.####.####.####..",
      ".####.####.####.####.####..",
      "..........................",
      "..~~~~~........~~~~~......",
      "..~~~~~........~~~~~......",
      "..........................",
      ".####.####.####.####.####..",
      ".####.####.####.####.####..",
      ".S..S.............S..S.....",
      "..#####..#.#..#####........",
      "..##..##..#.#..##..##......",
      "....BB.....................",
      "..........................",
    ]),
  },
  {
    id: "cage",
    label: "围城死斗",
    rows: presetFromRows([
      "..........................",
      ".#######################...",
      ".#######################...",
      "..........................",
      ".####..............####....",
      ".####..............####....",
      ".####..##########..####....",
      ".####..##########..####....",
      "......##########......S...",
      ".S...##########......S....",
      ".S...##########......S....",
      "......##########...........",
      ".####..##########..####....",
      ".####..##########..####....",
      ".####..............####....",
      ".####..............####....",
      "..........................",
      ".#######################...",
      ".#######################...",
      "..........................",
      ".####..............####....",
      ".####..............####....",
      ".####..##.BB.##....####....",
      ".####..##.BB.##....####....",
      "..........................",
      "..........................",
    ]),
  },
];

// Kill-streak combo: consecutive enemy kills within STREAK.window seconds
// multiply the awarded score up to STREAK.maxMult. Resets after the window
// or on player death. Visible on HUD via the #streak-badge.
export const STREAK = {
  window: 4.0, // seconds before the streak decays back to zero
  maxMult: 4, // cap so a perfect run doesn't run away
};

// Endless mode tuning knobs.
export const ENDLESS = {
  startEnemies: 4,
  spawnIntervalBase: 4.2,
  spawnIntervalMin: 1.3,
  fireMultiplierBase: 1,
  fireMultiplierDecay: 0.04,
  speedGrowth: 0.06,
  armorUnlockWave: 5,
  bossEvery: 5,
  livesStart: 3,
  livesMax: 5,
  powerupDropChance: 0.28,
  leaderboardSize: 10,
};

// Map modifier rolls for endless mode. Each entry is an optional tweak to
// apply at the start of a run. Multiple modifiers can stack.
export const MODIFIERS = [
  { id: "fog", label: "战争迷雾", hint: "视线受限" },
  { id: "iron", label: "钢铁模式", hint: "1 条命" },
  { id: "rapid", label: "急速火力", hint: "射速 +40%" },
  { id: "siege", label: "围攻", hint: "刷新 +20%" },
];

export function dailySeed(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return y * 10000 + m * 100 + d;
}

export function seededRandom(seed = 1990) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
