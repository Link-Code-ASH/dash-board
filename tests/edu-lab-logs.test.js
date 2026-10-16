import test from "node:test";
import assert from "node:assert/strict";
import { logTime, readLabLogs } from "../src/edu/lab/logs.js";

function fakeClient(result) {
  const calls = [];
  return {
    calls,
    from(table) {
      const query = { table, filters: {} };
      const builder = {
        select(columns) { query.columns = columns; return builder; },
        eq(field, value) { query.filters[field] = value; return builder; },
        order(field, options) { query.order = { field, ...options }; return builder; },
        limit(count) { query.limit = count; return builder; },
        insert() { throw new Error("logs must stay read-only"); },
        update() { throw new Error("logs must stay read-only"); },
        abortSignal() { calls.push(query); return Promise.resolve(result); },
      };
      return builder;
    },
  };
}

test("reads only the signed-in account's newest log rows", async () => {
  const client = fakeClient({ data: [{ id: "log-1", ran_at: "2026-10-18T19:00:00Z", title: "정기 점검", body: "처리할 문항 없음" }], error: null });
  const rows = await readLabLogs(client, "ash", { limit: 5 });
  assert.equal(rows.length, 1);
  assert.deepEqual(client.calls[0].filters, { user_id: "ash" });
  assert.equal(client.calls[0].table, "edu_lab_logs");
  assert.deepEqual(client.calls[0].order, { field: "ran_at", ascending: false });
  assert.equal(client.calls[0].limit, 5);
});

test("a missing log table is reported without breaking the Lab", async () => {
  await assert.rejects(readLabLogs(fakeClient({ data: null, error: { code: "PGRST205", message: "missing" } }), "ash"), { code: "LAB_LOGS_MISSING" });
  await assert.rejects(readLabLogs(fakeClient({ data: [], error: null }), null), { code: "LAB_ACCOUNT" });
});

test("log times are shown in Seoul time", () => {
  assert.match(logTime("2026-10-18T19:00:00Z"), /10월 19일.*04:00/);
  assert.equal(logTime("not a date"), "");
});
