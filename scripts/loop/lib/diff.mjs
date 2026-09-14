// scripts/loop/lib/diff.mjs
// Compare current capture vs baselines — pixelmatch for PNGs,
// deep-equal with whitelist for snapshots.json.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const PIXEL_THRESHOLD = 0.015; // 1.5% of pixels may differ (water animation, RNG, etc.)
const PIXEL_DELTA = 10;        // per-pixel color tolerance

// Whitelist of snapshot fields we treat as stable; everything else is noise.
// render.* is excluded — it varies frame-to-frame and is a perf metric, not state.
const SNAPSHOT_WHITELIST = [
  "state",
  "mode",
  "wave",
  "level",
  "levelName",
  "score",
  "kills",
  "lives",
  "baseAlive",
];

function pick(obj, dottedKey) {
  return dottedKey.split(".").reduce(
    (acc, k) => (acc == null ? acc : acc[k]),
    obj,
  );
}

export async function diffPngs(baselineDir, currentDir) {
  const files = (await readdir(baselineDir)).filter((f) => f.endsWith(".png"));
  const results = [];
  for (const file of files) {
    const basePath = path.join(baselineDir, file);
    const currPath = path.join(currentDir, file);
    let base, curr;
    try {
      base = PNG.sync.read(await readFile(basePath));
      curr = PNG.sync.read(await readFile(currPath));
    } catch (e) {
      results.push({
        file,
        status: "missing",
        diff_ratio: 1,
        message: e.message,
      });
      continue;
    }
    if (base.width !== curr.width || base.height !== curr.height) {
      results.push({
        file,
        status: "size-mismatch",
        diff_ratio: 1,
        message: `${base.width}x${base.height} vs ${curr.width}x${curr.height}`,
      });
      continue;
    }
    const diff = new PNG({ width: base.width, height: base.height });
    const count = pixelmatch(
      base.data,
      curr.data,
      diff.data,
      base.width,
      base.height,
      { threshold: PIXEL_DELTA / 255, alpha: 0.4 },
    );
    const total = base.width * base.height;
    const ratio = count / total;
    results.push({
      file,
      status: ratio <= PIXEL_THRESHOLD ? "ok" : "regressed",
      diff_ratio: ratio,
      diff_pixels: count,
    });
  }
  return results;
}

export async function diffSnapshots(baselinePath, currentPath) {
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  const current = JSON.parse(await readFile(currentPath, "utf8"));
  const diffs = [];
  const ids = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  for (const id of ids) {
    if (!baseline[id]) {
      diffs.push({ id, status: "new", fields: Object.keys(current[id]) });
      continue;
    }
    if (!current[id]) {
      diffs.push({ id, status: "removed", fields: Object.keys(baseline[id]) });
      continue;
    }
    const fieldDiffs = [];
    for (const f of SNAPSHOT_WHITELIST) {
      const a = pick(baseline[id], f);
      const b = pick(current[id], f);
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        fieldDiffs.push({ field: f, baseline: a, current: b });
      }
    }
    if (fieldDiffs.length) {
      diffs.push({ id, status: "field-drift", fieldDiffs });
    }
  }
  return diffs;
}

export async function runDiff({ baselineDir, currentDir, snapshotBaseline, snapshotCurrent }) {
  const pngResults = await diffPngs(
    path.join(baselineDir, "screenshots"),
    path.join(currentDir, "screenshots"),
  );
  const snapResults = await diffSnapshots(snapshotBaseline, snapshotCurrent);
  return { pngResults, snapResults };
}

export function summarize(result) {
  const pngFails = result.pngResults.filter(
    (r) => r.status === "regressed" || r.status === "missing" || r.status === "size-mismatch",
  );
  const snapFails = result.snapResults.filter((r) => r.status !== "ok");
  return {
    pass: pngFails.length === 0 && snapFails.length === 0,
    pngFails,
    snapFails,
    totalPngs: result.pngResults.length,
    totalSnaps: result.snapResults.length,
  };
}
