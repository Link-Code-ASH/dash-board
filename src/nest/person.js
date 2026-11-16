// The hero: a small person (about two and a half heads tall) in the same toon look as the lot. Built from the
// hero's look (skin, hair, hair colour, outfit, outfit colour, eyes) plus an accessory; limbs are exposed for
// walking and the hair is made of separate locks that sway (root.sway).
import * as THREE from "three";
import { lookOf, lookValue } from "./model.js";
import { INK, blobShadow, geo, part, place, shade, sphere, toon, toonTwoSided } from "./toon.js";
import { faceGeometry, faceTextures } from "./face.js";

const SHOES = 0x6b5049;
const DENIM = 0x6a80b3;
const HEAD = { y: 1.13, r: 0.29, squash: [1.02, 1, 1] };
const R0 = 0.36; // hair and head accessories are modelled for this radius and scaled to the head
const capsule = (radius, length) => geo(`capsule:${radius}:${length}`, () => new THREE.CapsuleGeometry(radius, length, 6, 14));
const cone = (top, bottom, height, segments = 18) => geo(`cone:${top}:${bottom}:${height}`, () => new THREE.CylinderGeometry(top, bottom, height, segments));
const lathe = (key, points, segments = 24) => geo(key, () => {
  const curve = new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.LatheGeometry(curve.getPoints(22), segments);
  geometry.computeVertexNormals();
  return geometry;
});
// Upper body: hips to shoulders, a little waist, rounded shoulders, closing at the neck.
const torso = () => lathe("torso2", [[0.001, 0.43], [0.152, 0.43], [0.158, 0.47], [0.138, 0.56], [0.136, 0.63], [0.152, 0.71], [0.138, 0.77], [0.085, 0.815], [0.04, 0.83], [0.001, 0.832]]);
// Shorts or the top of trousers, under the shirt's hem.
const hips = () => lathe("hips2", [[0.001, 0.37], [0.105, 0.37], [0.136, 0.4], [0.146, 0.45], [0.13, 0.5], [0.001, 0.51]]);
// An A-line skirt from the waist.
const skirt = () => lathe("skirt", [[0.001, 0.335], [0.2, 0.335], [0.238, 0.345], [0.222, 0.4], [0.18, 0.5], [0.142, 0.6], [0.128, 0.64]]);

