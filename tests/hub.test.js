import test from "node:test";
import assert from "node:assert/strict";
import { mergeDashboard } from "../src/hub/merge.js";
import {
  getFlowSources,
  subscribeFlowSources,
  registerFlowSource,
  registerBackupProvider,
  exportModuleBackups,
  restoreModuleBackups,
} from "../src/hub/moduleRegistry.js";

const clone = (value) => structuredClone(value);
const rows = (...ids) => ids.map((id) => ({ id, text: id }));
const ids = (items) => items.map((item) => item.id);
const source = (id, overrides = {}) => ({
  id,
  getItems: () => [],
  subscribe: () => () => {},
  openTarget: (itemId) => ({ moduleId: id, itemId }),
  ...overrides,
});

function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test("recursive merge preserves independent dashboard and unknown-module fields", () => {
  const base = { calendar: { today: "before" }, weeklyPlan: { books: { mon: "" } }, extension: { enabled: false } };
  const local = clone(base);
  const remote = clone(base);
  local.calendar.today = "local";
  remote.weeklyPlan.books.mon = "remote";
  remote.extension.enabled = true;
  const result = mergeDashboard(base, local, remote);
  assert.deepEqual(result, {
    data: { calendar: { today: "local" }, weeklyPlan: { books: { mon: "remote" } }, extension: { enabled: true } },
    conflicts: [],
  });
});

test("same-field conflicts use local and report escaped, unambiguous paths and snapshots", () => {
  const result = mergeDashboard({ "a/b~c": { n: 1 } }, { "a/b~c": { n: 2 } }, { "a/b~c": { n: 3 } });
  assert.deepEqual(result.conflicts, [{ path: "/a~1b~0c/n", kind: "value", base: 1, local: 2, remote: 3 }]);
  assert.equal(result.data["a/b~c"].n, 2);
});

test("undefined and missing properties delete; null remains a real value", () => {
  const base = { first: 1, second: 2, third: 3 };
  assert.deepEqual(mergeDashboard(base, { first: undefined, second: 2, third: 3 }, { first: 1, third: null }), {
    data: { third: null }, conflicts: [],
  });
  assert.deepEqual(mergeDashboard({ a: 1 }, undefined, { a: 1 }), { data: undefined, conflicts: [] });
});

test("delete-versus-edit conflicts preserve the local decision in both directions", () => {
  const before = { notes: { text: "base" } };
  const deleted = mergeDashboard(before, {}, { notes: { text: "remote" } });
  assert.deepEqual(deleted.data, {});
  assert.deepEqual(deleted.conflicts, [{
    path: "/notes", kind: "delete-edit", base: { text: "base" }, local: undefined, remote: { text: "remote" },
  }]);
  assert.ok(Object.hasOwn(deleted.conflicts[0], "local"));
  const edited = mergeDashboard(before, { notes: { text: "local" } }, {});
  assert.deepEqual(edited.data, { notes: { text: "local" } });
  assert.equal(edited.conflicts[0].remote, undefined);
  assert.deepEqual(mergeDashboard(before, {}, {}), { data: {}, conflicts: [] });
});

test("concurrent object creation merges fields but conflicting type replacements remain atomic", () => {
  assert.deepEqual(mergeDashboard({}, { new: { a: 1 } }, { new: { b: 2 } }), {
    data: { new: { a: 1, b: 2 } }, conflicts: [],
  });
  const result = mergeDashboard({ value: "old" }, { value: { a: 1 } }, { value: { b: 2 } });
  assert.deepEqual(result.data, { value: { a: 1 } });
  assert.equal(result.conflicts[0].path, "/value");
});

