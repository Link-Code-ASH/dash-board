// Shared toon look: stepped lighting, inverted-hull outlines, cached materials/geometries, sun shadows.
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
let outlineMaterial;
export const OUTLINE_PX = 1.8; // line width in CSS pixels, the same at every zoom level and object size
// Inverted hull drawn in screen space: back faces are pushed outwards on screen by a fixed number of pixels,
// along normals averaged across hard edges, so lines stay one width and never break open at box corners.
export function outline() {
  if (!outlineMaterial) outlineMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      width: { value: OUTLINE_PX },
      resolution: { value: new THREE.Vector2(1000, 1000) },
      color: { value: new THREE.Color(INK) },
    },
    vertexShader: `uniform float width;
      uniform vec2 resolution;
      attribute vec3 outlineNormal;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        view.z -= 0.08; // a hair behind, so faces of touching blocks hide the hull where they meet
        vec4 clip = projectionMatrix * view;
        vec3 n = normalMatrix * outlineNormal;
        vec2 dir = (projectionMatrix * vec4(n, 0.0)).xy * resolution;
        float len = length(dir);
        if (len > 1e-5) clip.xy += dir / len * width * 2.0 / resolution * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: "uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }",
  });
  return outlineMaterial;
}
// Set before each frame by whoever renders (the lot or a portrait), in device pixels.
export function setOutlineViewport(width, height, pixelRatio) {
  const material = outline();
  material.uniforms.resolution.value.set(width, height);
  material.uniforms.width.value = OUTLINE_PX * pixelRatio;
}
// Normals averaged over every vertex at the same spot, so a box's hull is closed at its corners.
function withOutlineNormals(geometry) {
  if (geometry.attributes.outlineNormal) return geometry;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const sums = new Map();
  const key = (i) => `${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`;
  for (let i = 0; i < position.count; i++) {
    const k = key(i);
    const sum = sums.get(k) || [0, 0, 0];
    sum[0] += normal.getX(i); sum[1] += normal.getY(i); sum[2] += normal.getZ(i);
    sums.set(k, sum);
  }
  const data = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const [x, y, z] = sums.get(key(i));
    const length = Math.hypot(x, y, z) || 1;
    data[i * 3] = x / length; data[i * 3 + 1] = y / length; data[i * 3 + 2] = z / length;
  }
  geometry.setAttribute("outlineNormal", new THREE.BufferAttribute(data, 3));
  return geometry;
}

const geometries = new Map();
export function geo(key, make) {
  if (!geometries.has(key)) geometries.set(key, make());
  return geometries.get(key);
}
export const sphere = () => geo("sphere", () => new THREE.SphereGeometry(1, 20, 14));
// A mesh with a toon fill and (optionally) a dark outline shell.
export function part(geometry, color, { line = true, basic = false, shadow = true } = {}) {
  const mesh = new THREE.Mesh(geometry, basic ? flat(color) : toon(color));
  mesh.castShadow = shadow && !basic;
  mesh.receiveShadow = !basic;
  if (line) {
    const shell = new THREE.Mesh(withOutlineNormals(geometry), outline());
    shell.raycast = () => {};
    mesh.add(shell);
  }
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