// tilt: how far the face turns up; the lot's camera looks down steeply, a portrait's camera looks almost level.
export function buildHero(hero, { tilt = 0.3 } = {}) {
  const look = lookOf(hero);
  const skin = lookValue("skin", look.skin).hex;
  const hair = lookValue("hairColor", look.hairColor).hex;
  const cloth = lookValue("outfitColor", look.outfitColor).hex;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const dress = look.outfit === "dress";
  const overalls = look.outfit === "overalls";
  const hoodie = look.outfit === "hoodie";
  const shirt = overalls ? shade(cloth, 0.24) : cloth;
  const pants = overalls ? cloth : DENIM;
  const soft = { gentle: true };
  const flatter = [1, 1, 0.82]; // bodies are a little shallower front to back than across

  // Legs hang from hip pivots so they can swing; trousers to the ankle, bare legs under a dress.
  const legs = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.072, 0.42, 0);
    if (dress) {
      pivot.add(place(part(capsule(0.045, 0.3), skin, soft), [0, -0.2, 0]));
      pivot.add(place(part(capsule(0.047, 0.05), 0xfaf4ee), [0, -0.33, 0])); // socks
    } else pivot.add(place(part(capsule(0.052, 0.27), pants), [0, -0.18, 0]));
    pivot.add(place(part(sphere(), SHOES), [0, -0.385, 0.03], [0.058, 0.045, 0.092]));
    body.add(pivot);
    return pivot;
  });

  // Body.
  if (!dress) body.add(place(part(hips(), pants), [0, 0, 0], flatter));
  body.add(place(part(torso(), shirt), [0, 0, 0], flatter));
  body.add(place(part(cone(0.034, 0.04, 0.14, 14), skin, soft), [0, 0.87, -0.005]));
  if (dress) {
    body.add(place(part(skirt(), cloth), [0, 0, 0], [1, 1, 0.86]));
    body.add(place(part(geo("sash", () => new THREE.TorusGeometry(0.133, 0.014, 6, 28)), shade(cloth, -0.12), { line: false }), [0, 0.635, 0], [1, 0.82, 1], [Math.PI / 2, 0, 0]));
  }
  if (overalls) {
    body.add(place(part(geo("bib2", () => new THREE.BoxGeometry(0.16, 0.15, 0.03)), cloth), [0, 0.59, 0.108], [1, 1, 1], [-0.05, 0, 0]));
    for (const side of [-1, 1]) {
      body.add(place(part(geo("strap", () => new THREE.BoxGeometry(0.035, 0.2, 0.02)), cloth, { line: false }), [side * 0.07, 0.7, 0.1], [1, 1, 1], [-0.25, 0, 0]));
      body.add(place(part(sphere(), 0xf5c542, { line: false }), [side * 0.055, 0.645, 0.126], [0.014]));
    }
  }
  if (hoodie) {
    body.add(place(part(geo("hood2", () => new THREE.TorusGeometry(0.085, 0.038, 8, 20)), shade(cloth, -0.05)), [0, 0.805, -0.05], [1, 1, 1], [Math.PI / 2 - 0.5, 0, 0]));
    body.add(place(part(geo("pocket2", () => new THREE.BoxGeometry(0.13, 0.05, 0.02)), shade(cloth, -0.06), { line: false }), [0, 0.5, 0.123]));
  }
  if (look.outfit === "tee") body.add(place(part(geo("collar2", () => new THREE.TorusGeometry(0.048, 0.011, 6, 16)), shade(cloth, -0.1), { line: false }), [0, 0.818, 0.012], [1, 1, 1], [Math.PI / 2 - 0.2, 0, 0]));

  // Arms from the shoulders: a sleeve, then the forearm (bare unless it's a hoodie) and a round hand.
  const sleeve = dress || look.outfit === "tee" ? cloth : shirt;
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.158, 0.765, 0);
    pivot.rotation.z = side * 0.12;
    if (dress) pivot.add(place(part(sphere(), sleeve), [0, -0.035, 0], [0.058, 0.07, 0.055]));
    else pivot.add(place(part(capsule(0.043, 0.1), sleeve), [0, -0.07, 0]));
    pivot.add(place(part(capsule(0.036, 0.13), hoodie ? sleeve : skin, hoodie ? undefined : soft), [0, -0.2, 0]));
    pivot.add(place(part(sphere(), skin, soft), [0, -0.315, 0.005], [0.043]));
    body.add(pivot);
    return pivot;
  });

  // Head and face (front is +z).
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
  for (const side of [-1, 1]) head.add(place(part(sphere(), skin, soft), [side * r * kx * 0.97, -0.045, -0.01], [0.032, 0.048, 0.032]));

  // Hair and head accessories are modelled at R0 and scaled to this head.
  const crown = new THREE.Group();
  crown.scale.set((r * kx) / R0, (r * ky) / R0, (r * kz) / R0);
  head.add(crown);
  const locks = addHair(crown, look.hair, hair, tilt);
  addAccessory(crown, body, hero.accessory);

  root.add(blobShadow(0.26));
  const size = { small: 0.94, medium: 1, large: 1.06 }[hero.genes?.size] || 1;
  root.scale.setScalar(size);
  root.userData = { kind: "hero", id: hero.id, top: HEAD.y + r * 1.1, person: true };
  root.blink = look.eyes === "sleepy" ? null : (closed) => { faceMaterial.map = closed ? faces.closed : faces.open; };
  root.limbs = { arms, legs };
  root.tail = null;
  // t: seconds; walk: 0 standing to 1 walking; step: the walk cycle's phase.
  root.sway = (t, walk = 0, step = 0) => swayLocks(locks, t, walk, step);
  root.dispose = () => locks.forEach((lock) => lock.mesh.geometry.dispose());
  return root;
}

