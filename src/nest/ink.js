// Ink lines drawn after the scene, from what is actually on screen (not from each mesh's own shell), so lines
// stay one even width, never vanish where things overlap or touch, and close all the way around every object.
//
// 1. The scene is drawn into a multisampled colour buffer.
// 2. The scene is drawn again into an "ink buffer": view normal, view depth and a code naming the object and
//    the part (by material) under each pixel.
// 3. A full-screen pass inks every pixel within half a line width of a change of object, of part, of a fold
//    (normals turning) or of a depth step, then FXAA smooths the result onto the screen.
//
// Object codes: a node with userData.inkKey shares one code with every node using the same key (the ground,
// the walls); a node with userData.inkSplit gives each child its own code (the furniture group, the clouds);
// otherwise every direct child of the scene is one object. Parts made with { line: false } keep the object's
// code but never draw lines inside it (eyes, cheeks, trims), and transparent things are left out.
import * as THREE from "three";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { INK } from "./toon.js";

export const LINE_PX = 2; // full line width in CSS pixels, the same at every zoom level and object size

const idVertex = `
  #include <common>
  varying vec3 vNormal;
  varying float vDepth;
  void main() {
    #include <beginnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    #include <project_vertex>
    vNormal = normalize(transformedNormal);
    vDepth = -mvPosition.z;
  }`;
const idFragment = `
  uniform float code;
  varying vec3 vNormal;
  varying float vDepth;
  void main() {
    vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
    gl_FragColor = vec4(n.xy, vDepth, code);
  }`;

const edgeFragment = `
  uniform sampler2D tColor;
  uniform sampler2D tInk;
  uniform vec2 texel;
  uniform float radius;
  uniform float depthStep;
  uniform float perPixel;
  uniform vec3 ink;
  varying vec2 vUv;
  vec4 at(vec2 offset) { return texture2D(tInk, vUv + offset * texel); }
  float object(float code) { return floor(abs(code) / 64.0); }
  // How far q sits off the surface through p (or through q, seen from p), in view units. A slope or a curve
  // predicts its own depth change from its normal, so only real steps (one thing in front of another) count.
  float gap(vec4 p, vec4 q, vec3 np, vec3 nq, vec2 offset) {
    vec2 d = offset * perPixel;
    float change = q.z - p.z;
    float fromP = abs(change - dot(np.xy, d) / max(np.z, 0.25));
    float fromQ = abs(change - dot(nq.xy, d) / max(nq.z, 0.25));
    return min(fromP, fromQ);
  }
  // 1 when q differs from the centre p enough to need a line between them.
  float differs(vec4 p, vec4 q, vec2 offset) {
    if (p.w == 0.0 && q.w == 0.0) return 0.0;
    if (p.w == 0.0 || q.w == 0.0) return 1.0;                       // edge of the scene against the sky
    if (object(p.w) != object(q.w)) return 1.0;                     // one object in front of another
    if (p.w < 0.0 || q.w < 0.0) return 0.0;                         // painted-on details draw nothing inside
    vec3 np = vec3(p.xy, sqrt(max(0.0, 1.0 - dot(p.xy, p.xy))));
    vec3 nq = vec3(q.xy, sqrt(max(0.0, 1.0 - dot(q.xy, q.xy))));
    float folded = dot(np, nq);
    float jump = gap(p, q, np, nq, offset);
    if (jump > depthStep) return 1.0;                               // an arm in front of the body
    // Two parts of one object, unless they are flush (same surface, where they would only flicker).
    if (abs(p.w - q.w) > 0.5 && (jump > depthStep * 0.3 || folded < 0.95)) return 1.0;
    return 0.0;
  }
  vec3 normalOf(vec4 c) { return vec3(c.xy, sqrt(max(0.0, 1.0 - dot(c.xy, c.xy)))); }
  // A fold (the corner of a box) between the two samples on either side of the centre. Comparing across the
  // whole line width keeps rounded edges from breaking up into dashes.
  float fold(vec4 p, vec4 a, vec4 b) {
    if (p.w <= 0.0 || a.w <= 0.0 || b.w <= 0.0 || object(a.w) != object(p.w) || object(b.w) != object(p.w)) return 0.0;
    return dot(normalOf(a), normalOf(b)) < 0.5 ? 1.0 : 0.0;
  }
  void main() {
    vec4 color = texture2D(tColor, vUv);
    vec4 p = at(vec2(0.0));
    float line = 0.0;
    for (int i = 0; i < 4; i++) {
      float angle = float(i) * 0.7853982;
      vec2 d = vec2(cos(angle), sin(angle));
      for (int k = 0; k < 2; k++) {
        vec2 o = d * radius * (k == 0 ? 1.0 : 0.5);
        vec4 a = at(o);
        vec4 b = at(-o);
        line = max(line, max(differs(p, a, o), differs(p, b, -o)));
        line = max(line, fold(p, a, b));
      }
    }
    // A soft grade: a touch warmer and richer, with shadows lifted towards lavender so dark areas never go muddy.
    vec3 rgb = color.rgb;
    float alpha = color.a;
    float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    rgb = mix(vec3(luma), rgb, 1.08) * vec3(1.03, 1.0, 0.955);
    rgb += vec3(0.012, 0.006, 0.026) * (1.0 - smoothstep(0.0, 0.35, luma)) * alpha;
    rgb = max(rgb, 0.0);
    // Lines take on a deep shade of what they outline, which reads softer than flat black.
    vec3 lineColor = mix(ink, rgb / max(alpha, 0.001) * 0.36, 0.5 * alpha);
    rgb = mix(rgb, lineColor * max(alpha, line), line);
    alpha = max(alpha, line);
    gl_FragColor = vec4(rgb, alpha);
    #include <colorspace_fragment>
  }`;
