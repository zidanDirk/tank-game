import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5173");
  await page.locator("#primary-btn").click();
  await page.keyboard.down("KeyW");
  const rect = await page.locator("canvas").boundingBox();
  await page.mouse.move(rect.x + rect.width * 0.7, rect.y + rect.height * 0.4);
  assert.equal(
    await page.evaluate(() => window.__TANK_GAME__.input.mouseAim),
    true,
  );
  await page.keyboard.down("KeyW");
  assert.equal(
    await page.evaluate(() => window.__TANK_GAME__.input.mouseAim),
    true,
  );
  await page.keyboard.up("KeyW");
  await page.goto("http://127.0.0.1:4173");
  await page.locator("#primary-btn").click();
  assert.equal(await page.locator("#status-label").textContent(), "作战中");
  assert.equal(
    await page.evaluate(() => typeof window.__TANK_GAME__),
    "undefined",
  );
  console.log(
    "PASS: mouse aiming survives keyboard repeat; final production build starts with no debug hook.",
  );
} finally {
  await browser.close();
}