// ---- Hair ------------------------------------------------------------------------------------------------
// Hair is a dark base cap over the scalp with separate locks laid over it: bangs across the forehead, locks
// framing the face, and locks down the sides and back. Each lock is a soft tapered ribbon that follows the head
// and then falls; neighbouring locks alternate between two close shades so the ink pass draws the partings.
const deg = Math.PI / 180;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// A point on the hair surface at radius R: theta from the top of the head, phi around from the front. Below the
// widest point hair stops wrapping in and falls (pulled in a little by `tuck`).
function surface(R, theta, phi, tuck = 0.12) {
  if (theta <= 90) return new THREE.Vector3(R * Math.sin(theta * deg) * Math.sin(phi * deg), R * Math.cos(theta * deg), R * Math.sin(theta * deg) * Math.cos(phi * deg));
  const below = (theta - 90) * deg;
  const across = R * (1 - tuck * Math.sin(Math.min(below, Math.PI / 2)));
  return new THREE.Vector3(across * Math.sin(phi * deg), -R * below, across * Math.cos(phi * deg));
}

// One lock's centre line: from the crown (t0, p0) over the head to (t1, p1), then `hang` further down, ending
// with the tip turned `flick` outward (negative tucks it under).
function lockPath({ t0, p0, t1, p1, R, hang = 0, flick = 0, lift = 0, wave = 0, drape = 0 }) {
  const points = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const theta = lerp(t0, t1, s);
    const phi = lerp(p0, p1, smooth(0, 1, s) * 0.85 + s * 0.15) + wave * Math.sin(s * Math.PI * 3);
    // The root starts under the smooth cap and comes out from beneath it.
    const sink = 1 - 0.03 * (1 - smooth(0, 0.25, s));
    points.push(surface(R * sink * (1 + lift * Math.sin(s * Math.PI)), theta, phi));
  }
  const end = points[points.length - 1];
  const out = new THREE.Vector3(end.x, 0, end.z).normalize();
  if (hang > 0) {
    const steps = Math.max(3, Math.round(hang / 0.05));
    const start = end.clone();
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const p = start.clone();
      p.y -= hang * u;
      // Falling hair drifts in towards the back and shoulders (drape) and out again at the tip (flick).
      p.addScaledVector(out, -drape * Math.sin(u * Math.PI * 0.5) + flick * u * u);
      p.x += wave * 0.004 * Math.sin(u * Math.PI * 4);
      points.push(p);
    }
  } else if (flick) {
    const tip = end.clone().addScaledVector(out, flick).add(new THREE.Vector3(0, -0.02, 0));
    points.push(tip);
  }
  return points;
}

