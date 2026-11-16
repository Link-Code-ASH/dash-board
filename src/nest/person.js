// The hero: a small two-head-tall person in the same toon look as the lot. Built from the hero's look
// (skin, hair, hair colour, outfit, outfit colour, eyes) plus an accessory; limbs are exposed for walking.
import * as THREE from "three";
import { lookOf, lookValue } from "./model.js";
import { INK, blobShadow, geo, part, place, shade, sphere } from "./toon.js";

const SHOES = 0x6b5049;
const DENIM = 0x6a80b3;
const EYE = 0x3a2a28;
const BLUSH = 0xffa8a4;
// Proportions of a chibi: a big round head on a small, soft body with short stubby limbs.
const HEAD = { y: 0.78, r: 0.42, squash: [1.07, 0.95, 0.98] };
const R0 = 0.36; // hair and head accessories are modelled for this radius and scaled to the head
const capsule = (radius, length) => geo(`capsule:${radius}:${length}`, () => new THREE.CapsuleGeometry(radius, length, 6, 14));
const cone = (top, bottom, height, segments = 18) => geo(`cone:${top}:${bottom}:${height}`, () => new THREE.CylinderGeometry(top, bottom, height, segments));
// A cap over the top and back of the head, open at the face.
const cap = () => geo("hairCap", () => new THREE.SphereGeometry(1, 26, 16, 0, Math.PI * 2, 0, Math.PI * 0.6));
// A soft bell for the body: narrow at the neck, round at the hips.
const torso = () => geo("torso", () => {
  const points = [[0.001, 0.17], [0.15, 0.17], [0.19, 0.22], [0.19, 0.3], [0.165, 0.4], [0.12, 0.47], [0.07, 0.5], [0.001, 0.505]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const curve = new THREE.SplineCurve(points);
  const lathe = new THREE.LatheGeometry(curve.getPoints(18), 22);
  lathe.computeVertexNormals();
  return lathe;
});

// tilt: how far the face turns up; the lot's camera looks down steeply, a portrait's camera looks almost level.
export function buildHero(hero, { tilt = 0.42 } = {}) {
  const look = lookOf(hero);
  const skin = lookValue("skin", look.skin).hex;
  const hair = lookValue("hairColor", look.hairColor).hex;
  const cloth = lookValue("outfitColor", look.outfitColor).hex;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const dress = look.outfit === "dress";
  const overalls = look.outfit === "overalls";
  const shirt = overalls ? shade(cloth, 0.24) : cloth;
  const pants = dress ? skin : overalls ? cloth : DENIM;
  const soft = { gentle: true };

  // Little legs and round shoes hang from hip pivots so they can swing.
  const legs = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.08, 0.19, 0);
    pivot.add(place(part(capsule(0.058, 0.05), pants, dress ? soft : undefined), [0, -0.07, 0]));
    pivot.add(place(part(sphere(), SHOES), [0, -0.135, 0.025], [0.075, 0.05, 0.1]));
    body.add(pivot);
    return pivot;
  });

  // Body (and skirt or overalls).
  body.add(part(torso(), shirt));
  if (dress) body.add(place(part(cone(0.13, 0.25, 0.2, 24), cloth), [0, 0.25, 0]));
  if (overalls) {
    body.add(place(part(cone(0.192, 0.192, 0.14, 24), cloth), [0, 0.24, 0], [1, 1, 1]));
    body.add(place(part(geo("bib", () => new THREE.BoxGeometry(0.17, 0.12, 0.04)), cloth), [0, 0.33, 0.16], [1, 1, 1], [-0.12, 0, 0]));
    for (const side of [-1, 1]) body.add(place(part(sphere(), 0xf5c542, { line: false }), [side * 0.06, 0.38, 0.18], [0.017]));
  }
  if (look.outfit === "hoodie") {
    body.add(place(part(geo("hood", () => new THREE.TorusGeometry(0.11, 0.05, 8, 20)), shade(cloth, -0.05)), [0, 0.49, -0.07], [1, 1, 1], [Math.PI / 2 - 0.6, 0, 0]));
    body.add(place(part(geo("pocket", () => new THREE.BoxGeometry(0.15, 0.05, 0.02)), shade(cloth, -0.06), { line: false }), [0, 0.27, 0.185]));
  }
  if (look.outfit === "tee") body.add(place(part(geo("collar", () => new THREE.TorusGeometry(0.06, 0.014, 6, 16)), shade(cloth, -0.1), { line: false }), [0, 0.49, 0.03], [1, 1, 1], [Math.PI / 2 - 0.25, 0, 0]));

  // Stubby arms held a little out from the body, ending in round hands.
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.15, 0.43, 0);
    pivot.rotation.z = side * 0.4;
    pivot.add(place(part(capsule(0.05, 0.05), look.outfit === "hoodie" ? cloth : look.outfit === "tee" || dress ? cloth : shirt), [0, -0.05, 0]));
    pivot.add(place(part(sphere(), skin, soft), [0, -0.12, 0.005], [0.055]));
    body.add(pivot);
    return pivot;
  });

  // Head and face (front is +z). The face sits low on the head, the way small children's faces do.
  const head = new THREE.Group();
  head.position.y = HEAD.y;
  head.rotation.x = -tilt; // chin up towards the camera, so the face stays in view
  body.add(head);
  const r = HEAD.r;
  const [kx, ky, kz] = HEAD.squash;
  head.add(place(part(sphere(), skin, soft), [0, 0, 0], [r * kx, r * ky, r * kz]));
  const faceZ = (x, y) => Math.sqrt(Math.max(0, 1 - (x / (r * kx)) ** 2 - (y / (r * ky)) ** 2)) * r * kz + 0.004;
  const eyes = new THREE.Group();
  const eyeY = -0.1;
  eyes.position.y = eyeY;
  head.add(eyes);
  const paint = (color) => part(sphere(), color, { line: false, basic: true });
  for (const side of [-1, 1]) {
    const x = side * 0.155;
    const z = faceZ(x, eyeY);
    if (look.eyes === "sleepy") {
      const lid = part(geo("lid", () => new THREE.TorusGeometry(0.045, 0.012, 6, 12, Math.PI)), EYE, { line: false, basic: true });
      head.add(place(lid, [x, eyeY - 0.01, z - 0.006], [1, 1, 1], [0, 0, 0]));
    } else {
      const size = { dot: 0.05, big: 0.082, sparkle: 0.076 }[look.eyes] || 0.07;
      eyes.add(place(paint(EYE), [x, 0, z - size * 0.3], [size * 0.82, size * 1.15, size * 0.45]));
      eyes.add(place(paint(0xffffff), [x + side * size * 0.18 + size * 0.12, size * 0.42, z + size * 0.12], [size * 0.32]));
      if (look.eyes !== "dot") eyes.add(place(paint(0xffffff), [x - size * 0.22, -size * 0.45, z + size * 0.1], [size * 0.15]));
      if (look.eyes === "sparkle") eyes.add(place(paint(0xffffff), [x + size * 0.3, -size * 0.2, z + size * 0.1], [size * 0.1]));
    }
    const cheekX = side * 0.245;
    head.add(place(paint(BLUSH), [cheekX, -0.19, faceZ(cheekX, -0.19) - 0.012], [0.07, 0.038, 0.02]));
  }
  // A tiny cat-like smile.
  for (const side of [-1, 1]) head.add(place(part(geo("smile", () => new THREE.TorusGeometry(0.018, 0.007, 6, 10, Math.PI)), EYE, { line: false, basic: true }),
    [side * 0.017, -0.19, faceZ(side * 0.017, -0.19)], [1, 1, 1], [0, 0, Math.PI]));
  for (const side of [-1, 1]) head.add(place(part(sphere(), skin, soft), [side * r * kx * 0.98, -0.08, -0.01], [0.045, 0.065, 0.045]));

  // Hair and head accessories are modelled at R0 and scaled to this head.
  const crown = new THREE.Group();
  crown.scale.set((r * kx) / R0, (r * ky) / R0, (r * kz) / R0);
  head.add(crown);
  addHair(crown, look.hair, hair);
  addAccessory(crown, body, hero.accessory);

  root.add(blobShadow(0.28));
  const size = { small: 0.94, medium: 1, large: 1.06 }[hero.genes?.size] || 1;
  root.scale.setScalar(size);
  root.userData = { kind: "hero", id: hero.id, top: HEAD.y + r, person: true };
  root.eyes = look.eyes === "sleepy" ? null : eyes;
  root.limbs = { arms, legs };
  root.tail = null;
  return root;
}

