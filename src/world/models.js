import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const mat = (color, roughness = 0.75, metalness = 0.05) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });
export const materials = {
  rubber: mat(0x29352d),
  trim: mat(0xd9d4b4),
  dark: mat(0x3c4a3d),
  gold: mat(0xe8b958, 0.45, 0.3),
  steel: mat(0x687e76, 0.65, 0.2),
};
export function box(w, h, d, x = 0, y = 0, z = 0) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}
export function cylinder(r, h, x, y, z) {
  return new THREE.CylinderGeometry(r, r, h, 12).translate(x, y, z);
}
export function merged(group, geometries, material) {
  const mixed =
    geometries.some((g) => !g.index) && geometries.some((g) => g.index);
  const normalized = mixed
    ? geometries.map((g) => (g.index ? g.toNonIndexed() : g))
    : geometries;
  const geometry = mergeGeometries(normalized, false);
  if (mixed)
    normalized.forEach((g) => {
      if (!geometries.includes(g)) g.dispose();
    });
  geometries.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function shell(group, geometries) {
  return merged(group, geometries, materials.steel);
}
export function tankModel(color, type) {
  const root = new THREE.Group();
  const hull = new THREE.Group();
  const turret = new THREE.Group();
  root.add(hull, turret);
  const paint = mat(color, 0.55, 0.18);
  const heavy = type === "heavy";
  const tracks = [],
    treads = [];
  for (const side of [-1, 1]) {
    tracks.push(box(0.25, 0.34, 1.16, side * 0.48, 0.27, 0));
    for (let i = 0; i < 8; i++)
      treads.push(box(0.28, 0.065, 0.075, side * 0.48, 0.45, -0.49 + i * 0.14));
  }
  merged(hull, tracks, materials.rubber);
  merged(hull, treads, materials.trim);
  const armor = [
    box(0.82, 0.29, 1.05, 0, 0.45, 0),
    box(0.67, 0.12, 0.84, 0, 0.65, 0),
  ];
  if (heavy)
    armor.push(
      box(0.15, 0.29, 1.02, -0.64, 0.5, 0),
      box(0.15, 0.29, 1.02, 0.64, 0.5, 0),
    );
  merged(hull, armor, paint);
  merged(
    hull,
    [
      box(0.5, 0.04, 0.1, 0, 0.73, 0.32),
      box(0.5, 0.04, 0.045, 0, 0.73, 0.19),
      box(0.5, 0.04, 0.045, 0, 0.73, 0.25),
    ],
    materials.dark,
  );
  const turretGeo = heavy
    ? box(0.69, 0.32, 0.62, 0, 0.86, 0)
    : cylinder(0.33, 0.29, 0, 0.84, -0.04);
  merged(
    turret,
    [
      turretGeo,
      box(0.15, 0.15, type === "rapid" ? 0.86 : 0.71, 0, 0.87, -0.49),
    ],
    paint,
  );
  const detail = [
    cylinder(0.15, 0.055, 0, 1.02, 0.02),
    box(0.24, 0.22, 0.19, 0, 0.87, -0.86),
  ];
  if (type === "rapid") detail.push(box(0.08, 0.08, 0.5, 0.21, 0.88, -0.52));
  merged(turret, detail, materials.dark);
  merged(
    turret,
    [
      box(0.23, 0.016, 0.065, 0, 1.055, 0.02),
      box(0.065, 0.016, 0.23, 0, 1.055, 0.02),
    ],
    materials.trim,
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.77, 0.81, 40),
    new THREE.MeshBasicMaterial({
      color: type === "player" ? 0x9eaf5b : color,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.035;
  root.add(ring);
  return { root, hull, turret, paint, ring };
}
export function bossTankModel(color, type) {
  const m = tankModel(color, type);
  const extra = [];
  for (let i = 0; i < 3; i++) {
    extra.push(box(0.05, 0.05, 0.65, -0.18, 0.88, -0.49 + i * 0.0));
    extra.push(box(0.05, 0.05, 0.65, 0.18, 0.88, -0.49));
  }
  extra.push(box(0.6, 0.12, 0.6, 0, 1.16, 0));
  extra.push(cylinder(0.05, 0.08, 0, 1.24, 0));
  shell(m.turret, extra);
  return m;
}
export function pickupStar() {
  const root = new THREE.Group();
  const star = new THREE.Shape();
  const spikes = 5,
    outer = 0.28,
    inner = 0.12;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) star.moveTo(x, y);
    else star.lineTo(x, y);
  }
  star.closePath();
  const geo = new THREE.ExtrudeGeometry(star, {
    depth: 0.08,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.02,
    bevelThickness: 0.02,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, 0);
  const mesh = new THREE.Mesh(geo, mat(0xf3d65a, 0.4, 0.5));
  mesh.castShadow = true;
  root.add(mesh);
  root.userData.spin = 0.8;
  return root;
}
export function pickupHelmet() {
  const root = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    mat(0xb4d8ff, 0.35, 0.45),
  );
  dome.scale.set(1, 0.7, 1);
  dome.position.y = 0.04;
  root.add(dome);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.08, 0.18),
    mat(0x6c8fbf, 0.3, 0.4),
  );
  visor.position.set(0, 0.16, 0.16);
  root.add(visor);
  root.userData.spin = 0.6;
  return root;
}
export function pickupClock() {
  const root = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.12, 18),
    mat(0x9aa6c4, 0.45, 0.3),
  );
  body.position.y = 0.06;
  root.add(body);
  const face = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, 0.02, 18),
    mat(0xece7be, 0.4, 0.2),
  );
  face.position.y = 0.13;
  root.add(face);
  const hand = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.02, 0.18),
    mat(0x263e32, 0.6, 0.2),
  );
  hand.position.set(0, 0.15, 0.05);
  hand.rotation.y = -0.4;
  root.add(hand);
  for (let i = 0; i < 4; i++) {
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.02, 0.04),
      mat(0x263e32, 0.6, 0.2),
    );
    const a = (i / 4) * Math.PI * 2;
    tick.position.set(Math.sin(a) * 0.22, 0.15, Math.cos(a) * 0.22);
    tick.rotation.y = a;
    root.add(tick);
  }
  root.userData.spin = 0.5;
  return root;
}
export function pickupBomb() {
  const root = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 14, 10),
    mat(0x2a2a2a, 0.5, 0.3),
  );
  body.scale.set(1, 0.85, 1);
  body.position.y = 0.18;
  root.add(body);
  const fuse = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8),
    mat(0xc98a5b, 0.8, 0.1),
  );
  fuse.position.y = 0.42;
  fuse.rotation.z = 0.3;
  root.add(fuse);
  const spark = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff7a4a }),
  );
  spark.position.set(0.04, 0.48, 0);
  root.add(spark);
  root.userData.spin = 0.4;
  root.userData.spark = spark;
  return root;
}
export function pickupTank() {
  const root = new THREE.Group();
  const hull = new THREE.Mesh(
    box(0.45, 0.18, 0.7, 0, 0.16, 0),
    mat(0x9bbf5a, 0.6, 0.1),
  );
  root.add(hull);
  const turret = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10),
    mat(0x749941, 0.55, 0.15),
  );
  turret.position.y = 0.32;
  root.add(turret);
  const barrel = new THREE.Mesh(
    box(0.05, 0.05, 0.42, 0, 0.34, -0.21),
    mat(0x263e32, 0.7, 0.2),
  );
  root.add(barrel);
  for (const side of [-1, 1]) {
    const track = new THREE.Mesh(
      box(0.08, 0.14, 0.6, side * 0.27, 0.18, 0),
      mat(0x29352d, 0.8, 0.05),
    );
    root.add(track);
  }
  root.userData.spin = 0.7;
  return root;
}
export function pickupShovel() {
  const root = new THREE.Group();
  const handle = new THREE.Mesh(
    box(0.06, 0.06, 0.45, 0, 0.18, 0.05),
    mat(0xc98a5b, 0.7, 0.1),
  );
  root.add(handle);
  const grip = new THREE.Mesh(
    box(0.1, 0.1, 0.12, 0, 0.18, 0.28),
    mat(0x29352d, 0.8, 0.05),
  );
  root.add(grip);
  const blade = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.28, 4),
    mat(0xcdd0c2, 0.4, 0.6),
  );
  blade.position.y = 0.04;
  blade.rotation.x = Math.PI;
  blade.rotation.y = Math.PI / 4;
  root.add(blade);
  root.userData.spin = 0.3;
  return root;
}
export const PICKUP_FACTORIES = {
  star: pickupStar,
  helmet: pickupHelmet,
  clock: pickupClock,
  bomb: pickupBomb,
  tank: pickupTank,
  shovel: pickupShovel,
};
export function eagleModel() {
  const root = new THREE.Group();
  merged(
    root,
    [box(1.55, 0.22, 1.55, 0, 0.12, 0), box(1.25, 0.18, 1.25, 0, 0.3, 0)],
    materials.dark,
  );
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.28);
  shape.lineTo(0.16, 0.09);
  shape.lineTo(0.67, 0.35);
  shape.lineTo(0.59, -0.03);
  shape.lineTo(0.3, -0.23);
  shape.lineTo(0.15, -0.18);
  shape.lineTo(0.12, -0.49);
  shape.lineTo(0, -0.37);
  shape.lineTo(-0.12, -0.49);
  shape.lineTo(-0.15, -0.18);
  shape.lineTo(-0.3, -0.23);
  shape.lineTo(-0.59, -0.03);
  shape.lineTo(-0.67, 0.35);
  shape.lineTo(-0.16, 0.09);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.035,
    bevelThickness: 0.035,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0.5, 0);
  merged(root, [geo, cylinder(0.13, 0.2, 0, 0.64, -0.3)], materials.gold);
  return root;
}
export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    if (o.geometry) o.geometry.dispose();
  });
  group.removeFromParent();
}
