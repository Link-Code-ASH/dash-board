import * as THREE from "three";
import { geneValue } from "./model.js";
import { INK, blobShadow, geo, part, place, shade, sphere } from "./toon.js";

// ---------- creatures ----------
const BODY = {
  round: { scale: [0.62, 0.56, 0.6], y: 0.56 },
  bean: { scale: [0.52, 0.7, 0.5], y: 0.7 },
  drop: { scale: [0.6, 0.62, 0.58], y: 0.55 },
  mochi: { scale: [0.74, 0.46, 0.66], y: 0.46 },
  star: { scale: [0.6, 0.58, 0.6], y: 0.58 },
};
function bodyGeometry(kind) {
  if (kind === "drop") return geo("drop", () => {
    const points = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const angle = Math.PI * t;
      const radius = Math.sin(angle) * (1 - 0.45 * t * t) ;
      points.push(new THREE.Vector2(Math.max(0.001, radius), -Math.cos(angle) * 1 + 0.25 * t * t));
    }
    points[points.length - 1].x = 0.001;
    const lathe = new THREE.LatheGeometry(points, 20);
    lathe.computeVertexNormals();
    return lathe;
  });
  return sphere();
}

export function buildCreature(creature) {
  const genes = creature.genes;
  const color = geneValue("color", genes.color).hex;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const spec = BODY[genes.body] || BODY.round;
  const [sx, sy, sz] = spec.scale;
  const top = spec.y + sy;
  const front = sz;

  body.add(place(part(bodyGeometry(genes.body), color), [0, spec.y, 0], spec.scale));
  if (genes.body === "star") for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const cone = part(geo("bump", () => new THREE.ConeGeometry(0.16, 0.26, 10)), color);
    const dir = new THREE.Vector3(Math.cos(angle) * 0.9, 0.35 * ((i % 2) * 2 - 1), Math.sin(angle) * 0.9).normalize();
    cone.position.set(dir.x * sx * 0.98, spec.y + dir.y * sy * 0.98, dir.z * sz * 0.98);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    body.add(cone);
  }

  // Pattern
  const light = shade(color, 0.12);
  const dark = shade(color, -0.14);
  if (genes.pattern === "belly")
    body.add(place(part(sphere(), light, { line: false }), [0, spec.y - sy * 0.15, sz * 0.62], [sx * 0.62, sy * 0.6, sz * 0.42]));
  if (genes.pattern === "spots") [[0.55, 0.35, -0.3], [-0.5, 0.5, -0.4], [0.1, 0.8, -0.55], [-0.62, 0.15, 0.1], [0.6, 0.6, 0.15]]
    .forEach(([x, y, z]) => {
      const dir = new THREE.Vector3(x, y, z).normalize();
      body.add(place(part(sphere(), dark, { line: false }), [dir.x * sx * 0.93, spec.y + dir.y * sy * 0.93, dir.z * sz * 0.93], [0.11, 0.11, 0.11]));
    });
  if (genes.pattern === "stripes") [0.35, 0.62].forEach((h) => {
    const ring = part(geo("ring", () => new THREE.TorusGeometry(1, 0.06, 6, 28)), dark, { line: false });
    const radius = Math.sqrt(Math.max(0.05, 1 - h * h));
    place(ring, [0, spec.y + sy * h, 0], [sx * radius * 1.01, sz * radius * 1.01, 1], [Math.PI / 2, 0, 0]);
    body.add(ring);
  });
  if (genes.pattern === "twotone") body.add(place(part(geo("half", () => new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45)), dark, { line: false }),
    [0, spec.y, 0], [sx * 1.015, sy * 1.015, sz * 1.015]));

  // Face (on the front, +z)
  const eyeY = spec.y + sy * 0.18;
  const eyeX = sx * 0.34;
  const faceZ = (x, y) => Math.sqrt(Math.max(0, 1 - (x / sx) ** 2 - ((y - spec.y) / sy) ** 2)) * sz + 0.005;
  // Open eyes sit in one group around eye height, so a blink is a single vertical squash.
  const eyes = new THREE.Group();
  eyes.position.y = eyeY;
  body.add(eyes);
  for (const side of [-1, 1]) {
    const x = side * eyeX;
    const z = faceZ(x, eyeY);
    if (genes.eyes === "sleepy") {
      const lid = part(geo("lid", () => new THREE.TorusGeometry(0.075, 0.018, 6, 12, Math.PI)), INK, { line: false, basic: true });
      body.add(place(lid, [x, eyeY - 0.02, z - 0.01], [1, 1, 1], [0, 0, Math.PI]));
    } else {
      const size = genes.eyes === "dot" ? 0.07 : genes.eyes === "big" ? 0.115 : 0.1;
      eyes.add(place(part(sphere(), INK, { line: false, basic: true }), [x, 0, z - size * 0.35], [size, size * 1.18, size * 0.6]));
      eyes.add(place(part(sphere(), 0xffffff, { line: false, basic: true }), [x + size * 0.3, size * 0.42, z + size * 0.2], [size * (genes.eyes === "dot" ? 0.26 : 0.34)]));
      if (genes.eyes === "sparkle") eyes.add(place(part(sphere(), 0xffffff, { line: false, basic: true }), [x - size * 0.3, -size * 0.35, z + size * 0.2], [size * 0.18]));
    }
    const cheekY = spec.y + sy * -0.02;
    const cheekX = side * sx * 0.55;
    body.add(place(part(sphere(), 0xff8f8f, { line: false, basic: true }), [cheekX, cheekY, faceZ(cheekX, cheekY) - 0.02], [0.08, 0.045, 0.03]));
  }
  const mouthY = spec.y + sy * 0.02;
  const mouth = part(geo("mouth", () => new THREE.TorusGeometry(0.045, 0.014, 6, 10, Math.PI)), INK, { line: false, basic: true });
  body.add(place(mouth, [0, mouthY, faceZ(0, mouthY)], [1, 1, 1], [0, 0, Math.PI]));

  // Ears
  const earY = top - 0.06;
  for (const side of [-1, 1]) {
    const x = side * sx * 0.48;
    const y = spec.y + sy * 0.82;
    if (genes.ears === "cat") body.add(place(part(geo("cone", () => new THREE.ConeGeometry(0.15, 0.26, 12)), color), [x, y + 0.06, 0], [1, 1, 0.7], [0, 0, -side * 0.35]));
    if (genes.ears === "bear") body.add(place(part(sphere(), color), [x * 1.08, y, 0], [0.15, 0.15, 0.1]));
    if (genes.ears === "bunny") body.add(place(part(sphere(), color), [x * 0.7, y + 0.28, 0], [0.1, 0.32, 0.08], [0, 0, -side * 0.2]));
  }
  if (genes.ears === "sprout") {
    body.add(place(part(geo("stem", () => new THREE.CylinderGeometry(0.025, 0.03, 0.22, 6)), 0x5d9b4f), [0, earY + 0.12, 0]));
    for (const side of [-1, 1]) body.add(place(part(sphere(), 0x7cc76a), [side * 0.11, earY + 0.24, 0], [0.12, 0.05, 0.07], [0, 0, side * 0.4]));
  }
  if (genes.ears === "antenna") for (const side of [-1, 1]) {
    body.add(place(part(geo("stem", () => new THREE.CylinderGeometry(0.025, 0.03, 0.22, 6)), dark), [side * 0.14, earY + 0.1, 0], [1, 1, 1], [0, 0, -side * 0.35]));
    body.add(place(part(sphere(), 0xffe07a), [side * 0.2, earY + 0.22, 0], [0.06]));
  }
  if (genes.ears === "horn") body.add(place(part(geo("horn", () => new THREE.ConeGeometry(0.09, 0.3, 10)), 0xfff3c4), [0, earY + 0.14, sz * 0.2], [1, 1, 1], [0.25, 0, 0]));

  // Tail (back, -z)
  const tailY = spec.y - sy * 0.35;
  if (genes.tail === "nub") body.add(place(part(sphere(), color), [0, tailY, -sz * 0.97], [0.12]));
  if (genes.tail === "fluffy") body.add(place(part(sphere(), shade(color, 0.16)), [0, tailY + 0.05, -sz * 1.02], [0.22, 0.2, 0.2]));
  if (genes.tail === "curl") body.add(place(part(geo("curl", () => new THREE.TorusGeometry(0.13, 0.045, 6, 14, Math.PI * 1.6)), color), [0, tailY + 0.12, -sz * 1.02], [1, 1, 1], [0, Math.PI / 2, 0]));
  if (genes.tail === "spike") body.add(place(part(geo("spike", () => new THREE.ConeGeometry(0.1, 0.32, 8)), dark), [0, tailY + 0.05, -sz * 1.05], [1, 1, 1], [-Math.PI / 2 - 0.4, 0, 0]));

  // Feet
  for (const side of [-1, 1]) body.add(place(part(sphere(), dark), [side * sx * 0.45, 0.06, sz * 0.35], [0.14, 0.07, 0.17]));

  addAccessory(body, creature.accessory, { top, front: sz, sx, y: spec.y, sy });

  const shadow = blobShadow(Math.max(sx, sz) * 1.05);
  root.add(shadow);
  const size = { small: 0.82, medium: 1, large: 1.18 }[genes.size] || 1;
  root.userData = { kind: "hero", id: creature.id, top };
  root.scale.setScalar(size);
  root.eyes = genes.eyes === "sleepy" ? null : eyes;
  return root;
}
function addAccessory(body, accessory, { top, front, sx, y, sy }) {
  if (accessory === "ribbon") {
    for (const side of [-1, 1]) body.add(place(part(geo("cone", () => new THREE.ConeGeometry(0.15, 0.26, 12)), 0xff6f91), [side * 0.13, top - 0.02, 0.1], [0.8, 0.8, 0.5], [0, 0, side * Math.PI / 2]));
    body.add(place(part(sphere(), 0xff6f91), [0, top - 0.02, 0.1], [0.07]));
  }
  if (accessory === "flower") {
    const at = [sx * 0.45, y + sy * 0.75, 0.2];
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      body.add(place(part(sphere(), 0xffffff, { line: false }), [at[0] + Math.cos(angle) * 0.07, at[1] + Math.sin(angle) * 0.07, at[2]], [0.055, 0.055, 0.03]));
    }
    body.add(place(part(sphere(), 0xffd34d, { line: false }), at, [0.045, 0.045, 0.04]));
  }
  if (accessory === "leaf") body.add(place(part(sphere(), 0x6dbb5a), [0, top + 0.01, 0], [0.3, 0.06, 0.24], [0, 0.5, 0.15]));
  if (accessory === "crown") {
    body.add(place(part(geo("crown", () => new THREE.CylinderGeometry(0.17, 0.15, 0.12, 10, 1, true)), 0xf5c542), [0, top + 0.03, 0]));
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      body.add(place(part(geo("tip", () => new THREE.ConeGeometry(0.035, 0.09, 6)), 0xf5c542, { line: false }), [Math.cos(angle) * 0.16, top + 0.12, Math.sin(angle) * 0.16]));
    }
  }
  if (accessory === "scarf") body.add(place(part(geo("scarf", () => new THREE.TorusGeometry(1, 0.12, 8, 24)), 0xe25b5b), [0, y - sy * 0.3, 0], [sx * 0.92, front * 0.92, 1], [Math.PI / 2, 0, 0]));
  if (accessory === "glasses") {
    const eyeY = y + sy * 0.18;
    for (const side of [-1, 1]) body.add(place(part(geo("lens", () => new THREE.TorusGeometry(0.1, 0.018, 6, 16)), INK, { line: false, basic: true }), [side * sx * 0.34, eyeY, front * 0.95 + 0.04]));
    body.add(place(part(geo("bridge", () => new THREE.BoxGeometry(0.1, 0.02, 0.02)), INK, { line: false, basic: true }), [0, eyeY + 0.02, front * 0.97 + 0.04]));
  }
}