test("updatedAt never conflicts or turns metadata-only changes into content edits", () => {
  const base = { updatedAt: "base", note: { text: "same", updatedAt: "base" } };
  const local = { updatedAt: "local", note: { text: "same", updatedAt: "local" } };
  const remote = { updatedAt: "remote", note: { text: "same", updatedAt: "remote" } };
  assert.deepEqual(mergeDashboard(base, local, remote), { data: local, conflicts: [] });
  assert.deepEqual(mergeDashboard(base, { updatedAt: "base" }, remote), {
    data: { updatedAt: "remote" }, conflicts: [],
  });
  assert.deepEqual(mergeDashboard(base, local, { updatedAt: "base" }), {
    data: { updatedAt: "local" }, conflicts: [],
  });
});

test("all six memo text/format pairs resolve cross-side text and markup edits atomically", () => {
  const fields = ["leftText", "leftTextExtra", "centerText", "centerTextExtra", "rightText", "rightTextExtra"];
  const wrap = (card) => ({ memos: { cards: [card] } });
  for (const name of fields) {
    const oldMarks = [{ start: 0, end: 4, type: "bold" }];
    const changedMarks = [{ start: 1, end: 4, type: "italic" }];
    const base = { id: "memo-life", [name]: "long text", textFormats: { [name]: oldMarks } };
    const textEdit = { ...base, [name]: "x", textFormats: { [name]: [] } };
    const marksEdit = { ...base, textFormats: { [name]: changedMarks } };
    for (const [local, remote] of [[textEdit, marksEdit], [marksEdit, textEdit]]) {
      const result = mergeDashboard(freeze(wrap(base)), freeze(wrap(local)), freeze(wrap(remote)));
      assert.deepEqual(result.data.memos.cards[0], local);
      assert.deepEqual(result.conflicts, [{
        path: `/memos/cards/@id="memo-life"/${name}`, kind: "value",
        base: { text: base[name], marks: oldMarks },
        local: { text: local[name], marks: local.textFormats[name] },
        remote: { text: remote[name], marks: remote.textFormats[name] },
        relatedPaths: [`/memos/cards/@id="memo-life"/textFormats/${name}`],
      }]);
      result.conflicts[0].local.marks.push({ start: 0, end: 1 });
      assert.deepEqual(result.data.memos.cards[0], local);
    }
  }
});

test("independent memo pairs, card titles, and unknown formatting fields still merge", () => {
  const base = { memos: { cards: [{ id: "memo", title: "before", leftText: "left", rightText: "right", textFormats: { leftText: [], rightText: [], future: 1 } }] } };
  const local = clone(base);
  const remote = clone(base);
  local.memos.cards[0].leftText = "local";
  local.memos.cards[0].textFormats.leftText = [{ start: 0, end: 5, type: "bold" }];
  remote.memos.cards[0].rightText = "remote";
  remote.memos.cards[0].textFormats.rightText = [{ start: 0, end: 6, type: "italic" }];
  remote.memos.cards[0].title = "remote title";
  remote.memos.cards[0].textFormats.future = 2;
  const result = mergeDashboard(base, local, remote);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.data.memos.cards[0], {
    ...remote.memos.cards[0], leftText: "local",
    textFormats: { ...remote.memos.cards[0].textFormats, leftText: local.memos.cards[0].textFormats.leftText },
  });
});

test("memo format deletion conflicts with text edits and one-sided pair edits remain conflict-free", () => {
  const base = { memos: { cards: [{ id: "memo", leftText: "before", textFormats: { leftText: [{ start: 0, end: 6 }] } }] } };
  const deleted = clone(base);
  delete deleted.memos.cards[0].textFormats;
  const edited = clone(base);
  edited.memos.cards[0].leftText = "x";
  edited.memos.cards[0].textFormats.leftText = [];
  const conflict = mergeDashboard(base, deleted, edited);
  assert.deepEqual(conflict.data, deleted);
  assert.equal(conflict.conflicts.length, 1);
  for (const [local, remote] of [[base, edited], [edited, base], [edited, edited]]) {
    assert.deepEqual(mergeDashboard(base, local, remote), { data: edited, conflicts: [] });
  }
});

