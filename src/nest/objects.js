// Low-poly toon meshes for yard things and furniture. Each is built around the centre of its footprint
// (before rotation), standing on y = 0. One tile = 1 unit.
import * as THREE from "three";
import { blobShadow, flat, geo, part, place, sphere } from "./toon.js";

const box = () => geo("box", () => new THREE.BoxGeometry(1, 1, 1));
const cylinder = (top, bottom, height, segments = 10) =>
  geo(`cyl${top}-${bottom}-${height}-${segments}`, () => new THREE.CylinderGeometry(top, bottom, height, segments));
const cone = (radius, height, segments = 10) => geo(`cone${radius}-${height}-${segments}`, () => new THREE.ConeGeometry(radius, height, segments));
const rock = () => geo("rock", () => new THREE.DodecahedronGeometry(1, 0));
const cap = () => geo("cap", () => new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2));
const block = (color, [x, y, z], [w, h, d], options) => place(part(box(), color, options), [x, y, z], [w, h, d]);

const BUILDERS = {
  tree(add) {
    add(place(part(cylinder(0.08, 0.12, 0.7, 8), 0x9a6b4a), [0, 0.35, 0]));
    add(place(part(sphere(), 0x79c26b), [0, 1.0, 0], [0.42, 0.38, 0.42]));
    add(place(part(sphere(), 0x8fd27c), [0.18, 1.25, 0.05], [0.26]));
    add(place(part(sphere(), 0x6ab45d), [-0.2, 1.18, -0.08], [0.25]));
    return 0.45;
  },
  pine(add) {
    add(place(part(cylinder(0.07, 0.1, 0.4, 8), 0x8a5e40), [0, 0.2, 0]));
    add(place(part(cone(0.42, 0.6), 0x4f9c63), [0, 0.65, 0]));
    add(place(part(cone(0.33, 0.5), 0x5fae71), [0, 0.98, 0]));
    add(place(part(cone(0.22, 0.4), 0x6fbe80), [0, 1.26, 0]));
    return 0.42;
  },
  bush(add) {
    add(place(part(sphere(), 0x7cc46e), [0, 0.22, 0], [0.3, 0.24, 0.28]));
    add(place(part(sphere(), 0x8fd27c), [0.2, 0.17, 0.08], [0.19]));
    add(place(part(sphere(), 0x6ab45d), [-0.2, 0.16, -0.05], [0.18]));
    return 0.42;
  },
  flowerbed(add) {
    add(block(0x9a6b4a, [0, 0.04, 0], [0.86, 0.08, 0.86], { line: false }));
    for (const [x, z, c] of [[-0.22, -0.2, 0xff8fb0], [0.2, -0.18, 0xffd34d], [0, 0.05, 0xb9a3ff], [-0.2, 0.24, 0xffffff], [0.22, 0.22, 0xff8fb0]]) {
      add(place(part(cylinder(0.015, 0.015, 0.2, 5), 0x5d9b4f, { line: false }), [x, 0.16, z]));
      add(place(part(sphere(), c), [x, 0.27, z], [0.07, 0.05, 0.07]));
    }
    return 0;
  },
  crop(add) {
    add(block(0x9a6b4a, [0, 0.05, 0], [1.8, 0.1, 1.8], { line: false }));
    for (let row = 0; row < 3; row++) {
      add(block(0x7d5338, [0, 0.12, -0.55 + row * 0.55], [1.6, 0.06, 0.28], { line: false }));
      for (let i = 0; i < 4; i++) {
        const x = -0.6 + i * 0.4; const z = -0.55 + row * 0.55;
        add(place(part(sphere(), 0x79c26b), [x, 0.24, z], [0.12, 0.1, 0.12]));
        if ((row + i) % 2) add(place(part(sphere(), 0xff8a5c, { line: false }), [x + 0.06, 0.3, z], [0.05]));
      }
    }
    return 0;
  },
  rock(add) {
    add(place(part(rock(), 0xb9b4ab), [0, 0.14, 0], [0.3, 0.2, 0.26], [0.2, 0.5, 0]));
    add(place(part(rock(), 0xa8a39a), [0.22, 0.08, 0.12], [0.13, 0.09, 0.11]));
    return 0.38;
  },
  fence(add) {
    for (const x of [-0.4, 0.4]) add(block(0xe2c39b, [x, 0.25, 0], [0.09, 0.5, 0.09]));
    for (const y of [0.18, 0.36]) add(block(0xd6b48a, [0, y, 0], [0.96, 0.06, 0.05]));
    return 0;
  },
  lamp(add) {
    add(place(part(cylinder(0.035, 0.05, 1.1, 8), 0x5b5450), [0, 0.55, 0]));
    add(place(part(sphere(), 0xfff2b0, { basic: true }), [0, 1.18, 0], [0.12]));
    add(place(part(cone(0.16, 0.1), 0x5b5450), [0, 1.32, 0]));
    return 0.22;
  },
  bench(add) {
    add(block(0xc98f5d, [0, 0.3, 0.05], [1.7, 0.08, 0.42]));
    add(block(0xc98f5d, [0, 0.58, -0.17], [1.7, 0.26, 0.06]));
    for (const x of [-0.7, 0.7]) add(block(0x5b5450, [x, 0.15, 0.05], [0.08, 0.3, 0.38]));
    return 0.7;
  },
  mailbox(add) {
    add(place(part(cylinder(0.04, 0.04, 0.7, 6), 0x8a5e40), [0, 0.35, 0]));
    add(block(0xe25b5b, [0, 0.8, 0], [0.24, 0.22, 0.38]));
    add(block(0xffd34d, [0.14, 0.9, -0.08], [0.02, 0.14, 0.04], { line: false }));
    return 0.2;
  },
  pond(add) {
    add(place(part(cylinder(1, 1, 0.04, 28), 0x7cc4e6, { line: false }), [0, 0.025, 0], [1.3, 1, 0.85]));
    add(place(part(cylinder(1, 1, 0.03, 24), 0xa8dff2, { line: false }), [0.25, 0.04, 0.1], [0.5, 1, 0.3]));
    for (const angle of [0.2, 0.9, 1.7, 2.5, 3.3, 4.1, 4.9, 5.7]) add(place(part(rock(), 0xb9b4ab), [Math.cos(angle) * 1.35, 0.05, Math.sin(angle) * 0.88], [0.13, 0.08, 0.11]));
    add(place(part(sphere(), 0x79c26b), [-0.5, 0.05, -0.2], [0.18, 0.02, 0.18]));
    return 0;
  },
  bed(add) {
    add(block(0xb98559, [0, 0.18, 0], [0.9, 0.3, 1.86]));
    add(block(0xffffff, [0, 0.38, 0.05], [0.82, 0.12, 1.7], { line: false }));
    add(block(0x9fcdf3, [0, 0.42, 0.35], [0.86, 0.1, 1.1]));
    add(place(part(sphere(), 0xfff6e4), [0, 0.5, -0.62], [0.3, 0.09, 0.17]));
    add(block(0xa8714f, [0, 0.45, -0.92], [0.9, 0.7, 0.08]));
    return 0;
  },
  table(add) {
    add(block(0xd9a066, [0, 0.62, 0], [1.7, 0.08, 0.82]));
    for (const [x, z] of [[-0.75, -0.32], [0.75, -0.32], [-0.75, 0.32], [0.75, 0.32]]) add(block(0xb98559, [x, 0.3, z], [0.08, 0.6, 0.08]));
    add(place(part(sphere(), 0xff8fb0, { line: false }), [0.3, 0.72, 0], [0.08]));
    return 0;
  },
  chair(add) {
    add(block(0xd9a066, [0, 0.38, 0.05], [0.5, 0.06, 0.46]));
    add(block(0xd9a066, [0, 0.68, -0.17], [0.5, 0.5, 0.06]));
    for (const [x, z] of [[-0.2, -0.13], [0.2, -0.13], [-0.2, 0.22], [0.2, 0.22]]) add(block(0xb98559, [x, 0.18, z], [0.06, 0.36, 0.06]));
    return 0;
  },
  sofa(add) {
    add(block(0x8fb7e0, [0, 0.22, 0.05], [1.8, 0.34, 0.7]));
    add(block(0x7fa7d0, [0, 0.55, -0.27], [1.8, 0.5, 0.2]));
    for (const x of [-0.85, 0.85]) add(block(0x7fa7d0, [x, 0.42, 0.05], [0.18, 0.28, 0.72]));
    for (const x of [-0.4, 0.4]) add(block(0xa8c8ea, [x, 0.43, 0.08], [0.72, 0.1, 0.56], { line: false }));
    return 0;
  },
  shelf(add) {
    add(block(0xb98559, [0, 0.8, -0.25], [0.9, 1.6, 0.36]));
    const colors = [0xe25b5b, 0x6aa7d8, 0xf5c542, 0x7cc46e, 0xc6b2f0];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++)
      add(block(colors[(row * 4 + i) % colors.length], [-0.3 + i * 0.18 + (row % 2) * 0.04, 0.35 + row * 0.48, -0.06], [0.12, 0.3, 0.06], { line: false }));
    return 0;
  },
  counter(add) {
    add(block(0xf1ece4, [0, 0.42, -0.05], [0.92, 0.84, 0.8]));
    add(block(0x8b8f96, [0, 0.86, -0.05], [0.96, 0.06, 0.84]));
    add(block(0xd9dde2, [0, 0.42, 0.36], [0.6, 0.5, 0.02], { line: false }));
    return 0;
  },
  fridge(add) {
    add(block(0xeef4f8, [0, 0.85, -0.05], [0.8, 1.7, 0.74]));
    add(block(0xb8c4cc, [0.3, 1.1, 0.33], [0.04, 0.4, 0.04], { line: false }));
    add(block(0xb8c4cc, [0.3, 0.45, 0.33], [0.04, 0.3, 0.04], { line: false }));
    add(block(0xd5dee5, [0, 0.95, 0.325], [0.76, 0.02, 0.01], { line: false }));
    return 0;
  },
  plant(add) {
    add(place(part(cylinder(0.2, 0.15, 0.32, 10), 0xd98a5f), [0, 0.16, 0]));
    add(place(part(sphere(), 0x6ab45d), [0, 0.5, 0], [0.24, 0.26, 0.24]));
    add(place(part(sphere(), 0x7cc46e), [0.12, 0.66, 0.04], [0.14]));
    return 0.25;
  },
  floorlamp(add) {
    add(place(part(cylinder(0.16, 0.18, 0.04, 12), 0x5b5450), [0, 0.02, 0]));
    add(place(part(cylinder(0.025, 0.025, 1.3, 6), 0x5b5450), [0, 0.67, 0]));
    add(place(part(cylinder(0.14, 0.24, 0.3, 12), 0xfff2c8), [0, 1.36, 0]));
    return 0;
  },
  rug(add) {
    add(place(part(cylinder(1, 1, 0.02, 28), 0xf4c7a1, { line: false }), [0, 0.012, 0], [0.92, 1, 0.92]));
    add(place(part(cylinder(1, 1, 0.02, 28), 0xfbe3c8, { line: false }), [0, 0.02, 0], [0.62, 1, 0.62]));
    return 0;
  },
};

