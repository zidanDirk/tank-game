import * as THREE from "three";
export class Effects {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.capacity = 700;
    this.particles = [];
    this.positions = new Float32Array(this.capacity * 3);
    this.colors = new Float32Array(this.capacity * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3),
    );
    this.geo.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.material = new THREE.PointsMaterial({
      size: 4,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: false,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.wrecks = [];
    this.pulses = [];
    this.shakeState = { mag: 0, duration: 0, time: 0, ox: 0, oz: 0 };
    this.slowMoState = { remaining: 0, scale: 1 };
  }
  burst(x, y, z, color, count = 15, life = 0.9) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.capacity) this.particles.shift();
      this.particles.push({
        x,
        y,
        z,
        vx: (this.rng() - 0.5) * 5,
        vy: 1 + this.rng() * 4,
        vz: (this.rng() - 0.5) * 5,
        life: life * (0.5 + this.rng() * 0.5),
        max: life,
        color: c,
        smoke: false,
      });
    }
  }
  smoke(x, z) {
    if (this.particles.length >= this.capacity) return;
    this.particles.push({
      x: x + (this.rng() - 0.5) * 0.3,
      y: 0.8,
      z,
      vx: (this.rng() - 0.5) * 0.3,
      vy: 0.8,
      vz: 0.1,
      life: 1.6,
      max: 1.6,
      color: new THREE.Color(0x778070),
      smoke: true,
    });
  }
  explode(x, z) {
    this.pulse(x, z, 0xff926b, 1.7, 0.35, 4);
    this.burst(x, 0.6, z, 0xf3b55c, 38, 1.2);
    this.burst(x, 0.6, z, 0x685b43, 20, 1.5);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.84, 0.15, 0.98),
      new THREE.MeshStandardMaterial({ color: 0x515345, roughness: 1 }),
    );
    mesh.position.set(x, 0.1, z);
    mesh.rotation.y = this.rng() * Math.PI;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.wrecks.push({ mesh, x, z, life: 10, smoke: 0 });
  }
  pulse(x, z, color, radius, duration, segments = 48) {
    if (this.pulses.length >= 12) this.disposePulse(this.pulses.shift());
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1, segments),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.065, z);
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    mesh.scale.setScalar(reduced ? radius : 0.1);
    this.scene.add(mesh);
    this.pulses.push({ mesh, radius, duration, life: duration, reduced });
  }
  disposePulse(pulse) {
    pulse.mesh.removeFromParent();
    pulse.mesh.geometry.dispose();
    pulse.mesh.material.dispose();
  }
  shake(durationMs, magnitude) {
    if (typeof window !== "undefined" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (mq.matches) return;
    }
    // Take the larger of the two so a fresh shake doesn't shrink an in-flight one.
    if (magnitude > this.shakeState.mag || this.shakeState.duration <= 0) {
      this.shakeState.mag = magnitude;
    }
    const newDuration = durationMs / 1000;
    if (newDuration > this.shakeState.duration)
      this.shakeState.duration = newDuration;
    if (
      this.shakeState.duration > 0 &&
      this.shakeState.time > this.shakeState.duration
    ) {
      this.shakeState.time = 0;
    }
  }
  shakeOffset() {
    return { x: this.shakeState.ox, z: this.shakeState.oz };
  }
  shakeReset() {
    this.shakeState.mag = 0;
    this.shakeState.duration = 0;
    this.shakeState.time = 0;
    this.shakeState.ox = 0;
    this.shakeState.oz = 0;
  }
  slowMo(durationMs, scale) {
    if (typeof window !== "undefined" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (mq.matches) return;
    }
    const next = Math.max(0, Math.min(1, scale));
    const remaining = durationMs / 1000;
    // Restart with the new params when the existing window is over so a fresh
    // kill always re-triggers the bullet-time cleanly.
    if (this.slowMoState.remaining <= 0) {
      this.slowMoState.scale = next;
      this.slowMoState.remaining = remaining;
    } else {
      // Mid-effect: take the smaller (slower) scale so a peak kill stacks.
      if (next < this.slowMoState.scale) this.slowMoState.scale = next;
      if (remaining > this.slowMoState.remaining)
        this.slowMoState.remaining = remaining;
    }
  }
  slowMoScale() {
    return this.slowMoState.remaining > 0 ? this.slowMoState.scale : 1;
  }
  slowMoReset() {
    this.slowMoState.remaining = 0;
    this.slowMoState.scale = 1;
  }
  tick(dt) {
    this.pulses = this.pulses.filter((pulse) => {
      pulse.life -= dt;
      if (pulse.life <= 0) {
        this.disposePulse(pulse);
        return false;
      }
      const t = 1 - pulse.life / pulse.duration;
      if (!pulse.reduced)
        pulse.mesh.scale.setScalar(pulse.radius * (1 - (1 - t) ** 3));
      pulse.mesh.material.opacity = 0.85 * (1 - t);
      return true;
    });
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (!p.smoke) p.vy -= 8 * dt;
      if (p.y < 0.05) {
        p.y = 0.05;
        p.vy *= -0.2;
        p.vx *= 0.8;
        p.vz *= 0.8;
      }
      return true;
    });
    this.particles.forEach((p, i) => {
      this.positions.set([p.x, p.y, p.z], i * 3);
      const fade = Math.min(1, p.life * 3);
      this.colors.set(
        [p.color.r * fade, p.color.g * fade, p.color.b * fade],
        i * 3,
      );
    });
    this.geo.setDrawRange(0, this.particles.length);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.wrecks = this.wrecks.filter((w) => {
      w.life -= dt;
      w.smoke -= dt;
      if (w.life > 6 && w.smoke <= 0) {
        this.smoke(w.x, w.z);
        w.smoke = 0.15;
      }
      if (w.life <= 0) {
        w.mesh.removeFromParent();
        w.mesh.geometry.dispose();
        w.mesh.material.dispose();
        return false;
      }
      return true;
    });
    // Camera shake decay (linear)
    if (this.shakeState.duration > 0) {
      this.shakeState.time += dt;
      const t = Math.min(1, this.shakeState.time / this.shakeState.duration);
      const decay = 1 - t;
      const mag = this.shakeState.mag * decay;
      this.shakeState.ox = (this.rng() - 0.5) * 2 * mag;
      this.shakeState.oz = (this.rng() - 0.5) * 2 * mag;
      if (t >= 1) this.shakeReset();
    }
    // Bullet-time decay: remaining tracks WALL-CLOCK seconds, so simulation
    // speed scales but real-time delay is not.
    if (this.slowMoState.remaining > 0) {
      this.slowMoState.remaining -= dt;
      if (this.slowMoState.remaining <= 0) this.slowMoReset();
    }
  }
  clear() {
    for (const pulse of this.pulses) this.disposePulse(pulse);
    this.pulses = [];
    this.particles = [];
    this.geo.setDrawRange(0, 0);
    for (const w of this.wrecks) {
      w.mesh.removeFromParent();
      w.mesh.geometry.dispose();
      w.mesh.material.dispose();
    }
    this.wrecks = [];
    this.shakeReset();
    this.slowMoReset();
  }
}
