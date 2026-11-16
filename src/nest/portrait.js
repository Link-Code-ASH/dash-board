// Small 3D portraits of a creature (front view, toon look) as image URLs for the panel, header and hero chooser.
import * as THREE from "three";
import { buildCreature } from "./creature.js";
import { InkPass } from "./ink.js";

let stage;
const cache = new Map();

function setup() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(192, 192, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe8f4ff, 0xd8c8a8, 1.4));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
  sun.position.set(-2, 4, 5);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  const ink = new InkPass(renderer);
  ink.setSize(192, 192, 1.4);
  return { renderer, scene, camera, ink };
}

export function portraitOf(creature) {
  const key = `${JSON.stringify(creature.genes)}|${creature.accessory || "none"}`;
  if (cache.has(key)) return cache.get(key);
  stage ||= setup();
  const { renderer, scene, camera, ink } = stage;
  const model = buildCreature({ ...creature, accessory: creature.accessory || "none" });
  model.children.filter((child) => child.material?.transparent).forEach((child) => model.remove(child)); // no ground spot
  model.rotation.y = -0.35; // turned so the tail (on its right) peeks out
  scene.add(model);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const distance = Math.max(size.x, size.y) * 2.35;
  camera.position.set(center.x + distance * 0.18, center.y + distance * 0.22, center.z + distance);
  camera.lookAt(center);
  const perPixel = (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / 192;
  ink.render(scene, camera, { perPixel, depthStep: Math.max(0.03, perPixel * 4) });
  const url = renderer.domElement.toDataURL("image/png");
  scene.remove(model);
  cache.set(key, url);
  return url;
}
