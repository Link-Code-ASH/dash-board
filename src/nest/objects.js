// Low-poly toon meshes for yard things and furniture. Each is built around the centre of its footprint
// (before rotation), standing on y = 0. One tile = 1 unit. A seed (the object's id) gives each copy small
// differences in size, tilt and colour, so a row of trees or flowers never looks stamped.
import * as THREE from "three";
import { flat, geo, part, place, shade, sphere } from "./toon.js";
import { seededRandom } from "./model.js";

const box = () => geo("box", () => new THREE.BoxGeometry(1, 1, 1));
const round = () => geo("roundbox", () => roundedBox(1, 1, 1, 0.12));
const cylinder = (top, bottom, height, segments = 10) =>
  geo(`cyl${top}-${bottom}-${height}-${segments}`, () => new THREE.CylinderGeometry(top, bottom, height, segments));
const cone = (radius, height, segments = 10) => geo(`cone${radius}-${height}-${segments}`, () => new THREE.ConeGeometry(radius, height, segments));
const rock = () => geo("rock", () => new THREE.DodecahedronGeometry(1, 0));
const blob = () => geo("blob", () => new THREE.IcosahedronGeometry(1, 1));
const cap = () => geo("cap", () => new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2));
const block = (color, [x, y, z], [w, h, d], options) => place(part(box(), color, options), [x, y, z], [w, h, d]);
const soft = (color, [x, y, z], [w, h, d], options) => place(part(round(), color, options), [x, y, z], [w, h, d]);

// A box with bevelled edges (smooth normals), so cushions and furniture read as soft toon shapes.
function roundedBox(width, height, depth, radius) {
  const shape = new THREE.Shape();
  const bevel = radius * 0.6;
  width -= bevel * 2; height -= bevel * 2;
  const w = width / 2 - radius; const h = height / 2 - radius;
  shape.moveTo(-w, -height / 2);
  shape.lineTo(w, -height / 2);
  shape.quadraticCurveTo(width / 2, -height / 2, width / 2, -h);
  shape.lineTo(width / 2, h);
  shape.quadraticCurveTo(width / 2, height / 2, w, height / 2);
  shape.lineTo(-w, height / 2);
  shape.quadraticCurveTo(-width / 2, height / 2, -width / 2, h);
  shape.lineTo(-width / 2, -h);
  shape.quadraticCurveTo(-width / 2, -height / 2, -w, -height / 2);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: depth - radius * 2, bevelEnabled: true, bevelThickness: radius,
    bevelSize: bevel, bevelSegments: 2, curveSegments: 3 });
  geometry.translate(0, 0, -(depth - radius * 2) / 2);
  geometry.computeVertexNormals();
  return geometry;
}

const LEAVES = [0x79c26b, 0x86cc72, 0x6cb860, 0x8fd27c];
const PETALS = [0xff8fb0, 0xffd34d, 0xb9a3ff, 0xffffff, 0xff9f7a, 0x9fcdf3];