test("ID arrays merge independent rows, independent fields, nested arrays, and additions", () => {
  const base = { days: { today: [{ id: "a", score: 1, label: "old", children: rows("child") }, { id: "b", score: 2 }] } };
  const local = clone(base);
  const remote = clone(base);
  local.days.today[0].score = 10;
  local.days.today[0].children.push(...rows("local-child"));
  local.days.today.push({ id: "local", score: 3 });
  remote.days.today[0].label = "remote";
  remote.days.today[0].children[0].text = "remote child";
  remote.days.today[1].score = 20;
  remote.days.today.push({ id: "remote", score: 4 });
  const { data, conflicts } = mergeDashboard(base, local, remote);
  assert.deepEqual(conflicts, []);
  assert.equal(data.days.today.length, 4);
  assert.deepEqual(data.days.today.find((item) => item.id === "a"), {
    id: "a", score: 10, label: "remote", children: [{ id: "child", text: "remote child" }, ...rows("local-child")],
  });
  assert.equal(data.days.today.find((item) => item.id === "b").score, 20);
});

test("actual category and preset key arrays do not require fabricated ids", () => {
  const base = { categories: [{ key: "books", label: "Books", yScore: 6 }], presets: [{ key: "sleep", name: "Sleep", nScore: -4 }] };
  const local = clone(base);
  const remote = clone(base);
  local.categories[0].label = "Reading";
  remote.categories[0].yScore = 8;
  local.presets[0].name = "Rest";
  remote.presets[0].nScore = -2;
  assert.deepEqual(mergeDashboard(base, local, remote), {
    data: { categories: [{ key: "books", label: "Reading", yScore: 8 }], presets: [{ key: "sleep", name: "Rest", nScore: -2 }] },
    conflicts: [],
  });
});

test("routine planKey takes precedence over random ids for competing Y/N choices", () => {
  const entry = (id, choice, score) => ({ id, planKey: "daily-reading", name: "Reading", choice, score });
  for (const previous of [[], [entry("base-uuid", "Y", 6)]]) {
    const base = { days: { today: previous } };
    const localEntry = entry("local-uuid", "N", -3);
    const remoteEntry = entry("remote-uuid", "Y", 8);
    const result = mergeDashboard(base, { days: { today: [localEntry] } }, { days: { today: [remoteEntry] } });
    assert.deepEqual(result.data.days.today, [localEntry]);
    assert.equal(result.data.days.today.reduce((sum, item) => sum + item.score, 0), -3);
    assert.ok(result.conflicts.some((conflict) => conflict.path === '/days/today/@planKey="daily-reading"/score'));
  }
});

test("unique planKeys preserve independent routines and missing planKeys fall back to id", () => {
  const local = [{ id: "a", planKey: "reading", choice: "Y" }];
  const remote = [{ id: "b", planKey: "exercise", choice: "N" }];
  const result = mergeDashboard([], local, remote);
  assert.deepEqual(new Set(result.data.map((item) => item.planKey)), new Set(["reading", "exercise"]));
  assert.deepEqual(result.conflicts, []);
  const base = [{ id: "a", planKey: "reading", title: "old" }, { id: "b", title: "old" }];
  assert.deepEqual(mergeDashboard(base, [{ ...base[0], title: "local" }, base[1]], [base[0], { ...base[1], title: "remote" }]), {
    data: [{ ...base[0], title: "local" }, { ...base[1], title: "remote" }], conflicts: [],
  });
});

test("ID row deletes and delete-edit conflicts are not resurrected silently", () => {
  const base = rows("a", "b", "c");
  const local = rows("b", "c");
  const remote = [{ id: "a", text: "edited" }, ...rows("b")];
  const result = mergeDashboard(base, local, remote);
  assert.deepEqual(ids(result.data), ["b"]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].path, '/@id="a"');
  assert.equal(result.conflicts[0].kind, "delete-edit");
});