export function buildObject(type) {
  const group = new THREE.Group();
  const add = (mesh) => { group.add(mesh); return mesh; };
  const shadow = (BUILDERS[type] || BUILDERS.bush)(add);
  if (shadow) group.add(blobShadow(shadow));
  return group;
}

// ---------- walls ----------
const WALL = { color: 0xfbf3e4, top: 0xe2cfb2, thick: 0.12 };
export function buildWall(type, height) {
  const group = new THREE.Group();
  const add = (mesh) => { group.add(mesh); return mesh; };
  const t = WALL.thick;
  if (type === "door") {
    const opening = Math.min(height, 1.55);
    for (const x of [-0.45, 0.45]) add(block(WALL.color, [x, height / 2, 0], [0.1, height, t]));
    if (height > opening) add(block(WALL.color, [0, (height + opening) / 2, 0], [0.8, height - opening, t]));
    if (height > 1) {
      const leaf = add(block(0xb98559, [0, opening / 2, 0], [0.78, opening - 0.04, 0.05]));
      const hinge = new THREE.Group();
      hinge.position.set(-0.39, 0, 0);
      leaf.position.set(0.39, opening / 2, 0);
      hinge.add(leaf);
      hinge.rotation.y = -1.1;
      group.add(hinge);
    }
  } else if (type === "window" && height > 1) {
    add(block(WALL.color, [0, 0.4, 0], [1, 0.8, t]));
    add(block(WALL.color, [0, (height + 1.55) / 2, 0], [1, height - 1.55, t]));
    for (const x of [-0.42, 0.42]) add(block(WALL.color, [x, 1.175, 0], [0.16, 0.75, t]));
    add(place(new THREE.Mesh(box(), flat(0xbfe3f5)), [0, 1.175, 0], [0.68, 0.75, 0.03]));
    add(block(0xffffff, [0, 1.175, 0], [0.04, 0.75, 0.05], { line: false }));
  } else {
    add(block(WALL.color, [0, height / 2, 0], [1, height, t]));
  }
  add(block(WALL.top, [0, height + 0.02, 0], [1.02, 0.04, t + 0.04], { line: false }));
  return group;
}
