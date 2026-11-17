// The hero: an anime-style person about five heads tall, in the same toon look as the lot. Body, head, clothes and
// hair are one skinned model made in Blender (hero.glb, built by tools/nest/hero_model.py). The game shows the pieces
// of the chosen outfit and hair style, colours them per look, paints the face, poses the bones (root.pose: walk with
// bending knees and elbows; root.sway: hair bones) and adds accessories.
// Load the model once with loadHeroModel() before calling buildHero().
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { lookOf, lookValue } from "./model.js";
import { INK, geo, blobShadow, cel, celMaterial, part, place, shade, sphere } from "./toon.js";
import { faceTextures } from "./face.js";
import heroUrl from "./hero.glb?url";

const SHOES = 0x6b5049;
const SOLE = 0xfaf4ee;
const DENIM = 0x5f74a8;
const SOCKS = 0xfaf4ee;
const HEAD_CENTER = new THREE.Vector3(0, 1.365, 0); // in the model, Y up, front +Z
const HAIR_SIZE = [0.13, 0.151, 0.148]; // the hair shell's radii in the model; trinkets are laid out at R0 and scaled to these
const R0 = 0.36;
const ARM_REST = 0.56; // the model stands in an A-pose; this lowers the arms to the sides

// What each outfit shows, and which body regions it covers (hidden, so skin never pokes through cloth).
const OUTFITS = {
  tee: { show: ["tee", "pants"], hide: ["bChest", "bHips", "bLegU", "bLegL", "bAnkle"] },
  hoodie: { show: ["hoodie", "hood", "shorts", "socks"], hide: ["bChest", "bArmU", "bArmL", "bHips", "bAnkle"] },
  overalls: { show: ["tee", "pants", "bib", "strap"], hide: ["bChest", "bHips", "bLegU", "bLegL", "bAnkle"] },
  dress: { show: ["dressTop", "skirt", "collar", "bow", "socks"], hide: ["bChest", "bAnkle"] },
};
const ALWAYS = ["face", "shoes", "sole", "bNeck", "bChest", "bArmU", "bArmL", "bHand", "bHips", "bLegU", "bLegL", "bAnkle"];

const FACE_LIGHT = new THREE.Vector3(0, 0.25, 0.75);
let model = null;
let loading = null;
export function loadHeroModel() {
  if (model) return Promise.resolve(model);
  loading ||= new GLTFLoader().loadAsync(heroUrl).then((gltf) => {
    // Anime faces are lit almost flat: lean the face's normals towards the front so no hard shadow cuts across it.
    gltf.scene.traverse((node) => {
      if (!node.isMesh || node.material.name !== "face") return;
      const normals = node.geometry.attributes.normal;
      const n = new THREE.Vector3();
      for (let i = 0; i < normals.count; i++) {
        n.fromBufferAttribute(normals, i);
        const facing = THREE.MathUtils.smoothstep(n.z, -0.1, 0.6);
        n.multiplyScalar(1 - 0.55 * facing).addScaledVector(FACE_LIGHT, facing).normalize();
        normals.setXYZ(i, n.x, n.y, n.z);
      }
    });
    model = gltf.scene;
    return model;
  });
  return loading;
}
export const heroModelLoaded = () => !!model;

const hex = (value) => `#${new THREE.Color(value).getHexString()}`;

// A group that follows `bone` but is laid out in the model's own space (Y up, front +Z), for trinkets.
function anchor(bone, root) {
  root.updateMatrixWorld(true);
  const group = new THREE.Group();
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(bone.matrixWorld).invert();
  inverse.decompose(group.position, group.quaternion, group.scale);
  bone.add(group);
  return group;
}

// Turns a bone about axes given in the model's space (x: nod forward/back, y: twist, z: lean sideways), on top of
// its rest pose, one after another in the order given: turn("x", 0.2, "z", -0.1).
const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
function turner(bone) {
  const rest = bone.quaternion.clone();
  const parentWorld = new THREE.Quaternion();
  bone.parent.getWorldQuaternion(parentWorld);
  const toLocal = parentWorld.invert();
  const q = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  return (...steps) => {
    bone.quaternion.copy(rest);
    for (let i = 0; i < steps.length; i += 2) {
      if (!steps[i + 1]) continue;
      axis.set(...AXES[steps[i]]).applyQuaternion(toLocal);
      bone.quaternion.premultiply(q.setFromAxisAngle(axis, steps[i + 1]));
    }
  };
}

