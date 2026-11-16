// The hero: a small two-head-tall person in the same toon look as the lot. Built from the hero's look
// (skin, hair, hair colour, outfit, outfit colour, eyes) plus an accessory; limbs are exposed for walking.
import * as THREE from "three";
import { lookOf, lookValue } from "./model.js";
import { INK, blobShadow, geo, part, place, shade, sphere } from "./toon.js";

const SHOES = 0x6b5049;
const DENIM = 0x5f74a6;
const HEAD = { y: 0.96, r: 0.36 };
const capsule = (radius, length) => geo(`capsule:${radius}:${length}`, () => new THREE.CapsuleGeometry(radius, length, 6, 14));
const cone = (top, bottom, height, segments = 18) => geo(`cone:${top}:${bottom}:${height}`, () => new THREE.CylinderGeometry(top, bottom, height, segments));
// A cap over the top and back of the head, open at the face.
const cap = () => geo("hairCap", () => new THREE.SphereGeometry(1, 26, 16, 0, Math.PI * 2, 0, Math.PI * 0.6));

export function buildHero(hero) {
  const look = lookOf(hero);
  const skin = lookValue("skin", look.skin).hex;
  const hair = lookValue("hairColor", look.hairColor).hex;
  const cloth = lookValue("outfitColor", look.outfitColor).hex;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const dress = look.outfit === "dress";
  const overalls = look.outfit === "overalls";
  const shirt = overalls ? shade(cloth, 0.22) : cloth;
  const pants = dress ? skin : overalls ? cloth : DENIM;

  // Legs and shoes hang from hip pivots so they can swing.
  const legs = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.085, 0.3, 0);
    pivot.add(place(part(capsule(0.066, 0.12), pants), [0, -0.13, 0]));
    pivot.add(place(part(sphere(), SHOES), [0, -0.26, 0.03], [0.085, 0.055, 0.12]));
    body.add(pivot);
    return pivot;
  });

  // Torso (and skirt or bib).
  body.add(place(part(capsule(0.18, 0.13), shirt), [0, 0.47, 0], [1, 1, 0.86]));
  if (dress) body.add(place(part(cone(0.16, 0.29, 0.26, 22), cloth), [0, 0.36, 0]));
  if (overalls) {
    body.add(place(part(cone(0.185, 0.2, 0.14, 22), cloth), [0, 0.37, 0], [1, 1, 0.9]));
    body.add(place(part(geo("bib", () => new THREE.BoxGeometry(0.2, 0.15, 0.04)), cloth), [0, 0.5, 0.145]));
    for (const side of [-1, 1]) {
      body.add(place(part(geo("strap", () => new THREE.BoxGeometry(0.035, 0.16, 0.03)), cloth, { line: false }), [side * 0.08, 0.6, 0.12], [1, 1, 1], [-0.35, 0, 0]));
      body.add(place(part(sphere(), 0xf5c542, { line: false }), [side * 0.07, 0.56, 0.17], [0.018]));
    }
  }
  if (look.outfit === "hoodie") {
    body.add(place(part(geo("hood", () => new THREE.TorusGeometry(0.14, 0.055, 8, 20)), shade(cloth, -0.06)), [0, 0.64, -0.08], [1, 1, 1], [Math.PI / 2 - 0.5, 0, 0]));
    body.add(place(part(geo("pocket", () => new THREE.BoxGeometry(0.17, 0.06, 0.02)), shade(cloth, -0.06), { line: false }), [0, 0.41, 0.155]));
    for (const side of [-1, 1]) body.add(place(part(sphere(), 0xffffff, { line: false }), [side * 0.04, 0.55, 0.16], [0.014, 0.04, 0.014]));
  }
  if (look.outfit === "tee") body.add(place(part(geo("collar", () => new THREE.TorusGeometry(0.075, 0.016, 6, 16)), shade(cloth, -0.1), { line: false }), [0, 0.61, 0.03], [1, 1, 1], [Math.PI / 2 - 0.2, 0, 0]));

  // Arms hang from shoulder pivots: sleeve at the top, a round hand at the end.
  const sleeve = dress || look.outfit === "tee" ? cloth : look.outfit === "hoodie" ? cloth : shirt;
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.2, 0.57, 0);
    pivot.rotation.z = side * 0.18;
    const long = look.outfit === "hoodie";
    pivot.add(place(part(capsule(0.052, 0.12), long ? sleeve : skin), [0, -0.1, 0]));
    if (!long) pivot.add(place(part(sphere(), sleeve), [0, -0.03, 0], [0.07, 0.07, 0.07]));
    pivot.add(place(part(sphere(), skin), [0, -0.2, 0.005], [0.058]));
    body.add(pivot);
    return pivot;
  });

  // Head and face (front is +z).
  const head = new THREE.Group();
  head.position.y = HEAD.y;
  head.rotation.x = -0.24; // chin up a little: the camera looks down from above, so the face stays in view
  body.add(head);
  const r = HEAD.r;
  const squash = [1, 0.94, 0.96];
  head.add(place(part(sphere(), skin), [0, 0, 0], [r * squash[0], r * squash[1], r * squash[2]]));
  const faceZ = (x, y) => Math.sqrt(Math.max(0, 1 - (x / (r * squash[0])) ** 2 - (y / (r * squash[1])) ** 2)) * r * squash[2] + 0.004;
  const eyes = new THREE.Group();
  const eyeY = -0.04;
  eyes.position.y = eyeY;
  head.add(eyes);
  for (const side of [-1, 1]) {
    const x = side * 0.125;
    const z = faceZ(x, eyeY);
    if (look.eyes === "sleepy") {
      const lid = part(geo("lid", () => new THREE.TorusGeometry(0.05, 0.013, 6, 12, Math.PI)), INK, { line: false, basic: true });
      head.add(place(lid, [x, eyeY - 0.01, z - 0.006], [1, 1, 1], [0, 0, Math.PI]));
    } else {
      const size = look.eyes === "dot" ? 0.042 : look.eyes === "big" ? 0.068 : 0.06;
      eyes.add(place(part(sphere(), INK, { line: false, basic: true }), [x, 0, z - size * 0.35], [size, size * 1.2, size * 0.55]));
      eyes.add(place(part(sphere(), 0xffffff, { line: false, basic: true }), [x + size * 0.32, size * 0.45, z + size * 0.15], [size * (look.eyes === "dot" ? 0.28 : 0.34)]));
      if (look.eyes === "sparkle") eyes.add(place(part(sphere(), 0xffffff, { line: false, basic: true }), [x - size * 0.3, -size * 0.4, z + size * 0.15], [size * 0.18]));
    }
    const cheekX = side * 0.2;
    head.add(place(part(sphere(), 0xff9a94, { line: false, basic: true }), [cheekX, -0.11, faceZ(cheekX, -0.11) - 0.015], [0.055, 0.03, 0.02]));
  }
  head.add(place(part(geo("mouth", () => new THREE.TorusGeometry(0.03, 0.01, 6, 10, Math.PI)), INK, { line: false, basic: true }),
    [0, -0.12, faceZ(0, -0.12)], [1, 1, 1], [0, 0, Math.PI]));
  for (const side of [-1, 1]) head.add(place(part(sphere(), skin), [side * r * 0.97, -0.04, -0.01], [0.05, 0.075, 0.05]));
  addHair(head, look.hair, hair);

  addAccessory(head, body, hero.accessory, cloth);

  root.add(blobShadow(0.3));
  const size = { small: 0.92, medium: 1, large: 1.08 }[hero.genes?.size] || 1;
  root.scale.setScalar(size);
  root.userData = { kind: "hero", id: hero.id, top: HEAD.y + r, person: true };
  root.eyes = look.eyes === "sleepy" ? null : eyes;
  root.limbs = { arms, legs };
  root.tail = null;
  return root;
}

