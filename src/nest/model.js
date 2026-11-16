// Nest: an idle housing game. One hero lives on a tile lot with a yard and a house that grow over time. Pure data rules (no browser APIs) so they can be tested.
export const VERSION = 1;
export const KINDS = ["hero", "land", "decor"];

const MINUTE = 60000;
export const HOUR = 60 * MINUTE;
export const SEED_EVERY_MS = 2 * MINUTE; // the hero finds one seed this often
export const START_SEEDS = 800;
export const LAND_START = 16; // tiles per side at the start
export const LAND_MAX = 32;
export const LAND_STEP = 2; // each expansion adds this many rows and columns (on the far sides)
export const MUTATION = 0.1; // chance per trait of a brand-new random value (kept for breeding later)

// Every trait value has a weight; low weights are rare. Ids are stored, labels may change freely.
export const GENES = {
  body: { label: "몸", values: [
    { id: "round", label: "동글", w: 30 }, { id: "bean", label: "콩", w: 24 }, { id: "drop", label: "물방울", w: 20 },
    { id: "mochi", label: "찹쌀떡", w: 18 }, { id: "star", label: "별사탕", w: 6 },
  ] },
  color: { label: "색", values: [
    { id: "peach", label: "복숭아", hex: "#ffb79e", w: 16 }, { id: "lemon", label: "레몬", hex: "#ffe07a", w: 16 },
    { id: "mint", label: "민트", hex: "#9fe3c4", w: 15 }, { id: "sky", label: "하늘", hex: "#9fcdf3", w: 15 },
    { id: "berry", label: "딸기", hex: "#ff9fb6", w: 13 }, { id: "cream", label: "크림", hex: "#fff0d4", w: 12 },
    { id: "lilac", label: "라벤더", hex: "#c6b2f0", w: 10 }, { id: "cocoa", label: "코코아", hex: "#c09274", w: 9 },
    { id: "night", label: "밤하늘", hex: "#5e6cae", w: 4 }, { id: "gold", label: "황금", hex: "#f5c542", w: 3 },
  ] },
  pattern: { label: "무늬", values: [
    { id: "none", label: "없음", w: 34 }, { id: "belly", label: "배 무늬", w: 26 }, { id: "spots", label: "점박이", w: 20 },
    { id: "stripes", label: "줄무늬", w: 14 }, { id: "twotone", label: "투톤", w: 6 },
  ] },
  ears: { label: "귀", values: [
    { id: "none", label: "없음", w: 18 }, { id: "cat", label: "고양이 귀", w: 20 }, { id: "bear", label: "곰 귀", w: 20 },
    { id: "bunny", label: "토끼 귀", w: 16 }, { id: "sprout", label: "새싹", w: 13 }, { id: "antenna", label: "더듬이", w: 9 },
    { id: "horn", label: "뿔", w: 4 },
  ] },
  eyes: { label: "눈", values: [
    { id: "dot", label: "콩알 눈", w: 36 }, { id: "big", label: "초롱 눈", w: 30 }, { id: "sleepy", label: "졸린 눈", w: 24 },
    { id: "sparkle", label: "반짝 눈", w: 6 },
  ] },
  tail: { label: "꼬리", values: [
    { id: "none", label: "없음", w: 24 }, { id: "nub", label: "몽당 꼬리", w: 28 }, { id: "fluffy", label: "솜 꼬리", w: 22 },
    { id: "curl", label: "돌돌 꼬리", w: 18 }, { id: "spike", label: "뾰족 꼬리", w: 6 },
  ] },
  size: { label: "크기", values: [
    { id: "small", label: "아담", w: 30 }, { id: "medium", label: "보통", w: 50 }, { id: "large", label: "듬직", w: 20 },
  ] },
  mood: { label: "성격", values: [
    { id: "calm", label: "느긋", w: 24 }, { id: "lively", label: "활발", w: 24 }, { id: "shy", label: "수줍", w: 20 },
    { id: "foodie", label: "먹보", w: 20 }, { id: "curious", label: "호기심", w: 12 },
  ] },
};
export const GENE_KEYS = Object.keys(GENES);

export const geneValue = (key, id) => GENES[key]?.values.find((value) => value.id === id) || GENES[key]?.values[0];
export const geneLabel = (key, id) => geneValue(key, id)?.label || "";
// Rare = the trait's weight is a small share of its gene's total.
export function rarity(key, id) {
  const values = GENES[key].values;
  const total = values.reduce((sum, value) => sum + value.w, 0);
  const share = (values.find((value) => value.id === id)?.w || 0) / total;
  return share <= 0.07 ? "rare" : share <= 0.14 ? "uncommon" : "common";
}

