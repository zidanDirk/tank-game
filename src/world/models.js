import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const mat = (color, roughness = 0.75, metalness = 0.05) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });
export const materials = {
  rubber: mat(0x29352d),
  trim: mat(0xd9d4b4),
  dark: mat(0x3c4a3d),
  gold: mat(0xe8b958, 0.45, 0.3),
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