function addHair(head, style, color) {
  const r = HEAD.r;
  const dark = shade(color, -0.08);
  const add = (mesh) => { head.add(mesh); return mesh; };
  const big = style === "curly" ? 1.1 : 1.06;
  // The cap tips back, so it sits low at the back of the head and stops above the eyes at the front.
  add(place(part(cap(), color), [0, 0.015, -0.01], [r * big, r * big * 0.96, r * big], [-0.42, 0, 0]));
  // Bangs: a few soft locks along the hairline so it never reads as a helmet.
  const bangs = (count = 3, spread = 0.27, drop = 0) => {
    for (let i = 0; i < count; i++) {
      const u = count === 1 ? 0 : i / (count - 1) - 0.5;
      const x = u * spread * 2;
      add(place(part(sphere(), color), [x, 0.15 - Math.abs(u) * 0.06 - drop, 0.3 - Math.abs(u) * 0.1], [0.11 - Math.abs(u) * 0.03, 0.09, 0.08], [0.75, -u * 0.7, -u * 0.4]));
    }
  };
  if (style === "short" || style === "bob" || style === "long" || style === "ponytail") bangs(4, 0.19, style === "short" ? 0.01 : 0.02);
  if (style === "short") for (const side of [-1, 1]) add(place(part(sphere(), color), [side * 0.31, 0.02, -0.04], [0.08, 0.17, 0.14]));
  if (style === "bob" || style === "long") {
    for (const side of [-1, 1]) add(place(part(sphere(), color), [side * 0.3, -0.07, -0.03], [0.12, 0.25, 0.22]));
    add(place(part(sphere(), color), [0, -0.06, -0.12], [0.36, 0.3, 0.28]));
  }
  if (style === "long") add(place(part(capsule(0.2, 0.22), color), [0, -0.34, -0.17], [1.2, 1, 0.55]));
  if (style === "ponytail") {
    for (const side of [-1, 1]) add(place(part(sphere(), color), [side * 0.3, -0.02, -0.04], [0.08, 0.17, 0.14]));
    add(place(part(sphere(), 0xff8fa8), [0, 0.16, -0.36], [0.05]));
    add(place(part(capsule(0.09, 0.2), color), [0, -0.02, -0.46], [1, 1, 0.9], [-0.35, 0, 0]));
  }
  if (style === "buns") {
    bangs(3, 0.17);
    for (const side of [-1, 1]) {
      add(place(part(sphere(), color), [side * 0.25, 0.27, -0.06], [0.12]));
      add(place(part(sphere(), color), [side * 0.3, -0.04, -0.03], [0.08, 0.17, 0.14]));
    }
  }
  if (style === "spiky") {
    const spike = geo("hairSpike", () => new THREE.ConeGeometry(0.1, 0.28, 8));
    for (const [x, y, z, rx, rz] of [[0, 0.42, 0.05, 0.35, 0], [-0.18, 0.36, 0.06, 0.35, 0.55], [0.18, 0.36, 0.06, 0.35, -0.55], [-0.29, 0.22, -0.1, -0.2, 1.0], [0.29, 0.22, -0.1, -0.2, -1.0], [0, 0.34, -0.24, -0.8, 0], [-0.08, 0.2, 0.3, 1.2, 0.3], [0.08, 0.2, 0.3, 1.2, -0.3]])
      add(place(part(spike, color), [x, y, z], [1, 1, 1], [rx, 0, rz]));
    for (const side of [-1, 1]) add(place(part(sphere(), color), [side * 0.31, 0.02, -0.04], [0.08, 0.16, 0.14]));
  }
  if (style === "curly") {
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2;
      add(place(part(sphere(), i % 2 ? color : dark), [Math.cos(angle) * 0.3, 0.2 + Math.sin(i * 1.7) * 0.04, Math.sin(angle) * 0.28 - 0.03], [0.1]));
    }
    bangs(3, 0.18);
  }
}