test("typed identities distinguish numeric zero from string zero", () => {
  const base = [{ id: 0, n: 0 }, { id: "0", n: 0 }];
  const result = mergeDashboard(base, [{ id: 0, n: 1 }, { id: "0", n: 0 }], [{ id: 0, n: 0 }, { id: "0", n: 2 }]);
  assert.deepEqual(result, { data: [{ id: 0, n: 1 }, { id: "0", n: 2 }], conflicts: [] });
});

test("local-only reorder survives remote field edits; remote-only reorder survives local edits", () => {
  const base = rows("a", "b", "c");
  const edit = rows("a", "b", "c");
  edit[0].text = "changed";
  for (const [local, remote] of [[rows("c", "a", "b"), edit], [edit, rows("c", "a", "b")]]) {
    const result = mergeDashboard(base, local, remote);
    assert.deepEqual(ids(result.data), ["c", "a", "b"]);
    assert.equal(result.data[1].text, "changed");
    assert.deepEqual(result.conflicts, []);
  }
});

test("incompatible concurrent reorders report order conflict and local order wins", () => {
  const result = mergeDashboard({ items: rows("a", "b", "c") }, { items: rows("b", "a", "c") }, { items: rows("a", "c", "b") });
  assert.deepEqual(ids(result.data.items), ["b", "a", "c"]);
  assert.deepEqual(result.conflicts, [{ path: "/items", kind: "order", base: ["a", "b", "c"], local: ["b", "a", "c"], remote: ["a", "c", "b"] }]);
  assert.deepEqual(mergeDashboard(rows("a", "b"), rows("b", "a"), rows("b", "a")).conflicts, []);
});

test("deletions and separate insertions are not mistaken for reorders", () => {
  const result = mergeDashboard(rows("a", "b", "c"), rows("a", "local", "c"), rows("remote", "a", "b", "c", "tail"));
  assert.deepEqual(ids(result.data), ["remote", "a", "local", "c", "tail"]);
  assert.deepEqual(result.conflicts, []);
});

test("concurrent placement of the same new identity conflicts only when incompatible", () => {
  const result = mergeDashboard(rows("a", "b"), rows("a", "new", "b"), rows("new", "a", "b"));
  assert.deepEqual(ids(result.data), ["a", "new", "b"]);
  assert.equal(result.conflicts[0].kind, "order");
  assert.deepEqual(mergeDashboard([], rows("a", "b"), rows("a", "b")).conflicts, []);
});

test("unkeyed, mixed, and duplicate-identity arrays use atomic local-wins conflicts", () => {
  for (const base of [[1, 2], [{ text: "a" }, { text: "b" }], [{ id: "a" }, { key: "b" }], [{ id: "a" }, { id: "a" }]]) {
    const local = [...base, { text: "local" }];
    const remote = [...base, { text: "remote" }];
    const result = mergeDashboard(base, local, remote);
    assert.deepEqual(result.data, local);
    assert.equal(result.conflicts[0].path, "");
    assert.equal(result.conflicts[0].kind, "value");
  }
});

test("merge never mutates inputs and data and conflict snapshots are detached", () => {
  const base = freeze({ value: ["base"] });
  const local = freeze({ value: ["local"] });
  const remote = freeze({ value: ["remote"] });
  const result = mergeDashboard(base, local, remote);
  result.data.value.push("changed");
  result.conflicts[0].local.push("snapshot change");
  assert.deepEqual(local, { value: ["local"] });
  assert.deepEqual(result.data.value, ["local", "changed"]);
  assert.deepEqual(result.conflicts[0].remote, ["remote"]);
});

