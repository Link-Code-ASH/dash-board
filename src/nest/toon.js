// Shared toon look: stepped lighting, cached materials/geometries, sun shadows (ink lines live in ink.js).
import * as THREE from "three";

export const INK = 0x3b302c;

let gradient;
export function toonGradient() {
  if (gradient) return gradient;
  // Three bands: a cool shade, a soft mid tone and full light.
  const data = new Uint8Array([125, 125, 135, 255, 205, 205, 208, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}
const materials = new Map();
export function toon(color) {
  const key = `t${color}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() }));
  return materials.get(key);
}
export function flat(color) {
  const key = `f${color}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshBasicMaterial({ color }));
  return materials.get(key);
}
const geometries = new Map();
export function geo(key, make) {
  if (!geometries.has(key)) geometries.set(key, make());
  return geometries.get(key);
}
export const sphere = () => geo("sphere", () => new THREE.SphereGeometry(1, 20, 14));
// A mesh with a toon fill. Ink lines come from the screen pass in ink.js; { line: false } marks a detail
// painted onto its object (eyes, cheeks, trims) that draws no lines of its own.
export function part(geometry, color, { line = true, basic = false, shadow = true } = {}) {
  const mesh = new THREE.Mesh(geometry, basic ? flat(color) : toon(color));
  mesh.castShadow = shadow && !basic;
  mesh.receiveShadow = !basic;
  if (!line) mesh.userData.ink = false;
  return mesh;
}
export function place(mesh, [x, y, z], [sx, sy, sz] = [1, 1, 1], [rx, ry, rz] = [0, 0, 0]) {
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy ?? sx, sz ?? sx);
  mesh.rotation.set(rx, ry, rz);
  return mesh;
}
export const shade = (hex, amount) => {
  const color = new THREE.Color(hex);
  const hsl = {};
  color.getHSL(hsl);
  color.setHSL(hsl.h, Math.min(1, hsl.s * (amount < 0 ? 1.05 : 0.8)), Math.max(0, Math.min(1, hsl.l + amount)));
  return color.getHex();
};

let shadowTexture;
// A soft contact spot under the hero, on top of the sun shadow.
export function blobShadow(radius) {
  if (!shadowTexture) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d");
    const fill = context.createRadialGradient(32, 32, 4, 32, 32, 32);
    fill.addColorStop(0, "rgba(40,50,30,0.35)");
    fill.addColorStop(1, "rgba(40,50,30,0)");
    context.fillStyle = fill;
    context.fillRect(0, 0, 64, 64);
    shadowTexture = new THREE.CanvasTexture(canvas);
  }
  const mesh = new THREE.Mesh(geo("plane", () => new THREE.PlaneGeometry(1, 1)),
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(radius * 2, radius * 2, 1);
  mesh.position.y = 0.01;
  mesh.raycast = () => {};
  return mesh;
}