// The ribbon around a centre line: `width` across the head, `thick` off it, tapering to a point.
function lockGeometry(points, width, thick, { sharp = false, bang = false } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const rings = 26;
  const around = 10;
  const positions = new Float32Array((rings * around + 1) * 3);
  const along = new Float32Array(rings * around + 1);
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const S = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i < rings; i++) {
    const s = i / rings;
    const c = curve.getPointAt(s);
    curve.getTangentAt(s, T);
    N.set(c.x, Math.max(c.y, 0), c.z).normalize();
    S.crossVectors(T, N).normalize();
    N.crossVectors(S, T).normalize();
    // Full through the middle, then a soft point; bangs keep their width longer for a blunter, softer tip.
    const taper = sharp ? (1 - s) ** 1.1 : bang ? 1 - smooth(0.45, 1, s) ** 1.6 * 0.97 : (1 - s ** 2.3) * (0.92 + 0.22 * Math.sin(Math.PI * s));
    const w = width * 0.5 * taper * lerp(0.6, 1, smooth(0, 0.3, s));
    const h = thick * 0.5 * (1 - 0.6 * s) * lerp(0.25, 1, smooth(0, 0.3, s));
    for (let j = 0; j < around; j++) {
      const a = (j / around) * Math.PI * 2;
      v.copy(c).addScaledVector(S, Math.cos(a) * w).addScaledVector(N, Math.sin(a) * h + h * 0.35);
      positions.set([v.x, v.y, v.z], (i * around + j) * 3);
      along[i * around + j] = s;
    }
  }
  const tip = curve.getPointAt(1);
  positions.set([tip.x, tip.y, tip.z], rings * around * 3);
  along[rings * around] = 1;
  const index = [];
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < around; j++) {
    const a = i * around + j;
    const b = i * around + ((j + 1) % around);
    index.push(a, a + around, b, b, a + around, b + around);
  }
  const last = (rings - 1) * around;
  for (let j = 0; j < around; j++) index.push(last + j, rings * around, last + ((j + 1) % around));
  for (let j = 1; j < around - 1; j++) index.push(0, j + 1, j); // close the root
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.userData.along = along;
  return geometry;
}

// Hair below the head stays upright in body space, though the head itself is tipped back by `tilt`.
function upright(points, tilt) {
  const axis = new THREE.Vector3(1, 0, 0);
  return points.map((p) => p.clone().applyAxisAngle(axis, tilt * smooth(-0.05, -0.3, p.y)));
}

// Which locks each style has. Angles in degrees; R is in crown units (the scalp is R0). Locks come out from
// under the smooth cap partway down the head; bangs fan over the forehead, swept a little to one side.
function styleLocks(style) {
  const R = R0 * 1.07;
  const list = [];
  // A fixed, uneven rhythm so a fringe never looks combed into even teeth.
  const jitter = [0, 0.7, -0.4, 1, -0.8, 0.3, -0.2, 0.9, -0.6, 0.5, -1, 0.2];
  const bangs = (count, from, to, end, { sweep = 14, flick = 0.006, width = 0.2, start = 20 } = {}) => {
    for (let i = 0; i < count; i++) {
      const u = count === 1 ? 0.5 : i / (count - 1);
      const p1 = lerp(from, to, u) + jitter[i] * 3;
      const t1 = end - 5 * Math.abs(u - 0.5) * 2 + jitter[i + 2] * 3.5;
      list.push({ t0: start, p0: p1 - sweep, t1, p1, R: R * (1.01 + (i % 2) * 0.01), width: width * (1 + jitter[i + 4] * 0.12), thick: 0.05, flick, kind: "bang" });
    }
  };
  // Locks framing the face at either side.
  const frame = (end, hang = 0, { flick = 0.01, width = 0.15 } = {}) => {
    for (const side of [-1, 1]) list.push({ t0: 24, p0: side * 46, t1: end, p1: side * 68, R: R * 1.03, hang, flick, width, thick: 0.055, kind: "side" });
  };
  // Locks round the sides and back, straight down from the crown.
  const around = (count, from, to, end, { hang = 0, flick = 0, drape = 0, width = 0.24, thick = 0.06, wave = 0, start = 10 } = {}) => {
    for (let i = 0; i < count; i++) {
      const p1 = lerp(from, to, count === 1 ? 0.5 : i / (count - 1)) + jitter[i] * 2;
      const t1 = end + jitter[i + 1] * 4 + (i % 2 ? 3 : 0);
      list.push({ t0: start + (i % 2) * 4, p0: p1, t1, p1, R: R * (1 + (i % 2) * 0.012), hang: hang * (1 + jitter[i + 3] * 0.08), flick, drape, width, thick, wave, kind: "back" });
    }
  };
  if (style === "short") {
    bangs(6, -46, 42, 80, { sweep: 20, flick: 0.015, width: 0.2 });
    frame(100, 0, { flick: 0.018, width: 0.14 });
    around(9, 86, 274, 108, { flick: 0.022, width: 0.24 });
  } else if (style === "bob") {
    bangs(7, -48, 48, 83, { sweep: 8, flick: -0.004, width: 0.19 });
    frame(118, 0.05, { flick: -0.02, width: 0.16 });
    around(10, 84, 276, 120, { hang: 0.06, flick: -0.03, width: 0.25, thick: 0.07 });
  } else if (style === "long") {
    bangs(6, -46, 40, 83, { sweep: 24, flick: 0.004, width: 0.2 });
    frame(118, 0.2, { flick: 0.015, width: 0.15 });
    around(11, 86, 274, 112, { hang: 0.5, flick: 0.03, drape: 0.06, width: 0.24, thick: 0.065 });
  } else if (style === "ponytail") {
    bangs(5, -42, 40, 80, { sweep: 18, width: 0.21 });
    frame(112, 0.06, { flick: 0.02, width: 0.13 });
  } else if (style === "buns") {
    bangs(6, -44, 42, 81, { sweep: 12, width: 0.2 });
    frame(114, 0.08, { flick: 0.015, width: 0.13 });
    around(9, 86, 274, 104, { width: 0.24, thick: 0.05 });
  } else if (style === "spiky") {
    bangs(5, -40, 38, 77, { sweep: 26, flick: 0.035, width: 0.22 });
    frame(98, 0, { flick: 0.03, width: 0.15 });
    around(8, 84, 276, 104, { flick: 0.06, width: 0.26 });
    // A few bold tufts sticking up and out at the crown.
    for (const [t, p] of [[12, 150], [12, 210], [14, 95], [14, -95]])
      list.push({ t0: t, p0: p, t1: t + 34, p1: p, R: R * 1.02, flick: 0.09, width: 0.3, thick: 0.1, kind: "spike", sharp: true });
  } else if (style === "curly") {
    bangs(6, -46, 44, 79, { sweep: 8, flick: 0.025, width: 0.2 });
    frame(112, 0.05, { flick: 0.03, width: 0.16 });
    around(11, 84, 276, 116, { hang: 0.08, flick: 0.04, width: 0.22, thick: 0.08, wave: 9 });
  }
  return list;
}

