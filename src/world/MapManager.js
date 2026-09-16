import * as THREE from "three";
import { SIZE, CELL } from "../core/config.js";
import {
  box,
  mat,
  merged,
  eagleModel,
  disposeGroup,
  materials,
} from "./models.js";

export class MapManager {
  constructor(scene, level = "training") {
    this.scene = scene;
    this.level = level;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.cells = new Uint8Array(SIZE * SIZE);
    this.brickInstances = new Map();
    this.steelInstances = new Map();
    this.ruins = [];
    this.fortifyBackup = null;
    this.fortifyExpiry = 0;
    this.build();
  }
  index(x, z) {
    return z * SIZE + x;
  }
  get(x, z) {
    return x < 0 || z < 0 || x >= SIZE || z >= SIZE
      ? CELL.STEEL
      : this.cells[this.index(x, z)];
  }
  set(x, z, type) {
    this.cells[this.index(x, z)] = type;
  }
  rectangle(x, z, w, h, type) {
    for (let j = z; j < z + h; j++)
      for (let i = x; i < x + w; i++) this.set(i, j, type);
  }
  applyLayout() {
    const brick = (x, z, w, h) => this.rectangle(x, z, w, h, CELL.BRICK);
    const steel = (x, z, w, h) => this.rectangle(x, z, w, h, CELL.STEEL);
    const water = (x, z, w, h) => this.rectangle(x, z, w, h, CELL.WATER);

    if (this.level === "endless") {
      // Endless maps inject their own layout; no preset terrain is added here.
      return;
    }

    if (this.level === "crossfire") {
      for (const x of [2, 6, 16, 20, 23]) {
        brick(x, 4, x === 23 ? 1 : 2, 3);
        brick(x, 16, x === 23 ? 1 : 2, 3);
      }
      water(3, 9, 5, 2);
      water(18, 9, 5, 2);
      water(8, 13, 2, 5);
      water(16, 13, 2, 5);
      steel(11, 6, 4, 2);
      steel(11, 12, 2, 3);
      steel(14, 12, 2, 3);
      steel(4, 20, 2, 1);
      steel(20, 20, 2, 1);
    } else if (this.level === "citadel") {
      for (const x of [2, 6, 10, 16, 20, 23]) {
        brick(x, 5, x === 23 ? 1 : 2, 3);
        brick(x, 15, x === 23 ? 1 : 2, 3);
      }
      brick(3, 9, 5, 1);
      brick(18, 9, 5, 1);
      brick(3, 12, 4, 1);
      brick(19, 12, 4, 1);
      steel(9, 8, 2, 4);
      steel(15, 8, 2, 4);
      steel(10, 14, 2, 3);
      steel(14, 14, 2, 3);
      steel(4, 20, 3, 1);
      steel(19, 20, 3, 1);
      water(11, 9, 1, 3);
      water(14, 9, 1, 3);
    } else {
      for (const x of [3, 7, 11, 15, 19, 22]) {
        brick(x, 5, x === 22 ? 1 : 2, 4);
        brick(x, 16, x === 22 ? 1 : 2, 4);
      }
      water(3, 11, 5, 2);
      water(18, 11, 5, 2);
      steel(10, 11, 2, 2);
      steel(14, 11, 2, 2);
      steel(4, 21, 2, 1);
      steel(20, 21, 2, 1);
    }
    brick(11, 21, 4, 1);
    brick(11, 22, 1, 2);
    brick(14, 22, 1, 2);
    this.rectangle(12, 22, 2, 2, CELL.BASE);
  }
  build() {
    for (let n = 0; n < SIZE; n++) {
      this.set(n, 0, CELL.STEEL);
      this.set(n, 25, CELL.STEEL);
      this.set(0, n, CELL.STEEL);
      this.set(25, n, CELL.STEEL);
    }
    this.applyLayout();
    this.base = { x: 13, z: 23, alive: true };
    const foundation = merged(
      this.root,
      [box(26.6, 0.7, 26.6, 13, -0.5, 13)],
      mat(0x8d9682),
    );
    foundation.receiveShadow = true;
    const floor = merged(
      this.root,
      [box(25.8, 0.12, 25.8, 13, -0.08, 13)],
      mat(0xbac0a2),
    );
    floor.castShadow = false;
    const gridLines = [];
    for (let i = 1; i < 26; i++) {
      gridLines.push(i, 0.004, 1, i, 0.004, 25, 1, 0.004, i, 25, 0.004, i);
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(gridLines, 3),
    );
    this.root.add(
      new THREE.LineSegments(
        gridGeo,
        new THREE.LineBasicMaterial({
          color: 0x85917b,
          transparent: true,
          opacity: 0.24,
        }),
      ),
    );
    const brickCount = this.cells.filter((t) => t === CELL.BRICK).length;
    this.bricks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.45, 0.27, 0.94),
      mat(0xffffff),
      Math.max(1, brickCount * 6),
    );
    this.bricks.castShadow = true;
    this.bricks.receiveShadow = true;
    this.root.add(this.bricks);
    const steelCount = this.cells.filter((t) => t === CELL.STEEL).length;
    this.steelsMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.98, 0.95, 0.98),
      mat(0x687e76, 0.65, 0.2),
      Math.max(1, steelCount),
    );
    this.steelsMesh.castShadow = true;
    this.steelsMesh.receiveShadow = true;
    this.root.add(this.steelsMesh);
    const water = [],
      ripples = [];
    let bi = 0;
    let si = 0;
    const m = new THREE.Matrix4();
    for (let z = 0; z < SIZE; z++)
      for (let x = 0; x < SIZE; x++) {
        const t = this.get(x, z);
        if (t === CELL.BRICK) {
          const ids = [];
          for (let row = 0; row < 3; row++)
            for (let col = 0; col < 2; col++) {
              m.makeTranslation(
                x + 0.25 + col * 0.5,
                0.15 + row * 0.29,
                z + 0.5,
              );
              this.bricks.setMatrixAt(bi, m);
              this.bricks.setColorAt(
                bi,
                new THREE.Color().setHex(
                  (x + z + row) % 3 === 0 ? 0xc88b60 : 0xae694b,
                ),
              );
              ids.push(bi++);
            }
          this.brickInstances.set(this.index(x, z), ids);
        }
        if (t === CELL.STEEL) {
          m.makeTranslation(x + 0.5, 0.475, z + 0.5);
          this.steelsMesh.setMatrixAt(si, m);
          this.steelInstances.set(this.index(x, z), si++);
        }
        if (t === CELL.WATER) {
          water.push(box(0.99, 0.035, 0.99, x + 0.5, 0.015, z + 0.5));
          if ((x + z) % 2 === 0)
            ripples.push(
              box(0.56, 0.008, 0.025, x + 0.5, 0.04, z + 0.35),
              box(0.29, 0.008, 0.018, x + 0.3, 0.04, z + 0.66),
            );
        }
      }
    this.bricks.instanceMatrix.needsUpdate = true;
    if (this.bricks.instanceColor) this.bricks.instanceColor.needsUpdate = true;
    this.steelsMesh.count = si;
    this.steelsMesh.instanceMatrix.needsUpdate = true;
    if (water.length) {
      this.waterMesh = merged(this.root, water, mat(0x72aab0, 0.27, 0.22));
      this.waterMesh.castShadow = false;
    }
    if (ripples.length) merged(this.root, ripples, mat(0xb4d4ce));
    this.eagle = eagleModel();
    this.eagle.position.set(13, 0, 23);
    this.root.add(this.eagle);
    const padMaterial = new THREE.MeshBasicMaterial({
      color: 0xb85843,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    this.spawnPads = [];
    for (const x of [2.5, 12.5, 23.5]) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.65, 0.72, 4),
        padMaterial,
      );
      ring.rotation.x = -Math.PI / 2;
      ring.rotation.z = Math.PI / 4;
      ring.position.set(x, 0.025, 2.5);
      this.root.add(ring);
      this.spawnPads.push(ring);
    }
    const corners = [];
    for (const x of [1.3, 24.7])
      for (const z of [1.3, 24.7])
        corners.push(
          box(0.6, 0.015, 0.045, x, 0.025, z),
          box(0.045, 0.015, 0.6, x, 0.025, z),
        );
    merged(this.root, corners, mat(0xe8e4cc));
  }
  destroyBrick(x, z) {
    if (this.get(x, z) !== CELL.BRICK) return false;
    this.set(x, z, CELL.EMPTY);
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const i of this.brickInstances.get(this.index(x, z)))
      this.bricks.setMatrixAt(i, m);
    this.bricks.instanceMatrix.needsUpdate = true;
    return true;
  }
  destroySteel(x, z) {
    if (this.get(x, z) !== CELL.STEEL) return false;
    this.set(x, z, CELL.EMPTY);
    const i = this.steelInstances.get(this.index(x, z));
    if (i !== undefined) {
      this.steelsMesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
      this.steelsMesh.instanceMatrix.needsUpdate = true;
    }
    return true;
  }
  destroyBase() {
    this.base.alive = false;
    this.eagle.rotation.z = 0.2;
    this.eagle.scale.y = 0.35;
  }
  rebuildInstances() {
    if (!this.bricks || !this.steelsMesh) return;
    this.brickInstances.clear();
    this.steelInstances.clear();
    const m = new THREE.Matrix4();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.bricks.count; i++)
      this.bricks.setMatrixAt(i, zero);
    for (let i = 0; i < this.steelsMesh.count; i++)
      this.steelsMesh.setMatrixAt(i, zero);
    let bi = 0;
    let si = 0;
    for (let z = 0; z < SIZE; z++)
      for (let x = 0; x < SIZE; x++) {
        const t = this.get(x, z);
        if (t === CELL.BRICK) {
          const ids = [];
          for (let row = 0; row < 3; row++)
            for (let col = 0; col < 2; col++) {
              m.makeTranslation(
                x + 0.25 + col * 0.5,
                0.15 + row * 0.29,
                z + 0.5,
              );
              this.bricks.setMatrixAt(bi, m);
              this.bricks.setColorAt(
                bi,
                new THREE.Color().setHex(
                  (x + z + row) % 3 === 0 ? 0xc88b60 : 0xae694b,
                ),
              );
              ids.push(bi++);
            }
          this.brickInstances.set(this.index(x, z), ids);
        }
        if (t === CELL.STEEL) {
          m.makeTranslation(x + 0.5, 0.475, z + 0.5);
          this.steelsMesh.setMatrixAt(si, m);
          this.steelInstances.set(this.index(x, z), si++);
        }
      }
    this.bricks.count = bi;
    this.bricks.instanceMatrix.needsUpdate = true;
    if (this.bricks.instanceColor) this.bricks.instanceColor.needsUpdate = true;
    this.steelsMesh.count = si;
    this.steelsMesh.instanceMatrix.needsUpdate = true;
  }
  fortifyBase(time, gameTime) {
    if (this.fortifyBackup) return false;
    const tiles = [];
    for (const [x, z] of [
      [11, 21],
      [11, 22],
      [12, 21],
      [13, 21],
      [14, 21],
      [14, 22],
    ]) {
      const idx = this.index(x, z);
      tiles.push({ x, z, prev: this.cells[idx] });
      this.cells[idx] = CELL.STEEL;
    }
    this.fortifyBackup = { tiles, total: 6, remaining: 6 };
    this.refreshFortifyVisual();
    this.fortifyExpiry = gameTime + time;
    return true;
  }
  refreshFortifyVisual() {
    if (!this.fortifyBackup) return;
    const m = new THREE.Matrix4().makeTranslation;
    let si = this.steelsMesh.count;
    const mat4 = new THREE.Matrix4();
    for (const t of this.fortifyBackup.tiles) {
      if (t.prev === CELL.STEEL) continue;
      mat4.makeTranslation(t.x + 0.5, 0.475, t.z + 0.5);
      this.steelsMesh.setMatrixAt(si, mat4);
      this.steelInstances.set(this.index(t.x, t.z), si++);
    }
    this.steelsMesh.count = si;
    this.steelsMesh.instanceMatrix.needsUpdate = true;
  }
  tickFortify(gameTime) {
    if (!this.fortifyBackup) return;
    if (gameTime >= this.fortifyExpiry) {
      for (const t of this.fortifyBackup.tiles) {
        this.cells[this.index(t.x, t.z)] = t.prev;
        const i = this.steelInstances.get(this.index(t.x, t.z));
        if (i !== undefined) {
          this.steelsMesh.setMatrixAt(
            i,
            new THREE.Matrix4().makeScale(0, 0, 0),
          );
          this.steelInstances.delete(this.index(t.x, t.z));
        }
      }
      this.fortifyBackup = null;
      this.steelsMesh.count = this.steelInstances.size;
      this.steelsMesh.instanceMatrix.needsUpdate = true;
    }
  }
  tick(time) {
    if (!this.waterMesh) return;
    this.waterMesh.material.color.setHSL(
      0.49,
      0.24,
      0.53 + Math.sin(time * 1.4) * 0.015,
    );
  }
  dispose() {
    const owned = new Set();
    this.root.traverse((o) => {
      if (o.material) owned.add(o.material);
    });
    disposeGroup(this.root);
    for (const m of owned)
      if (!Object.values(materials).includes(m)) m.dispose();
  }
}