test("prototype-like JSON keys remain own data fields", () => {
  const base = JSON.parse('{"__proto__":{"a":1},"constructor":{"a":1}}');
  const local = JSON.parse('{"__proto__":{"a":2},"constructor":{"a":1}}');
  const remote = JSON.parse('{"__proto__":{"a":1},"constructor":{"a":2}}');
  const result = mergeDashboard(base, local, remote);
  assert.equal(Object.getPrototypeOf(result.data), Object.prototype);
  assert.ok(Object.hasOwn(result.data, "__proto__"));
  assert.equal(result.data.__proto__.a, 2);
  assert.equal(result.data.constructor.a, 2);
  assert.deepEqual(result.conflicts, []);
});

test("one-sided and identical-change merge laws hold across membership and order changes", () => {
  const variants = [undefined, null, {}, { x: 1 }, { x: undefined },
    rows("a", "b", "c"), rows("c", "a"), rows("new", "b", "a"), [], [1, 2],
    [{ key: "first", n: 1 }, { key: "second", n: 2 }]];
  const normalized = (value) => value && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) : value;
  for (const base of variants) {
    for (const changed of variants) {
      for (const result of [mergeDashboard(base, base, changed), mergeDashboard(base, changed, base), mergeDashboard(base, changed, changed)]) {
        assert.deepEqual(result, { data: normalized(changed), conflicts: [] });
      }
    }
  }
});

test("flow registry starts empty and forwards date, open target, commands, and async results", async (t) => {
  assert.deepEqual(getFlowSources(), []);
  const calls = [];
  t.after(registerFlowSource(source("flow", {
    getItems(date) { calls.push(["date", date, this.id]); return Promise.resolve([]); },
    execute(...args) { calls.push(args); return "done"; },
  })));
  const [registered] = getFlowSources();
  assert.ok(Object.isFrozen(registered));
  assert.ok(Object.isFrozen(getFlowSources()));
  assert.deepEqual(await registered.getItems("2026-10-09"), []);
  assert.deepEqual(registered.openTarget("item"), { moduleId: "flow", itemId: "item" });
  assert.equal(registered.execute("item", "complete", { value: true }), "done");
  assert.deepEqual(calls, [["date", "2026-10-09", "flow"], ["item", "complete", { value: true }]]);
});

test("registry listeners observe late registration and removal, not failed or repeated changes", (t) => {
  assert.throws(() => subscribeFlowSources(null), /listener/);
  const snapshots = [];
  const stop = subscribeFlowSources(() => snapshots.push(getFlowSources().map((item) => item.id)));
  t.after(stop);
  assert.deepEqual(snapshots, []);
  const unregister = registerFlowSource(source("late"));
  t.after(unregister);
  assert.deepEqual(snapshots, [["late"]]);
  assert.throws(() => registerFlowSource(source("late")), /already registered/);
  assert.throws(() => registerFlowSource({ id: "invalid" }), /getItems/);
  assert.deepEqual(snapshots, [["late"]]);
  unregister();
  unregister();
  assert.deepEqual(snapshots, [["late"], []]);
  stop();
  stop();
  const next = registerFlowSource(source("after-unsubscribe"));
  next();
  assert.deepEqual(snapshots, [["late"], []]);
});

test("registry subscriptions are independent and respect teardown during notification", (t) => {
  let count = 0;
  let stopLater;
  t.after(subscribeFlowSources(() => stopLater()));
  stopLater = subscribeFlowSources(() => { count += 100; });
  t.after(stopLater);
  const listener = () => { count += 1; };
  const stopFirst = subscribeFlowSources(listener);
  t.after(stopFirst);
  t.after(subscribeFlowSources(listener));
  const unregister = registerFlowSource(source("observed"));
  t.after(unregister);
  assert.equal(count, 2);
  stopFirst();
  unregister();
  assert.equal(count, 3);
});

