import test from "node:test";
import assert from "node:assert/strict";
import {
  GENES, GENE_KEYS, HOUR, LAND_START, LAND_STEP, SEED_EVERY_MS, START_SEEDS, canPlace, edgesBetween, expandCost,
  expansionSpent, findPath, heroCandidates, inheritGenes, newHero, newLand, newObject, seedBalance, seededRandom,
  validateBackup, validateItem, walkable,
} from "../src/nest/model.js";
import { createNestStore } from "../src/nest/store.js";
import { accountLock } from "../src/nest/storage.js";

const copy = (value) => structuredClone(value);
function memoryStorage() {
  const data = new Map();
  return { data, read: async (id) => copy(data.get(id)), write: async (id, value) => { data.set(id, copy(value)); } };
}
function memoryCloud() {
  const rows = new Map();
  return { rows, read: async () => copy([...rows.values()]), write: async (value, revision) => {
    if ((rows.get(value.id)?.revision || 0) !== revision) throw Object.assign(new Error("conflict"), { code: "NEST_CONFLICT" });
    rows.set(value.id, { item_id: value.id, payload: copy(value), revision: revision + 1 });
    return revision + 1;
  } };
}
const T0 = Date.parse("2026-11-16T00:00:00Z");

test("hero candidates are the same three for the same owner", () => {
  assert.deepEqual(heroCandidates("user-1"), heroCandidates("user-1"));
  assert.equal(heroCandidates("user-1").length, 3);
  assert.notDeepEqual(heroCandidates("user-1"), heroCandidates("user-2"));
});

test("inherited traits come from a parent or are new (kept for later breeding)", () => {
  const random = seededRandom("inherit");
  const [a, b] = heroCandidates("x");
  for (let i = 0; i < 100; i++) {
    const { genes, sources } = inheritGenes(a.genes, b.genes, random);
    for (const key of GENE_KEYS) {
      if (sources[key] === "mother") assert.equal(genes[key], a.genes[key]);
      else if (sources[key] === "father") assert.equal(genes[key], b.genes[key]);
      else assert.ok(GENES[key].values.some((value) => value.id === genes[key]));
    }
  }
});

test("objects fit inside the lot, never overlap and never cross a wall", () => {
  const land = newLand(T0);
  const bed = newObject("bed", 2, 2, 0, T0); // 1×2: tiles (2,2) and (2,3)
  const items = [land, bed];
  assert.equal(canPlace(items, land, "chair", 2, 3), false);
  assert.equal(canPlace(items, land, "chair", 3, 3), true);
  assert.equal(canPlace(items, land, "rug", 2, 2), true, "flat rugs go under furniture");
  assert.equal(canPlace(items, land, "pond", LAND_START - 2, 0), false, "3 wide pond would leave the lot");
  assert.equal(canPlace(items, land, "pond", LAND_START - 2, 0, 1), true, "rotated it is 2 wide");
  const walled = { ...land, walls: { "v:6,6": "wall" } };
  assert.equal(canPlace([walled], walled, "sofa", 5, 6), false, "a 2-wide sofa cannot straddle a wall");
  assert.equal(canPlace([walled], { ...walled, floors: { "8,8": "water" } }, "chair", 8, 8), false);
});

test("wall drags follow one straight grid line", () => {
  assert.deepEqual(edgesBetween({ x: 2, z: 3 }, { x: 5, z: 4 }), ["h:2,3", "h:3,3", "h:4,3"]);
  assert.deepEqual(edgesBetween({ x: 2, z: 3 }, { x: 2, z: 1 }), ["v:2,1", "v:2,2"]);
});