// Small seeded random so the same seed always gives the same creature (starters, names).
export function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
export function seededRandom(seed) {
  let a = typeof seed === "number" ? seed >>> 0 : hashString(String(seed));
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pickWeighted(values, random = Math.random) {
  const total = values.reduce((sum, value) => sum + value.w, 0);
  let roll = random() * total;
  for (const value of values) { roll -= value.w; if (roll < 0) return value.id; }
  return values.at(-1).id;
}
export const randomGenes = (random = Math.random) =>
  Object.fromEntries(GENE_KEYS.map((key) => [key, pickWeighted(GENES[key].values, random)]));

// Each trait comes from the mother or the father, except a MUTATION chance of a fresh random value.
export function inheritGenes(mother, father, random = Math.random) {
  const genes = {};
  const sources = {};
  for (const key of GENE_KEYS) {
    const roll = random();
    if (roll < MUTATION) { genes[key] = pickWeighted(GENES[key].values, random); sources[key] = "new"; }
    else if (roll < MUTATION + (1 - MUTATION) / 2) { genes[key] = mother[key]; sources[key] = "mother"; }
    else { genes[key] = father[key]; sources[key] = "father"; }
  }
  return { genes, sources };
}

// ---------- catalog ----------
// size = [width, depth] in tiles before rotation; yield = seeds per hour while placed; solid blocks walking.
export const OBJECTS = [
  // Yard
  { id: "tree", group: "yard", label: "나무", cost: 40, size: [1, 1], yield: 2 },
  { id: "pine", group: "yard", label: "전나무", cost: 45, size: [1, 1], yield: 2 },
  { id: "bush", group: "yard", label: "덤불", cost: 15, size: [1, 1] },
  { id: "flowerbed", group: "yard", label: "꽃밭", cost: 20, size: [1, 1], yield: 1, solid: false },
  { id: "crop", group: "yard", label: "텃밭", cost: 60, size: [2, 2], yield: 6, solid: false },
  { id: "rock", group: "yard", label: "바위", cost: 15, size: [1, 1] },
  { id: "fence", group: "yard", label: "울타리", cost: 6, size: [1, 1] },
  { id: "lamp", group: "yard", label: "가로등", cost: 35, size: [1, 1] },
  { id: "bench", group: "yard", label: "벤치", cost: 40, size: [2, 1] },
  { id: "mailbox", group: "yard", label: "우체통", cost: 25, size: [1, 1] },
  { id: "pond", group: "yard", label: "연못", cost: 120, size: [3, 2], yield: 3 },
  // Furniture
  { id: "bed", group: "home", label: "침대", cost: 80, size: [1, 2] },
  { id: "table", group: "home", label: "식탁", cost: 50, size: [2, 1] },
  { id: "chair", group: "home", label: "의자", cost: 20, size: [1, 1] },
  { id: "sofa", group: "home", label: "소파", cost: 90, size: [2, 1] },
  { id: "shelf", group: "home", label: "책장", cost: 60, size: [1, 1] },
  { id: "counter", group: "home", label: "조리대", cost: 70, size: [1, 1] },
  { id: "fridge", group: "home", label: "냉장고", cost: 90, size: [1, 1] },
  { id: "plant", group: "home", label: "화분", cost: 25, size: [1, 1], yield: 1 },
  { id: "floorlamp", group: "home", label: "스탠드", cost: 30, size: [1, 1] },
  { id: "rug", group: "home", label: "러그", cost: 30, size: [2, 2], solid: false, flat: true },
];
export const FLOORS = [
  { id: "grass", label: "잔디", cost: 0, color: "#9bd77f", group: "yard" },
  { id: "dirt", label: "흙길", cost: 1, color: "#d9b98c", group: "yard" },
  { id: "stone", label: "돌길", cost: 2, color: "#c9c6c0", group: "yard" },
  { id: "sand", label: "모래", cost: 1, color: "#f1dfac", group: "yard" },
  { id: "water", label: "물", cost: 3, color: "#8ccbe8", group: "yard", blocks: true },
  { id: "wood", label: "마루", cost: 3, color: "#c98f5e", group: "home" },
  { id: "tile", label: "타일", cost: 3, color: "#eef0f2", group: "home" },
  { id: "carpet", label: "카펫", cost: 4, color: "#e9b9c4", group: "home" },
  { id: "mint", label: "민트 바닥", cost: 3, color: "#bfe6d6", group: "home" },
];
export const WALLS = [
  { id: "wall", label: "벽", cost: 5, blocks: true },
  { id: "window", label: "창문", cost: 10, blocks: true },
  { id: "door", label: "문", cost: 15, blocks: false },
];
export const ACCESSORIES = [
  { id: "none", label: "없음", cost: 0 }, { id: "ribbon", label: "리본", cost: 30 }, { id: "flower", label: "꽃핀", cost: 35 },
  { id: "leaf", label: "나뭇잎 모자", cost: 40 }, { id: "scarf", label: "목도리", cost: 50 }, { id: "glasses", label: "동글 안경", cost: 60 },
  { id: "crown", label: "왕관", cost: 150 },
];
export const objectInfo = (id) => OBJECTS.find((item) => item.id === id);
export const floorInfo = (id) => FLOORS.find((item) => item.id === id) || FLOORS[0];
export const wallInfo = (id) => WALLS.find((item) => item.id === id);
export const accessoryInfo = (id) => ACCESSORIES.find((item) => item.id === id) || ACCESSORIES[0];

// Cost of growing the lot from `size` to `size + LAND_STEP`.
export const expandCost = (size) => Math.round(200 * 1.5 ** ((size - LAND_START) / LAND_STEP));
export function expansionSpent(size) {
  let total = 0;
  for (let current = LAND_START; current < size; current += LAND_STEP) total += expandCost(current);
  return total;
}

// ---------- ids, names, records ----------
const SYLLABLES = ["콩", "모", "찌", "몽", "뭉", "토", "리", "보", "루", "미", "두", "부", "쿠", "나", "포", "또", "랑", "솜", "방", "울"];
export function nameFor(seed) {
  const random = seededRandom(`name:${seed}`);
  const one = () => SYLLABLES[Math.floor(random() * SYLLABLES.length)];
  return `${one()}${one()}`;
}
export const uid = () => crypto.randomUUID();
const iso = (value) => new Date(value).toISOString();
const time = (value) => Date.parse(value || "") || 0;
export const HERO_ID = "hero";
export const LAND_ID = "land";

// Three hero candidates, fixed per owner so every device offers the same choice.
export function heroCandidates(owner) {
  return [0, 1, 2].map((index) => {
    const random = seededRandom(`hero:${owner}:${index}`);
    return { genes: randomGenes(random), sex: random() < 0.5 ? "f" : "m", name: nameFor(`${owner}:${index}`) };
  });
}
export function newHero({ genes, sex, name }, now = Date.now()) {
  const at = iso(now);
  return { version: VERSION, id: HERO_ID, kind: "hero", name: (name || "").trim().slice(0, 20) || nameFor(at), sex, genes,
    accessory: "none", bornAt: at, createdAt: at, updatedAt: at, deletedAt: null };
}
export function newLand(now = Date.now()) {
  const at = iso(now);
  return { version: VERSION, id: LAND_ID, kind: "land", size: LAND_START, floors: {}, walls: {},
    createdAt: at, updatedAt: at, deletedAt: null };
}
export function newObject(type, x, z, rot = 0, now = Date.now()) {
  const info = objectInfo(type);
  if (!info) throw new Error("알 수 없는 물건입니다.");
  const at = iso(now);
  return { version: VERSION, id: uid(), kind: "decor", type, x, z, rot: rot & 3, cost: info.cost,
    createdAt: at, updatedAt: at, deletedAt: null };
}

// ---------- grid ----------
// Tiles are "x,z". Wall edges: "h:x,z" is the edge on the north side of tile (x,z) (the line z, from x to x+1);
// "v:x,z" is the edge on the west side of tile (x,z) (the line x, from z to z+1).
export const tileKey = (x, z) => `${x},${z}`;
export function footprint(type, rot = 0) {
  const [w, d] = objectInfo(type)?.size || [1, 1];
  return rot % 2 ? [d, w] : [w, d];
}
export function objectTiles(object) {
  const [w, d] = footprint(object.type, object.rot);
  const tiles = [];
  for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < d; dz++) tiles.push([object.x + dx, object.z + dz]);
  return tiles;
}
export const objects = (items) => items.filter((item) => item.kind === "decor" && !item.deletedAt);
export const findHero = (items) => items.find((item) => item.kind === "hero" && !item.deletedAt) || null;
export const findLand = (items) => items.find((item) => item.kind === "land" && !item.deletedAt) || null;

