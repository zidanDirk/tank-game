import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { browserLaunchOptions } from "./browser-launch.mjs";

const browser = await chromium.launch(browserLaunchOptions());

const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

async function arrangeFinalEnemy({ mode, wave = 0 }) {
  await page.evaluate(
    async ({ nextMode, nextWave }) => {
      const game = window.__TANK_GAME__;
      game.mode = nextMode;
      if (nextMode === "endless") {
        game.resetRunUpgrades();
        game.resetEndless(nextWave);
        game.state = "playing";
        game.setOverlay();
      }
      for (const enemy of game.enemies) enemy.dispose();
      const { EnemyTank } = await import("/src/entities/Tank.js");
      const laneX = Math.floor(game.player.x);
      for (
        let laneZ = Math.floor(game.player.z) - 4;
        laneZ <= Math.floor(game.player.z);
        laneZ++
      )
        game.map.cells[laneZ * 26 + laneX] = 0;
      game.map.rebuildInstances();
      const enemy = new EnemyTank(
        game,
        "light",
        game.player.x,
        game.player.z - 3,
      );
      enemy.speed = 0;
      enemy.think = 999;
      enemy.cooldownLeft = 999;
      enemy.invincible = 0;
      game.enemies = [enemy];
      game.spawned = game.levelConfig.sequence.length;
      game.spawnTimer = 999;
      game.kills = game.levelConfig.sequence.length - 1;
      game.updateUI();
    },
    { nextMode: mode, nextWave: wave },
  );
}

async function destroyArrangedEnemy() {
  await page.keyboard.down("Space");
  await page.waitForFunction(() => window.__TANK_GAME__.state !== "playing");
  await page.keyboard.up("Space");
}

try {
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForFunction(() => window.__TANK_GAME__);
  await page.locator("#primary-btn").click();

  await arrangeFinalEnemy({ mode: "campaign" });
  await destroyArrangedEnemy();
  assert.equal(
    await page.evaluate(() => window.__TANK_GAME__.state),
    "level-clear",
  );
  await page.locator("#primary-btn").click();
  await page.waitForFunction(
    () => window.__TANK_GAME__.state === "upgrade-select",
  );

  const desktopChoices = await page.locator(".upgrade-choice").count();
  assert.equal(desktopChoices, 3);
  const ids = await page
    .locator(".upgrade-choice")
    .evaluateAll((buttons) => buttons.map((button) => button.dataset.upgrade));
  assert.equal(new Set(ids).size, 3);
  await page.screenshot({
    path: "artifacts/desktop-upgrade-select.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLayout = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overlay: document
      .querySelector("#overlay-panel")
      .getBoundingClientRect()
      .toJSON(),
  }));
  assert.equal(mobileLayout.width, mobileLayout.scrollWidth);
  assert.ok(mobileLayout.overlay.left >= 0);
  assert.ok(mobileLayout.overlay.right <= mobileLayout.width);
  await page.screenshot({
    path: "artifacts/mobile-upgrade-select.png",
    fullPage: true,
  });

  const selectedCampaignId = ids[0];
  const campaignCenter = await page.evaluate((id) => {
    const button = document.querySelector(
      `.upgrade-choice[data-upgrade="${id}"]`,
    );
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, selectedCampaignId);
  await page.mouse.click(campaignCenter.x, campaignCenter.y);
  let snapshot = await page.evaluate(() => window.__TANK_GAME__.snapshot());
  assert.equal(snapshot.state, "playing");
  assert.equal(snapshot.level, 2);
  assert.deepEqual(snapshot.runUpgrades, [
    { id: selectedCampaignId, stacks: 1 },
  ]);
  assert.equal(await page.locator(".run-upgrade-slot").count(), 1);

  await page.setViewportSize({ width: 1280, height: 900 });
  await arrangeFinalEnemy({ mode: "endless", wave: 3 });
  await destroyArrangedEnemy();
  snapshot = await page.evaluate(() => window.__TANK_GAME__.snapshot());
  assert.equal(snapshot.state, "upgrade-select");
  assert.equal(snapshot.wave, 3);
  assert.equal(snapshot.upgradeChoices.length, 3);
  const endlessId = snapshot.upgradeChoices[0];
  const endlessCenter = await page.evaluate((id) => {
    const button = document.querySelector(
      `.upgrade-choice[data-upgrade="${id}"]`,
    );
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, endlessId);
  await page.mouse.click(endlessCenter.x, endlessCenter.y);
  snapshot = await page.evaluate(() => window.__TANK_GAME__.snapshot());
  assert.equal(snapshot.state, "playing");
  assert.equal(snapshot.wave, 4);
  assert.deepEqual(snapshot.runUpgrades, [{ id: endlessId, stacks: 1 }]);
  assert.deepEqual(errors, []);

  console.log(
    JSON.stringify(
      {
        pass: true,
        campaignChoice: selectedCampaignId,
        endlessChoice: endlessId,
        mobileLayout,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
