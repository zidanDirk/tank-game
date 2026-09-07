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
    if (!this.context || this.context.state !== "running" || this.muted) return;
    const c = this.context,
      t = c.currentTime;
    const g = c.createGain();
    g.connect(this.master);
    const o = c.createOscillator();
    o.type = kind === "explosion" ? "sawtooth" : "square";
    const f =
      { shoot: 180, hit: 90, brick: 130, explosion: 65, start: 440 }[kind] ||
      180;
    const d = kind === "explosion" ? 0.4 : 0.1;
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
}