export function occupancy(items) {
  const map = new Map();
  for (const object of objects(items)) {
    if (objectInfo(object.type)?.flat) continue;
    for (const [x, z] of objectTiles(object)) map.set(tileKey(x, z), object.id);
  }
  return map;
}
// Whether an object fits: inside the lot, not on another (non-flat) object, not on water, not crossing a wall.
export function canPlace(items, land, type, x, z, rot = 0, ignoreId = null) {
  const info = objectInfo(type);
  if (!info || !land) return false;
  const [w, d] = footprint(type, rot);
  if (x < 0 || z < 0 || x + w > land.size || z + d > land.size) return false;
  const taken = info.flat ? new Map() : occupancy(items);
  for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < d; dz++) {
    const key = tileKey(x + dx, z + dz);
    const owner = taken.get(key);
    if (owner && owner !== ignoreId) return false;
    if (floorInfo(land.floors[key]).blocks) return false;
    if (dx > 0 && land.walls[`v:${x + dx},${z + dz}`]) return false;
    if (dz > 0 && land.walls[`h:${x + dx},${z + dz}`]) return false;
  }
  return true;
}
// Edges along a straight drag from grid point a to grid point b (axis-aligned, the longer axis wins).
export function edgesBetween(a, b) {
  const edges = [];
  if (Math.abs(b.x - a.x) >= Math.abs(b.z - a.z)) {
    const [from, to] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
    for (let x = from; x < to; x++) edges.push(`h:${x},${a.z}`);
  } else {
    const [from, to] = [Math.min(a.z, b.z), Math.max(a.z, b.z)];
    for (let z = from; z < to; z++) edges.push(`v:${a.x},${z}`);
  }
  return edges;
}
export function edgeInside(key, size) {
  const match = /^([hv]):(\d+),(\d+)$/.exec(key);
  if (!match) return false;
  const [, axis, a, b] = match;
  const x = Number(a); const z = Number(b);
  return axis === "h" ? x < size && z <= size : x <= size && z < size;
}
// Tiles the hero can walk between: not solid objects, not water, and no wall (doors are open).
export function walkable(items, land) {
  const blocked = new Set();
  const taken = occupancy(items);
  for (const [key, id] of taken) {
    const object = items.find((item) => item.id === id);
    if (objectInfo(object?.type)?.solid !== false) blocked.add(key);
  }
  for (const [key, floor] of Object.entries(land?.floors || {})) if (floorInfo(floor).blocks) blocked.add(key);
  const wall = (key) => wallInfo(land?.walls?.[key])?.blocks;
  return {
    size: land?.size || LAND_START,
    free: (x, z) => x >= 0 && z >= 0 && x < (land?.size || LAND_START) && z < (land?.size || LAND_START) && !blocked.has(tileKey(x, z)),
    // Step from (x,z) by one tile in direction (dx,dz).
    open: (x, z, dx, dz) => {
      if (dx === 1) return !wall(`v:${x + 1},${z}`);
      if (dx === -1) return !wall(`v:${x},${z}`);
      if (dz === 1) return !wall(`h:${x},${z + 1}`);
      return !wall(`h:${x},${z}`);
    },
  };
}
export function findPath(grid, from, to) {
  if (!grid.free(to.x, to.z)) return null;
  const start = tileKey(from.x, from.z);
  const previous = new Map([[start, null]]);
  const queue = [from];
  while (queue.length) {
    const tile = queue.shift();
    if (tile.x === to.x && tile.z === to.z) {
      const path = [];
      for (let key = tileKey(tile.x, tile.z); key; key = previous.get(key)) {
        const [x, z] = key.split(",").map(Number);
        path.unshift({ x, z });
      }
      return path.slice(1);
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = tile.x + dx; const z = tile.z + dz;
      const key = tileKey(x, z);
      if (previous.has(key) || !grid.free(x, z) || !grid.open(tile.x, tile.z, dx, dz)) continue;
      previous.set(key, tileKey(tile.x, tile.z));
      queue.push({ x, z });
    }
  }
  return null;
}