const BUILDERS = {
  tree(add, r, sway) {
    const s = 0.9 + r() * 0.25;
    add(place(part(cylinder(0.07, 0.12, 0.75, 8), 0x9a6b4a), [0, 0.37 * s, 0], [s, s, s]));
    add(place(part(cylinder(0.12, 0.17, 0.12, 8), 0x8a5e40), [0, 0.05, 0]));
    const crown = new THREE.Group();
    crown.position.y = 0.75 * s;
    add(crown);
    const base = LEAVES[Math.floor(r() * LEAVES.length)];
    const clumps = [[0, 0.32, 0, 0.42], [0.2, 0.52, 0.08, 0.28], [-0.22, 0.46, -0.06, 0.27], [0.04, 0.7, -0.1, 0.24], [-0.1, 0.25, 0.22, 0.24]];
    for (const [x, y, z, size] of clumps) {
      crown.add(place(part(blob(), shade(base, (r() - 0.5) * 0.08)), [x * s, y * s, z * s], [size * s, size * 0.9 * s, size * s], [r(), r(), 0]));
    }
    if (r() < 0.5) for (let i = 0; i < 3; i++) {
      const a = r() * Math.PI * 2;
      crown.add(place(part(sphere(), 0xe25b5b, { line: false, shadow: false }), [Math.cos(a) * 0.38 * s, (0.3 + r() * 0.3) * s, Math.sin(a) * 0.38 * s], [0.045]));
    }
    sway.push(crown);
  },
  pine(add, r, sway) {
    const s = 0.9 + r() * 0.25;
    add(place(part(cylinder(0.06, 0.1, 0.4, 8), 0x8a5e40), [0, 0.2, 0]));
    const top = new THREE.Group();
    top.position.y = 0.3;
    add(top);
    const tiers = [[0.44, 0.55, 0.3, 0x4f9c63], [0.35, 0.5, 0.62, 0x5aa86d], [0.25, 0.45, 0.9, 0x66b679], [0.14, 0.32, 1.12, 0x72c284]];
    for (const [radius, height, y, color] of tiers) top.add(place(part(cone(radius, height, 9), color), [0, y * s, 0], [s, s, s], [0, r() * 3, 0]));
    sway.push(top);
  },
  bush(add, r, sway) {
    const group = new THREE.Group();
    add(group);
    const base = LEAVES[Math.floor(r() * LEAVES.length)];
    for (const [x, y, z, size] of [[0, 0.2, 0, 0.3], [0.22, 0.15, 0.06, 0.2], [-0.21, 0.15, -0.04, 0.2], [0.05, 0.16, 0.22, 0.18]])
      group.add(place(part(blob(), shade(base, (r() - 0.5) * 0.08)), [x, y, z], [size, size * 0.85, size], [r(), r(), 0]));
    if (r() < 0.6) for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2;
      group.add(place(part(sphere(), r() < 0.5 ? 0xe25b5b : 0xb9a3ff, { line: false, shadow: false }), [Math.cos(a) * 0.26, 0.18 + r() * 0.12, Math.sin(a) * 0.24], [0.035]));
    }
    sway.push(group);
  },
  flowerbed(add, r, sway) {
    for (const [x, z, w, d] of [[0, -0.42, 0.92, 0.08], [0, 0.42, 0.92, 0.08], [-0.42, 0, 0.08, 0.76], [0.42, 0, 0.08, 0.76]])
      add(block(0xc98f5d, [x, 0.07, z], [w, 0.14, d]));
    add(block(0x7d5338, [0, 0.05, 0], [0.78, 0.1, 0.78], { line: false }));
    const flowers = new THREE.Group();
    add(flowers);
    for (let i = 0; i < 6; i++) {
      const x = -0.25 + (i % 3) * 0.25 + (r() - 0.5) * 0.08; const z = i < 3 ? -0.16 : 0.16;
      const height = 0.16 + r() * 0.1;
      const color = PETALS[Math.floor(r() * PETALS.length)];
      flowers.add(place(part(cylinder(0.012, 0.012, height, 5), 0x5d9b4f, { line: false, shadow: false }), [x, 0.1 + height / 2, z]));
      flowers.add(place(part(sphere(), 0x6ab45d, { line: false, shadow: false }), [x + 0.04, 0.14, z], [0.04, 0.015, 0.025], [0, 0, 0.4]));
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        flowers.add(place(part(sphere(), color, { line: false }), [x + Math.cos(a) * 0.035, 0.11 + height, z + Math.sin(a) * 0.035], [0.03, 0.018, 0.03]));
      }
      flowers.add(place(part(sphere(), 0xffd34d, { line: false, shadow: false }), [x, 0.125 + height, z], [0.022]));
    }
    sway.push(flowers);
  },
  crop(add, r) {
    for (const [x, z, w, d] of [[0, -0.9, 1.9, 0.1], [0, 0.9, 1.9, 0.1], [-0.9, 0, 0.1, 1.7], [0.9, 0, 0.1, 1.7]])
      add(block(0xc98f5d, [x, 0.08, z], [w, 0.16, d]));
    add(block(0x8a5a3c, [0, 0.05, 0], [1.72, 0.1, 1.72], { line: false }));
    for (let row = 0; row < 3; row++) {
      const z = -0.55 + row * 0.55;
      add(block(0x6e4630, [0, 0.12, z], [1.6, 0.06, 0.3], { line: false }));
      for (let i = 0; i < 4; i++) {
        const x = -0.6 + i * 0.4;
        if (row === 0) { // cabbages
          add(place(part(blob(), 0x9fd77f), [x, 0.22, z], [0.13, 0.11, 0.13]));
          add(place(part(sphere(), 0xc7eaa8, { line: false }), [x, 0.27, z], [0.07, 0.05, 0.07]));
        } else if (row === 1) { // carrots: orange shoulders and leafy tops
          add(place(part(cylinder(0.05, 0.03, 0.06, 8), 0xff8a3c), [x, 0.17, z]));
          for (const a of [-0.4, 0, 0.4]) add(place(part(cone(0.025, 0.18, 5), 0x5fae4f, { line: false }), [x + a * 0.06, 0.28, z], [1, 1, 1], [0, 0, a]));
        } else { // tomato vines on a stick
          add(place(part(cylinder(0.012, 0.012, 0.42, 5), 0xc98f5d, { line: false }), [x, 0.33, z]));
          add(place(part(blob(), 0x6cb860), [x, 0.36, z], [0.1, 0.13, 0.1]));
          add(place(part(sphere(), 0xe5484d, { line: false }), [x + 0.06, 0.3 + r() * 0.12, z + 0.04], [0.045]));
        }
      }
    }
  },
  rock(add, r) {
    add(place(part(rock(), 0xb9b4ab), [0, 0.15, 0], [0.32, 0.22, 0.27], [0.2, r() * 3, 0]));
    add(place(part(rock(), 0xa8a39a), [0.24, 0.08, 0.13], [0.13, 0.09, 0.11], [0, r() * 3, 0]));
    add(place(part(blob(), 0x8fc46e, { line: false, shadow: false }), [-0.05, 0.3, -0.04], [0.16, 0.04, 0.13]));
  },
  fence(add) {
    for (const x of [-0.42, 0.42]) {
      add(block(0xf0d6ae, [x, 0.27, 0], [0.1, 0.54, 0.1]));
      add(place(part(cone(0.075, 0.1, 4), 0xf0d6ae), [x, 0.59, 0], [1, 1, 1], [0, Math.PI / 4, 0]));
    }
    for (const y of [0.2, 0.4]) add(block(0xe2c39b, [0, y, 0], [0.98, 0.07, 0.05]));
  },
  lamp(add) {
    add(place(part(cylinder(0.1, 0.13, 0.08, 8), 0x4a4440), [0, 0.04, 0]));
    add(place(part(cylinder(0.03, 0.045, 1.1, 8), 0x5b5450), [0, 0.6, 0]));
    add(place(part(cylinder(0.11, 0.08, 0.04, 8), 0x5b5450), [0, 1.16, 0]));
    add(place(part(sphere(), 0xfff2b0, { basic: true }), [0, 1.26, 0], [0.1, 0.12, 0.1]));
    add(place(part(cone(0.17, 0.12, 8), 0x5b5450), [0, 1.42, 0]));
    add(glow(0xfff2b0, 0.7, [0, 1.26, 0]));
  },
  bench(add) {
    for (const z of [-0.08, 0.06, 0.2]) add(soft(0xc98f5d, [0, 0.32, z], [1.7, 0.06, 0.12]));
    for (const y of [0.52, 0.66]) add(soft(0xc98f5d, [0, y, -0.19], [1.7, 0.1, 0.05]));
    for (const x of [-0.72, 0.72]) {
      add(block(0x5b5450, [x, 0.16, 0.06], [0.06, 0.32, 0.32]));
      add(block(0x5b5450, [x, 0.45, -0.19], [0.06, 0.6, 0.06]));
    }
  },
  mailbox(add) {
    add(place(part(cylinder(0.04, 0.04, 0.7, 6), 0x8a5e40), [0, 0.35, 0]));
    add(soft(0xe25b5b, [0, 0.8, 0], [0.26, 0.24, 0.4]));
    add(block(0xffd34d, [0.15, 0.94, -0.1], [0.02, 0.16, 0.05], { line: false }));
    add(block(0xffffff, [0, 0.82, 0.205], [0.12, 0.05, 0.01], { line: false }));
  },
  pond(add, r, sway, animate) {
    const water = place(new THREE.Mesh(cylinder(1, 1, 0.04, 32), flat(0x86c9e8)), [0, 0.02, 0], [1.3, 1, 0.85]);
    water.receiveShadow = true;
    add(water);
    const shine = place(new THREE.Mesh(geo("ripple", () => new THREE.RingGeometry(0.7, 0.78, 32)),
      new THREE.MeshBasicMaterial({ color: 0xdff3fb, transparent: true, opacity: 0.8, depthWrite: false })), [0.2, 0.045, 0.05], [0.4, 0.3, 1], [-Math.PI / 2, 0, 0]);
    add(shine);
    animate.push((t) => { const k = 0.8 + Math.sin(t * 1.3) * 0.12; shine.scale.set(0.4 * k, 0.3 * k, 1); shine.material.opacity = 0.5 + Math.sin(t * 1.3) * 0.3; });
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + r() * 0.2;
      add(place(part(rock(), i % 3 ? 0xc4bfb6 : 0xa8a39a), [Math.cos(a) * 1.34, 0.05, Math.sin(a) * 0.88], [0.12 + r() * 0.05, 0.07, 0.1], [0, r() * 3, 0]));
    }
    for (const [x, z] of [[-0.5, -0.2], [0.35, 0.35]]) {
      add(place(part(cylinder(1, 1, 0.01, 12), 0x79c26b, { line: false }), [x, 0.05, z], [0.17, 1, 0.17]));
      if (x < 0) add(place(part(sphere(), 0xff9fc0, { line: false }), [x + 0.03, 0.08, z], [0.05, 0.04, 0.05]));
    }
    const reeds = new THREE.Group();
    reeds.position.set(1.05, 0, -0.45);
    add(reeds);
    for (let i = 0; i < 4; i++) reeds.add(place(part(cylinder(0.015, 0.02, 0.5 + r() * 0.2, 5), 0x6cb860, { line: false }), [(r() - 0.5) * 0.2, 0.28, (r() - 0.5) * 0.15], [1, 1, 1], [(r() - 0.5) * 0.2, 0, (r() - 0.5) * 0.3]));
    reeds.add(place(part(cylinder(0.035, 0.035, 0.14, 6), 0x8a5e40), [0, 0.55, 0]));
    sway.push(reeds);
  },
  bed(add) {
    add(soft(0xb98559, [0, 0.16, 0], [0.92, 0.26, 1.88]));
    add(soft(0xffffff, [0, 0.34, 0.02], [0.84, 0.12, 1.76], { line: false }));
    add(soft(0x9fcdf3, [0, 0.4, 0.3], [0.9, 0.1, 1.2]));
    add(soft(0xbfe0f8, [0, 0.46, -0.24], [0.88, 0.06, 0.16], { line: false }));
    add(place(part(blob(), 0xfff6e4), [0, 0.47, -0.62], [0.3, 0.08, 0.16]));
    add(soft(0xa8714f, [0, 0.46, -0.92], [0.94, 0.72, 0.1]));
    add(soft(0xa8714f, [0, 0.3, 0.92], [0.94, 0.4, 0.08]));
  },
  table(add) {
    add(soft(0xd9a066, [0, 0.62, 0], [1.72, 0.08, 0.84]));
    for (const [x, z] of [[-0.74, -0.3], [0.74, -0.3], [-0.74, 0.3], [0.74, 0.3]]) add(block(0xb98559, [x, 0.3, z], [0.08, 0.6, 0.08]));
    add(place(part(cylinder(0.07, 0.05, 0.14, 10), 0xffffff), [0.35, 0.73, 0]));
    add(place(part(sphere(), 0xff8fb0, { line: false }), [0.35, 0.84, 0], [0.07]));
    add(place(part(cylinder(0.16, 0.16, 0.02, 14), 0xffffff), [-0.35, 0.67, 0.05]));
  },
  chair(add) {
    add(soft(0xd9a066, [0, 0.38, 0.05], [0.5, 0.07, 0.48]));
    add(soft(0xf4c7a1, [0, 0.43, 0.06], [0.42, 0.05, 0.4], { line: false }));
    add(soft(0xd9a066, [0, 0.68, -0.17], [0.5, 0.5, 0.06]));
    for (const [x, z] of [[-0.2, -0.13], [0.2, -0.13], [-0.2, 0.22], [0.2, 0.22]]) add(block(0xb98559, [x, 0.18, z], [0.06, 0.36, 0.06]));
  },
  sofa(add) {
    add(soft(0x7fa7d0, [0, 0.18, 0.05], [1.84, 0.26, 0.74]));
    add(soft(0x7fa7d0, [0, 0.52, -0.28], [1.84, 0.5, 0.2]));
    for (const x of [-0.84, 0.84]) add(soft(0x7398c4, [x, 0.4, 0.05], [0.2, 0.32, 0.76]));
    for (const x of [-0.37, 0.37]) add(soft(0xa8c8ea, [x, 0.36, 0.08], [0.7, 0.12, 0.56]));
    add(soft(0xffd34d, [0.5, 0.5, -0.12], [0.3, 0.26, 0.1]));
  },
  shelf(add, r) {
    add(soft(0xb98559, [0, 0.8, -0.25], [0.92, 1.62, 0.38]));
    for (const y of [0.22, 0.7, 1.18]) add(block(0xa8714f, [0, y, -0.06], [0.82, 0.03, 0.02], { line: false }));
    const colors = [0xe25b5b, 0x6aa7d8, 0xf5c542, 0x7cc46e, 0xc6b2f0, 0xff9f7a];
    for (let row = 0; row < 3; row++) {
      let x = -0.34;
      while (x < 0.3) {
        const w = 0.07 + r() * 0.06; const h = 0.24 + r() * 0.12;
        add(block(colors[Math.floor(r() * colors.length)], [x + w / 2, 0.24 + row * 0.48 + h / 2, -0.07], [w - 0.01, h, 0.05], { line: false }));
        x += w;
      }
    }
  },
  counter(add) {
    add(soft(0xf1ece4, [0, 0.42, -0.05], [0.94, 0.84, 0.82]));
    add(soft(0x8b8f96, [0, 0.86, -0.05], [0.98, 0.06, 0.86]));
    add(block(0xd9dde2, [-0.2, 0.42, 0.37], [0.36, 0.6, 0.01], { line: false }));
    add(block(0xd9dde2, [0.22, 0.42, 0.37], [0.36, 0.6, 0.01], { line: false }));
    add(place(part(cylinder(0.12, 0.1, 0.12, 12), 0x5b5450), [0.18, 0.95, -0.05]));
  },
  fridge(add) {
    add(soft(0xeef4f8, [0, 0.86, -0.05], [0.8, 1.72, 0.76]));
    add(block(0xb8c4cc, [0.3, 1.1, 0.34], [0.04, 0.42, 0.04], { line: false }));
    add(block(0xb8c4cc, [0.3, 0.42, 0.34], [0.04, 0.3, 0.04], { line: false }));
    add(block(0xd5dee5, [0, 0.76, 0.335], [0.76, 0.02, 0.01], { line: false }));
    add(place(part(sphere(), 0xff8fb0, { line: false }), [-0.2, 1.3, 0.34], [0.04, 0.04, 0.01]));
  },
  plant(add, r, sway) {
    add(place(part(cylinder(0.2, 0.14, 0.34, 12), 0xd98a5f), [0, 0.17, 0]));
    add(place(part(cylinder(0.21, 0.21, 0.05, 12), 0xc77a52), [0, 0.33, 0]));
    const leaves = new THREE.Group();
    leaves.position.y = 0.34;
    add(leaves);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r() * 0.4;
      leaves.add(place(part(sphere(), i % 2 ? 0x6ab45d : 0x7cc46e), [Math.cos(a) * 0.12, 0.2 + r() * 0.15, Math.sin(a) * 0.12], [0.07, 0.2, 0.04], [Math.sin(a) * 0.5, -a, Math.cos(a) * 0.5]));
    }
    sway.push(leaves);
  },
  floorlamp(add) {
    add(place(part(cylinder(0.16, 0.18, 0.04, 12), 0x5b5450), [0, 0.02, 0]));
    add(place(part(cylinder(0.022, 0.022, 1.3, 6), 0x5b5450), [0, 0.67, 0]));
    add(place(part(cylinder(0.14, 0.24, 0.3, 14), 0xfff2c8), [0, 1.36, 0]));
    add(glow(0xfff2c8, 0.6, [0, 1.28, 0]));
  },
  rug(add) {
    add(place(part(cylinder(1, 1, 0.02, 32), 0xf4c7a1, { line: false, shadow: false }), [0, 0.012, 0], [0.92, 1, 0.92]));
    add(place(part(cylinder(1, 1, 0.02, 32), 0xfbe3c8, { line: false, shadow: false }), [0, 0.018, 0], [0.7, 1, 0.7]));
    add(place(part(cylinder(1, 1, 0.02, 32), 0xf4c7a1, { line: false, shadow: false }), [0, 0.024, 0], [0.4, 1, 0.4]));
  },
};

