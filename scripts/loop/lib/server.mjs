// scripts/loop/lib/server.mjs
// Start/stop Vite dev server for Playwright capture.
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const PORT = 5173;
const BASE = `http://127.0.0.1:${PORT}`;

let proc = null;

export async function startServer() {
  if (proc) return BASE;
  proc = spawn("npm", ["run", "dev"], {
    stdio: ["ignore", "ignore", "pipe"],
    env: { ...process.env, BROWSER: "none" },
    detached: false,
  });
  // Wait for "ready" line on stderr (Vite prints "Local: http://...")
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return BASE;
    } catch {}
    await delay(500);
  }
  throw new Error("Vite dev server did not start within 30s");
}

export async function stopServer() {
  if (!proc) return;
  proc.kill("SIGTERM");
  await delay(300);
  if (!proc.killed) proc.kill("SIGKILL");
  proc = null;
}

export async function withServer(fn) {
  const url = await startServer();
  try {
    return await fn(url);
  } finally {
    await stopServer();
  }
}

export { BASE };
