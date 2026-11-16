// Nest 3D lot: an orthographic toon view of the tile lot, its yard, walls, furniture and the hero.
// Kept light: instanced tiles and grass, capped pixel ratio, 30 fps while something moves (12 fps when calm),
// one sun shadow map that is only redrawn when something moved, and the loop stops while hidden.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FLOORS, LAND_MAX, edgesBetween, findPath, footprint, hashString, objectTiles, seededRandom, tileKey, walkable } from "./model.js";
import { flat, outline, part, setOutlineViewport, toon } from "./toon.js";
import { buildObject, buildPost, buildWall } from "./objects.js";
import { buildCreature } from "./creature.js";

const WALL_HIGH = 2;
const WALL_LOW = 0.35;
const SPEED = { calm: 1.1, lively: 2, shy: 1.2, foodie: 1.3, curious: 1.7 };
const REST = { calm: [4, 9], lively: [1, 3], shy: [3, 7], foodie: [2, 6], curious: [1.5, 4] };
const floorColor = Object.fromEntries(FLOORS.map((floor) => [floor.id, new THREE.Color(floor.color)]));
const GRASS_TINTS = ["#a8dc88", "#9bd57d", "#b4e396", "#8fcf72"].map((hex) => new THREE.Color(hex));
const FLOWER_TINTS = ["#ffffff", "#ffd34d", "#ff9fc0", "#c6b2f0"].map((hex) => new THREE.Color(hex));
// Small per-tile colour drift so big lawns and floors do not look like flat paint.
const tileNoise = (x, z) => (hashString(`${x}:${z}`) % 1000) / 1000;
const mobile = () => Math.min(window.innerWidth, window.innerHeight) < 600;

const center = (object) => {
  const [w, d] = footprint(object.type, object.rot);
  return { x: object.x + w / 2, z: object.z + d / 2 };
};