function addHair(head, style, color) {
  const r = R0;
  const dark = shade(color, -0.08);
  const add = (mesh) => { head.add(mesh); return mesh; };
  const big = style === "curly" ? 1.1 : 1.06;
  // The cap tips back, so it sits low at the back of the head and stops above the eyes at the front.
  add(place(part(cap(), color), [0, 0.015, -0.01], [r * big, r * big * 0.96, r * big], [-0.42, 0, 0]));
  // Bangs, so the hairline reads as hair, not a helmet.
  const bangs = (spread = 1, drop = 0) => {
    // Three locks hang just below the cap's edge; their round ends make the scalloped hairline.
    for (const [x, y, sx, rz] of [[-0.135, 0.075, 0.115, 0.45], [0, 0.06, 0.12, 0], [0.135, 0.075, 0.115, -0.45]]) {
      const z = Math.sqrt(Math.max(0, R0 * R0 * 1.02 - x * x * spread * spread - y * y)) - 0.02;
      add(place(part(sphere(), color), [x * spread, y - drop, z], [sx * spread, 0.085, 0.07], [0.35, x * 2.2, rz]));
    }
  };
  if (style === "short" || style === "bob" || style === "long" || style === "ponytail") bangs(1, style === "short" ? 0 : 0.01);
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
    bangs(0.9);
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
    bangs(0.95);
  }
}

function addAccessory(head, body, accessory) {
  const top = R0 * 1.04;
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
    body.add(place(part(geo("scarf", () => new THREE.TorusGeometry(0.1, 0.05, 8, 22)), 0xe25b5b), [0, 0.47, 0], [1, 1, 0.95], [Math.PI / 2, 0, 0]));
    body.add(place(part(geo("scarfEnd", () => new THREE.BoxGeometry(0.06, 0.12, 0.03)), 0xe25b5b), [0.07, 0.4, 0.14], [1, 1, 1], [0.25, 0, 0.15]));
  }
  if (accessory === "glasses") {
    for (const side of [-1, 1]) head.add(place(part(geo("lens", () => new THREE.TorusGeometry(0.068, 0.012, 6, 16)), INK, { line: false, basic: true }), [side * 0.155 * R0 / HEAD.r, -0.1 * R0 / HEAD.r, R0 * 0.9 + 0.02]));
    head.add(place(part(geo("bridge", () => new THREE.BoxGeometry(0.06, 0.014, 0.014)), INK, { line: false, basic: true }), [0, -0.09 * R0 / HEAD.r, R0 * 0.95 + 0.02]));
  }
}
