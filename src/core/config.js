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
  player: { color: 0x338e9d, speed: 4.1, hp: 1, cooldown: 0.3, score: 0 },
  light: { color: 0xb05246, speed: 2.9, hp: 1, cooldown: 2, score: 100 },
  heavy: { color: 0x76648c, speed: 1.45, hp: 3, cooldown: 2.5, score: 300 },
  rapid: { color: 0xa35b8f, speed: 2.2, hp: 1, cooldown: 0.95, score: 200 },
  sniper: { color: 0xe346a7, speed: 1.35, hp: 2, cooldown: 2.4, score: 350 },
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
  ricochet: {
    id: "ricochet",
    icon: "↯",
    label: "跳弹模块",
    description: "炮弹遇钢墙反弹一次；满级破墙优先，反弹仍可伤及基地",
    maxStacks: 1,
    mode: "endless",
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
    objective: "守住核心堡垒，完成第一章防线。",
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
  ...[
    {
      name: "反射走廊",
      english: "REBOUND DISTRICT.",
      map: "reflect",
      briefing: "跳弹模块已解锁。对准钢墙借角反击；跳弹同样会伤及核心。",
      sequence: [
        "light",
        "heavy",
        "rapid",
        "light",
        "heavy",
        "rapid",
        "heavy",
        "rapid",
        "light",
        "heavy",
        "rapid",
        "heavy",
      ],
      maxConcurrent: 4,
    },
    {
      name: "狙击封锁",
      english: "SIGHTLINE LOCKDOWN.",
      map: "sniper",
      briefing:
        "EMP 已解锁（Q）。粉色预警线锁定后有 0.8 秒闪避窗口；靠近后用 EMP 打断蓄力。",
      sequence: [
        "sniper",
        "light",
        "sniper",
        "rapid",
        "heavy",
        "sniper",
        "light",
        "sniper",
        "rapid",
        "sniper",
        "heavy",
        "sniper",
      ],
      maxConcurrent: 4,
    },
    {
      name: "装甲指挥官",
      english: "BREAK THE COMMANDER.",
      map: "commander",
      briefing:
        "装甲精英正面减伤 50%，绕侧后攻击紫色弱点。最后的指挥官半血后追加冲锋，预警后横移躲避。",
      sequence: [
        "armor",
        "light",
        "rapid",
        "armor",
        "heavy",
        "light",
        "armor",
        "boss",
      ],
      maxConcurrent: 3,
      bossHp: 12,
    },
    {
      name: "双路围城",
      english: "TWIN FRONT SIEGE.",
      map: "siege",
      briefing:
        "水道分割双翼，南北连接线可换路。狙击手与装甲精英交替进攻，优先拦截靠近核心的目标。",
      sequence: [
        "armor",
        "sniper",
        "rapid",
        "heavy",
        "sniper",
        "armor",
        "rapid",
        "light",
        "sniper",
        "heavy",
        "armor",
        "rapid",
        "sniper",
        "armor",
        "heavy",
        "rapid",
      ],
      maxConcurrent: 5,
    },
    {
      name: "脉冲倒计时",
      english: "HOLD UNTIL EXTRACTION.",
      map: "survival",
      briefing:
        "坚守 90 秒等待援军。无需歼灭全部敌军；保持核心在线，EMP 留给近身弹幕。",
      sequence: Array.from(
        { length: 60 },
        (_, i) => ["light", "rapid", "sniper", "heavy", "armor"][i % 5],
      ),
      maxConcurrent: 5,
      goal: { kind: "survive", seconds: 90 },
    },
    {
      name: "核心决战",
      english: "THE LAST NEON CORE.",
      map: "core",
      briefing:
        "清除护卫后迎战最终核心守卫。扇形炮击留有间隙，半血冲锋后有 1.4 秒恢复期；EMP 可打断预警。",
      sequence: [
        "armor",
        "sniper",
        "heavy",
        "rapid",
        "sniper",
        "armor",
        "heavy",
        "rapid",
        "armor",
        "sniper",
        "boss",
      ],
      maxConcurrent: 4,
      bossHp: 18,
    },
  ].map((level, i) => ({
    number: i + 4,
    subtitle: level.briefing,
    objective: level.goal ? "坚守 90 秒，保护核心。" : "守住核心，清除敌军。",
    spawnInterval: 3.8 - i * 0.12,
    speedMultiplier: 1.1,
    fireMultiplier: 0.95,
    allowPowerups: true,
    abilities: { ricochet: true, emp: i >= 1 },
    ...level,
  })),
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

// Player-selectable difficulty presets. Each tier maps a friendly name + a
// short copy blurb onto six independent axes so the difficulty signal isn't a
// single global knob (XAG 108). Multipliers combine multiplicatively with
// existing run upgrades, modifiers, and per-level / per-wave tuning.
export const DIFFICULTY_TIERS = [
  {
    id: "cadet",
    label: "实习兵",
    english: "CADET",
    summary: "速 ×0.75 · 射 ×1.25 · 生命 ×1.5",
    description: "敌人更慢、射速更慢、道具更慷慨，适合新指挥官。",
    enemySpeedMul: 0.75,
    enemyFireMul: 1.25,
    spawnIntervalMul: 1.35,
    livesMul: 1.5,
    powerupDropMul: 1.35,
    hazardMul: 0.85,
  },
  {
    id: "veteran",
    label: "老兵",
    english: "VETERAN",
    summary: "速 ×1.00 · 射 ×1.00 · 生命 ×1.0",
    description: "现行难度基线，复刻 Battle City 经典手感。",
    enemySpeedMul: 1.0,
    enemyFireMul: 1.0,
    spawnIntervalMul: 1.0,
    livesMul: 1.0,
    powerupDropMul: 1.0,
    hazardMul: 1.0,
  },
  {
    id: "iron-hand",
    label: "铁拳",
    english: "IRON HAND",
    summary: "速 ×1.20 · 射 ×0.85 · 生命 ×0.85",
    description: "敌人更快、射速更快，道具掉率不变 — 节奏更紧。",
    enemySpeedMul: 1.2,
    enemyFireMul: 0.85,
    spawnIntervalMul: 0.9,
    livesMul: 0.85,
    powerupDropMul: 1.0,
    hazardMul: 1.15,
  },
  {
    id: "iron-curtain",
    label: "铁幕",
    english: "IRON CURTAIN",
    summary: "速 ×1.40 · 射 ×0.70 · 生命 ×0.65",
    description: "挑战极限：全速压制 + 更少生命，资深指挥官专属。",
    enemySpeedMul: 1.4,
    enemyFireMul: 0.7,
    spawnIntervalMul: 0.8,
    livesMul: 0.65,
    powerupDropMul: 0.85,
    hazardMul: 1.3,
  },
];
export const DEFAULT_DIFFICULTY = "veteran";
export const DIFFICULTY_KEYS = DIFFICULTY_TIERS.map((t) => t.id);
const _DIFFICULTY_BY_ID = Object.fromEntries(
  DIFFICULTY_TIERS.map((t) => [t.id, t]),
);
// Surface the default tier for any unknown id so callers that resolve a tier
// by an externally-supplied key (e.g. persistence, URL, legacy save) keep
// working without a separate null check.
export const DIFFICULTY_BY_ID = new Proxy(_DIFFICULTY_BY_ID, {
  get(target, prop, receiver) {
    if (typeof prop === "string" && !(prop in target)) {
      return Reflect.get(target, DEFAULT_DIFFICULTY, receiver);
    }
    return Reflect.get(target, prop, receiver);
  },
});

function clampDifficulty(id) {
  if (DIFFICULTY_BY_ID[id]) return id;
  return DEFAULT_DIFFICULTY;
}

export function difficultyFor(id) {
  return DIFFICULTY_BY_ID[clampDifficulty(id)];
}

// Pure scaling helper — combines a difficulty tier with the per-wave tuning
// curve so it can be tested without instantiating GameManager. Returning the
// raw multiplier keeps the helper composable with future per-axis overrides.
export function computeEffectiveScaling(difficulty, wave = 1, base = ENDLESS) {
  const tier = difficultyFor(difficulty);
  const w = Math.max(1, Math.floor(wave));
  const fireMul =
    (base.fireMultiplierBase / (1 + base.fireMultiplierDecay * (w - 1))) *
    tier.enemyFireMul;
  const speedMul = (1 + base.speedGrowth * (w - 1)) * tier.enemySpeedMul;
  const spawnInterval =
    Math.max(base.spawnIntervalMin, base.spawnIntervalBase - (w - 1) * 0.18) *
    tier.spawnIntervalMul;
  const lives = Math.max(
    1,
    Math.round((base.livesStart + Math.floor((w - 1) / 3)) * tier.livesMul),
  );
  const dropChance = Math.min(
    0.75,
    base.powerupDropChance * tier.powerupDropMul,
  );
  return {
    fireMul,
    speedMul,
    spawnInterval,
    lives,
    dropChance,
    tier,
  };
}

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

// Lighting preset catalog. Each preset describes the lighting rig parameters
// for a stage of the day cycle. The values are pure data — mounting them onto a
// live scene happens elsewhere (see LightingRig). All numeric fields use plain
// numbers so the catalog is easy to diff and to consume from tests.
export const LIGHTING_PRESETS = {
  noon: {
    sun: {
      color: 0xfff4d6,
      intensity: 1.55,
      azimuth: 0.78,
      elevation: 1.1,
    },
    hemi: {
      skyColor: 0xbcdcff,
      groundColor: 0x6b5638,
      intensity: 0.65,
    },
    ambient: {
      color: 0xffffff,
      intensity: 0.18,
    },
    background: {
      top: 0x9fc6ff,
      bottom: 0xc5b48a,
    },
    envIntensity: 1.0,
    toneMappingExposure: 1.05,
  },
  overcast: {
    sun: {
      color: 0xe6ecf2,
      intensity: 0.85,
      azimuth: 0.0,
      elevation: 0.55,
    },
    hemi: {
      skyColor: 0xc8d0d8,
      groundColor: 0x6a6a6a,
      intensity: 0.85,
    },
    ambient: {
      color: 0xd6dde4,
      intensity: 0.32,
    },
    background: {
      top: 0xa8b4be,
      bottom: 0x8c8a86,
    },
    envIntensity: 0.75,
    toneMappingExposure: 1.0,
  },
  dusk: {
    sun: {
      color: 0xff8a55,
      intensity: 1.1,
      azimuth: -1.3,
      elevation: 0.18,
    },
    hemi: {
      skyColor: 0xffb182,
      groundColor: 0x3a2238,
      intensity: 0.55,
    },
    ambient: {
      color: 0xffd1a0,
      intensity: 0.22,
    },
    background: {
      top: 0xff7a4a,
      bottom: 0x2b1e3a,
    },
    envIntensity: 0.9,
    toneMappingExposure: 1.1,
  },
  night: {
    sun: {
      color: 0x6f86b8,
      intensity: 0.35,
      azimuth: 0.4,
      elevation: -0.4,
    },
    hemi: {
      skyColor: 0x3b4f7a,
      groundColor: 0x121826,
      intensity: 0.25,
    },
    ambient: {
      color: 0x4a5680,
      intensity: 0.14,
    },
    background: {
      top: 0x0b1428,
      bottom: 0x070912,
    },
    envIntensity: 0.4,
    toneMappingExposure: 0.95,
  },
};

// pickLightingPreset maps a (mode, level, wave) tuple to the preset key that
// should drive the scene's lighting rig. It is intentionally side-effect free
// and never touches the scene graph — keeping it pure makes it trivial to test
// and to call from level intros / replay scrubbers.
//
// Modes:
//   - "campaign": level index picks the preset deterministically (level 0 →
//     noon, level 1 → overcast, level 2 → dusk, anything ≥ 3 → night).
//   - "endless": cycles through all four presets every wave, regardless of the
//     level (the level is accepted for symmetry but unused).
//   - anything else: returns the first preset key (currently "noon") without
//     throwing.
const LIGHTING_CAMPAIGN_BY_LEVEL = ["noon", "overcast", "dusk", "night"];
export const LIGHTING_PRESET_KEYS = Object.keys(LIGHTING_PRESETS);
export function pickLightingPreset(mode, level = 0, wave = 1) {
  if (mode === "campaign") {
    const idx = Math.max(0, Math.floor(Number(level) || 0));
    if (idx < LIGHTING_CAMPAIGN_BY_LEVEL.length) {
      return LIGHTING_CAMPAIGN_BY_LEVEL[idx];
    }
    return "night";
  }
  if (mode === "endless") {
    const order = LIGHTING_PRESET_KEYS;
    const w = Math.max(1, Math.floor(Number(wave) || 1));
    return order[(w - 1) % order.length];
  }
  return LIGHTING_PRESET_KEYS[0];
}
