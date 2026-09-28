import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { browserLaunchOptions } from "./browser-launch.mjs";
const browser = await chromium.launch(browserLaunchOptions());
const errors = [];
const evidence = process.env.TANK_EVIDENCE_DIR || "artifacts";
await mkdir(evidence, { recursive: true });
try {
  for (const [name, width, height, touch] of [
    ["desktop", 1440, 900, false],
    ["portrait", 390, 844, true],
    ["landscape", 844, 390, true],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      hasTouch: touch,
      isMobile: touch,
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() =>
      localStorage.setItem("tank-visual-quality", "low"),
    );
    await page.goto("http://127.0.0.1:5173/");
    await page.locator("[data-level='0']").waitFor();
    assert.equal(
      await page.locator(".chapter-stages button:disabled").count(),
      8,
    );
    if (name === "desktop")
      await page.screenshot({ path: `${evidence}/campaign-menu.png` });
    await page.locator("#primary-btn").click();
    await page.waitForFunction(() =>
      document.querySelector(".app-shell").classList.contains("immersive"),
    );
    await page.evaluate(() => {
      const g = window.__TANK_GAME__;
      g.spawnTimer = 999;
      for (const e of g.enemies) {
        e.speed = 0;
        e.cooldownLeft = 999;
      }
    });
    const rect = await page.locator("#battlefield").boundingBox();
    assert.ok(
      rect.width > 300 && rect.height > (touch ? 220 : 680),
      `${name}: ${JSON.stringify(rect)}`,
    );
    const layout = await page.evaluate(() => ({
      vw: innerWidth,
      width: document.documentElement.scrollWidth,
      height: document.querySelector(".app-shell").getBoundingClientRect()
        .bottom,
    }));
    assert.ok(layout.width <= width + 1, `${name}: horizontal overflow`);
    assert.ok(layout.height <= height + 1, `${name}: vertical overflow`);
    if (touch) {
      for (const id of ["[data-control='up']", ".touch-fire", "#touch-emp"]) {
        const r = await page.locator(id).boundingBox();
        assert.ok(
          r &&
            r.x >= 0 &&
            r.y >= 0 &&
            r.x + r.width <= width + 1 &&
            r.y + r.height <= height + 1,
          `${name}: ${id} out of viewport`,
        );
        if (name === "landscape")
          assert.ok(
            r.x + r.width <= rect.x || r.x >= rect.x + rect.width,
            `${id} covers battlefield`,
          );
      }
    }
    const rendered = await page.evaluate(
      () => window.__TANK_GAME__.renderer.info.render.frame,
    );
    await page.waitForFunction(
      (frame) => window.__TANK_GAME__.renderer.info.render.frame > frame + 2,
      rendered,
    );
    await page.screenshot({ path: `${evidence}/battle-${name}.png` });
    if (
      name === "desktop" &&
      (await page.evaluate(() => document.fullscreenEnabled))
    ) {
      await page.locator("#fullscreen-btn").click();
      await page.waitForFunction(() => !!document.fullscreenElement);
      await page.locator("#fullscreen-btn").click();
      await page.waitForFunction(() => !document.fullscreenElement);
    }
    await page.locator("#tactics-btn").click();
    assert.equal(
      await page.evaluate(() => window.__TANK_GAME__.state),
      "paused",
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page.evaluate(() => window.__TANK_GAME__.state),
      "paused",
    );
    await page.locator("#primary-btn").click();
    await page.locator("#tactics-btn").click();
    await page.locator("#campaign-menu-btn").click();
    await page.waitForFunction(() => window.__TANK_GAME__.state === "ready");
    assert.equal(await page.locator(".chapter-stages button").count(), 9);
    if (name === "desktop") {
      const bossSpawn = await page.evaluate(() => {
        const g = window.__TANK_GAME__;
        g.campaignProgress.unlocked = 9;
        g.selectCampaignLevel(8);
        g.start();
        for (const e of g.enemies) e.dispose();
        g.enemies = [];
        g.bullets.clear();
        g.spawned = g.levelConfig.sequence.length - 1;
        const spawned = g.spawnEnemy(1);
        const maxHp = g.boss.maxHp;
        g.boss.x = 12.5;
        g.boss.z = 10.5;
        g.boss.hp = 9;
        g.boss.invincible = 0;
        g.boss.attackTimer = 0;
        g.player.x = 12.5;
        g.player.z = 14.5;
        g.player.invincible = 999;
        g.spawnTimer = 999;
        g.updateUI();
        return { spawned, maxHp };
      });
      assert.deepEqual(bossSpawn, { spawned: true, maxHp: 18 });
      await page.waitForFunction(
        () => window.__TANK_GAME__.boss.telegraph.line.visible,
      );
      assert.equal(await page.locator("#boss-hp").isVisible(), true);
      assert.match(await page.locator(".boss-name").textContent(), /阶段 2/);
      await page.screenshot({ path: `${evidence}/tactical-boss.png` });
      await page.keyboard.press("KeyQ");
      assert.ok(
        await page.evaluate(() => {
          const g = window.__TANK_GAME__;
          return (
            g.empCooldownLeft > 0 &&
            g.boss.frozenUntil > g.time &&
            !g.boss.telegraph.line.visible
          );
        }),
      );
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: responsive battlefield, mobile controls, campaign menu, drawer pause/resume and no browser errors.",
  );
} finally {
  await browser.close();
}