// A shell over the scalp down to a hairline: `front` degrees from the top at the forehead, `side` over the
// ears and `back` at the nape.
function hairShell(front, side, back) {
  return geo(`hairShell:${front}:${side}:${back}`, () => {
    const geometry = new THREE.SphereGeometry(1, 48, 28);
    const position = geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      const phi = Math.atan2(v.x, v.z);
      const away = Math.abs(phi);
      let edge = front;
      edge += (side - edge) * smooth(0.7, 1.5, away);
      edge += (back - edge) * smooth(1.7, 2.6, away);
      const theta = Math.min(Math.acos(Math.max(-1, Math.min(1, v.y))), edge * deg);
      v.copy(surface(1, theta / deg, phi / deg, 0.12));
      position.setXYZ(i, v.x, v.y, v.z);
    }
    geometry.computeVertexNormals();
    return geometry;
  });
}
const UNDER = { short: 104, bob: 116, long: 112, ponytail: 110, buns: 104, spiky: 102, curly: 112 }; // nape of the under layer

function addHair(head, style, color, tilt) {
  const add = (mesh) => { head.add(mesh); return mesh; };
  const tones = [toonTwoSided(color), toonTwoSided(shade(color, -0.035))];
  // An under layer a shade darker, so a gap between locks reads as depth, and the smooth crown the locks come
  // out from under (for a ponytail it covers the whole head, combed back).
  const under = add(place(part(hairShell(70, 94, UNDER[style] || 108), color), [0, 0, 0], [R0 * 1.03, R0 * 1.03, R0 * 1.03]));
  under.material = toonTwoSided(shade(color, -0.1));
  const ponytail = style === "ponytail";
  const cap = add(place(part(hairShell(ponytail ? 66 : 22, ponytail ? 92 : 22, ponytail ? 112 : 22), color), [0, 0, 0], [R0 * 1.07, R0 * 1.07, R0 * 1.07]));
  cap.material = tones[0];
  const locks = [];
  const keep = (mesh, points, kind, phase) => {
    const tip = points[points.length - 1];
    const out = new THREE.Vector2(tip.x, tip.z);
    if (out.lengthSq() < 1e-6) out.set(0, -1);
    out.normalize();
    const length = points.reduce((sum, p, k) => (k ? sum + p.distanceTo(points[k - 1]) : 0), 0);
    locks.push({ mesh, rest: mesh.geometry.attributes.position.array.slice(), out, kind, length, phase });
  };
  styleLocks(style).forEach((spec, i) => {
    const points = upright(lockPath(spec), tilt);
    const geometry = lockGeometry(points, spec.width, spec.thick, { sharp: spec.sharp, bang: spec.kind === "bang" });
    const mesh = add(new THREE.Mesh(geometry, tones[0]));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    keep(mesh, points, spec.kind, i * 0.9 + spec.p1 * 0.02);
  });
  if (style === "ponytail") {
    const tie = new THREE.Vector3(0, 0.16, -0.37);
    add(place(part(geo("tie2", () => new THREE.TorusGeometry(0.045, 0.02, 8, 16)), 0xff8fa8), [tie.x, tie.y, tie.z], [1, 1, 1], [1.1, 0, 0]));
    add(place(part(sphere(), color), [tie.x, tie.y + 0.005, tie.z - 0.03], [0.06, 0.06, 0.05]));
    [[0, 0.44, 0.2, 0.12], [-0.04, 0.38, 0.17, 0.1], [0.04, 0.4, 0.17, 0.1]].forEach(([spread, len, width, thick], k) => {
      const at = (x, y, z) => tie.clone().add(new THREE.Vector3(x, y, z));
      const points = upright([at(spread * 0.3, 0.01, -0.04), at(spread * 0.7, 0.03, -0.13), at(spread, -0.07, -0.2), at(spread * 1.2, -len * 0.6, -0.2), at(spread * 1.4, -len, -0.12)], tilt);
      const mesh = add(new THREE.Mesh(lockGeometry(points, width, thick), tones[0]));
      mesh.castShadow = true;
      keep(mesh, points, "tail", k * 1.3);
    });
  }
  if (style === "buns") for (const side of [-1, 1]) {
    add(place(part(sphere(), color), [side * 0.25, 0.3, -0.07], [0.115]));
    add(place(part(geo("bunWrap", () => new THREE.TorusGeometry(0.1, 0.022, 8, 18)), shade(color, -0.05)), [side * 0.215, 0.27, -0.06], [1, 1, 1], [0.3, 0, side * 0.75]));
  }
  if (style === "curly") for (let i = 0; i < 6; i++) {
    const p = surface(R0 * 1.12, 60 + (i % 2) * 14, 110 + i * 28);
    add(place(part(sphere(), i % 2 ? color : shade(color, -0.04)), [p.x, p.y, p.z], [0.085]));
  }
  return locks;
}