test("registry removal notification survives provider teardown failure", (t) => {
  const snapshots = [];
  t.after(subscribeFlowSources(() => snapshots.push(getFlowSources().map((item) => item.id))));
  const unregister = registerFlowSource(source("cleanup-error", {
    subscribe: () => () => { throw new Error("cleanup"); },
  }));
  t.after(unregister);
  getFlowSources()[0].subscribe(() => {});
  assert.throws(unregister, AggregateError);
  assert.deepEqual(snapshots, [["cleanup-error"], []]);
});

test("Flow items, navigation targets, and command arguments pass through unchanged", (t) => {
  const command = { id: "complete", label: "Complete", payload: { done: true } };
  const item = { id: "item", title: "Module task", commands: [command] };
  const target = { moduleId: "flow-contract", section: "today" };
  const calls = [];
  t.after(registerFlowSource(source("flow-contract", {
    getItems: () => [item],
    openTarget: () => target,
    execute: (...args) => calls.push(args),
  })));
  const [registered] = getFlowSources();
  assert.equal(registered.getItems("2026-10-09")[0], item);
  assert.equal(registered.openTarget(item.id), target);
  registered.execute(item.id, command.id, command.payload);
  assert.deepEqual(calls, [[item.id, command.id, command.payload]]);
  assert.equal(calls[0][2], command.payload);
  assert.equal(registered.id, "flow-contract");
});

test("flow registration validates contracts and rejects duplicate ids without replacing sources", (t) => {
  assert.throws(() => registerFlowSource({ id: "invalid" }), /getItems/);
  assert.throws(() => registerFlowSource(source(" ")), /non-empty/);
  assert.throws(() => registerFlowSource(source("invalid", { execute: true })), /execute/);
  t.after(registerFlowSource(source("unique")));
  assert.throws(() => registerFlowSource(source("unique")), /already registered/);
  assert.equal(getFlowSources()[0].execute, undefined);
});

test("subscriber and module teardown are idempotent and suppress late callbacks", () => {
  const callbacks = [];
  let cleanups = 0;
  let notifications = 0;
  const unregister = registerFlowSource(source("subscriptions", {
    subscribe(cb) { callbacks.push(cb); return () => { cleanups += 1; }; },
  }));
  const [registered] = getFlowSources();
  const stop = registered.subscribe(() => { notifications += 1; });
  registered.subscribe(() => { notifications += 1; });
  callbacks.forEach((cb) => cb());
  stop();
  stop();
  callbacks.forEach((cb) => cb());
  unregister();
  unregister();
  callbacks.forEach((cb) => cb());
  assert.equal(cleanups, 2);
  assert.equal(notifications, 3);
  assert.deepEqual(getFlowSources(), []);
  assert.throws(() => registered.getItems("date"), /unregistered/);
  assert.throws(() => registered.subscribe(() => {}), /unregistered/);
  assert.throws(() => registered.openTarget("id"), /unregistered/);
});

test("unregister drains every subscription even when one cleanup throws", () => {
  let cleanups = 0;
  const unregister = registerFlowSource(source("throwing-cleanup", {
    subscribe: () => () => { cleanups += 1; throw new Error("cleanup failure"); },
  }));
  const [registered] = getFlowSources();
  registered.subscribe(() => {});
  registered.subscribe(() => {});
  assert.throws(unregister, (error) => error instanceof AggregateError && error.errors.length === 2);
  assert.equal(cleanups, 2);
  unregister();
  assert.deepEqual(getFlowSources(), []);
});

test("synchronous subscription notifications can unregister safely", () => {
  let cleaned = 0;
  const unregister = registerFlowSource(source("synchronous", {
    subscribe(cb) { cb(); return () => { cleaned += 1; }; },
  }));
  const [registered] = getFlowSources();
  const stop = registered.subscribe(unregister);
  stop();
  assert.equal(cleaned, 1);
  assert.deepEqual(getFlowSources(), []);
});

test("bad subscription contracts fail clearly and stale unregister cannot remove a replacement", () => {
  const unregister = registerFlowSource(source("replacement", { subscribe: () => undefined }));
  assert.throws(() => getFlowSources()[0].subscribe(() => {}), /teardown/);
  unregister();
  const next = registerFlowSource(source("replacement"));
  unregister();
  assert.equal(getFlowSources().length, 1);
  next();
});

