import { mergeDashboard } from "../hub/merge.js";
import { VERSION, emptyDeck, validateDeck, validateBackup } from "./model.js";

const clone = (value) => structuredClone(value);
const blank = () => ({ version: VERSION, entries: [], recovery: [] });
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Dependencies are injected so concurrency, storage failures and account disposal
// can be tested without a browser or a real user's cloud data.
export function createLingoStore(owner, { storage, cloud, lock }) {
  let active = true;
  let state = { decks: [], ready: false, status: "단어장 불러오는 중…", recoveryCount: 0 };
  const listeners = new Set();
  const check = () => { if (!active) throw new Error("계정이 변경되어 작업을 취소했습니다."); };
  const emit = (patch) => {
    if (!active) return;
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const publish = (record, status) => emit({ decks: record.entries.map((entry) => entry.deck),
    ready: true, recoveryCount: record.recovery.length, status });
  const read = async () => {
    check();
    const record = await storage.read(owner) || blank();
    check();
    if (record.version !== VERSION || !Array.isArray(record.entries) || !Array.isArray(record.recovery))
      throw new Error("Lingo 저장 형식을 확인할 수 없습니다. 기존 데이터는 보존됩니다.");
    validateBackup({ version: VERSION, decks: record.entries.map((entry) => entry.deck) });
    for (const entry of record.entries) {
      if (!Number.isInteger(entry.revision) || entry.revision < 0 || typeof entry.dirty !== "boolean" ||
          (entry.revision > 0 && entry.base === null) ||
          (entry.base !== null && validateDeck(entry.base).id !== entry.deck.id))
        throw new Error("Lingo 동기화 기준이 손상되었습니다. 기존 데이터는 보존됩니다.");
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
      publish(record, cloud ? "계정 단어장 연결 중…" : "이 기기에 저장 · 로그인하면 계정 단어장을 사용할 수 있습니다.");
    }),
    change: (id, transform) => guarded(async () => {
      const record = await read();
      const current = record.entries.find((entry) => entry.deck.id === id);
      const deck = validateDeck(transform(current ? clone(current.deck) : null));
      if (deck.id !== id) throw new Error("단어장 ID가 변경되었습니다.");
      if (current) { current.deck = deck; current.dirty = true; }
      else record.entries.push({ deck, base: null, revision: 0, dirty: true });
      await save(record);
      publish(record, cloud ? "이 기기에 저장됨 · 계정에 전송 대기" : "이 기기에 저장됨");
      return deck;
    }),
    sync: () => guarded(async () => {
      if (!cloud) return;
      for (let attempt = 0; attempt < 3; attempt++) {
        let record = await read();
        const rows = await cloud.read();
        check();
        // Validate the entire remote response before touching the local snapshot.
        const remote = rows.map((row) => {
          const deck = validateDeck(row.payload);
          if (row.deck_id !== deck.id || !Number.isInteger(row.revision) || row.revision < 1)
            throw new Error("서버의 단어장 형식을 확인할 수 없습니다.");
          return { deck, revision: row.revision };
        });
        for (const row of remote) {
          const current = record.entries.find((entry) => entry.deck.id === row.deck.id);
          if (!current) { record.entries.push({ ...row, base: clone(row.deck), dirty: false }); continue; }
          if (current.revision === row.revision) continue;
          if (!current.dirty) { Object.assign(current, row, { base: clone(row.deck), dirty: false }); continue; }
          const base = current.base || emptyDeck(current.deck.name, current.deck.id);
          const merged = mergeDashboard(base, current.deck, row.deck);
          if (merged.conflicts.length) record.recovery.push({ at: new Date().toISOString(), reason: "merge",
            base: clone(base), local: clone(current.deck), remote: clone(row.deck),
            conflicts: JSON.parse(JSON.stringify(merged.conflicts, (_, value) => value === undefined ? { deleted: true } : value)) });
          try { current.deck = validateDeck(merged.data); }
          catch (error) {
            record.recovery.push({ at: new Date().toISOString(), reason: "invalid-merge", base: clone(base), local: clone(current.deck), remote: clone(row.deck) });
            await save(record);
            publish(record, "병합을 확인해 주세요. 복구 사본을 내려받을 수 있습니다.");
            throw error;
          }
          current.base = clone(row.deck); current.revision = row.revision;
          current.dirty = !equal(current.deck, row.deck);
        }
        // Recovery copies and merged local data must be durable before cloud writes.
        await save(record);
        publish(record, "계정에 동기화 중…");
        let retry = false;
        for (const entry of record.entries.filter((item) => item.dirty)) {
          check();
          try {
            const revision = await cloud.write(clone(entry.deck), entry.revision);
            check();
            entry.revision = revision; entry.base = clone(entry.deck); entry.dirty = false;
            await save(record);
          } catch (error) {
            if (error.code === "LINGO_CONFLICT") { retry = true; break; }
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
      return { version: VERSION, decks: record.entries.map((entry) => entry.deck) };
    }),
    exportRecovery: () => guarded(async () => ({ version: VERSION, recovery: (await read()).recovery })),
    restoreBackup: (payload) => guarded(async () => {
      const backup = validateBackup(payload);
      const record = await read();
      record.recovery.push({ at: new Date().toISOString(), reason: "before-restore", decks: record.entries.map((entry) => clone(entry.deck)) });
      for (const deck of backup.decks) {
        const entry = record.entries.find((item) => item.deck.id === deck.id);
        if (entry) { entry.deck = deck; entry.dirty = true; }
        else record.entries.push({ deck, base: null, revision: 0, dirty: true });
      }
      await save(record);
      publish(record, "백업을 복원했습니다. 계정 전송 대기 중입니다.");
    }),
  };
  return api;
}
