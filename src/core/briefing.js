// Pure briefing logic for the in-game dynamic HUD.
//
// The renderer (`refreshBriefing` on GameManager) reads a snapshot of the
// current play state, calls `collectBriefingEntries`, and shows the highest-
// priority entry on the `#battle-briefing` DOM node. Keeping the priority
// ladder and condition checks in a standalone module lets the unit tests in
// `tests/briefing.test.js` exercise them without pulling in THREE.js or a
// document, and lets the renderer stay a thin shell.
//
// Priority ladder (highest first, ties broken by recency):
//   1. critical — base under pressure, boss spawn, last life
//   2. warning  — boss low HP, buff expiring
//   3. info     — low enemy count, generic acknowledgement
//
// `ariaLive` returns "assertive" for critical entries (to interrupt the
// screen reader) and "polite" otherwise. The renderer is expected to revert
// `aria-live` back to "polite" after a short window so the next critical
// can re-trigger the interrupt.

export const BRIEFING_PRIORITY = {
  critical: 0,
  warning: 1,
  info: 2,
};

// Pull this many characters from an enemy row to render as a short tag.
function describeEnemy(enemy) {
  if (!enemy) return null;
  const labels = {
    light: "轻型",
    heavy: "重型",
    rapid: "速射",
    armor: "装甲",
    boss: "Boss",
  };
  return labels[enemy.type] ?? "坦克";
}

// `state.time` is the in-game simulation clock the renderer keeps and passes
// in so entries can carry a monotonic timestamp for tie-breaking.
export function collectBriefingEntries(state) {
  const entries = [];
  const now = state.time ?? 0;
  const base = state.base ?? { x: 12.5, z: 22 };
  // Critical: enemy literally standing on / next to the base.
  if (Array.isArray(state.enemies)) {
    for (const enemy of state.enemies) {
      if (!enemy || !enemy.alive) continue;
      const dx = (enemy.x ?? 0) - base.x;
      const dz = (enemy.z ?? 0) - base.z;
      const dist = Math.hypot(dx, dz);
      if ((enemy.z ?? 0) >= 22 && dist <= 4) {
        entries.push({
          id: "base-under-pressure",
          tone: "critical",
          text: `⚠ ${describeEnemy(enemy)}已逼近基地！立即截击`,
          ariaLive: "assertive",
          at: now,
        });
        // Only one base-pressure entry even if multiple enemies swarm in.
        break;
      }
    }
  }
  // Critical: last life remaining.
  if ((state.lives ?? 0) === 1) {
    entries.push({
      id: "last-life",
      tone: "critical",
      text: "⚠ 最后一条命 · 守住阵线",
      ariaLive: "assertive",
      at: now,
    });
  }
  // Critical / warning: boss is up and low on HP. Spawn itself is a critical
  // interrupt (boss appearing requires immediate attention); low-HP is a
  // softer warning so the screen reader does not keep interrupting.
  if (state.boss) {
    const maxHp = state.boss.maxHp ?? state.boss.hp ?? 1;
    const ratio = state.boss.hp / Math.max(1, maxHp);
    if (state.boss.justSpawned) {
      entries.push({
        id: "boss-spawn",
        tone: "critical",
        text: "⚠ Boss 已出现 · 集中火力",
        ariaLive: "assertive",
        at: now,
      });
    } else if (ratio < 0.5) {
      entries.push({
        id: "boss-low",
        tone: "warning",
        text: "Boss 血量过半 · 持续压制",
        ariaLive: "polite",
        at: now,
      });
    }
  }
  // Warning: any active buff has 3s or less remaining.
  if (state.activeBuffs && typeof state.activeBuffs === "object") {
    let soonest = null;
    for (const [key, expiresAt] of Object.entries(state.activeBuffs)) {
      const remaining = (expiresAt ?? 0) - now;
      if (remaining > 0 && remaining <= 3) {
        if (soonest === null || remaining < soonest.remaining) {
          soonest = { key, remaining };
        }
      }
    }
    if (soonest) {
      const labels = {
        helmet: "护盾",
        clock: "冰冻",
        shovel: "壁垒",
      };
      const name = labels[soonest.key] ?? soonest.key;
      entries.push({
        id: "buff-expiring",
        tone: "warning",
        text: `${name}即将到期（${soonest.remaining.toFixed(1)}s）`,
        ariaLive: "polite",
        at: now,
      });
    }
  }
  // Info: low remaining enemy count.
  if (
    typeof state.remaining === "number" &&
    state.remaining >= 0 &&
    state.remaining <= 3
  ) {
    const tail =
      state.remaining === 0
        ? "本波已清空"
        : `剩余 ${state.remaining} 辆敌军`;
    entries.push({
      id: "low-count",
      tone: "info",
      text: tail,
      ariaLive: "polite",
      at: now,
    });
  }
  return entries;
}

// Sort by priority then by recency; `previousId` lets callers keep the
// existing entry on screen when nothing outranks it (avoids flicker).
export function pickTopBriefing(entries, previousId = null) {
  if (!entries.length) return null;
  const sorted = [...entries].sort((a, b) => {
    const pa = BRIEFING_PRIORITY[a.tone] ?? 99;
    const pb = BRIEFING_PRIORITY[b.tone] ?? 99;
    if (pa !== pb) return pa - pb;
    return (b.at ?? 0) - (a.at ?? 0);
  });
  const top = sorted[0];
  if (previousId && top.id === previousId) return null;
  return top;
}