test("module backup round trips opaque versioned data and isolates callback mutation", async (t) => {
  const original = { version: 17, records: [{ arbitrary: "real module data" }] };
  let received;
  t.after(registerBackupProvider({
    id: "module", exportBackup: async () => original,
    restoreBackup: async (payload) => { received = clone(payload); payload.records.length = 0; },
  }));
  const backups = await exportModuleBackups();
  assert.deepEqual(backups, { module: original });
  backups.module.version = 18;
  assert.equal(original.version, 17);
  assert.deepEqual(await restoreModuleBackups(backups), { restored: ["module"] });
  assert.equal(received.version, 18);
  assert.equal(backups.module.records.length, 1);
});

test("unknown backup modules are rejected before any provider is invoked", async (t) => {
  let writes = 0;
  t.after(registerBackupProvider({ id: "known", exportBackup: () => null, restoreBackup: () => { writes += 1; } }));
  await assert.rejects(restoreModuleBackups({ known: {}, future: { important: true } }), /Unknown backup modules: future/);
  assert.equal(writes, 0);
  assert.deepEqual(await restoreModuleBackups({}), { restored: [] });
});

test("backup failures propagate with completed-provider progress, without continuing", async (t) => {
  const calls = [];
  for (const id of ["first", "failing", "last"]) {
    t.after(registerBackupProvider({
      id, exportBackup: () => ({}),
      restoreBackup: () => { calls.push(id); if (id === "failing") throw new Error("provider failure"); },
    }));
  }
  await assert.rejects(restoreModuleBackups({ first: {}, failing: {}, last: {} }), (error) => {
    assert.equal(error.moduleId, "failing");
    assert.deepEqual(error.restored, ["first"]);
    assert.equal(error.cause.message, "provider failure");
    return true;
  });
  assert.deepEqual(calls, ["first", "failing"]);
});

test("backup contract rejects lossy JSON values and invalid envelopes before writes", async (t) => {
  let writes = 0;
  let payload;
  const cycle = {};
  cycle.self = cycle;
  const hidden = Object.defineProperty({}, "future", { value: "must not disappear" });
  const arrayWithExtra = Object.assign([], { future: "must not disappear" });
  t.after(registerBackupProvider({ id: "json", exportBackup: () => payload, restoreBackup: () => { writes += 1; } }));
  for (const invalid of [undefined, NaN, Infinity, 1n, () => {}, new Date(), cycle, { lost: undefined }, [, 1],
    { [Symbol("future")]: "must not disappear" }, hidden, arrayWithExtra]) {
    payload = invalid;
    await assert.rejects(exportModuleBackups(), TypeError);
    await assert.rejects(restoreModuleBackups({ json: invalid }), TypeError);
  }
  for (const invalid of [null, [], "text", new Date()]) await assert.rejects(restoreModuleBackups(invalid), TypeError);
  assert.equal(writes, 0);
});

test("backup registration validates, unregisters cleanly, and preserves prototype-like module ids", async () => {
  assert.throws(() => registerBackupProvider({ id: "missing" }), /exportBackup/);
  const unregister = registerBackupProvider({ id: "__proto__", exportBackup: () => ({ n: 1 }), restoreBackup: () => {} });
  assert.throws(() => registerBackupProvider({ id: "__proto__" }), /already registered/);
  const backups = await exportModuleBackups();
  assert.ok(Object.hasOwn(backups, "__proto__"));
  assert.deepEqual(await restoreModuleBackups(backups), { restored: ["__proto__"] });
  unregister();
  unregister();
  assert.deepEqual(await exportModuleBackups(), {});
  await assert.rejects(restoreModuleBackups(backups), /Unknown backup modules/);
});
