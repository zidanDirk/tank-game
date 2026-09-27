import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { browserLaunchOptions } from "./browser-launch.mjs";

const browser = await chromium.launch(browserLaunchOptions());
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.addInitScript(() =>
    localStorage.setItem("tank-visual-quality", "low"),
  );
  await page.goto("http://127.0.0.1:5173/");
  await page.locator("#primary-btn").click();
  await page.evaluate(() => {
    const g = window.__TANK_GAME__;
    g.spawnTimer = 999;
    for (const e of g.enemies) {
      e.speed = 0;
      e.cooldownLeft = 999;
    }
  });
  const canvas = await page.locator("#battlefield canvas").boundingBox();
  await page.mouse.move(
    canvas.x + canvas.width * 0.68,
    canvas.y + canvas.height * 0.4,
  );
  await page.keyboard.down("KeyW");
  await page.waitForFunction(() => window.__TANK_GAME__.player.z < 23);
  await page.keyboard.up("KeyW");
  await page.keyboard.down("KeyA");
  await page.waitForFunction(() => window.__TANK_GAME__.input.direction === 3);
  assert.equal(
    await page.evaluate(() => window.__TANK_GAME__.input.mouseAim),
    true,
  );
  await page.keyboard.up("KeyA");
  // Confirm the guide ends at exactly the first collision from the shared trace.
  const guide = await page.evaluate(() => {
    const g = window.__TANK_GAME__,
      p = g.player;
    g.input.mouseAim = true;
    p.x = 9.5;
    p.z = 11.5;
    p.aim = Math.PI / 2;
    g.input.target = { x: 16, z: 11.5 };
    g._updateTouchAimLine();
    const point = g.aimReticle.position;
    return { visible: g.aimReticle.visible, x: point.x, z: point.z };
  });
  assert.equal(guide.visible, true);
  assert.ok(Math.abs(guide.x - 9.9) < 1e-5);
  assert.equal(guide.z, 11.5);
  await page.locator("#aim-mode").selectOption("classic");
  await page.mouse.move(
    canvas.x + canvas.width * 0.6,
    canvas.y + canvas.height * 0.35,
  );
  await page.keyboard.down("KeyD");
  await page.waitForFunction(
    () => window.__TANK_GAME__.player.aim === Math.PI / 2,
  );
  assert.equal(
    await page.evaluate(() => window.__TANK_GAME__.input.mouseAim),
    false,
  );
  await page.keyboard.up("KeyD");
  await page.locator("#aim-mode").selectOption("independent");
  await page.evaluate(() => {
    const g = window.__TANK_GAME__;
    g.mode = "endless";
    g.resetEndless(1);
    g.state = "playing";
    g.setOverlay();
    g.spawnTimer = 999;
    for (const e of g.enemies) {
      e.speed = 0;
      e.cooldownLeft = 999;
    }
    for (let wave = 1; wave <= 4; wave++) {
      g.resetEndless(wave);
      if (!g.collision.canMove(g.player, g.player.x, g.player.z - 0.25))
        throw new Error(`Blocked player spawn in wave ${wave}`);
      if (g.map.bricks.count > g.map.bricks.instanceMatrix.count)
        throw new Error(`Instance overflow in wave ${wave}`);
    }
    g.resetEndless(1);
    g.spawnTimer = 999;
    for (const e of g.enemies) {
      e.speed = 0;
      e.cooldownLeft = 999;
    }
    g.runUpgrades.apply("ricochet");
    g.player.applyLevelStats();
    g.syncRunUpgradeHud();
  });
  assert.equal(
    await page.evaluate(() => window.__TANK_GAME__.player.ricochets),
    1,
  );
  await page.keyboard.press("KeyQ");
  await page.waitForFunction(() => window.__TANK_GAME__.empCooldownLeft > 0);
  await page.keyboard.press("KeyP");
  const pausedCooldown = await page.evaluate(
    () => window.__TANK_GAME__.empCooldownLeft,
  );
  await page.waitForTimeout(200);
  assert.equal(
    await page.evaluate(() => window.__TANK_GAME__.empCooldownLeft),
    pausedCooldown,
  );
  await page.keyboard.press("KeyP");
  await page.evaluate(() => {
    const g = window.__TANK_GAME__;
    g.beginEndlessWave(2);
    g.spawnTimer = 999;
    for (const e of g.enemies) {
      e.speed = 0;
      e.cooldownLeft = 999;
    }
  });
  assert.ok(
    await page.evaluate(() => window.__TANK_GAME__.empCooldownLeft > 0),
  );
  assert.equal(
    await page.evaluate(() => window.__TANK_GAME__.player.ricochets),
    1,
  );
  await page.screenshot({ path: "artifacts/neon-desktop.png", fullPage: true });
  // Render the high-quality path and exercise repeated release/recreation of render targets.
  const memory = [];
  for (let i = 0; i < 3; i++) {
    await page.locator("#visual-quality").selectOption("high");
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert.equal(
      await page.evaluate(() => window.__TANK_GAME__.neonRenderer.quality),
      "high",
    );
    if (i === 0)
      await page.screenshot({
        path: "artifacts/neon-bloom.png",
        fullPage: true,
      });
    await page.locator("#visual-quality").selectOption("low");
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    memory.push(
      await page.evaluate(
        () => window.__TANK_GAME__.renderer.info.memory.textures,
      ),
    );
  }
  assert.ok(
    Math.max(...memory) - Math.min(...memory) <= 1,
    `texture leak: ${memory}`,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.__TANK_GAME__.empCooldownLeft = 0;
  });
  await page.locator("#touch-emp").click();
  assert.ok(
    await page.evaluate(() => window.__TANK_GAME__.empCooldownLeft > 0),
  );
  await page.screenshot({ path: "artifacts/neon-mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.locator("#primary-btn").click();
  assert.equal(
    await page.evaluate(() => window.__TANK_GAME__.reducedMotion),
    true,
  );
  await page.keyboard.down("KeyD");
  await page.waitForFunction(() => window.__TANK_GAME__.player.direction === 1);
  assert.equal(await page.evaluate(() => window.__TANK_GAME__.player.pitch), 0);
  await page.keyboard.up("KeyD");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      pass: true,
      aim: "independent + classic + occlusion",
      emp: "keyboard + touch + pause + wave persistence",
      bloom: "render + release",
      textures: memory,
      mobileOverflow: false,
      reducedMotion: true,
      errors,
    }),
  );
} finally {
  await browser.close();
}