// ---------- seeds ----------
// Seeds are never stored as a counter (two devices could both change it): the hero finds them over time, things
// with a yield add more while placed, and whatever is built holds the spent ones (removing it gives them back).
export function seedBalance(items, now = Date.now()) {
  let earned = START_SEEDS;
  let spent = 0;
  for (const item of items) {
    if (item.kind === "hero") {
      const end = item.deletedAt ? Math.min(now, time(item.deletedAt)) : now;
      earned += Math.max(0, Math.floor((end - time(item.bornAt)) / SEED_EVERY_MS));
      if (!item.deletedAt) spent += accessoryInfo(item.accessory).cost;
    } else if (item.kind === "decor") {
      const info = objectInfo(item.type);
      const end = item.deletedAt ? Math.min(now, time(item.deletedAt)) : now;
      if (info?.yield) earned += Math.max(0, Math.floor(((end - time(item.createdAt)) / HOUR) * info.yield));
      if (!item.deletedAt) spent += item.cost;
    } else if (item.kind === "land" && !item.deletedAt) {
      spent += expansionSpent(item.size);
      for (const floor of Object.values(item.floors)) spent += floorInfo(floor).cost;
      for (const wall of Object.values(item.walls)) spent += wallInfo(wall)?.cost || 0;
    }
  }
  return earned - spent;
}
export function seedsPerHour(items) {
  let rate = findHero(items) ? HOUR / SEED_EVERY_MS : 0;
  for (const object of objects(items)) rate += objectInfo(object.type)?.yield || 0;
  return rate;
}

