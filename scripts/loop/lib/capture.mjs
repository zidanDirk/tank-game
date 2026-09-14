// scripts/loop/lib/capture.mjs
// Capture game snapshots + 7 hero screenshots via Playwright.
// Reuses the launch pattern from tests/browser-check.mjs.
import { chromium } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { startServer, stopServer } from "./server.mjs";

export const SHOTS = [
  { id: "ready", setup: (g) => { g.mode = "campaign"; g.levelIndex = 0; g.reset(0, false); g.setOverlay("ready"); }, wait: 200 },
  { id: "active", setup: (g) => { g.mode = "campaign"; g.reset(0, false); g.start(); }, wait: 1200 },
  { id: "paused", setup: (g) => { g.mode = "campaign"; g.reset(0, false); g.start(); g.togglePause(); }, wait: 200 },
  {
    id: "buffs",
    setup: (g) => {
      g.mode = "campaign";
      g.reset(0, false);
      g.start();
      g.player.upgrade();
      g.player.upgrade();
      g.player.shieldLeft = 8;
      g.activeBuffs.set("helmet", g.time + 8);
      g.activeBuffs.set("clock", g.time + 7);
      g.syncBuffHud();
    },
    wait: 300,
  },
  {
    id: "boss",
    setup: (g) => {
      g.mode = "endless";
      g.resetEndless(5);
      g.startEndless();
      g.spawnBoss();
    },
    wait: 700,
  },
  {
    id: "level-clear",
    setup: (g) => {
      g.mode = "campaign";
      g.reset(0, false);
      g.completeLevel();
    },
    wait: 400,
  },
  {
    id: "lost",
    setup: (g) => {
      g.mode = "endless";
      g.resetEndless(1);
      g.finish(false, "测试记录：第 1 波阵亡。");
    },
    wait: 400,
  },
];

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

async function launchChrome() {
  for (const executablePath of CHROME_CANDIDATES) {
    try {
      return await chromium.launch({
        executablePath,
        headless: true,
        args: [
          "--use-gl=angle",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
          "--disable-gpu-vsync",
          "--no-sandbox",
        ],
      });
    } catch (e) {
      // try next candidate
    }
  }
  throw new Error(
    "No Chrome/Chromium found. Set CHROME_PATH or install @playwright/test browsers.",
  );
}

export async function captureBaselines({ outDir }) {
  const url = await startServer();
  const browser = await launchChrome();
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(
      () => typeof window.__TANK_GAME__ !== "undefined",
      { timeout: 15000 },
    );
    await page.waitForTimeout(800);

    const snapshots = {};
    await mkdir(path.join(outDir, "screenshots"), { recursive: true });

    for (const shot of SHOTS) {
      // Each scenario's setup function is responsible for resetting game state.
      await page.evaluate((setupSrc) => {
        const g = window.__TANK_GAME__;
        const fn = new Function("g", `return (${setupSrc})(g)`);
        fn(g);
      }, shot.setup.toString());

      if (shot.wait) await page.waitForTimeout(shot.wait);

      const file = path.join(outDir, "screenshots", `${shot.id}.png`);
      await page.screenshot({ path: file, fullPage: false });
      snapshots[shot.id] = await page.evaluate(() =>
        JSON.parse(JSON.stringify(window.__TANK_GAME__.snapshot())),
      );
      console.log(`  captured ${shot.id}`);
    }

    await writeFile(
      path.join(outDir, "snapshots.json"),
      JSON.stringify(snapshots, null, 2),
    );
    return snapshots;
  } finally {
    await browser.close();
    await stopServer();
  }
}

// Capture a single state for verify-time use (cheaper than full baseline).
export async function captureState({ outDir, scenarios }) {
  const url = await startServer();
  const browser = await launchChrome();
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(
      () => typeof window.__TANK_GAME__ !== "undefined",
      { timeout: 15000 },
    );
    await page.waitForTimeout(800);

    await mkdir(path.join(outDir, "screenshots"), { recursive: true });
    const out = {};
    for (const s of scenarios) {
      await page.evaluate((setupSrc) => {
        const g = window.__TANK_GAME__;
        const fn = new Function("g", `return (${setupSrc})(g)`);
        fn(g);
      }, s.setup.toString());
      if (s.wait) await page.waitForTimeout(s.wait);
      const file = path.join(outDir, "screenshots", `${s.id}.png`);
      await page.screenshot({ path: file });
      out[s.id] = await page.evaluate(() =>
        JSON.parse(JSON.stringify(window.__TANK_GAME__.snapshot())),
      );
    }
    await writeFile(
      path.join(outDir, "snapshots.json"),
      JSON.stringify(out, null, 2),
    );
    return out;
  } finally {
    await browser.close();
    await stopServer();
  }
}