// tilt: how far the face turns up; the lot's camera looks down steeply, a portrait's camera looks almost level.
export function buildHero(hero, { tilt = 0.34 } = {}) {
  if (!model) throw new Error("hero model not loaded");
  const look = lookOf(hero);
  const skin = lookValue("skin", look.skin).hex;
  const hair = lookValue("hairColor", look.hairColor).hex;
  const cloth = lookValue("outfitColor", look.outfitColor).hex;
  const outfit = OUTFITS[look.outfit] ? look.outfit : "tee";
  const overalls = outfit === "overalls";
  const colours = {
    tee: overalls ? shade(cloth, 0.3) : cloth, pants: overalls ? cloth : DENIM, bib: cloth, strap: cloth,
    hoodie: cloth, hood: cloth, shorts: shade(DENIM, -0.12), socks: SOCKS,
    dressTop: cloth, skirt: cloth, collar: 0xfffaf2, bow: shade(cloth, -0.3),
    shoes: SHOES, sole: SOLE, bHips: outfit === "dress" ? 0xfffaf2 : skin,
  };
  const shown = new Set([...ALWAYS, ...OUTFITS[outfit].show].filter((name) => !OUTFITS[outfit].hide.includes(name)));

  const root = new THREE.Group();
  const body = cloneSkinned(model);
  root.add(body);
  const faces = faceTextures(look.eyes, hex(skin));
  const faceMaterial = celMaterial(0xffffff, { kind: "skin", map: faces.open });
  const bones = {};
  const unused = [];
  const hairMeshes = [];
  body.traverse((node) => {
    if (node.isBone) bones[node.name] = node;
    if (!node.isMesh) return;
    const name = node.material.name;
    const isHair = name === "hair";
    let owner = node;
    while (owner.parent && !owner.name.startsWith("hair_") && owner !== body) owner = owner.parent;
    if (isHair ? owner.name !== `hair_${look.hair}` : !shown.has(name)) { unused.push(node); return; }
    node.frustumCulled = false; // skinned: the rest-pose bounds don't follow the walk
    node.castShadow = false;
    node.receiveShadow = true;
    if (isHair) {
      node.material = cel(hair, "cloth", true);
      node.userData.inkKey = `hair:${hero.id}`; // inked as its own object, so hair always meets the face with a line
      hairMeshes.push(node);
    } else if (name === "face") node.material = faceMaterial;
    else {
      const bare = (name === "skin" || /^b[A-Z]/.test(name)) && !(name === "bHips" && outfit === "dress");
      node.material = cel(colours[name] ?? skin, bare ? "skin" : "cloth", name === "skirt");
    }
  });
  for (const node of unused) node.parent.remove(node);

  const turn = Object.fromEntries(Object.keys(bones).map((name) => [name, turner(bones[name])]));
  const head = new THREE.Group();
  head.position.copy(HEAD_CENTER);
  head.scale.set(HAIR_SIZE[0] / R0, HAIR_SIZE[1] / R0, HAIR_SIZE[2] / R0).divideScalar(1.1);
  anchor(bones.head, root).add(head);
  const chest = anchor(bones.chest, root);
  addAccessory(head, chest, hero.accessory);
  turn.head("x", -tilt * 0.65);
  turn.neck("x", -tilt * 0.35);

  root.add(blobShadow(0.2));
  const size = { small: 0.95, medium: 1, large: 1.05 }[hero.genes?.size] || 1;
  root.scale.setScalar(size * 0.95);
  root.userData = { kind: "hero", id: hero.id, top: HEAD_CENTER.y + 0.2, person: true };
  root.blink = look.eyes === "sleepy" ? null : (closed) => { faceMaterial.map = closed ? faces.closed : faces.open; };
  // swing: −1…1 through the walk cycle (0 standing); phase: the cycle's angle while walking, so each knee folds as
  // its leg comes forward and straightens to land. Arms swing against the legs with a loose elbow.
  root.pose = (swing, breathe = 0, phase = null) => {
    const stride = phase === null ? Math.abs(swing) : 1;
    const pass = phase === null ? 0 : Math.cos(phase); // > 0 while the left leg travels forward
    const kneeL = stride * (0.12 + 1.05 * Math.max(0, pass) ** 1.3);
    const kneeR = stride * (0.12 + 1.05 * Math.max(0, -pass) ** 1.3);
    turn.thigh_L("x", -swing * 0.52 - kneeL * 0.28);
    turn.thigh_R("x", swing * 0.52 - kneeR * 0.28);
    turn.shin_L("x", kneeL);
    turn.shin_R("x", kneeR);
    turn.foot_L("x", -0.25 * kneeL + 0.18 * Math.max(0, swing));
    turn.foot_R("x", -0.25 * kneeR + 0.18 * Math.max(0, -swing));
    turn.upperarm_L("z", -ARM_REST, "x", swing * 0.5 + 0.04);
    turn.upperarm_R("z", ARM_REST, "x", -swing * 0.5 + 0.04);
    turn.forearm_L("x", -0.22 - 0.4 * Math.max(0, -swing) - 0.12 * stride, "z", 0.1);
    turn.forearm_R("x", -0.22 - 0.4 * Math.max(0, swing) - 0.12 * stride, "z", -0.1);
    turn.spine("x", stride * 0.05);
    turn.chest("x", breathe * 0.02, "y", -swing * 0.1);
    turn.hips("y", swing * 0.1);
  };
  root.pose(0);
  root.limbs = null;
  root.tail = null;
  // Hair sways from its bones: a slow breeze at rest, trailing behind and bouncing on a walk.
  root.sway = (t, walk = 0, step = 0) => {
    const breeze = Math.sin(t * 1.6) + 0.4 * Math.sin(t * 2.7 + 1);
    const bounce = walk * Math.sin(step * 2);
    turn.hair_back("x", 0.025 * breeze + walk * 0.16 + 0.05 * bounce, "z", 0.02 * Math.sin(t * 1.1) + walk * 0.05 * Math.sin(step));
    turn.hair_back2("x", 0.03 * Math.sin(t * 1.6 - 0.8) + walk * 0.1 + 0.06 * Math.sin(step * 2 - 0.9) * walk, "z", walk * 0.06 * Math.sin(step - 0.8));
    turn.hair_tail("x", 0.04 * breeze + walk * 0.28 + 0.1 * bounce, "z", 0.04 * Math.sin(t * 1.3) + walk * 0.22 * Math.sin(step));
    turn.hair_L("x", 0.02 * Math.sin(t * 1.5 + 0.6) + walk * 0.1 + 0.04 * bounce, "z", 0.012 * breeze);
    turn.hair_R("x", 0.02 * Math.sin(t * 1.5 + 1.4) + walk * 0.1 + 0.04 * bounce, "z", 0.012 * breeze);
  };
  root.dispose = () => {};
  // Seen small, the lines between clumps turn into scribbles: draw only the hair's outline then.
  root.hairDetail = (fine) => { for (const node of hairMeshes) node.userData.ink = fine ? undefined : false; };
  return root;
}