// A soft halo around a light (a sprite, so it costs one quad).
let glowTexture;
function glow(color, size, [x, y, z]) {
  if (!glowTexture) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d");
    const fill = context.createRadialGradient(32, 32, 2, 32, 32, 32);
    fill.addColorStop(0, "rgba(255,255,255,0.85)");
    fill.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = fill;
    context.fillRect(0, 0, 64, 64);
    glowTexture = new THREE.CanvasTexture(canvas);
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color, transparent: true, opacity: 0.55, depthWrite: false }));
  sprite.position.set(x, y, z);
  sprite.scale.set(size, size, 1);
  sprite.raycast = () => {};
  return sprite;
}

export function buildObject(type, seed = type) {
  const group = new THREE.Group();
  const add = (mesh) => { group.add(mesh); return mesh; };
  const sway = [];
  const animate = [];
  (BUILDERS[type] || BUILDERS.bush)(add, seededRandom(`obj:${seed}`), sway, animate);
  group.sway = sway;
  group.animate = animate;
  group.phase = seededRandom(`phase:${seed}`)() * Math.PI * 2;
  return group;
}

// ---------- walls ----------
const WALL = { color: 0xfbf3e4, inner: 0xf6ead6, top: 0xe2cfb2, base: 0xc9a27a, trim: 0xffffff, thick: 0.14 };
export function buildWall(type, height) {
  const group = new THREE.Group();
  const add = (mesh) => { group.add(mesh); return mesh; };
  const t = WALL.thick;
  const tall = height > 1;
  if (type === "door") {
    const opening = Math.min(height, 1.6);
    for (const x of [-0.44, 0.44]) add(block(WALL.color, [x, height / 2, 0], [0.12, height, t]));
    if (height > opening) add(block(WALL.color, [0, (height + opening) / 2, 0], [0.8, height - opening, t]));
    if (tall) {
      for (const x of [-0.39, 0.39]) add(block(WALL.trim, [x, opening / 2, 0], [0.04, opening, t + 0.04], { line: false }));
      add(block(WALL.trim, [0, opening, 0], [0.82, 0.05, t + 0.04], { line: false }));
      const hinge = new THREE.Group();
      hinge.position.set(-0.37, 0, 0.02);
      hinge.rotation.y = -1.1;
      group.add(hinge);
      const leaf = soft(0xb98559, [0.37, opening / 2, 0], [0.74, opening - 0.04, 0.06]);
      hinge.add(leaf);
      hinge.add(block(0xa8714f, [0.37, opening * 0.7, 0.035], [0.5, 0.4, 0.01], { line: false }));
      hinge.add(place(part(sphere(), 0xf5c542, { line: false }), [0.64, opening / 2, 0.05], [0.04]));
    }
  } else if (type === "window" && tall) {
    add(block(WALL.color, [0, 0.4, 0], [1, 0.8, t]));
    add(block(WALL.color, [0, (height + 1.55) / 2, 0], [1, height - 1.55, t]));
    for (const x of [-0.42, 0.42]) add(block(WALL.color, [x, 1.175, 0], [0.16, 0.75, t]));
    const glass = place(new THREE.Mesh(box(), new THREE.MeshBasicMaterial({ color: 0xcdeaf7, transparent: true, opacity: 0.75 })), [0, 1.175, 0], [0.68, 0.75, 0.02]);
    glass.userData.ink = false;
    glass.userData.inkSolid = true; // counts as part of the wall for ink, so the panes read as one window
    add(glass);
    add(block(WALL.trim, [0, 1.175, 0], [0.04, 0.75, 0.05], { line: false }));
    add(block(WALL.trim, [0, 1.175, 0], [0.68, 0.04, 0.05], { line: false }));
    for (const side of [-1, 1]) add(block(WALL.trim, [0, 0.82, side * (t / 2 + 0.05)], [0.8, 0.05, 0.1]));
    add(block(WALL.trim, [0, 1.56, 0], [0.76, 0.05, t + 0.04], { line: false }));
  } else {
    add(block(WALL.color, [0, height / 2, 0], [1, height, t]));
  }
  // Baseboards on both faces and a cap on top.
  if (type !== "door") for (const side of [-1, 1]) add(block(WALL.base, [0, 0.06, side * (t / 2 + 0.008)], [1, 0.12, 0.016], { line: false }));
  add(block(WALL.top, [0, height + 0.02, 0], [1.02, 0.05, t + 0.05]));
  return group;
}
// A square post where walls meet, hiding the seams at corners and ends.
export function buildPost(height) {
  const group = new THREE.Group();
  group.add(block(WALL.color, [0, height / 2, 0], [0.2, height, 0.2]));
  group.add(block(WALL.top, [0, height + 0.03, 0], [0.24, 0.06, 0.24]));
  group.add(block(WALL.base, [0, 0.06, 0], [0.22, 0.12, 0.22], { line: false }));
  return group;
}