const quadVertex = "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";

function quad(material) {
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return scene;
}
function setCode(renderer, scene, camera, geometry, material) {
  if (material.isInkCode) { material.uniforms.code.value = this.userData.inkCode || 0; material.uniformsNeedUpdate = true; }
}

export class InkPass {
  constructor(renderer, { fxaa = true } = {}) {
    this.renderer = renderer;
    const gl = renderer.getContext();
    // The ink buffer needs float colour targets (nearly every WebGL2 device); without them the scene is drawn plain.
    this.supported = renderer.capabilities.isWebGL2 !== false && renderer.extensions.has("EXT_color_buffer_float");
    this.precise = this.supported;
    // 8-bit sRGB targets keep dark tones smooth and can be multisampled everywhere.
    this.color = new THREE.WebGLRenderTarget(1, 1, { samples: Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0), colorSpace: THREE.SRGBColorSpace });
    this.ink = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.codeMaterial = new THREE.ShaderMaterial({ uniforms: { code: { value: 0 } }, vertexShader: idVertex, fragmentShader: idFragment, side: THREE.DoubleSide });
    this.codeMaterial.isInkCode = true;
    this.edgeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.color.texture }, tInk: { value: this.ink.texture },
        texel: { value: new THREE.Vector2() }, radius: { value: 1 }, depthStep: { value: 0.1 }, perPixel: { value: 0.02 },
        ink: { value: new THREE.Color(INK) },
      },
      vertexShader: quadVertex, fragmentShader: edgeFragment, depthTest: false, depthWrite: false,
    });
    this.edgeScene = quad(this.edgeMaterial);
    this.fxaa = fxaa;
    if (fxaa) {
      this.mixed = new THREE.WebGLRenderTarget(1, 1, { colorSpace: THREE.SRGBColorSpace });
      // The mix is stored as sRGB but read back linear; FXAA converts to the screen's colour space at the end.
      const fragmentShader = FXAAShader.fragmentShader.replace("gl_FragColor = ApplyFXAA( tDiffuse, resolution.xy, vUv );",
        "gl_FragColor = ApplyFXAA( tDiffuse, resolution.xy, vUv );\n#include <colorspace_fragment>");
      this.fxaaMaterial = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms), vertexShader: quadVertex, fragmentShader, depthTest: false, depthWrite: false });
      this.fxaaMaterial.uniforms.tDiffuse.value = this.mixed.texture;
      this.fxaaScene = quad(this.fxaaMaterial);
    }
    this.quadCamera = new THREE.Camera();
    this.keys = new Map();
    this.hidden = [];
  }
  // scale: 1 for full width; a little less when zoomed far out, where small things would drown in ink.
  setLineScale(scale) {
    this.edgeMaterial.uniforms.radius.value = Math.max(1, (LINE_PX * this.pixelRatio * scale) / 2);
  }
  setSize(width, height, pixelRatio) {
    for (const target of [this.color, this.ink, this.mixed].filter(Boolean)) target.setSize(width, height);
    this.edgeMaterial.uniforms.texel.value.set(1 / width, 1 / height);
    this.edgeMaterial.uniforms.radius.value = Math.max(1, (LINE_PX * pixelRatio) / 2);
    if (this.fxaa) this.fxaaMaterial.uniforms.resolution.value.set(1 / width, 1 / height);
    this.pixelRatio = pixelRatio;
    this.height = height;
  }
  // Codes every visible mesh and hides what must stay out of the ink buffer. Returns the hidden nodes.
  prepare(scene) {
    let next = 1;
    const precise = this.precise;
    const objectCode = (key) => {
      if (key !== undefined) { if (!this.keys.has(key)) this.keys.set(key, this.keys.size + 1); return 1000 + this.keys.get(key); }
      return next++;
    };
    const visit = (node, object) => {
      if (!node.visible) return;
      if (node.userData.inkKey !== undefined) object = objectCode(node.userData.inkKey);
      if (node.isMesh) {
        if ((node.material.transparent && !node.userData.inkSolid) || node.userData.ink === "skip") { node.visible = false; this.hidden.push(node); return; }
        const part = 1 + (node.material.id % 63);
        const base = precise ? object : object % 32;
        node.userData.inkCode = (base * 64 + part) * (node.userData.ink === false ? -1 : 1);
        if (node.onBeforeRender !== setCode) node.onBeforeRender = setCode;
      } else if (node.isSprite || node.isLine || node.isPoints) { node.visible = false; this.hidden.push(node); return; }
      const split = node.userData.inkSplit;
      for (const child of node.children) visit(child, split ? objectCode(child.userData.inkKey) : object);
    };
    for (const child of scene.children) visit(child, objectCode(child.userData.inkKey));
  }
  // perPixel: view units per buffer pixel; depthStep: how far apart two surfaces must be to count as a step.
  render(scene, camera, { perPixel = 0.02, depthStep = perPixel * 4 } = {}) {
    const renderer = this.renderer;
    if (!this.supported) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
    const autoUpdate = renderer.shadowMap.autoUpdate;
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.color);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    // Second pass: the shadow map is already up to date.
    renderer.shadowMap.autoUpdate = false;
    const needsUpdate = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.needsUpdate = false;
    this.prepare(scene);
    const override = scene.overrideMaterial;
    const background = scene.background;
    scene.overrideMaterial = this.codeMaterial;
    scene.background = null;
    renderer.setRenderTarget(this.ink);
    renderer.clear();
    renderer.render(scene, camera);
    scene.overrideMaterial = override;
    scene.background = background;
    for (const node of this.hidden) node.visible = true;
    this.hidden.length = 0;
    renderer.shadowMap.autoUpdate = autoUpdate;
    renderer.shadowMap.needsUpdate = needsUpdate;
    this.edgeMaterial.uniforms.depthStep.value = depthStep;
    this.edgeMaterial.uniforms.perPixel.value = perPixel;
    renderer.setRenderTarget(this.fxaa ? this.mixed : null);
    renderer.clear();
    renderer.render(this.edgeScene, this.quadCamera);
    if (this.fxaa) {
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(this.fxaaScene, this.quadCamera);
    }
    renderer.setClearColor(clearColor, clearAlpha);
  }
  dispose() {
    for (const target of [this.color, this.ink, this.mixed].filter(Boolean)) target.dispose();
    this.codeMaterial.dispose();
    this.edgeMaterial.dispose();
    this.fxaaMaterial?.dispose();
  }
}
