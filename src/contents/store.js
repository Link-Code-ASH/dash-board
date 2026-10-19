import { mergeDashboard } from "../hub/merge.js";
import { VERSION, validateItem, validateBackup } from "./model.js";

const clone = (value) => structuredClone(value);
const blank = () => ({ version: VERSION, entries: [], recovery: [] });
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Dependencies are injected so concurrency, storage failures and account disposal
// can be tested without a browser or a real user's cloud data.
export function createContentsStore(owner, { storage, cloud, lock }) {
  let active = true;
  let state = { items: [], ready: false, status: "컬렉션 불러오는 중…", recoveryCount: 0 };
  const listeners = new Set();
  const check = () => { if (!active) throw new Error("계정이 변경되어 작업을 취소했습니다."); };
  const emit = (patch) => {
    if (!active) return;
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const publish = (record, status) => emit({ items: record.entries.map((entry) => entry.item),
    ready: true, recoveryCount: record.recovery.length, status });
  const read = async () => {
    check();
    const record = clone(await storage.read(owner) || blank());
    check();
    if (record.version !== VERSION || !Array.isArray(record.entries) || !Array.isArray(record.recovery))
      throw new Error("Contents 저장 형식을 확인할 수 없습니다. 기존 데이터는 보존됩니다.");
    const normalized = validateBackup({ version: VERSION, items: record.entries.map((entry) => entry.item) });
    for (const [index, entry] of record.entries.entries()) {
      const base = entry.base === null ? null : validateItem(entry.base);
      if (!Number.isInteger(entry.revision) || entry.revision < 0 || typeof entry.dirty !== "boolean" ||
          (entry.revision > 0 && entry.base === null) ||
          (base !== null && base.id !== entry.item.id))
        throw new Error("Contents 동기화 기준이 손상되었습니다. 기존 데이터는 보존됩니다.");
      entry.item = normalized.items[index];
      entry.base = base;
    }
    return clone(record);
  };
  const save = async (record) => { check(); await storage.write(owner, clone(record)); check(); };
  const guarded = async (action) => {
    try { return await lock(owner, async () => { check(); return action(); }); }
    catch (error) { emit({ status: `저장·동기화 확인 필요: ${error.message || "연결 실패"}` }); throw error; }
  };
  const api = {
    getSnapshot: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    dispose: () => { active = false; listeners.clear(); },
    load: () => guarded(async () => {
      const record = await read();
      publish(record, cloud ? "계정 컬렉션 연결 중…" : "이 기기에 저장 · 로그인하면 다른 기기와 함께 볼 수 있습니다.");
    }),
    change: async (id, transform) => (await api.changeMany([{ id, transform }]))[0],
    changeMany: (changes) => guarded(async () => {
      if (!Array.isArray(changes) || changes.some((change) => !change || typeof change.id !== "string" || !change.id || typeof change.transform !== "function") ||
          new Set(changes.map((change) => change.id)).size !== changes.length)
        throw new Error("Contents 변경 목록이 올바르지 않습니다.");
      if (!changes.length) return [];
      const record = await read();
      const items = changes.map(({ id, transform }) => {
        const current = record.entries.find((entry) => entry.item.id === id);
        const item = validateItem(transform(current ? clone(current.item) : null));
        if (item.id !== id) throw new Error("기록 ID가 변경되었습니다.");
        return item;
      });
      for (const item of items) {
        const current = record.entries.find((entry) => entry.item.id === item.id);
        if (current) { current.item = item; current.dirty = true; }
        else record.entries.push({ item, base: null, revision: 0, dirty: true });
      }
      await save(record);
      publish(record, cloud ? "이 기기에 저장됨 · 계정에 전송 대기" : "이 기기에 저장됨");
      return items;
    }),
    sync: () => guarded(async () => {
      if (!cloud) return;
      for (let attempt = 0; attempt < 3; attempt++) {
        let record = await read();
        const rows = await cloud.read();
        check();
        // Validate the entire remote response before touching the local snapshot.
        const remote = rows.map((row) => {
          const item = validateItem(row.payload);
          if (row.item_id !== item.id || !Number.isInteger(row.revision) || row.revision < 1)
            throw new Error("서버의 Contents 형식을 확인할 수 없습니다.");
          return { item, revision: row.revision };
        });
        for (const row of remote) {
          const current = record.entries.find((entry) => entry.item.id === row.item.id);
          if (!current) { record.entries.push({ ...row, base: clone(row.item), dirty: false }); continue; }
          if (current.revision === row.revision) continue;
          if (!current.dirty) { Object.assign(current, row, { base: clone(row.item), dirty: false }); continue; }
          const base = current.base || {};
          const merged = mergeDashboard(base, current.item, row.item);
          if (merged.conflicts.length) record.recovery.push({ at: new Date().toISOString(), reason: "merge",
            base: clone(base), local: clone(current.item), remote: clone(row.item),
            conflicts: JSON.parse(JSON.stringify(merged.conflicts, (_, value) => value === undefined ? { deleted: true } : value)) });
          try { current.item = validateItem(merged.data); }
          catch (error) {
            record.recovery.push({ at: new Date().toISOString(), reason: "invalid-merge", base: clone(base), local: clone(current.item), remote: clone(row.item) });
            await save(record);
            publish(record, "병합을 확인해 주세요. 복구 사본을 내려받을 수 있습니다.");
            throw error;
          }
          current.base = clone(row.item); current.revision = row.revision;
          current.dirty = !equal(current.item, row.item);
        }
        // Recovery copies and merged local data must be durable before cloud writes.
        await save(record);
        publish(record, "계정에 동기화 중…");
        let retry = false;
        for (const entry of record.entries.filter((item) => item.dirty)) {
          check();
          try {
            const revision = await cloud.write(clone(entry.item), entry.revision);
            check();
            entry.revision = revision; entry.base = clone(entry.item); entry.dirty = false;
            await save(record);
          } catch (error) {
            if (error.code === "CONTENTS_CONFLICT") { retry = true; break; }
            throw error;
          }
        }
        if (!retry) {
          publish(record, record.recovery.length ? "동기화됨 · 충돌 복구 사본 있음" : "계정에 동기화됨");
          return;
        }
      }
      throw new Error("다른 기기에서 수정 중입니다. 잠시 후 다시 동기화해 주세요.");
    }),
    exportBackup: () => guarded(async () => {
      const record = await read();
      return { version: VERSION, items: record.entries.map((entry) => entry.item) };
    }),
    exportRecovery: () => guarded(async () => ({ version: VERSION, recovery: (await read()).recovery })),
    restoreBackup: (payload) => guarded(async () => {
      const backup = validateBackup(payload);
      const record = await read();
      record.recovery.push({ at: new Date().toISOString(), reason: "before-restore", items: record.entries.map((entry) => clone(entry.item)) });
      for (const item of backup.items) {
        const entry = record.entries.find((current) => current.item.id === item.id);
        if (entry) { entry.item = item; entry.dirty = true; }
        else record.entries.push({ item, base: null, revision: 0, dirty: true });
      }
      await save(record);
      publish(record, "백업을 복원했습니다. 계정 전송 대기 중입니다.");
    }),
  };
  return api;
}
