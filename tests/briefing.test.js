import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectBriefingEntries,
  pickTopBriefing,
  BRIEFING_PRIORITY,
} from "../src/core/briefing.js";

test("critical: enemy at base triggers assertive base-under-pressure", () => {
  const entries = collectBriefingEntries({
    time: 10,
    base: { x: 12.5, z: 22 },
    enemies: [{ type: "heavy", x: 12.5, z: 22, alive: true }],
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "base-under-pressure");
  assert.equal(entries[0].tone, "critical");
  assert.equal(entries[0].ariaLive, "assertive");
});

test("critical: boss just-spawned triggers assertive boss-spawn", () => {
  const entries = collectBriefingEntries({
    time: 10,
    boss: { hp: 12, maxHp: 12, justSpawned: true },
  });
  const spawn = entries.find((e) => e.id === "boss-spawn");
  assert.ok(spawn, "boss-spawn entry expected");
  assert.equal(spawn.tone, "critical");
  assert.equal(spawn.ariaLive, "assertive");
  assert.match(spawn.text, /Boss 已出现/);
});

test("critical: last life triggers assertive last-life", () => {
  const entries = collectBriefingEntries({
    time: 10,
    lives: 1,
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "last-life");
  assert.equal(entries[0].tone, "critical");
  assert.equal(entries[0].ariaLive, "assertive");
});

test("warning: buff expiring within 3s is polite", () => {
  const entries = collectBriefingEntries({
    time: 10,
    activeBuffs: { helmet: 11.5 },
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "buff-expiring");
  assert.equal(entries[0].tone, "warning");
  assert.equal(entries[0].ariaLive, "polite");
  assert.match(entries[0].text, /护盾/);
});

test("warning: boss low HP (<50%) is polite warning", () => {
  const entries = collectBriefingEntries({
    time: 10,
    boss: { hp: 4, maxHp: 12, justSpawned: false },
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "boss-low");
  assert.equal(entries[0].tone, "warning");
  assert.equal(entries[0].ariaLive, "polite");
});

test("info: low remaining count (1-3) is polite", () => {
  const entries = collectBriefingEntries({
    time: 10,
    remaining: 2,
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "low-count");
  assert.equal(entries[0].tone, "info");
  assert.equal(entries[0].ariaLive, "polite");
  assert.match(entries[0].text, /剩余 2 辆/);
});

test("info: zero remaining announces wave clear", () => {
  const entries = collectBriefingEntries({
    time: 10,
    remaining: 0,
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].tone, "info");
  assert.match(entries[0].text, /清空|清除/);
});

test("pickTopBriefing: priority order critical > warning > info", () => {
  const entries = collectBriefingEntries({
    time: 10,
    base: { x: 12.5, z: 22 },
    enemies: [{ type: "light", x: 12.5, z: 22, alive: true }],
    activeBuffs: { clock: 11.5 },
    remaining: 1,
  });
  const tones = new Set(entries.map((e) => e.tone));
  assert.equal(tones.size, 3, "expected all three tones to be present");
  const top = pickTopBriefing(entries, null);
  assert.equal(top.tone, "critical");
  assert.equal(top.id, "base-under-pressure");
});

test("pickTopBriefing: warning outranks info when no critical", () => {
  const entries = collectBriefingEntries({
    time: 10,
    activeBuffs: { helmet: 11.5 },
    remaining: 2,
  });
  const top = pickTopBriefing(entries, null);
  assert.equal(top.tone, "warning");
  assert.equal(top.id, "buff-expiring");
});

test("pickTopBriefing: returns null for empty list", () => {
  assert.equal(pickTopBriefing([], null), null);
});

test("pickTopBriefing: same priority ties broken by recency", () => {
  const entries = [
    { id: "a", tone: "info", text: "older", ariaLive: "polite", at: 5 },
    { id: "b", tone: "info", text: "newer", ariaLive: "polite", at: 10 },
  ];
  const top = pickTopBriefing(entries, null);
  assert.equal(top.id, "b");
  assert.equal(top.text, "newer");
});

test("base-under-pressure: only one entry even with multiple enemies", () => {
  const entries = collectBriefingEntries({
    time: 10,
    base: { x: 12.5, z: 22 },
    enemies: [
      { type: "light", x: 12.5, z: 22, alive: true },
      { type: "heavy", x: 13.5, z: 23, alive: true },
      { type: "rapid", x: 11.5, z: 22.5, alive: true },
    ],
  });
  const pressure = entries.filter((e) => e.id === "base-under-pressure");
  assert.equal(pressure.length, 1);
});

test("buff-expiring: emits only the soonest active buff", () => {
  const entries = collectBriefingEntries({
    time: 10,
    activeBuffs: {
      helmet: 11.5,
      clock: 12.5,
      shovel: 11.0,
    },
  });
  const expiring = entries.filter((e) => e.id === "buff-expiring");
  assert.equal(expiring.length, 1);
  assert.equal(expiring[0].text, "壁垒即将到期（1.0s）");
});

test("base-under-pressure: enemy too far away does not trigger", () => {
  const entries = collectBriefingEntries({
    time: 10,
    base: { x: 12.5, z: 22 },
    enemies: [{ type: "light", x: 12.5, z: 4, alive: true }],
  });
  assert.equal(entries.length, 0);
});

test("boss: full HP and not just-spawned yields no boss entry", () => {
  const entries = collectBriefingEntries({
    time: 10,
    boss: { hp: 12, maxHp: 12, justSpawned: false },
  });
  assert.equal(entries.length, 0);
});

test("BRIEFING_PRIORITY assigns numeric weights to tones", () => {
  assert.ok(BRIEFING_PRIORITY.critical < BRIEFING_PRIORITY.warning);
  assert.ok(BRIEFING_PRIORITY.warning < BRIEFING_PRIORITY.info);
});