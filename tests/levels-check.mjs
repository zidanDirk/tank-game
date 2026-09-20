import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { browserLaunchOptions } from "./browser-launch.mjs";

const browser = await chromium.launch(browserLaunchOptions());

try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.goto("http://127.0.0.1:5173/");
  await page.locator("#primary-btn").click();

  async function clearCurrentLevel() {
    await page.evaluate(async () => {
      const game = window.__TANK_GAME__;
      for (const enemy of game.enemies) enemy.dispose();
      const { EnemyTank } = await import("/src/entities/Tank.js");
      const enemy = new EnemyTank(game, "light", 9.5, 20.5);
      enemy.speed = 0;
      enemy.think = 999;
      enemy.cooldownLeft = 999;
      enemy.invincible = 0;
      game.enemies = [enemy];
      game.spawned = game.levelConfig.sequence.length;
      game.spawnTimer = 999;
      game.kills = game.levelConfig.sequence.length - 1;
      game.updateUI();
    });
    await page.keyboard.down("Space");
    await page.waitForFunction(() => window.__TANK_GAME__.state !== "playing");
    await page.keyboard.up("Space");
  }

  await clearCurrentLevel();
  let snapshot = await page.evaluate(() => window.__TANK_GAME__.snapshot());
  assert.equal(snapshot.state, "level-clear");
  assert.equal(snapshot.level, 1);
  assert.match(
    await page.locator("#overlay-title").textContent(),
    /第 1 关完成/,
  );
  await page.locator("#primary-btn").click();
  await page.waitForFunction(
    () => window.__TANK_GAME__.state === "upgrade-select",
  );
  assert.equal(await page.locator(".upgrade-choice").count(), 3);
  await page.locator(".upgrade-choice").first().click();
  snapshot = await page.evaluate(() => window.__TANK_GAME__.snapshot());
  assert.equal(snapshot.state, "playing");
  assert.equal(snapshot.level, 2);
  assert.equal(snapshot.levelName, "交叉火力");
  assert.equal(await page.locator("#wave").textContent(), "02");
  assert.equal(await page.locator("#remaining").textContent(), "15");
  assert.ok(
    await page.evaluate(() => window.__TANK_GAME__.map.get(3, 9) === 3),
  );
  assert.ok(
    await page.evaluate(
      () => window.__TANK_GAME__.levelConfig.speedMultiplier > 1,
    ),
  );

  await clearCurrentLevel();
  await page.locator("#primary-btn").click();
  await page.waitForFunction(
    () => window.__TANK_GAME__.state === "upgrade-select",
  );
  assert.equal(await page.locator(".upgrade-choice").count(), 3);
  await page.locator(".upgrade-choice").first().click();
  snapshot = await page.evaluate(() => window.__TANK_GAME__.snapshot());
  assert.equal(snapshot.level, 3);
  assert.equal(snapshot.levelName, "钢铁堡垒");
  assert.equal(await page.locator("#wave").textContent(), "03");
  assert.equal(await page.locator("#remaining").textContent(), "18");
  assert.ok(
    await page.evaluate(
      () => window.__TANK_GAME__.levelConfig.fireMultiplier < 1,
    ),
  );

  await clearCurrentLevel();
  snapshot = await page.evaluate(() => window.__TANK_GAME__.snapshot());
  assert.equal(snapshot.state, "won");
  assert.equal(snapshot.level, 3);
  assert.match(
    await page.locator("#overlay-title").textContent(),
    /阵地守住了/,
  );
  await page.locator("#primary-btn").click();
  snapshot = await page.evaluate(() => window.__TANK_GAME__.snapshot());
  assert.equal(snapshot.state, "playing");
  assert.equal(snapshot.level, 1);
  assert.equal(snapshot.score, 0);
  assert.deepEqual(snapshot.runUpgrades, []);
  console.log(
    "PASS: three-stage progression, run-upgrade choices, difficulty tuning, score carry, final victory, and campaign restart.",
  );
} finally {
  await browser.close();
}
