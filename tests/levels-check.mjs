import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { browserLaunchOptions } from "./browser-launch.mjs";
const browser = await chromium.launch(browserLaunchOptions());
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem("tank-visual-quality", "low"),
  );
  await page.goto("http://127.0.0.1:5173/");
  await page.locator("#primary-btn").click();
  for (let level = 1; level <= 9; level++) {
    const snapshot = await page.evaluate(() => window.__TANK_GAME__.snapshot());
    assert.equal(snapshot.level, level);
    assert.equal(snapshot.state, "playing");
    await page.evaluate(async () => {
      const g = window.__TANK_GAME__;
      for (const e of g.enemies) e.dispose();
      g.boss = null;
      g.bullets.clear();
      const { EnemyTank } = await import("/src/entities/Tank.js");
      const enemy = new EnemyTank(g, "light", 9.5, 20.5);
      enemy.speed = 0;
      enemy.think = 999;
      enemy.cooldownLeft = 999;
      enemy.invincible = 0;
      g.enemies = [enemy];
      g.spawned = g.levelConfig.sequence.length;
      g.spawnTimer = 999;
      g.kills = g.levelConfig.sequence.length - 1;
      g.player.x = 9.5;
      g.player.z = 23.5;
      g.player.aim = 0;
      g.input.mouseAim = false;
      g.updateUI();
    });
    await page.keyboard.down("Space");
    await page.waitForFunction(
      () =>
        window.__TANK_GAME__.kills >=
        window.__TANK_GAME__.levelConfig.sequence.length,
    );
    await page.keyboard.up("Space");
    if (level === 8) {
      assert.equal(
        await page.evaluate(() => window.__TANK_GAME__.state),
        "playing",
        "survival must not end on kill count",
      );
      await page.evaluate(() => {
        window.__TANK_GAME__.time = 89.98;
      });
    }
    await page.waitForFunction(() => window.__TANK_GAME__.state !== "playing");
    assert.equal(
      await page.evaluate(() => window.__TANK_GAME__.state),
      level === 9 ? "won" : "level-clear",
    );
    assert.equal(
      await page.evaluate(() => window.__TANK_GAME__.campaignProgress.unlocked),
      Math.min(9, level + 1),
    );
    if (level < 9) {
      await page.locator("#primary-btn").click();
      assert.equal(await page.locator(".upgrade-choice").count(), 3);
      await page.locator(".upgrade-choice").first().click();
      if (level === 3)
        assert.equal(
          await page.evaluate(() => window.__TANK_GAME__.player.ricochets),
          1,
        );
      if (level === 4)
        assert.equal(
          await page.evaluate(() => window.__TANK_GAME__.empAvailable()),
          true,
        );
    }
  }
  assert.equal(
    await page.evaluate(
      () => Object.keys(window.__TANK_GAME__.campaignProgress.records).length,
    ),
    9,
  );
  await page.reload();
  await page.locator("[data-level='8']").waitFor();
  assert.equal(
    await page.locator(".chapter-stages button:disabled").count(),
    0,
  );
  await page.locator("[data-level='8']").click();
  await page.locator("#primary-btn").click();
  assert.equal(await page.evaluate(() => window.__TANK_GAME__.levelIndex), 8);
  assert.equal(await page.evaluate(() => window.__TANK_GAME__.score), 0);
  assert.deepEqual(
    await page.evaluate(() => window.__TANK_GAME__.runUpgrades.snapshot()),
    [],
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: all nine stages, between-stage upgrades, survival timer, ability unlocks, victory, persistent records and replay selection.",
  );
} finally {
  await browser.close();
}
