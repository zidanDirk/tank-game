import { test } from "node:test";
import assert from "node:assert/strict";
import { browserLaunchOptions } from "./browser-launch.mjs";

test("CI uses the Playwright-managed Chromium when no path is configured", () => {
  const options = browserLaunchOptions({ chromePath: "", platform: "linux" });
  assert.equal("executablePath" in options, false);
  assert.equal(options.headless, true);
});

test("an explicit Chrome path is honored", () => {
  const options = browserLaunchOptions({
    chromePath: "/opt/chrome/chrome",
    platform: "linux",
  });
  assert.equal(options.executablePath, "/opt/chrome/chrome");
});

test("macOS keeps the existing local Chrome default", () => {
  const options = browserLaunchOptions({ chromePath: "", platform: "darwin" });
  assert.equal(
    options.executablePath,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  );
});