export class World {
  constructor(container, handlers = {}) {
    this.container = container;
    this.handlers = handlers;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 200);
    this.view = { turn: 0, angle: Math.PI / 4, zoom: 1, target: new THREE.Vector3(8, 0, 8) };
    // Soft sky light plus a warm sun that casts the only shadow map.
    this.scene.add(new THREE.HemisphereLight(0xe8f4ff, 0xd8c8a8, 1.35));
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.1);
    this.sun.castShadow = true;
    const mapSize = mobile() ? 1024 : 2048;
    this.sun.shadow.mapSize.set(mapSize, mapSize);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.intensity = 0.55;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);

    // Ground: a floating chunk (grass lip, soil, stone), instanced floor tiles, grass and flowers, grid for editing.
    this.island = new THREE.Group();
    const layer = (color, height) => { const mesh = part(new THREE.BoxGeometry(1, 1, 1), color, { shadow: false }); mesh.raycast = () => {}; mesh.userData.height = height; this.island.add(mesh); return mesh; };
    this.lip = layer(0x7fc469, 0.2);
    this.soil = layer(0xc79b72, 0.8);
    this.stone = layer(0xa8927c, 0.6);
    this.scene.add(this.island);
    const tileMaterial = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toon(0xffffff).gradientMap });
    this.tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 1), tileMaterial, LAND_MAX * LAND_MAX);
    this.tiles.raycast = () => {};
    // Colours must exist before the first draw, or the shader is built without them.
    this.tiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(LAND_MAX * LAND_MAX * 3).fill(1), 3);
    this.tiles.count = 0;
    this.tiles.frustumCulled = false; // its bounds change as the lot grows
    this.tiles.receiveShadow = true;
    this.scene.add(this.tiles);
    const blade = (angle, lean) => { const g = new THREE.ConeGeometry(0.05, 0.3, 3); g.translate(0, 0.15, 0); g.rotateZ(lean); g.rotateY(angle); return g; };
    const tuft = mergeGeometries([blade(0, 0.15), blade(2.1, -0.25), blade(4.2, 0.3), blade(1, 0)].map((g) => g.toNonIndexed()));
    this.grass = new THREE.InstancedMesh(tuft, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toon(0xffffff).gradientMap }), LAND_MAX * LAND_MAX);
    this.grass.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(LAND_MAX * LAND_MAX * 3).fill(1), 3);
    this.flowers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toon(0xffffff).gradientMap }), LAND_MAX * LAND_MAX);
    this.flowers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(LAND_MAX * LAND_MAX * 3).fill(1), 3);
    for (const mesh of [this.grass, this.flowers]) { mesh.count = 0; mesh.frustumCulled = false; mesh.raycast = () => {}; this.scene.add(mesh); }
    this.clouds = this.buildClouds();
    this.scene.add(this.clouds);
    this.grid = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x3b302c, transparent: true, opacity: 0.12 }));
    this.grid.visible = false;
    this.scene.add(this.grid);

    this.wallGroup = new THREE.Group();
    this.scene.add(this.wallGroup);
    this.objects = new Map();
    this.objectGroup = new THREE.Group();
    this.scene.add(this.objectGroup);
    this.hero = null;

    // Edit markers
    this.marker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x4e9a52, transparent: true, opacity: 0.35, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.marker.raycast = () => {};
    this.scene.add(this.marker);
    this.wallPreview = new THREE.Group();
    this.scene.add(this.wallPreview);
    this.selection = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
    this.selection.rotation.x = -Math.PI / 2;
    this.selection.visible = false;
    this.selection.raycast = () => {};
    this.scene.add(this.selection);

    this.size = 0;
    this.land = null;
    this.items = [];
    this.tool = { mode: "look" };
    this.wallsLow = false;
    this.selectedId = null;
    this.ghost = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.clock = new THREE.Clock();
    this.last = 0;
    this.calmSince = 0;
    this.running = false;
    this.visible = true;
    this.reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    this.bindEvents();
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.io = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; this.update(); });
    this.io.observe(container);
    this.onVisibility = () => this.update();
    document.addEventListener("visibilitychange", this.onVisibility);
    this.update();
    if (import.meta.env?.DEV) window.__nestWorld = this;
    if (import.meta.env?.DEV) window.__nestScreen = (x, z) => {
      const v = new THREE.Vector3(x, 0, z).project(this.camera);
      const rect = this.renderer.domElement.getBoundingClientRect();
      return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
    };
  }

  // ---------- loop ----------
  update() {
    const should = this.visible && document.visibilityState === "visible";
    if (should && !this.running) { this.running = true; this.clock.getDelta(); this.frame = requestAnimationFrame((t) => this.tick(t)); }
    if (!should && this.running) { this.running = false; cancelAnimationFrame(this.frame); }
  }
  wake() { this.calmSince = performance.now(); }
  tick(time) {
    if (!this.running) return;
    this.frame = requestAnimationFrame((t) => this.tick(t));
    const calm = this.heroState?.mode === "rest" && time - this.calmSince > 3000;
    if (time - this.last < 1000 / (calm ? 12 : 30) - 2) return;
    this.last = time;
    const dt = Math.min(0.1, this.clock.getDelta());
    if (!this.reduced) this.step(dt, this.clock.elapsedTime);
    this.render();
  }
  render() {
    // Shadows are redrawn only when something that casts one has moved.
    if (this.shadowDirty) { this.renderer.shadowMap.needsUpdate = true; this.shadowDirty = false; }
    const size = this.renderer.getDrawingBufferSize(this.bufferSize ||= new THREE.Vector2());
    setOutlineViewport(size.x, size.y, this.renderer.getPixelRatio());
    this.renderer.render(this.scene, this.camera);
  }

  // ---------- camera ----------
  resize() {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.aspect = width / height;
    this.placeCamera();
  }
  placeCamera() {
    const { angle, zoom, target } = this.view;
    // At zoom 1 the whole lot (a diamond seen from the corner) fits the view, on wide and narrow screens alike.
    const size = this.size || 32;
    const aspect = this.aspect || 1;
    const across = size * Math.SQRT2 + 1;
    const halfH = Math.max(across * 0.72, across / aspect) / 2 / zoom;
    this.camera.left = -halfH * aspect; this.camera.right = halfH * aspect;
    this.camera.top = halfH; this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
    const distance = 60;
    this.camera.position.set(target.x + Math.sin(angle) * distance * 0.72, distance * 0.7, target.z + Math.cos(angle) * distance * 0.72);
    this.camera.lookAt(target);
    // The sun's shadow box follows what is on screen, so one map stays sharp on any lot size.
    const reach = Math.min(48, Math.max(this.camera.right, this.camera.top) * 1.35 + 2);
    this.sun.position.set(target.x - 14, 26, target.z + 9);
    this.sun.target.position.copy(target);
    Object.assign(this.sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 80 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.shadowDirty = true;
    this.wake();
    this.render();
  }
  rotateView(direction) {
    this.view.turn = (this.view.turn + direction + 4) % 4;
    const goal = Math.PI / 4 + this.view.turn * (Math.PI / 2);
    let diff = goal - this.view.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.view.angleGoal = this.view.angle + diff;
    if (this.reduced) { this.view.angle = this.view.angleGoal; this.placeCamera(); }
    this.wake();
  }
  // Zoom 1 shows the whole lot; zooming in stops at about 6 tiles across.
  clampZoom(value) { return Math.min(Math.max(3, (this.size || 32) / 6), Math.max(0.9, value)); }
  zoomBy(factor) {
    this.view.zoom = this.clampZoom(this.view.zoom * factor);
    this.placeCamera();
  }
  recenter() {
    // Start close enough to see the hero well (about 24 tiles across), centred on the hero.
    const hero = this.hero?.position;
    this.view.target.set(hero ? hero.x : this.size / 2, 0, hero ? hero.z : this.size / 2);
    this.view.zoom = this.clampZoom(this.size / 24);
    this.placeCamera();
  }

  // ---------- data ----------
  setData({ land, objects, hero }) {
    if (!land) return;
    const grew = land.size !== this.size;
    const first = !this.size;
    this.land = land;
    this.items = [...objects, ...(hero ? [hero] : [])];
    if (grew) {
      this.size = land.size;
      let top = -0.02;
      for (const [mesh, inset] of [[this.lip, -0.06], [this.soil, 0], [this.stone, 0.9]]) {
        const height = mesh.userData.height;
        mesh.scale.set(this.size - inset * 2, height, this.size - inset * 2);
        mesh.position.set(this.size / 2, top - height / 2, this.size / 2);
        top -= height;
      }
      this.clouds.userData.size = this.size;
      this.placeClouds(this.clock.elapsedTime);
      this.buildGrid();
      if (!first) this.placeCamera();
    }
    this.paintTiles();
    this.buildWalls();
    this.syncObjects(objects);
    this.scatterGrass();
    this.syncHero(hero);
    if (first) this.recenter();
    this.grid.visible = this.tool.mode !== "look";
    this.select(this.selectedId);
    this.wake();
    this.render();
  }
  paintTiles() {
    const matrix = new THREE.Matrix4();
    let index = 0;
    for (let x = 0; x < this.size; x++) for (let z = 0; z < this.size; z++) {
      matrix.makeTranslation(x + 0.5, -0.05, z + 0.5);
      this.tiles.setMatrixAt(index, matrix);
      const floor = this.land.floors[tileKey(x, z)] || "grass";
      const noise = tileNoise(x, z);
      const color = (floorColor[floor] || floorColor.grass).clone();
      // Grass drifts a little in light; wood shifts per plank row; checker kept very faint so tiles still read.
      const drift = floor === "grass" ? (noise - 0.5) * 0.05 + ((x + z) % 2 ? 0.012 : 0) : floor === "wood" ? ((z % 2) ? 0.02 : -0.01) + (noise - 0.5) * 0.02 : (noise - 0.5) * 0.025;
      color.offsetHSL(0, 0, drift);
      this.tiles.setColorAt(index, color);
      index++;
    }
    this.tiles.count = index;
    this.tiles.instanceMatrix.needsUpdate = true;
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
  }
  // Grass tufts and tiny flowers on free grass tiles (decoration only, never saved).
  scatterGrass() {
    const taken = new Set();
    for (const item of this.items) if (item.kind === "decor") for (const [x, z] of objectTiles(item)) taken.add(tileKey(x, z));
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    let tufts = 0; let flowers = 0;
    for (let x = 0; x < this.size; x++) for (let z = 0; z < this.size; z++) {
      const key = tileKey(x, z);
      if (this.land.floors[key] || taken.has(key)) continue;
      const r = seededRandom(`grass:${key}`);
      if (r() < 0.42) {
        position.set(x + 0.15 + r() * 0.7, 0, z + 0.15 + r() * 0.7);
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
        const s = 0.7 + r() * 0.6;
        scale.set(s, s * (0.8 + r() * 0.5), s);
        this.grass.setMatrixAt(tufts, matrix.compose(position, quaternion, scale));
        this.grass.setColorAt(tufts, GRASS_TINTS[Math.floor(r() * GRASS_TINTS.length)]);
        tufts++;
      }
      if (r() < 0.05) {
        position.set(x + 0.2 + r() * 0.6, 0.05, z + 0.2 + r() * 0.6);
        quaternion.identity();
        scale.set(1, 0.7, 1);
        this.flowers.setMatrixAt(flowers, matrix.compose(position, quaternion, scale));
        this.flowers.setColorAt(flowers, FLOWER_TINTS[Math.floor(r() * FLOWER_TINTS.length)]);
        flowers++;
      }
    }
    this.grass.count = tufts; this.flowers.count = flowers;
    for (const mesh of [this.grass, this.flowers]) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
  }
  buildClouds() {
    const group = new THREE.Group();
    const r = seededRandom("clouds");
    for (let i = 0; i < 9; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const puff = part(new THREE.IcosahedronGeometry(1, 1), 0xffffff, { shadow: false });
        puff.receiveShadow = false;
        const size = 0.9 + r() * 0.9;
        puff.position.set(j * 1.1 - 1.6 + r() * 0.4, r() * 0.4, (r() - 0.5) * 0.8);
        puff.scale.set(size, size * 0.6, size);
        cloud.add(puff);
      }
      cloud.userData = { u: r(), v: r(), y: -2.2 - r() * 2.5, speed: 0.15 + r() * 0.2 };
      group.add(cloud);
    }
    group.userData.size = 32;
    return group;
  }
  // Clouds drift around and below the lot, wrapping around its edges.
  placeClouds(t = 0) {
    const size = this.clouds.userData.size || 32;
    const span = size + 24;
    for (const cloud of this.clouds.children) {
      const { u, v, y, speed } = cloud.userData;
      const along = ((u * span + t * speed) % span) - 12;
      const side = v < 0.5 ? -6 - v * 10 : size + 6 + (v - 0.5) * 10;
      if (v < 0.25 || v > 0.75) cloud.position.set(along, y, side);
      else cloud.position.set(side, y, along);
    }
  }
  buildGrid() {
    const points = [];
    for (let i = 0; i <= this.size; i++) {
      points.push(i, 0.005, 0, i, 0.005, this.size, 0, 0.005, i, this.size, 0.005, i);
    }
    this.grid.geometry.dispose();
    this.grid.geometry = new THREE.BufferGeometry();
    this.grid.geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  }
  buildWalls() {
    const key = `${JSON.stringify(this.land.walls)}|${this.wallsLow}`;
    if (key === this.wallKey) return;
    this.wallKey = key;
    this.wallGroup.clear();
    const height = this.wallsLow ? WALL_LOW : WALL_HIGH;
    for (const [edge, type] of Object.entries(this.land.walls)) {
      const [axis, rest] = edge.split(":");
      const [x, z] = rest.split(",").map(Number);
      const wall = buildWall(type, height);
      if (axis === "h") wall.position.set(x + 0.5, 0, z);
      else { wall.position.set(x, 0, z + 0.5); wall.rotation.y = Math.PI / 2; }
      wall.userData = { kind: "wall", key: edge };
      this.wallGroup.add(wall);
    }
    // Posts at every grid point a wall ends or turns.
    const ends = new Map();
    for (const edge of Object.keys(this.land.walls)) {
      const [axis, rest] = edge.split(":");
      const [x, z] = rest.split(",").map(Number);
      for (const point of axis === "h" ? [[x, z], [x + 1, z]] : [[x, z], [x, z + 1]]) {
        const key = point.join(",");
        const entry = ends.get(key) || { point, axes: new Set(), count: 0 };
        entry.axes.add(axis); entry.count++;
        ends.set(key, entry);
      }
    }
    for (const { point, axes, count } of ends.values()) {
      if (count === 2 && axes.size === 1) continue; // straight run, no seam to hide
      const post = buildPost(height);
      post.position.set(point[0], 0, point[1]);
      this.wallGroup.add(post);
    }
    this.wallGroup.traverse((child) => { if (child.isMesh && child.material.isMeshToonMaterial) { child.castShadow = true; child.receiveShadow = true; } });
    this.shadowDirty = true;
  }
  setWallsLow(low) {
    this.wallsLow = low;
    if (this.land) this.buildWalls();
    this.render();
  }
  syncObjects(list) {
    const seen = new Set();
    for (const item of list) {
      seen.add(item.id);
      const current = this.objects.get(item.id);
      const signature = `${item.type}|${item.x}|${item.z}|${item.rot}`;
      if (current?.signature === signature) continue;
      if (current && current.type === item.type) {
        const { x, z } = center(item);
        current.object.position.set(x, 0, z);
        current.object.rotation.y = -item.rot * Math.PI / 2;
        current.signature = signature;
        continue;
      }
      if (current) this.objectGroup.remove(current.object);
      const object = buildObject(item.type, item.id);
      const { x, z } = center(item);
      object.position.set(x, 0, z);
      object.rotation.y = -item.rot * Math.PI / 2;
      object.userData = { kind: "object", id: item.id };
      this.objectGroup.add(object);
      this.objects.set(item.id, { object, signature, type: item.type });
    }
    for (const [id, entry] of this.objects) if (!seen.has(id)) { this.objectGroup.remove(entry.object); this.objects.delete(id); }
    this.walk = walkable(this.items, this.land);
    this.shadowDirty = true;
  }
  syncHero(hero) {
    if (!hero) { if (this.hero) this.scene.remove(this.hero); this.hero = null; return; }
    const signature = `${JSON.stringify(hero.genes)}|${hero.accessory}`;
    if (this.heroSignature !== signature) {
      const old = this.hero;
      this.hero = buildCreature(hero);
      this.hero.userData = { kind: "hero", id: hero.id };
      this.hero.scale.multiplyScalar(0.92);
      // The hero keeps its soft contact spot instead of a sun shadow, so walking never redraws the shadow map.
      this.hero.traverse((child) => { if (child.isMesh) child.castShadow = false; });
      if (old) { this.hero.position.copy(old.position); this.hero.rotation.y = old.rotation.y; this.scene.remove(old); }
      this.scene.add(this.hero);
      this.heroSignature = signature;
      this.heroMood = hero.genes.mood;
    }
    if (!this.heroState) {
      const start = this.nearestFree(Math.floor(this.size / 2), Math.floor(this.size / 2));
      this.heroState = { mode: "rest", wait: 1, tile: start, path: [], phase: 0 };
      this.hero.position.set(start.x + 0.5, 0, start.z + 0.5);
    }
    // Edits may have put something on the hero's tile: hop to the nearest free one.
    const { tile } = this.heroState;
    if (!this.walk.free(tile.x, tile.z)) {
      const spot = this.nearestFree(tile.x, tile.z);
      this.heroState = { mode: "rest", wait: 1, tile: spot, path: [], phase: 0 };
      this.hero.position.set(spot.x + 0.5, 0, spot.z + 0.5);
    }
    this.heroState.path = [];
    if (this.heroState.mode === "walk") this.heroState.mode = "rest";
  }
  nearestFree(x, z) {
    for (let r = 0; r < this.size; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (this.walk.free(x + dx, z + dz)) return { x: x + dx, z: z + dz };
    }
    return { x: Math.max(0, Math.min(this.size - 1, x)), z: Math.max(0, Math.min(this.size - 1, z)) };
  }

  // ---------- selection & tools ----------
  select(id) {
    this.selectedId = id;
    const entry = this.objects.get(id);
    const item = this.items.find((value) => value.id === id && value.kind === "decor");
    this.selection.visible = !!(entry && item);
    if (entry && item) {
      const [w, d] = footprint(item.type, item.rot);
      const { x, z } = center(item);
      this.selection.scale.set(w, d, 1);
      this.selection.position.set(x, 0.015, z);
    }
    this.render();
  }
  setTool(tool) {
    this.tool = tool;
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
    if (tool.mode === "place") {
      this.ghost = buildObject(tool.type);
      this.ghost.traverse((child) => {
        if (child.material && child.material !== outline()) {
          child.material = child.material.clone();
          child.material.transparent = true;
          child.material.opacity = 0.6;
        }
      });
      this.ghost.visible = false;
      this.scene.add(this.ghost);
    }
    this.marker.visible = false;
    this.wallPreview.clear();
    this.grid.visible = tool.mode !== "look";
    this.container.dataset.tool = tool.mode;
    this.render();
  }

  // ---------- pointer ----------
  setPointer(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }
  groundAt(event) {
    this.setPointer(event);
    const point = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, point) ? point : null;
  }
  tileAt(event) {
    const point = this.groundAt(event);
    if (!point) return null;
    const x = Math.floor(point.x); const z = Math.floor(point.z);
    return x >= 0 && z >= 0 && x < this.size && z < this.size ? { x, z, point } : null;
  }
  pick(event) {
    this.setPointer(event);
    const targets = [...this.objectGroup.children, ...(this.hero ? [this.hero] : [])];
    let node = this.raycaster.intersectObjects(targets, true)[0]?.object;
    while (node && !node.userData?.kind) node = node.parent;
    return node?.userData || null;
  }
  // Top-left tile of a footprint centred under the pointer.
  anchor(tile, type, rot) {
    const [w, d] = footprint(type, rot);
    return { x: tile.x - Math.floor((w - 1) / 2), z: tile.z - Math.floor((d - 1) / 2), w, d };
  }
  showMarker(x, z, w, d, ok) {
    this.marker.visible = true;
    this.marker.scale.set(w, d, 1);
    this.marker.position.set(x + w / 2, 0.02, z + d / 2);
    this.marker.material.color.set(ok ? 0x4e9a52 : 0xe5484d);
  }
  gridPoint(point) {
    return { x: Math.max(0, Math.min(this.size, Math.round(point.x))), z: Math.max(0, Math.min(this.size, Math.round(point.z))) };
  }
  nearestEdge(point) {
    const fx = point.x - Math.floor(point.x); const fz = point.z - Math.floor(point.z);
    const toV = Math.min(fx, 1 - fx); const toH = Math.min(fz, 1 - fz);
    if (toH <= toV) return `h:${Math.floor(point.x)},${Math.round(point.z)}`;
    return `v:${Math.round(point.x)},${Math.floor(point.z)}`;
  }
  previewWalls(edges, type) {
    this.wallPreview.clear();
    for (const edge of edges) {
      const [axis, rest] = edge.split(":");
      const [x, z] = rest.split(",").map(Number);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, type === "erase" ? 0.1 : 0.5, 0.16), flat(type === "erase" ? 0xe5484d : 0x4e9a52));
      if (axis === "h") mesh.position.set(x + 0.5, 0.25, z);
      else { mesh.position.set(x, 0.25, z + 0.5); mesh.rotation.y = Math.PI / 2; }
      this.wallPreview.add(mesh);
    }
    this.render();
  }

  bindEvents() {
    const canvas = this.renderer.domElement;
    const pointers = new Map();
    let gesture = null;
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    canvas.addEventListener("pointerdown", (event) => {
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.wake();
      if (pointers.size === 2) { // two fingers: zoom (and cancel any tool stroke)
        const [a, b] = [...pointers.values()];
        gesture = { kind: "pinch", distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.view.zoom };
        this.wallPreview.clear();
        return;
      }
      const mode = this.tool.mode;
      const panButton = event.button === 1 || event.button === 2;
      const ground = this.groundAt(event);
      const base = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false, ground, target: this.view.target.clone() };
      if (panButton || !ground) { gesture = { ...base, kind: "pan" }; return; }
      if (mode === "floor") {
        const tile = this.tileAt(event);
        gesture = { ...base, kind: "paint", tiles: new Set(tile ? [tileKey(tile.x, tile.z)] : []) };
        if (tile) this.showMarker(tile.x, tile.z, 1, 1, true);
        return;
      }
      if (mode === "wall") {
        gesture = { ...base, kind: "wall", from: this.gridPoint(ground) };
        return;
      }
      if (mode === "move" || mode === "erase" || mode === "look") {
        const hit = this.pick(event);
        if (mode === "move" && hit?.kind === "object") { gesture = { ...base, kind: "drag", hit }; return; }
        gesture = { ...base, kind: "click", hit };
        return;
      }
      gesture = { ...base, kind: "click", hit: null };
    });
    canvas.addEventListener("pointermove", (event) => {
      if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (gesture?.kind === "pinch" && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        this.view.zoom = this.clampZoom(gesture.zoom * Math.hypot(a.x - b.x, a.y - b.y) / gesture.distance);
        this.placeCamera();
        return;
      }
      // Hover feedback (also when no button is down)
      const tile = this.tileAt(event);
      if (!gesture || gesture.id !== event.pointerId) {
        if (this.tool.mode === "place" && this.ghost) {
          if (tile) {
            const { x, z, w, d } = this.anchor(tile, this.tool.type, this.tool.rot || 0);
            this.ghost.visible = true;
            this.ghost.position.set(x + w / 2, 0, z + d / 2);
            this.ghost.rotation.y = -(this.tool.rot || 0) * Math.PI / 2;
            this.showMarker(x, z, w, d, this.handlers.canPlace?.(this.tool.type, x, z, this.tool.rot || 0) ?? true);
          } else { this.ghost.visible = false; this.marker.visible = false; }
          this.render();
        } else if (this.tool.mode === "floor" || this.tool.mode === "erase") {
          if (tile) this.showMarker(tile.x, tile.z, 1, 1, this.tool.mode === "floor"); else this.marker.visible = false;
          this.render();
        }
        return;
      }
      const dx = event.clientX - gesture.x; const dy = event.clientY - gesture.y;
      if (!gesture.moved && Math.hypot(dx, dy) < 6) return;
      gesture.moved = true;
      if (gesture.kind === "paint") {
        if (tile) { gesture.tiles.add(tileKey(tile.x, tile.z)); this.showMarker(tile.x, tile.z, 1, 1, true); this.previewTiles(gesture.tiles); }
        return;
      }
      if (gesture.kind === "wall") {
        const point = this.groundAt(event);
        if (point) { gesture.to = this.gridPoint(point); this.previewWalls(edgesBetween(gesture.from, gesture.to), this.tool.wall); }
        return;
      }
      if (gesture.kind === "drag") {
        const entry = this.objects.get(gesture.hit.id);
        const item = this.items.find((value) => value.id === gesture.hit.id);
        if (tile && entry && item) {
          const { x, z, w, d } = this.anchor(tile, item.type, item.rot);
          gesture.spot = { x, z };
          entry.object.position.set(x + w / 2, 0, z + d / 2);
          const ok = this.handlers.canPlace?.(item.type, x, z, item.rot, item.id) ?? true;
          gesture.ok = ok;
          this.showMarker(x, z, w, d, ok);
          this.selection.visible = false;
          this.render();
        }
        return;
      }
      // Pan: keep the ground point under the finger.
      gesture.kind = "pan";
      this.view.target.copy(gesture.target);
      this.placeCamera();
      const now = this.groundAt(event);
      if (now && gesture.ground) {
        const shift = gesture.ground.clone().sub(now);
        this.view.target.add(shift);
        const limit = this.size;
        this.view.target.x = Math.max(0, Math.min(limit, this.view.target.x));
        this.view.target.z = Math.max(0, Math.min(limit, this.view.target.z));
        this.placeCamera();
      }
    });
    const finish = (event) => {
      pointers.delete(event.pointerId);
      if (gesture?.kind === "pinch") { if (!pointers.size) gesture = null; return; }
      if (!gesture || gesture.id !== event.pointerId) return;
      const done = gesture;
      gesture = null;
      if (event.type === "pointercancel") { this.wallPreview.clear(); this.paintTiles(); this.syncBack(); return; }
      if (done.kind === "paint") {
        this.marker.visible = false;
        this.paintTiles(); // drop the preview; saved floors come back through setData
        if (done.tiles.size) this.handlers.onPaint?.([...done.tiles]);
        return;
      }
      if (done.kind === "wall") {
        this.wallPreview.clear();
        const to = done.to || done.from;
        let edges = edgesBetween(done.from, to);
        if (!edges.length) { const point = this.groundAt(event); if (point) edges = [this.nearestEdge(point)]; }
        if (edges.length) this.handlers.onWalls?.(edges);
        this.render();
        return;
      }
      if (done.kind === "drag") {
        this.marker.visible = false;
        if (done.moved && done.spot && done.ok) this.handlers.onMove?.(done.hit.id, done.spot.x, done.spot.z);
        else this.syncBack();
        if (!done.moved) this.handlers.onSelect?.(done.hit);
        return;
      }
      if (done.kind === "pan" || done.moved) return;
      // A tap
      const mode = this.tool.mode;
      if (mode === "place") {
        const tile = this.tileAt(event);
        if (tile) {
          const { x, z } = this.anchor(tile, this.tool.type, this.tool.rot || 0);
          this.handlers.onPlace?.(x, z);
        }
        return;
      }
      if (mode === "erase") {
        if (done.hit?.kind === "object") { this.handlers.onErase?.({ kind: "object", id: done.hit.id }); return; }
        const point = this.groundAt(event);
        if (!point) return;
        const edge = this.nearestEdge(point);
        const fx = point.x - Math.floor(point.x); const fz = point.z - Math.floor(point.z);
        const nearLine = Math.min(fx, 1 - fx, fz, 1 - fz) < 0.22;
        if (nearLine && this.land.walls[edge]) { this.handlers.onErase?.({ kind: "wall", key: edge }); return; }
        const tile = this.tileAt(event);
        if (tile) this.handlers.onErase?.({ kind: "floor", key: tileKey(tile.x, tile.z) });
        return;
      }
      this.handlers.onSelect?.(done.hit);
    };
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", finish);
    canvas.addEventListener("pointerleave", () => {
      if (this.ghost) this.ghost.visible = false;
      if (!gesture) this.marker.visible = false;
      this.render();
    });
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.zoomBy(event.deltaY > 0 ? 1 / 1.12 : 1.12);
    }, { passive: false });
  }
  previewTiles(keys) {
    const color = floorColor[this.tool.floor] || floorColor.grass;
    let index = 0;
    for (let x = 0; x < this.size; x++) for (let z = 0; z < this.size; z++) {
      if (keys.has(tileKey(x, z))) this.tiles.setColorAt(index, color);
      index++;
    }
    this.tiles.instanceColor.needsUpdate = true;
    this.render();
  }
  // Puts a dragged object back where the data says it is.
  syncBack() {
    for (const item of this.items) {
      const entry = this.objects.get(item.id);
      if (!entry) continue;
      const { x, z } = center(item);
      entry.object.position.set(x, 0, z);
    }
    this.select(this.selectedId);
  }

  // ---------- hero ----------
  step(dt, t) {
    if (this.view.angleGoal !== undefined) {
      const diff = this.view.angleGoal - this.view.angle;
      if (Math.abs(diff) < 0.002) { this.view.angle = this.view.angleGoal; this.view.angleGoal = undefined; }
      else this.view.angle += diff * Math.min(1, dt * 8);
      this.placeCamera();
    }
    // Leaves and reeds lean a little in the wind; ponds shimmer; clouds drift.
    for (const { object } of this.objects.values()) {
      for (const [i, node] of object.sway.entries()) {
        node.rotation.z = Math.sin(t * 1.1 + object.phase + i) * 0.035;
        node.rotation.x = Math.cos(t * 0.9 + object.phase) * 0.02;
      }
      for (const run of object.animate) run(t + object.phase);
    }
    this.placeClouds(t);
    if (!this.hero || !this.heroState || !this.walk) return;
    const state = this.heroState;
    const body = this.hero.children[0];
    // Blink every few seconds.
    state.blink = (state.blink ?? 2 + Math.random() * 3) - dt;
    if (this.hero.eyes) this.hero.eyes.scale.y = state.blink < 0 ? 0.12 : 1;
    if (state.blink < -0.12) state.blink = 2.5 + Math.random() * 3.5;
    if (state.mode === "rest") {
      state.wait -= dt;
      body.position.y = 0;
      const breathe = 1 + Math.sin(t * 2) * 0.025;
      body.scale.set(1 / Math.sqrt(breathe), breathe, 1 / Math.sqrt(breathe));
      // While resting, turn to look at the viewer and glance around now and then.
      state.glance = (state.glance ?? 0) - dt;
      if (state.glance <= 0) { state.look = (Math.random() - 0.5) * 1.1; state.glance = 1.5 + Math.random() * 3; }
      let diff = this.view.angle + (state.look || 0) - this.hero.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.hero.rotation.y += diff * Math.min(1, dt * 3);
      if (state.wait <= 0) {
        const goal = { x: state.tile.x + Math.round((Math.random() - 0.5) * 12), z: state.tile.z + Math.round((Math.random() - 0.5) * 12) };
        const path = findPath(this.walk, state.tile, goal);
        if (path?.length) { state.path = path; state.mode = "walk"; this.wake(); }
        else state.wait = 0.5;
      }
      return;
    }
    const next = state.path[0];
    if (!next) {
      const [min, max] = REST[this.heroMood] || REST.calm;
      state.mode = "rest"; state.wait = min + Math.random() * (max - min);
      body.scale.set(1, 1, 1);
      this.calmSince = performance.now();
      return;
    }
    const goal = new THREE.Vector3(next.x + 0.5, 0, next.z + 0.5);
    const to = goal.sub(this.hero.position);
    to.y = 0;
    const distance = to.length();
    const speed = SPEED[this.heroMood] || 1.3;
    if (distance < 0.02) { state.tile = next; state.path.shift(); return; }
    this.hero.position.addScaledVector(to.normalize(), Math.min(distance, speed * dt));
    const heading = Math.atan2(to.x, to.z);
    let diff = heading - this.hero.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.hero.rotation.y += diff * Math.min(1, dt * 8);
    const hop = Math.abs(Math.sin(t * speed * 7));
    body.position.y = hop * 0.1;
    const squash = 1 + (hop < 0.25 ? -0.05 : 0.025);
    body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.io.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

