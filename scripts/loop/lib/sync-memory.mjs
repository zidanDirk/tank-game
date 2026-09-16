#!/usr/bin/env node
// scripts/loop/lib/sync-memory.mjs
// Bidirectional bridge between Claude Code sessions and the project's
// MEMORY.md (~/.../memory/MEMORY.md).
//
//   --on-start  : read MEMORY.md and emit SessionStart additionalContext so the
//                 new session knows what happened last time.
//   --on-stop   : extract a 30-turn digest from the latest transcript JSONL and
//                 write MEMORY.md for the next session to read.
//
// Invoked from .claude/settings.json SessionStart / Stop hooks.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const mode = process.argv[2];
const REPO = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
const PROJ_DIR = join(
  process.env.HOME || "",
  ".claude",
  "projects",
  "-Users-zidanzhang-work-hy-tank-game"
);
const MEMORY_FILE = join(PROJ_DIR, "memory", "MEMORY.md");

if (mode === "--on-start") {
  if (!existsSync(MEMORY_FILE)) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext:
            "[tank-loop] MEMORY.md absent — first session. Read scripts/loop/state.json + scripts/loop/loop-prompt.md to bootstrap.",
        },
      })
    );
    process.exit(0);
  }
  const body = readFileSync(MEMORY_FILE, "utf8").split("\n").slice(0, 200).join("\n");
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: `[tank-loop] MEMORY.md (last session digest):\n\n${body}`,
      },
    })
  );
  process.exit(0);
}

if (mode === "--on-stop") {
  const files = readdirSync(PROJ_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => ({ f, m: statSync(join(PROJ_DIR, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (!files.length) process.exit(0);

  const latest = files[0].f;
  const lines = readFileSync(join(PROJ_DIR, latest), "utf8")
    .split("\n")
    .filter(Boolean);

  const turns = [];
  for (const line of lines) {
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (rec.type !== "user" && rec.type !== "assistant") continue;
    const blocks = Array.isArray(rec.message?.content) ? rec.message.content : [];
    const text = blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .slice(0, 600);
    if (text) turns.push(`[${rec.type}] ${text.replace(/\s+/g, " ").trim()}`);
  }
  const tail = turns.slice(-30);

  const state = JSON.parse(
    readFileSync(join(REPO, "scripts", "loop", "state.json"), "utf8")
  );
  const now = new Date().toISOString();

  const md = [
    "# Tank 1990 — Session Memory",
    "",
    `Last written: ${now}`,
    `Source transcript: ${latest}`,
    "",
    "## Loop state at session end",
    `- next_action: ${state.next_action}`,
    `- current_item_id: ${state.current_item_id}`,
    `- needs_human: ${state.needs_human}`,
    `- last_completed_at: ${state.last_completed_at}`,
    `- failed_cycles_in_row: ${state.failed_cycles_in_row}`,
    "",
    "## Last 30 turns",
    ...tail.map((t) => `- ${t}`),
    "",
  ].join("\n");

  writeFileSync(MEMORY_FILE, md);
  process.exit(0);
}

console.error("usage: sync-memory.mjs --on-start | --on-stop");
process.exit(2);