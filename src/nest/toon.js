// Shared toon look: stepped lighting, cached materials/geometries, sun shadows (ink lines live in ink.js).
import * as THREE from "three";

export const INK = 0x3b302c;

let gradient;
export function toonGradient() {
  if (gradient) return gradient;
  // Three bands: shade, a soft mid tone and full light.
  // Only the red channel is read; the light colours themselves tint each band.
  const data = new Uint8Array([150, 150, 150, 255, 214, 214, 214, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}
let gentleGradient;
// A softer ramp for skin: shade stays light so faces never look bruised.
function softGradient() {
  if (gentleGradient) return gentleGradient;
  const data = new Uint8Array([196, 196, 196, 255, 236, 236, 236, 255, 255, 255, 255, 255]);
  gentleGradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gentleGradient.minFilter = gentleGradient.magFilter = THREE.NearestFilter;
  gentleGradient.generateMipmaps = false;
  gentleGradient.needsUpdate = true;
  return gentleGradient;
}
const materials = new Map();
export function toon(color, gentle = false) {
  const key = `${gentle ? "g" : "t"}${color}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshToonMaterial({ color, gradientMap: gentle ? softGradient() : toonGradient() }));
  return materials.get(key);
}
// Both faces drawn: for open shells such as hair, whose inside can show at the edges.
export function toonTwoSided(color) {
  const key = `d${color}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), side: THREE.DoubleSide }));
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
export function part(geometry, color, { line = true, basic = false, shadow = true, gentle = false } = {}) {
  const mesh = new THREE.Mesh(geometry, basic ? flat(color) : toon(color, gentle));
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

// Anime-style cel shading for characters: two flat tones with a hard edge, the shadow tone tinted (warm rose on
// skin, cool lavender on hair and clothes) instead of just darker. three's toon shader reads only the red channel
// of a gradient map; here it reads all three so the shadow can carry a colour.
const celGradients = new Map();
function celGradient(kind) {
  if (celGradients.has(kind)) return celGradients.get(kind);
  const shadow = kind === "skin" ? [228, 178, 188] : [168, 162, 214];
  const data = new Uint8Array([...shadow, 255, ...shadow, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  celGradients.set(kind, texture);
  return texture;
}
const tintedGradient = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace("#include <gradientmap_pars_fragment>",
    THREE.ShaderChunk.gradientmap_pars_fragment.replace("texture2D( gradientMap, coord ).r )", "texture2D( gradientMap, coord ).rgb )"));
};
export function celMaterial(color, { kind = "cloth", twoSided = false, map = null } = {}) {
  const material = new THREE.MeshToonMaterial({ color, map, gradientMap: celGradient(kind), side: twoSided ? THREE.DoubleSide : THREE.FrontSide });
  material.onBeforeCompile = tintedGradient;
  material.customProgramCacheKey = () => "cel";
  return material;
}
export function cel(color, kind = "cloth", twoSided = false) {
  const key = `c${kind}${twoSided ? 2 : 1}${color}`;
  if (!materials.has(key)) materials.set(key, celMaterial(color, { kind, twoSided }));
  return materials.get(key);
}
