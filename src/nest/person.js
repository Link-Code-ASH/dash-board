// The hero: a small two-head-tall person in the same toon look as the lot. Built from the hero's look
// (skin, hair, hair colour, outfit, outfit colour, eyes) plus an accessory; limbs are exposed for walking.
import * as THREE from "three";
import { lookOf, lookValue } from "./model.js";
import { INK, blobShadow, geo, part, place, shade, sphere, toon, toonTwoSided } from "./toon.js";
import { faceGeometry, faceTextures } from "./face.js";

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
  // The painted face sits a hair above the skin and is lit like it.
  const faces = faceTextures(look.eyes);
  const faceMaterial = new THREE.MeshToonMaterial({ map: faces.open, transparent: true, gradientMap: toon(0xffffff, true).gradientMap,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false });
  const face = place(new THREE.Mesh(geo("face", faceGeometry), faceMaterial), [0, 0, 0], [r * kx * 1.004, r * ky * 1.004, r * kz * 1.004]);
  face.raycast = () => {};
  head.add(face);
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
  root.blink = look.eyes === "sleepy" ? null : (closed) => { faceMaterial.map = closed ? faces.closed : faces.open; };
  root.limbs = { arms, legs };
  root.tail = null;
  return root;
}

// Hair is one smooth shell over the head whose lower edge follows a hairline: pointed bangs at the front, over
// the ears at the sides and down to the nape (or lower) at the back. Extra volumes add buns, tails and curls.
const HAIRLINES = {
  short: { front: 77, tips: 13, side: 97, back: 124 },
  bob: { front: 79, tips: 12, side: 124, back: 132, puff: 0.07 },
  long: { front: 79, tips: 12, side: 128, back: 145, puff: 0.06 },
  ponytail: { front: 75, tips: 12, side: 100, back: 121 },
  buns: { front: 77, tips: 12, side: 100, back: 122 },
  spiky: { front: 73, tips: 17, side: 96, back: 120, sharp: true },
  curly: { front: 75, tips: 8, side: 104, back: 127, puff: 0.05, curl: true },
};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hairShell(style) {
  return geo(`hair:${style}`, () => {
    const line = HAIRLINES[style] || HAIRLINES.short;
    const deg = Math.PI / 180;
    const geometry = new THREE.SphereGeometry(1, 64, 40);
    const position = geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      const phi = Math.atan2(v.x, v.z); // 0 at the front
      const away = Math.abs(phi);
      let theta = Math.acos(Math.max(-1, Math.min(1, v.y)));
      // Bang tips at the centre and about 40 degrees either side.
      const wave = Math.max(0, Math.cos(phi * 9)) ** (line.sharp ? 3 : 1.6) * (away < 0.95 ? 1 : 0);
      let edge = line.front + line.tips * wave;
      edge += (line.side - edge) * smooth(0.75, 1.45, away);
      edge += (line.back - edge) * smooth(1.75, 2.7, away);
      theta = Math.min(theta, edge * deg);
      let radius = 1 + 0.035 * Math.cos(theta);
      if (line.puff) radius += line.puff * Math.sin(theta) ** 2 * smooth(0.6, 1.4, away);
      if (line.curl) radius += 0.025 * Math.sin(phi * 7) * Math.sin(theta * 5);
      v.set(Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi)).multiplyScalar(radius);
      position.setXYZ(i, v.x, v.y, v.z);
    }
    geometry.computeVertexNormals();
    return geometry;
  });
}

function addHair(head, style, color) {
  const r = R0;
  const dark = shade(color, -0.07);
  const add = (mesh) => { head.add(mesh); return mesh; };
  const shell = add(place(part(hairShell(style), color), [0, 0.005, -0.005], [r * 1.06, r * 1.06, r * 1.06]));
  shell.material = toonTwoSided(shade(color, -0.04));
  if (style === "long") add(place(part(capsule(0.2, 0.2), color), [0, -0.33, -0.2], [1.25, 1, 0.5], [0.12, 0, 0]));
  if (style === "ponytail") {
    add(place(part(sphere(), 0xff8fa8), [0, 0.12, -0.39], [0.05]));
    add(place(part(capsule(0.1, 0.22), color), [0, -0.08, -0.47], [1, 1, 0.85], [-0.3, 0, 0]));
  }
  if (style === "buns") for (const side of [-1, 1]) add(place(part(sphere(), color), [side * 0.25, 0.28, -0.06], [0.125]));
  if (style === "spiky") {
    const spike = geo("hairSpike", () => new THREE.ConeGeometry(0.1, 0.26, 10));
    for (const [x, y, z, rx, rz] of [[0, 0.41, 0.0, 0.1, 0], [-0.17, 0.35, 0.02, 0.2, 0.6], [0.17, 0.35, 0.02, 0.2, -0.6], [-0.27, 0.2, -0.12, -0.3, 1.1], [0.27, 0.2, -0.12, -0.3, -1.1], [0, 0.32, -0.25, -0.9, 0]])
      add(place(part(spike, color), [x, y, z], [1, 1, 1], [rx, 0, rz]));
  }
  if (style === "curly") for (let i = 0; i < 7; i++) {
    const angle = Math.PI + (i / 6 - 0.5) * Math.PI * 1.3;
    add(place(part(sphere(), i % 2 ? color : dark), [Math.sin(angle) * 0.33, 0.05 - Math.abs(i - 3) * 0.02, Math.cos(angle) * 0.33], [0.1]));
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
