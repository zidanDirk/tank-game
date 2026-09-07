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
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.cells = new Uint8Array(SIZE * SIZE);
    this.brickInstances = new Map();
    this.ruins = [];
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
  build() {
    for (let n = 0; n < SIZE; n++) {
      this.set(n, 0, CELL.STEEL);
      this.set(n, 25, CELL.STEEL);
      this.set(0, n, CELL.STEEL);
      this.set(25, n, CELL.STEEL);
    }
    for (const x of [3, 7, 11, 15, 19, 22]) {
      this.rectangle(x, 5, x === 22 ? 1 : 2, 4, CELL.BRICK);
      this.rectangle(x, 16, x === 22 ? 1 : 2, 4, CELL.BRICK);
    }
    for (const x of [3, 18]) this.rectangle(x, 11, 5, 2, CELL.WATER);
    this.rectangle(10, 11, 2, 2, CELL.STEEL);
    this.rectangle(14, 11, 2, 2, CELL.STEEL);
    this.rectangle(4, 21, 2, 1, CELL.STEEL);
    this.rectangle(20, 21, 2, 1, CELL.STEEL);
    this.rectangle(11, 21, 4, 1, CELL.BRICK);
    this.rectangle(11, 22, 1, 2, CELL.BRICK);
    this.rectangle(14, 22, 1, 2, CELL.BRICK);
    this.rectangle(12, 22, 2, 2, CELL.BASE);
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
      brickCount * 6,
    );
    this.bricks.castShadow = true;
    this.bricks.receiveShadow = true;
    this.root.add(this.bricks);
    const steels = [],
      caps = [],
      water = [],
      ripples = [];
    let bi = 0;
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
          const edge = x === 0 || z === 0 || x === 25 || z === 25;
          const h = edge ? 0.65 : 0.95;
          steels.push(box(0.98, h, 0.98, x + 0.5, h / 2, z + 0.5));
          caps.push(box(0.84, 0.07, 0.84, x + 0.5, h + 0.015, z + 0.5));
          if (!edge)
            caps.push(box(0.11, 0.015, 0.7, x + 0.5, h + 0.06, z + 0.5));
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
    merged(this.root, steels, mat(0x687e76, 0.65, 0.2));
    merged(this.root, caps, mat(0x92a298, 0.52, 0.15));
    this.waterMesh = merged(this.root, water, mat(0x72aab0, 0.27, 0.22));
    this.waterMesh.castShadow = false;
    merged(this.root, ripples, mat(0xb4d4ce));
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
  destroyBase() {
    this.base.alive = false;
    this.eagle.rotation.z = 0.2;
    this.eagle.scale.y = 0.35;
  }
  tick(time) {
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
