import { LEVELS } from "../core/config.js";
export const CAMPAIGN_KEY = "tank-campaign-v1";
const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export class CampaignProgress {
  constructor(storage) {
    this.storage = storage;
    this.unlocked = 1;
    this.records = {};
    try {
      this.storage ??= globalThis.localStorage;
      const data = JSON.parse(this.storage?.getItem(CAMPAIGN_KEY) ?? "null");
      if (data?.version !== 1) return;
      if (Number.isInteger(data.unlocked))
        this.unlocked = Math.max(1, Math.min(LEVELS.length, data.unlocked));
      for (const [key, record] of Object.entries(data.records ?? {})) {
        if (
          !/^[1-9]:(cadet|veteran|iron-hand|iron-curtain)$/.test(key) ||
          !finite(record?.score) ||
          !finite(record?.seconds)
        )
          continue;
        this.records[key] = {
          score: record.score,
          seconds: record.seconds,
          intact: record.intact === true,
          swift: record.swift === true,
        };
      }
    } catch {
      /* Storage unavailable or invalid: campaign still works in memory. */
    }
  }
  record(level, difficulty, score, seconds, deaths) {
    this.unlocked = Math.max(this.unlocked, Math.min(LEVELS.length, level + 1));
    const key = `${level}:${difficulty}`;
    const previous = this.records[key];
    const swift = LEVELS[level - 1].goal?.kind !== "survive" && seconds <= 150;
    this.records[key] = {
      score: Math.max(previous?.score ?? 0, score),
      seconds: Math.min(previous?.seconds ?? Infinity, seconds),
      intact: previous?.intact || deaths === 0,
      swift: previous?.swift || swift,
    };
    try {
      this.storage?.setItem(
        CAMPAIGN_KEY,
        JSON.stringify({
          version: 1,
          unlocked: this.unlocked,
          records: this.records,
        }),
      );
    } catch {
      /* Keep session progress when persistence is blocked. */
    }
    return this.records[key];
  }
}
