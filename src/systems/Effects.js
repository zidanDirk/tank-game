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
  tick(dt) {
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
  }
  clear() {
    this.particles = [];
    this.geo.setDrawRange(0, 0);
    for (const w of this.wrecks) {
      w.mesh.removeFromParent();
      w.mesh.geometry.dispose();
      w.mesh.material.dispose();
    }
    this.wrecks = [];
  }
}
