const FREQ = {
  shoot: 180,
  hit: 90,
  brick: 130,
  explosion: 65,
  start: 440,
  "pickup-spawn": 220,
  powerup: 330,
  levelup: 520,
  shield: 280,
  bomb: 110,
  clock: 360,
  shovel: 200,
};
const DUR = {
  shoot: 0.1,
  hit: 0.1,
  brick: 0.1,
  explosion: 0.4,
  start: 0.4,
  "pickup-spawn": 0.18,
  powerup: 0.22,
  levelup: 0.3,
  shield: 0.18,
  bomb: 0.45,
  clock: 0.32,
  shovel: 0.22,
};
const WAVE = {
  shoot: "square",
  hit: "square",
  brick: "square",
  explosion: "sawtooth",
  start: "square",
  "pickup-spawn": "triangle",
  powerup: "triangle",
  levelup: "triangle",
  shield: "sine",
  bomb: "sawtooth",
  clock: "sine",
  shovel: "square",
};
// Mobile haptic patterns in milliseconds. Use 0 for events that should NOT
// vibrate (e.g. brick chips are too spammy). Patterns may be arrays for the
// Vibration API's on/off pulse form.
const VIBRATE = {
  shoot: 8,
  hit: 45,
  brick: 0,
  explosion: 120,
  start: 0,
  "pickup-spawn": 0,
  powerup: 30,
  levelup: [50, 25, 50],
  shield: 25,
  bomb: 220,
  clock: 30,
  shovel: 30,
  "aim-lock": 8,
};

export class AudioSystem {
  constructor() {
    this.muted = false;
    this.context = null;
  }
  unlock() {
    try {
      if (!this.context) {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : 0.18;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === "suspended")
        this.context.resume().catch(() => {});
    } catch {
      /* Audio is optional if the browser has no Web Audio support. */
    }
  }
  toggle() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.18;
    return this.muted;
  }
  play(kind) {
    // Haptic fires BEFORE the audio early-return so it still triggers when the
    // sound is muted (independent channel for accessibility on touch devices).
    this.vibrate(kind);
    if (!this.context || this.context.state !== "running" || this.muted) return;
    const c = this.context,
      t = c.currentTime;
    const g = c.createGain();
    g.connect(this.master);
    const o = c.createOscillator();
    o.type = WAVE[kind] ?? "square";
    const f = FREQ[kind] ?? 180;
    const d = DUR[kind] ?? 0.1;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(25, t + d);
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g);
    o.start(t);
    o.stop(t + d);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  vibrate(kind) {
    if (typeof navigator === "undefined") return;
    if (typeof navigator.vibrate !== "function") return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const p = VIBRATE[kind];
    if (p === undefined || p === 0) return;
    try {
      navigator.vibrate(p);
    } catch {
      /* vibrate may throw in insecure contexts — ignore. */
    }
  }
}