export function formatDuration(ms) {
  if (ms <= 0) return "곧";
  const minutes = Math.ceil(ms / MINUTE);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

// ---------- validation ----------
function cleanGenes(value) {
  const genes = {};
  for (const key of GENE_KEYS) {
    const id = value?.[key];
    genes[key] = GENES[key].values.some((option) => option.id === id) ? id : GENES[key].values[0].id;
  }
  return { ...(value && typeof value === "object" ? value : {}), ...genes };
}
const text = (value, fallback = "") => typeof value === "string" ? value : fallback;
const nullableText = (value) => typeof value === "string" && value ? value : null;
const int = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback;

// Accepts older or partial rows by filling defaults; never drops unknown fields.
export function validateItem(value) {
  if (!value || value.version !== VERSION || typeof value.id !== "string" || !value.id || !KINDS.includes(value.kind))
    throw new Error("지원하지 않거나 손상된 Nest 기록입니다.");
  const item = structuredClone(value);
  const epoch = new Date(0).toISOString();
  item.createdAt = text(item.createdAt, epoch);
  item.updatedAt = text(item.updatedAt, item.createdAt);
  item.deletedAt = nullableText(item.deletedAt);
  if (item.kind === "hero") {
    item.genes = cleanGenes(item.genes);
    item.sex = item.sex === "m" ? "m" : "f";
    item.name = text(item.name).trim().slice(0, 20) || nameFor(item.id);
    item.bornAt = text(item.bornAt, item.createdAt);
    if (!ACCESSORIES.some((option) => option.id === item.accessory)) item.accessory = "none";
  } else if (item.kind === "land") {
    item.size = Math.min(LAND_MAX, Math.max(LAND_START, int(item.size, LAND_START)));
    const floors = item.floors && typeof item.floors === "object" ? item.floors : {};
    item.floors = Object.fromEntries(Object.entries(floors).filter(([key, floor]) =>
      /^\d+,\d+$/.test(key) && FLOORS.some((option) => option.id === floor) && floor !== "grass"));
    const walls = item.walls && typeof item.walls === "object" ? item.walls : {};
    item.walls = Object.fromEntries(Object.entries(walls).filter(([key, wall]) => /^[hv]:\d+,\d+$/.test(key) && wallInfo(wall)));
  } else {
    if (!objectInfo(item.type)) item.type = "bush";
    item.x = Math.max(0, int(item.x));
    item.z = Math.max(0, int(item.z));
    item.rot = int(item.rot) & 3;
    item.cost = Math.max(0, int(item.cost, objectInfo(item.type).cost));
  }
  return item;
}
export function validateBackup(value) {
  if (!value || value.version !== VERSION || !Array.isArray(value.items)) throw new Error("Nest 백업 형식이 아닙니다.");
  const items = value.items.map(validateItem);
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error("Nest 백업에 중복 기록이 있습니다.");
  return { version: VERSION, items };
}
