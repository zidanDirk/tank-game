import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { browserLaunchOptions } from "./browser-launch.mjs";

const browser = await chromium.launch(browserLaunchOptions());
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 1,
});
const errors = [],
  badResponses = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("response", (r) => {
  if (r.status() >= 400)
    badResponses.push({ status: r.status(), url: r.url() });
});
try {
  await page.goto("http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__TANK_GAME__);
  await page.screenshot({
    path: "artifacts/desktop-ready.png",
    fullPage: true,
  });
  await page.locator("#primary-btn").click();
  await page.waitForFunction(() => window.__TANK_GAME__.state === "playing");
  const movementStart = await page.evaluate(
    () => window.__TANK_GAME__.player.z,
  );
  await page.keyboard.down("KeyW");
  try {
    await page.waitForFunction(
      (startZ) => window.__TANK_GAME__.player.z < startZ - 1.5,
      movementStart,
      { timeout: 5000 },
    );
  } finally {
    await page.keyboard.up("KeyW");
  }
  const moved = await page.evaluate(() => window.__TANK_GAME__.player.z);
  assert.ok(moved < movementStart - 1.5);
  await page.screenshot({ path: "artifacts/motion-1.png" });
  await page.keyboard.down("Space");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "artifacts/motion-2.png" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: "artifacts/motion-3.png" });
  await page.keyboard.up("Space");
  const active = await page.evaluate(() => window.__TANK_GAME__.snapshot());
  await page.screenshot({
    path: "artifacts/desktop-active.png",
    fullPage: true,
  });
  await page.keyboard.press("KeyP");
  const pauseStart = await page.evaluate(() => window.__TANK_GAME__.time);
  await page.waitForTimeout(250);
  assert.equal(
    await page.evaluate(() => window.__TANK_GAME__.time),
    pauseStart,
  );
  await page.screenshot({
    path: "artifacts/desktop-paused.png",
    fullPage: true,
  });
  await page.locator("#primary-btn").click();
  // An arranged encounter exercises three hits through actual Space input and real BulletManager logic.
  await page.evaluate(async () => {
    const g = window.__TANK_GAME__;
    g.restart();
    for (const e of g.enemies) e.dispose();
    const { EnemyTank } = await import("/src/entities/Tank.js");
    const heavy = new EnemyTank(g, "heavy", 9.5, 20.5);
    heavy.speed = 0;
    heavy.think = 999;
    heavy.cooldownLeft = 999;
    heavy.invincible = 0;
    g.enemies = [heavy];
    g.spawnTimer = 999;
  });
  await page.keyboard.down("Space");
  await page.waitForFunction(
    () => window.__TANK_GAME__.kills === 1,
    {},
    { timeout: 6000 },
  );
  await page.keyboard.up("Space");
  const combat = await page.evaluate(() => window.__TANK_GAME__.snapshot());
  assert.equal(combat.score, 300);
  await page.screenshot({
    path: "artifacts/desktop-impact.png",
    fullPage: true,
  });
  // Base failure is driven entirely by cardinal movement and shooting after restart.
  await page.locator("#restart-btn").click();
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(100);
  await page.keyboard.up("KeyD");
  await page.keyboard.down("Space");
  await page.waitForFunction(
    () => window.__TANK_GAME__.state === "lost",
    {},
    { timeout: 6000 },
  );
  await page.keyboard.up("Space");
  const lost = await page.evaluate(() => window.__TANK_GAME__.snapshot());
  assert.equal(lost.baseAlive, false);
  assert.equal(lost.lives, 3);
  await page.screenshot({ path: "artifacts/desktop-lost.png", fullPage: true });
  await page.locator("#primary-btn").click();
  const restarted = await page.evaluate(() => window.__TANK_GAME__.snapshot());
  assert.equal(restarted.kills, 0);
  assert.equal(restarted.lives, 3);
  assert.equal(restarted.baseAlive, true);
  // Arrange the final opponent, then use the same real shoot input to prove victory and UI.
  await page.evaluate(() => {
    const g = window.__TANK_GAME__;
    for (const e of g.enemies.slice(1)) e.dispose();
    g.enemies = g.enemies.slice(0, 1);
    const e = g.enemies[0];
    e.x = 9.5;
    e.z = 20.5;
    e.speed = 0;
    e.think = 999;
    e.cooldownLeft = 999;
    e.invincible = 0;
    g.kills = 11;
    g.score = 1100;
    g.spawned = 12;
    g.spawnTimer = 999;
    g.updateUI();
  });
  await page.keyboard.down("Space");
  await page.waitForFunction(
    () => window.__TANK_GAME__.state === "level-clear",
    {},
    { timeout: 6000 },
  );
  await page.keyboard.up("Space");
  const won = await page.evaluate(() => window.__TANK_GAME__.snapshot());
  assert.equal(won.kills, 12);
  assert.equal(won.level, 1);
  await page.screenshot({ path: "artifacts/desktop-won.png", fullPage: true });
  // Repeat restart and render to check that GPU geometry counts plateau.
  const memories = [];
  for (let i = 0; i < 4; i++) {
    await page.locator("#restart-btn").click();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    memories.push(
      await page.evaluate(
        () => window.__TANK_GAME__.snapshot().render.geometries,
      ),
    );
  }
  console.log("Restart geometries", memories);
  assert.ok(Math.max(...memories) - Math.min(...memories) <= 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const cdp = await page.context().newCDPSession(page);
  const up = await page.locator('[data-control="up"]').boundingBox();
  const before = await page.evaluate(() => window.__TANK_GAME__.player.z);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: up.x + up.width / 2, y: up.y + up.height / 2 }],
  });
  await page.waitForTimeout(400);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  const after = await page.evaluate(() => window.__TANK_GAME__.player.z);
  assert.ok(after < before);
  const touchReleased = await page.evaluate(
    () => window.__TANK_GAME__.input.direction === null,
  );
  assert.ok(touchReleased);
  await page.screenshot({
    path: "artifacts/mobile-active.png",
    fullPage: true,
  });
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    canvas: document.querySelector("canvas").getBoundingClientRect().toJSON(),
  }));
  assert.equal(layout.width, layout.scrollWidth);
  await page.locator("#sound-btn").click();
  assert.equal(
    await page.evaluate(() => window.__TANK_GAME__.audio.muted),
    true,
  );
  await page.locator("#sound-btn").click();
  const audio = await page.evaluate(() => ({
    state: window.__TANK_GAME__.audio.context.state,
    muted: window.__TANK_GAME__.audio.muted,
  }));
  assert.equal(audio.muted, false);
  assert.equal(audio.state, "running");
  await page.goto("http://127.0.0.1:4173");
  await page.locator("#primary-btn").click();
  await page.keyboard.down("KeyW");
  await page.keyboard.down("Space");
  await page.waitForTimeout(350);
  await page.keyboard.up("KeyW");
  await page.keyboard.up("Space");
  assert.equal(await page.locator("#status-label").textContent(), "作战中");
  assert.equal(
    await page.evaluate(() => typeof window.__TANK_GAME__),
    "undefined",
  );
  await page.screenshot({
    path: "artifacts/production-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: "artifacts/production-desktop.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(badResponses, []);
  const result = {
    pass: true,
    errors,
    badResponses,
    active,
    combat,
    lost,
    won,
    restarted,
    geometryCountsAcrossRestarts: memories,
    mobile: { before, after, touchReleased, layout },
    audio,
    production: { started: true, debugHooksAbsent: true },
    motion: ["motion-1.png", "motion-2.png", "motion-3.png"],
  };
  await fs.writeFile(
    "artifacts/browser-smoke.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
