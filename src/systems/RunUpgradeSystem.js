import { RUN_UPGRADES, RUN_UPGRADE_KEYS } from "../core/config.js";

export class RunUpgradeSystem {
  constructor() {
    this.stacks = new Map();
    this.choices = [];
  }

  get(id) {
    return this.stacks.get(id) ?? 0;
  }

  reset() {
    this.stacks.clear();
    this.choices = [];
  }

  roll(rng, count = 3) {
    const candidates = RUN_UPGRADE_KEYS.filter(
      (id) => this.get(id) < RUN_UPGRADES[id].maxStacks,
    );
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    this.choices = candidates.slice(0, count);
    return [...this.choices];
  }

  apply(id) {
    const upgrade = RUN_UPGRADES[id];
    if (!upgrade) return false;
    const current = this.get(id);
    if (current >= upgrade.maxStacks) return false;
    this.stacks.set(id, current + 1);
    this.choices = [];
    return true;
  }

  snapshot() {
    return RUN_UPGRADE_KEYS.filter((id) => this.get(id) > 0).map((id) => ({
      id,
      stacks: this.get(id),
    }));
  }
}
