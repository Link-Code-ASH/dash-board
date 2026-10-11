import test from "node:test";
import assert from "node:assert/strict";
import { createLabCloud, labFailure } from "../src/edu/lab/cloud.js";
import { createLabStore } from "../src/edu/lab/store.js";

const copy = (value) => structuredClone(value);
const item = (id, user_id = "ash") => ({ id, user_id, revision: 1, deleted_at: null, title: id,
  status: "review", feedback: "", stem: "Claude의 문제", extra: { untouched: true } });
const note = (id, user_id = "ash") => ({ id, user_id, revision: 1, deleted_at: null, title: id,
  kind: "idea", scope: "전 과목", body: "본문", tags: [], source: "", related: ["item-1"], extra: { untouched: true } });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

function fakeClient({ notes = [], items = [], beforeRequest } = {}) {
  const tables = { edu_notes: copy(notes), edu_items: copy(items) };
  const calls = [];
  return {
    tables, calls,
    from(table) {
      assert.ok(Object.hasOwn(tables, table), `Unexpected table access: ${table}`);
      const query = { table, operation: "select", filters: {}, nulls: {}, patch: null };
      const builder = {
        select() { return builder; },
        update(patch) { query.operation = "update"; query.patch = copy(patch); return builder; },
        eq(field, value) { query.filters[field] = value; return builder; },
        is(field, value) { query.nulls[field] = value; return builder; },
        order(field, options) { query.order = { field, ...options }; return builder; },
        range(from, to) { query.range = [from, to]; return builder; },
        maybeSingle() { query.single = true; return builder; },
        abortSignal(signal) { query.signal = signal; return builder; },
        then(resolve, reject) {
          const run = async () => {
            calls.push(query);
            await beforeRequest?.(query, tables);
            const matches = (row) => Object.entries({ ...query.filters, ...query.nulls }).every(([field, value]) => row[field] === value);
            let rows = tables[table].filter(matches);
            if (query.operation === "update") {
              for (const row of rows) Object.assign(row, copy(query.patch), { updated_at: "2026-10-11T00:00:00Z" });
            } else {
              if (query.order) rows = rows.toSorted((left, right) => left[query.order.field].localeCompare(right[query.order.field]));
              if (query.range) rows = rows.slice(query.range[0], query.range[1] + 1);
            }
            return { data: copy(query.single ? rows[0] || null : rows), error: null };
          };
          return run().then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

function setup(options = {}, owner = "ash", storeOptions = {}) {
  const client = fakeClient(options);
  const controller = new AbortController();
  const cloud = createLabCloud(client, owner, { signal: controller.signal, pageSize: 2 });
  const store = createLabStore(owner, { cloud, controller, ...storeOptions });
  return { client, cloud, store };
}

test("Lab loading reads every ordered page, scoped to owner and live rows, without any writes", async () => {
  const { client, store } = setup({
    notes: [note("c"), note("a"), note("e"), note("d"), note("b"), note("other", "claude"), { ...note("deleted"), deleted_at: "2026-10-10" }],
    items: [item("i")],
  });
  await store.refresh();
  assert.deepEqual(store.getSnapshot().notes.map((row) => row.id), ["a", "b", "c", "d", "e"]);
  assert.equal(store.getSnapshot().items.length, 1);
  assert.equal(store.getSnapshot().loaded, true);
  assert.equal(store.getSnapshot().loading, false);
  assert.ok(client.calls.every((call) => call.operation === "select"));
  const pages = client.calls.filter((call) => call.table === "edu_notes");
  assert.deepEqual(pages.map((call) => call.range), [[0, 1], [2, 3], [4, 5]]);
  for (const call of client.calls) {
    assert.equal(call.filters.user_id, "ash");
    assert.equal(call.nulls.deleted_at, null);
    assert.deepEqual(call.order, { field: "id", ascending: true });
  }
  store.dispose();
});

test("Manual refresh reflects external inserts, edits and soft deletes without saving defaults", async () => {
  const { client, store } = setup({ notes: [note("n")], items: [item("i")] });
  await store.refresh();
  client.tables.edu_notes.push(note("new-kind"));
  client.tables.edu_notes[1].kind = "Claude가 만든 종류";
  Object.assign(client.tables.edu_items[0], { stem: "새 문제", revision: 2 });
  await store.refresh();
  assert.equal(store.getSnapshot().items[0].stem, "새 문제");
  assert.equal(store.getSnapshot().notes.length, 2);
  client.tables.edu_items[0].deleted_at = "2026-10-11";
  client.tables.edu_notes[0].deleted_at = "2026-10-11";
  await store.refresh();
  assert.deepEqual(store.getSnapshot().items, []);
  assert.deepEqual(store.getSnapshot().notes.map((row) => row.kind), ["Claude가 만든 종류"]);
  assert.ok(client.calls.every((call) => call.operation === "select"));
  store.dispose();
});

test("Feedback PATCH uses owner/id/revision CAS and preserves all external content", async () => {
  let raced = false;
  const { client, store } = setup({ items: [item("i")], beforeRequest(query, tables) {
    if (query.operation === "update" && !raced) {
      raced = true;
      Object.assign(tables.edu_items[0], { revision: 2, stem: "Claude의 외부 수정", extra: { newKey: 10 } });
    }
  } });
  await store.refresh();
  const saved = await store.updateItem(store.getSnapshot().items[0], { feedback: "좋아요", status: "approved" });
  assert.equal(saved.revision, 3);
  assert.equal(saved.stem, "Claude의 외부 수정");
  assert.deepEqual(saved.extra, { newKey: 10 });
  assert.equal(saved.feedback, "좋아요");
  const writes = client.calls.filter((call) => call.operation === "update");
  assert.equal(writes.length, 2);
  assert.deepEqual(writes.map((call) => call.filters), [
    { user_id: "ash", id: "i", revision: 1 }, { user_id: "ash", id: "i", revision: 2 },
  ]);
  assert.deepEqual(writes.map((call) => call.patch), [
    { feedback: "좋아요", status: "approved", revision: 2 }, { feedback: "좋아요", status: "approved", revision: 3 },
  ]);
  assert.ok(writes.every((call) => call.nulls.deleted_at === null));
  store.dispose();
});

test("Three-way merge carries a nonoverlapping note edit through a CAS race", async () => {
  let raced = false;
  const { client, store } = setup({ notes: [note("n")], beforeRequest(query, tables) {
    if (query.operation === "update" && !raced) {
      raced = true;
      Object.assign(tables.edu_notes[0], { title: "Claude의 새 제목", revision: 2, related: ["i", "n2"] });
    }
  } });
  await store.refresh();
  const saved = await store.updateNote(store.getSnapshot().notes[0], { body: "애쉬의 보완", title: "n" });
  assert.equal(saved.title, "Claude의 새 제목");
  assert.equal(saved.body, "애쉬의 보완");
  assert.deepEqual(saved.related, ["i", "n2"]);
  const writes = client.calls.filter((call) => call.operation === "update");
  assert.ok(writes.every((call) => !Object.hasOwn(call.patch, "title")));
  assert.deepEqual(saved.extra, { untouched: true });
  store.dispose();
});

test("Overlapping feedback changes reject with both versions and never force overwrite", async () => {
  const { client, store } = setup({ items: [item("i")], beforeRequest(query, tables) {
    if (query.operation === "update") Object.assign(tables.edu_items[0], { feedback: "다른 기기의 의견", revision: 2 });
  } });
  await store.refresh();
  const base = copy(store.getSnapshot().items[0]);
  await assert.rejects(store.updateItem(base, { feedback: "내 입력" }), (error) => {
    assert.equal(error.code, "LAB_CONFLICT");
    assert.equal(error.latest.feedback, "다른 기기의 의견");
    assert.equal(error.draft.feedback, "내 입력");
    assert.equal(error.conflicts[0].path, "/feedback");
    return true;
  });
  assert.equal(client.tables.edu_items[0].feedback, "다른 기기의 의견");
  assert.equal(store.getSnapshot().items[0].feedback, "다른 기기의 의견");
  assert.equal(client.calls.filter((call) => call.operation === "update").length, 1);
  assert.equal(store.getSnapshot().busy, false);
  store.dispose();
});

test("A remotely deleted item stays deleted and its unsaved feedback is recoverable", async () => {
  const { client, store } = setup({ items: [item("i")], beforeRequest(query, tables) {
    if (query.operation === "update") Object.assign(tables.edu_items[0], { deleted_at: "2026-10-11", revision: 2 });
  } });
  await store.refresh();
  await assert.rejects(store.updateItem(store.getSnapshot().items[0], { feedback: "입력 보존" }), (error) => {
    assert.equal(error.code, "LAB_DELETED");
    assert.equal(error.draft.feedback, "입력 보존");
    return true;
  });
  assert.deepEqual(store.getSnapshot().items, []);
  assert.equal(client.calls.filter((call) => call.operation === "update").length, 1);
  store.dispose();
});

test("Disposing an account aborts late reads and prevents publishing them into another account", async () => {
  const started = deferred(), finish = deferred();
  const { client, store } = setup({ notes: [note("old")], beforeRequest: async () => { started.resolve(); await finish.promise; } });
  let notifications = 0;
  store.subscribe(() => { notifications += 1; });
  const reading = store.refresh();
  await started.promise;
  store.dispose();
  const countAtDispose = notifications;
  assert.ok(client.calls.every((call) => call.signal.aborted));
  finish.resolve();
  await assert.rejects(reading, (error) => error.code === "LAB_ACCOUNT_CHANGED");
  assert.equal(notifications, countAtDispose);
  assert.deepEqual(store.getSnapshot().notes, []);
  await assert.rejects(store.updateNote(note("old"), { body: "late" }), (error) => error.code === "LAB_ACCOUNT_CHANGED");
  const next = setup({ notes: [note("old"), note("new", "next")] }, "next");
  await next.store.refresh();
  assert.deepEqual(next.store.getSnapshot().notes.map((row) => row.id), ["new"]);
  next.store.dispose();
});

test("Account disposal between CAS miss and retry prevents the later write", async () => {
  const started = deferred(), finish = deferred();
  const { client, store } = setup({ items: [item("i")], beforeRequest: async (query, tables) => {
    if (query.operation !== "update") return;
    tables.edu_items[0].revision = 2;
    started.resolve();
    await finish.promise;
  } });
  await store.refresh();
  const saving = store.updateItem(store.getSnapshot().items[0], { feedback: "late" });
  await started.promise;
  store.dispose();
  finish.resolve();
  await assert.rejects(saving, (error) => error.code === "LAB_ACCOUNT_CHANGED");
  assert.equal(client.calls.filter((call) => call.operation === "update").length, 1);
  assert.equal(client.tables.edu_items[0].feedback, "");
});

test("App writes reject external-only fields, foreign owners and invalid statuses before networking", async () => {
  const { client, store, cloud } = setup({ items: [item("i")] });
  await store.refresh();
  const base = store.getSnapshot().items[0];
  for (const patch of [{ stem: "forbidden" }, { extra: {} }, { user_id: "next" }, { revision: 100 }, { status: "unknown" }]) {
    await assert.rejects(store.updateItem(base, patch), (error) => error.code === "LAB_PATCH");
  }
  await assert.rejects(store.updateItem(item("i", "other"), { feedback: "no" }), (error) => error.code === "LAB_DATA");
  await assert.rejects(cloud.update("edu_items", "i", 1, { answer: "no" }), (error) => error.code === "LAB_PATCH");
  await assert.rejects(cloud.read("hub_user_data"), (error) => error.code === "LAB_TABLE");
  assert.ok(client.calls.every((call) => call.operation === "select"));
  store.dispose();
});

test("Unchanged feedback is a read-only operation and write gating blocks edits", async () => {
  let allowed = true;
  const { client, store } = setup({ items: [item("i")] }, "ash", { canWrite: () => allowed });
  await store.refresh();
  const row = store.getSnapshot().items[0];
  assert.equal((await store.updateItem(row, { feedback: "" })).revision, 1);
  allowed = false;
  await assert.rejects(store.updateItem(row, { feedback: "blocked" }), (error) => error.code === "LAB_WRITE_BLOCKED");
  assert.ok(client.calls.every((call) => call.operation === "select"));
  store.dispose();
});

test("Saving an unchanged old editor after refresh cannot replace the latest visible row", async () => {
  const { client, store } = setup({ items: [item("i")] });
  await store.refresh();
  const original = copy(store.getSnapshot().items[0]);
  Object.assign(client.tables.edu_items[0], { feedback: "최신 의견", stem: "최신 문제", revision: 2 });
  await store.refresh();
  const saved = await store.updateItem(original, { feedback: "", status: "review" });
  assert.equal(saved.revision, 2);
  assert.equal(store.getSnapshot().items[0].feedback, "최신 의견");
  assert.equal(store.getSnapshot().items[0].stem, "최신 문제");
  assert.ok(client.calls.every((call) => call.operation === "select"));
  store.dispose();
});

test("Refresh and explicit writes are serialized so an old read cannot replace a successful save", async () => {
  const started = deferred(), finish = deferred();
  let wait = true;
  const { client, store } = setup({ items: [item("i")], beforeRequest: async (query) => {
    if (query.table === "edu_items" && query.operation === "select" && wait) {
      wait = false;
      started.resolve();
      await finish.promise;
    }
  } });
  const reading = store.refresh();
  await started.promise;
  const saving = store.updateItem(item("i"), { feedback: "최신 입력" });
  assert.equal(client.calls.filter((call) => call.operation === "update").length, 0);
  finish.resolve();
  await reading;
  await saving;
  await store.refresh();
  assert.equal(store.getSnapshot().items[0].feedback, "최신 입력");
  assert.equal(store.getSnapshot().items[0].revision, 2);
  store.dispose();
});

test("Missing SQL tables expose an actionable error without any initialization writes", async () => {
  const store = createLabStore("ash", { cloud: {
    read: async () => { throw labFailure("PGRST205", "schema cache"); },
    update: () => { assert.fail("load must never write"); },
  } });
  await assert.rejects(store.refresh());
  assert.match(store.getSnapshot().error, /edu_lab\.sql/);
  assert.equal(store.getSnapshot().loaded, false);
  assert.equal(store.getSnapshot().loading, false);
  store.dispose();
});