function addAccessory(head, body, accessory, cloth) {
  const top = HEAD.r * 1.04;
  if (accessory === "ribbon") {
    const at = [0.2, top - 0.08, 0.06];
    for (const side of [-1, 1]) head.add(place(part(geo("bow", () => new THREE.ConeGeometry(0.09, 0.15, 12)), 0xff6f91), [at[0] + side * 0.075, at[1], at[2]], [0.8, 0.8, 0.5], [0, 0, side * Math.PI / 2]));
    head.add(place(part(sphere(), 0xff6f91), at, [0.04]));
  }
  if (accessory === "flower") {
    const at = [-0.25, top - 0.16, 0.14];
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      head.add(place(part(sphere(), 0xffffff, { line: false }), [at[0] + Math.cos(angle) * 0.045, at[1] + Math.sin(angle) * 0.045, at[2]], [0.035, 0.035, 0.02]));
    }
    head.add(place(part(sphere(), 0xffd34d, { line: false }), at, [0.03]));
  }
  if (accessory === "leaf") head.add(place(part(sphere(), 0x6dbb5a), [0.02, top + 0.04, 0], [0.24, 0.05, 0.19], [0, 0.5, 0.15]));
  if (accessory === "crown") {
    head.add(place(part(geo("crown", () => new THREE.CylinderGeometry(0.14, 0.12, 0.1, 10, 1, true)), 0xf5c542), [0, top + 0.03, 0]));
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      head.add(place(part(geo("tip", () => new THREE.ConeGeometry(0.03, 0.08, 6)), 0xf5c542, { line: false }), [Math.cos(angle) * 0.13, top + 0.12, Math.sin(angle) * 0.13]));
    }
  }
  if (accessory === "scarf") {
    body.add(place(part(geo("scarf", () => new THREE.TorusGeometry(0.15, 0.055, 8, 22)), 0xe25b5b), [0, 0.63, 0], [1, 1, 0.9], [Math.PI / 2, 0, 0]));
    body.add(place(part(geo("scarfEnd", () => new THREE.BoxGeometry(0.07, 0.15, 0.03)), 0xe25b5b), [0.08, 0.55, 0.15], [1, 1, 1], [0.2, 0, 0.15]));
  }
  if (accessory === "glasses") {
    for (const side of [-1, 1]) head.add(place(part(geo("lens", () => new THREE.TorusGeometry(0.068, 0.012, 6, 16)), INK, { line: false, basic: true }), [side * 0.125, -0.04, HEAD.r * 0.93 + 0.02]));
    head.add(place(part(geo("bridge", () => new THREE.BoxGeometry(0.06, 0.014, 0.014)), INK, { line: false, basic: true }), [0, -0.03, HEAD.r * 0.95 + 0.02]));
  }
  void cloth;
}