// Each lock bends from its root: the further along, the more it moves. Bangs only drift sideways (so they never
// poke the eyes); longer hair swings, and while walking it trails back and bounces with each step.
function swayLocks(locks, t, walk, step) {
  for (const lock of locks) {
    const attribute = lock.mesh.geometry.attributes.position;
    const along = lock.mesh.geometry.userData.along;
    const array = attribute.array;
    const rest = lock.rest;
    const reach = Math.min(1, lock.length / 0.35);
    const sideX = -lock.out.y;
    const sideZ = lock.out.x;
    const breeze = Math.sin(t * 1.7 + lock.phase) + 0.4 * Math.sin(t * 2.9 + lock.phase * 1.7);
    const bounce = walk * Math.abs(Math.sin(step));
    let sideways = breeze * 0.006 * reach + walk * Math.sin(step + lock.phase * 0.3) * 0.008 * reach;
    let outward = (0.5 + 0.5 * Math.sin(t * 1.3 + lock.phase)) * 0.004 * reach;
    let backward = walk * (0.02 + 0.012 * bounce) * reach;
    let up = bounce * 0.012 * reach;
    if (lock.kind === "bang") { sideways *= 0.7; outward *= 0.5; backward *= 0.3; up *= 0.4; }
    if (lock.kind === "tail") { sideways *= 3; backward *= 1.6; outward = 0; }
    for (let i = 0, k = 0; k < along.length; i += 3, k++) {
      const w = smooth(0.15, 1, along[k]) ** 1.4;
      array[i] = rest[i] + w * (sideX * sideways + lock.out.x * outward);
      array[i + 1] = rest[i + 1] + w * up;
      array[i + 2] = rest[i + 2] + w * (sideZ * sideways + lock.out.y * outward - backward);
    }
    attribute.needsUpdate = true;
  }
}

