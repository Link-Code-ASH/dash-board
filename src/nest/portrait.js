// Small 3D portraits of the hero (front view, toon look) as image URLs for the panel, header and hero chooser.
import * as THREE from "three";
import { buildHero, loadHeroModel } from "./person.js";
import { InkPass } from "./ink.js";

const SIZE = 256; // drawn larger than shown, so small avatars stay crisp
let stage;
const cache = new Map();

function setup() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  // The same late-afternoon light as the lot.
  scene.add(new THREE.HemisphereLight(0xd3d9ff, 0xf3cda4, 1.25));
  const sun = new THREE.DirectionalLight(0xffe7cc, 2.2);
  sun.position.set(-2, 4, 5);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  const ink = new InkPass(renderer);
  ink.setSize(SIZE, SIZE, 1.5);
  return { renderer, scene, camera, ink };
}

export async function portraitOf(hero) {
  const key = `${JSON.stringify(hero.genes)}|${JSON.stringify(hero.look || null)}|${hero.bornAt}|${hero.sex}|${hero.accessory || "none"}`;
  if (cache.has(key)) return cache.get(key);
  await loadHeroModel();
  if (cache.has(key)) return cache.get(key);
  stage ||= setup();
  const { renderer, scene, camera, ink } = stage;
  const model = buildHero({ ...hero, accessory: hero.accessory || "none" }, { tilt: 0.12 });
  model.children.filter((child) => child.material?.transparent).forEach((child) => model.remove(child)); // no ground spot
  model.rotation.y = -0.3;
  model.sway?.(0);
  scene.add(model);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  // Head and shoulders: centred just under the chin.
  center.y = box.max.y - size.y * 0.27;
  const distance = size.y * 0.5 * 2.3;
  camera.position.set(center.x + distance * 0.1, center.y + distance * 0.22, center.z + distance);
  camera.lookAt(center);
  const perPixel = (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / SIZE;
  ink.render(scene, camera, { perPixel, depthStep: Math.max(0.03, perPixel * 4) });
  const url = renderer.domElement.toDataURL("image/png");
  scene.remove(model);
  model.dispose?.();
  cache.set(key, url);
  return url;
}