test("the hero walks through doors but not through walls", () => {
  // A wall line at x = 3 from z = 0 to 3, so (2,0)→(3,0) must go around via z = 3.
  const walls = { "v:3,0": "wall", "v:3,1": "wall", "v:3,2": "wall" };
  const land = { ...newLand(T0), walls };
  const around = findPath(walkable([land], land), { x: 2, z: 0 }, { x: 3, z: 0 });
  assert.ok(around.length > 1);
  assert.ok(around.some((tile) => tile.z >= 3));
  const door = { ...land, walls: { ...walls, "v:3,0": "door" } };
  assert.deepEqual(findPath(walkable([door], door), { x: 2, z: 0 }, { x: 3, z: 0 }), [{ x: 3, z: 0 }]);
});

test("seeds come from time and yields; building holds them and removing gives them back", () => {
  const hero = newHero(heroCandidates("x")[0], T0);
  const land = newLand(T0);
  const later = T0 + HOUR;
  const perHour = HOUR / SEED_EVERY_MS;
  assert.equal(seedBalance([hero, land], later), START_SEEDS + perHour);
  const crop = newObject("crop", 0, 0, 0, T0);
  assert.equal(seedBalance([hero, land, crop], later), START_SEEDS + perHour + 6 - 60);
  const removed = { ...crop, deletedAt: new Date(later).toISOString() };
  assert.equal(seedBalance([hero, land, removed], later), START_SEEDS + perHour + 6);
  const built = { ...land, size: LAND_START + LAND_STEP, floors: { "1,1": "wood" }, walls: { "h:1,1": "door" } };
  assert.equal(seedBalance([hero, built], later), START_SEEDS + perHour - expandCost(LAND_START) - 3 - 15);
  assert.equal(expansionSpent(LAND_START + 2 * LAND_STEP), expandCost(LAND_START) + expandCost(LAND_START + LAND_STEP));
});

test("records keep unknown fields and fix bad values", () => {
  const hero = validateItem({ version: 1, id: "hero", kind: "hero", genes: { body: "nope", color: "gold" }, extra: 1 });
  assert.equal(hero.genes.body, "round");
  assert.equal(hero.genes.color, "gold");
  assert.equal(hero.extra, 1);
  const land = validateItem({ version: 1, id: "land", kind: "land", size: 99, floors: { "1,1": "wood", "2,2": "grass", bad: "x" }, walls: { "h:1,1": "door", "q:1": "wall" } });
  assert.equal(land.size, 32);
  assert.deepEqual(land.floors, { "1,1": "wood" });
  assert.deepEqual(land.walls, { "h:1,1": "door" });
  assert.equal(validateItem({ version: 1, id: "o", kind: "decor", type: "tree", x: 2.6, z: -3, rot: 5 }).rot, 1);
  assert.throws(() => validateItem({ version: 1, id: "b", kind: "spaceship" }), /손상/);
  assert.throws(() => validateBackup({ version: 1, items: [hero, hero] }), /중복/);
});

test("floors painted on two devices merge, and both keep one hero", async () => {
  const cloud = memoryCloud();
  const a = createNestStore("u", { storage: memoryStorage(), cloud, lock: accountLock });
  const b = createNestStore("u", { storage: memoryStorage(), cloud, lock: accountLock });
  const hero = newHero(heroCandidates("u")[0], T0);
  const land = newLand(T0);
  await a.load();
  await a.changeMany([hero, land].map((item) => ({ id: item.id, transform: (current) => current || item })));
  await a.sync();
  await b.load();
  await b.sync();
  await a.changeMany([{ id: "land", transform: (item) => ({ ...item, floors: { ...item.floors, "1,1": "wood" } }) }]);
  await b.changeMany([{ id: "land", transform: (item) => ({ ...item, floors: { ...item.floors, "5,5": "stone" } }) }]);
  await a.sync();
  await b.sync();
  await a.sync();
  const floors = cloud.rows.get("land").payload.floors;
  assert.deepEqual(floors, { "1,1": "wood", "5,5": "stone" });
  assert.equal([...cloud.rows.values()].filter((row) => row.payload.kind === "hero").length, 1);
});