function addAccessory(head, body, accessory) {
  const top = R0 * 1.1;
  if (accessory === "ribbon") {
    const at = [0.2, top - 0.08, 0.06];
    for (const side of [-1, 1]) head.add(place(part(geo("bow", () => new THREE.ConeGeometry(0.09, 0.15, 12)), 0xff6f91), [at[0] + side * 0.075, at[1], at[2]], [0.8, 0.8, 0.5], [0, 0, side * Math.PI / 2]));
    head.add(place(part(sphere(), 0xff6f91), at, [0.04]));
  }
  if (accessory === "flower") {
    const at = [-0.27, top - 0.16, 0.14];
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      head.add(place(part(sphere(), 0xffffff, { line: false }), [at[0] + Math.cos(angle) * 0.045, at[1] + Math.sin(angle) * 0.045, at[2]], [0.035, 0.035, 0.02]));
    }
    head.add(place(part(sphere(), 0xffd34d, { line: false }), at, [0.03]));
  }
  if (accessory === "leaf") head.add(place(part(sphere(), 0x6dbb5a), [0.02, top + 0.03, 0], [0.24, 0.05, 0.19], [0, 0.5, 0.15]));
  if (accessory === "crown") {
    head.add(place(part(geo("crown", () => new THREE.CylinderGeometry(0.14, 0.12, 0.1, 10, 1, true)), 0xf5c542), [0, top + 0.02, 0]));
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      head.add(place(part(geo("tip", () => new THREE.ConeGeometry(0.03, 0.08, 6)), 0xf5c542, { line: false }), [Math.cos(angle) * 0.13, top + 0.11, Math.sin(angle) * 0.13]));
    }
  }
  if (accessory === "scarf") {
    body.add(place(part(geo("scarf2", () => new THREE.TorusGeometry(0.068, 0.034, 8, 22)), 0xe25b5b), [0, 0.83, 0], [1, 1, 0.95], [Math.PI / 2, 0, 0]));
    body.add(place(part(geo("scarfEnd2", () => new THREE.BoxGeometry(0.05, 0.13, 0.025)), 0xe25b5b), [0.05, 0.74, 0.115], [1, 1, 1], [0.15, 0, 0.12]));
  }
  if (accessory === "glasses") {
    for (const side of [-1, 1]) head.add(place(part(geo("lens", () => new THREE.TorusGeometry(0.068, 0.012, 6, 16)), INK, { line: false, basic: true }), [side * 0.133, -0.086, 0.344]));
    head.add(place(part(geo("bridge", () => new THREE.BoxGeometry(0.06, 0.014, 0.014)), INK, { line: false, basic: true }), [0, -0.077, 0.362]));
  }
}