function addAccessory(head, body, accessory) {
  const top = R0 * 1.1;
  if (accessory === "ribbon") {
    const at = [0.2, top - 0.08, 0.06];
    for (const side of [-1, 1]) head.add(place(part(geo("bow", () => new THREE.ConeGeometry(0.09, 0.15, 12)), 0xff6f91), [at[0] + side * 0.075, at[1], at[2]], [0.8, 0.8, 0.5], [0, 0, side * Math.PI / 2]));
    head.add(place(part(sphere(), 0xff6f91), at, [0.04]));
  }
  if (accessory === "flower") {
    const at = [-0.31, top - 0.2, 0.25];
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      head.add(place(part(sphere(), 0xffffff, { line: false }), [at[0] + Math.cos(angle) * 0.045, at[1] + Math.sin(angle) * 0.045, at[2]], [0.035, 0.035, 0.02]));
    }
    head.add(place(part(sphere(), 0xffd34d, { line: false }), at, [0.03]));
  }
  if (accessory === "leaf") head.add(place(part(sphere(), 0x6dbb5a), [0.02, top + 0.005, 0], [0.24, 0.05, 0.19], [0, 0.5, 0.15]));
  if (accessory === "crown") {
    head.add(place(part(geo("crown", () => new THREE.CylinderGeometry(0.14, 0.12, 0.1, 10, 1, true)), 0xf5c542), [0, top + 0.02, 0]));
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      head.add(place(part(geo("tip", () => new THREE.ConeGeometry(0.03, 0.08, 6)), 0xf5c542, { line: false }), [Math.cos(angle) * 0.13, top + 0.11, Math.sin(angle) * 0.13]));
    }
  }
  if (accessory === "scarf") {
    body.add(place(part(geo("scarf4", () => new THREE.TorusGeometry(0.05, 0.024, 8, 22)), 0xe25b5b), [0, 1.158, 0.004], [1, 1, 0.95], [Math.PI / 2, 0, 0]));
    body.add(place(part(geo("scarfEnd4", () => new THREE.BoxGeometry(0.042, 0.11, 0.02)), 0xe25b5b), [0.032, 1.1, 0.078], [1, 1, 1], [0.2, 0, 0.12]));
  }
  if (accessory === "glasses") {
    for (const side of [-1, 1]) head.add(place(part(geo("lens2", () => new THREE.TorusGeometry(0.088, 0.011, 6, 20)), INK, { line: false, basic: true }), [side * 0.14, -0.105, 0.36], [1, 0.86, 1]));
    head.add(place(part(geo("bridge2", () => new THREE.BoxGeometry(0.11, 0.014, 0.014)), INK, { line: false, basic: true }), [0, -0.095, 0.385]));
  }
}
