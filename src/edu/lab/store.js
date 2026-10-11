import { mergeDashboard } from "../../hub/merge.js";
import { editableLabFields, labFailure, validateLabPatch, validateNewNote } from "./cloud.js";

const clone = (value) => structuredClone(value);
const projection = (row, fields) => Object.fromEntries(fields.filter((field) => Object.hasOwn(row, field)).map((field) => [field, clone(row[field])]));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const message = (error) => {
  if (["PGRST205", "42P01"].includes(error.code)) return "문항 연구소의 테이블이 아직 없습니다. Supabase에서 edu_lab.sql을 먼저 실행해주세요.";
  return error.message || "문항 연구소를 불러오지 못했습니다. 다시 시도해주세요.";
};

/** No defaults, journals, migrations or hub payload writes: loading is read-only. */
export function createLabStore(userId, { cloud, controller = new AbortController(), canWrite = () => true } = {}) {
  let active = true;
  let state = { notes: [], items: [], loading: false, loaded: false, busy: false, error: "" };
  let queue = Promise.resolve();
  let refreshing = null;
  let pendingWrites = 0;
  const listeners = new Set();
  const check = () => {
    if (!active || controller.signal.aborted) throw labFailure("LAB_ACCOUNT_CHANGED", "계정이 변경되어 작업을 중단했습니다.");
    if (!userId || !cloud) throw labFailure("LAB_ACCOUNT", "문항 연구소를 사용하려면 로그인해주세요.");
  };
  const publish = (patch) => {
    if (!active) return;
    state = { ...state, ...patch };
    for (const listener of [...listeners]) listener();
  };
  const enqueue = (work) => {
    const next = queue.then(() => { check(); return work(); });
    queue = next.catch(() => {});
    return next;
  };
  const validateRow = (row) => {
    if (!row || row.user_id !== userId || typeof row.id !== "string" || !row.id
      || !Number.isSafeInteger(row.revision) || row.revision < 1) {
      throw labFailure("LAB_DATA", "문항 연구소의 계정 또는 revision이 올바르지 않습니다.");
    }
    return row;
  };
  const setRow = (table, row, id = row?.id) => {
    const field = table === "edu_notes" ? "notes" : "items";
    const rows = state[field].filter((item) => item.id !== id);
    if (row && !row.deleted_at) rows.push(validateRow(row));
    rows.sort((left, right) => left.id.localeCompare(right.id));
    publish({ [field]: rows });
  };
  const refresh = () => {
    try { check(); } catch (error) { return Promise.reject(error); }
    if (refreshing) return refreshing;
    refreshing = enqueue(async () => {
      publish({ loading: true, error: "" });
      try {
        const [notes, items] = await Promise.all([cloud.read("edu_notes"), cloud.read("edu_items")]);
        check();
        const live = (rows) => rows.map(validateRow).filter((row) => !row.deleted_at);
        publish({ notes: live(notes), items: live(items), loaded: true });
        return state;
      } catch (error) {
        if (active) publish({ error: message(error) });
        throw error;
      } finally {
        if (active) publish({ loading: false });
      }
    }).finally(() => { refreshing = null; });
    return refreshing;
  };
  const update = (table, baseRow, input) => {
    let base, patch;
    try {
      check();
      if (!canWrite()) throw labFailure("LAB_WRITE_BLOCKED", "계정 확인이 끝난 뒤 다시 저장해주세요.");
      base = clone(validateRow(baseRow));
      if (base.deleted_at) throw labFailure("LAB_DELETED", "삭제된 자료는 수정할 수 없습니다.");
      patch = validateLabPatch(table, input);
    } catch (error) { return Promise.reject(error); }
    pendingWrites += 1;
    publish({ busy: true });
    return enqueue(async () => {
      try {
        const fields = editableLabFields(table);
        const before = projection(base, fields);
        const local = { ...before, ...clone(patch) };
        const collection = table === "edu_notes" ? state.notes : state.items;
        const acknowledged = collection.find((row) => row.id === base.id);
        // Refreshing while an editor is open must not let an unchanged save put
        // its old base back into the visible list.
        let remote = acknowledged && acknowledged.revision >= base.revision ? acknowledged : base;
        // Each attempt merges the original edit against the latest acknowledged row.
        // A retry never adopts an overlapping remote change as the edit's new base.
        for (let attempt = 0; attempt < 3; attempt += 1) {
          check();
          if (!canWrite()) throw labFailure("LAB_WRITE_BLOCKED", "계정 확인이 끝난 뒤 다시 저장해주세요.");
          const { data, conflicts } = mergeDashboard(before, local, projection(remote, fields));
          if (conflicts.length) {
            setRow(table, remote);
            throw labFailure("LAB_CONFLICT", "같은 내용을 다른 곳에서 수정했습니다. 입력한 내용을 보관하고 있으니 최신 내용과 비교한 뒤 다시 편집해주세요.", {
              latest: clone(remote), draft: clone(local), conflicts,
            });
          }
          const changes = Object.fromEntries(fields.filter((field) => Object.hasOwn(data, field) && !same(data[field], remote[field])).map((field) => [field, clone(data[field])]));
          if (!Object.keys(changes).length) {
            setRow(table, remote);
            publish({ error: "" });
            return clone(remote);
          }
          try {
            const saved = await cloud.update(table, base.id, remote.revision, changes);
            check();
            validateRow(saved);
            setRow(table, saved);
            publish({ error: "" });
            return clone(saved);
          } catch (error) {
            check();
            if (error.code !== "LAB_CAS_MISS") throw error;
            remote = await cloud.readRow(table, base.id);
            check();
            if (!remote || remote.deleted_at) {
              setRow(table, null, base.id);
              throw labFailure("LAB_DELETED", "다른 곳에서 삭제한 자료입니다. 입력한 내용은 편집창에 남아 있습니다.", { draft: clone(local) });
            }
            validateRow(remote);
          }
        }
        setRow(table, remote);
        throw labFailure("LAB_CONFLICT", "다른 곳에서 계속 수정 중입니다. 입력한 내용을 보관하고 있으니 잠시 후 최신 내용을 확인해주세요.", {
          latest: clone(remote), draft: clone(local), conflicts: [],
        });
      } catch (error) {
        if (active) publish({ error: message(error) });
        throw error;
      }
    }).finally(() => {
      pendingWrites -= 1;
      if (active) publish({ busy: pendingWrites > 0 });
    });
  };
  const write = (work) => {
    try {
      check();
      if (!canWrite()) throw labFailure("LAB_WRITE_BLOCKED", "계정 확인이 끝난 뒤 다시 저장해주세요.");
    } catch (error) { return Promise.reject(error); }
    pendingWrites += 1;
    publish({ busy: true });
    return enqueue(async () => {
      try {
        if (!canWrite()) throw labFailure("LAB_WRITE_BLOCKED", "계정 확인이 끝난 뒤 다시 저장해주세요.");
        const result = await work();
        check();
        publish({ error: "" });
        return result;
      } catch (error) {
        if (active) publish({ error: message(error) });
        throw error;
      }
    }).finally(() => {
      pendingWrites -= 1;
      if (active) publish({ busy: pendingWrites > 0 });
    });
  };
  const createNote = (input) => {
    let note;
    try { note = validateNewNote(input); } catch (error) { return Promise.reject(error); }
    return write(async () => {
      const saved = validateRow(await cloud.insertNote(`principle-${globalThis.crypto.randomUUID()}`, note));
      check();
      setRow("edu_notes", saved);
      return clone(saved);
    });
  };
  // Deleting never retries against a newer row: the person confirms what they saw.
  const remove = (table, baseRow) => {
    let base;
    try { base = clone(validateRow(baseRow)); } catch (error) { return Promise.reject(error); }
    return write(async () => {
      try {
        const saved = await cloud.remove(table, base.id, base.revision);
        check();
        setRow(table, null, base.id);
        return clone(saved);
      } catch (error) {
        if (error.code !== "LAB_CAS_MISS") throw error;
        const latest = await cloud.readRow(table, base.id);
        check();
        setRow(table, latest && !latest.deleted_at ? latest : null, base.id);
        throw labFailure("LAB_CONFLICT", "다른 곳에서 바뀐 기록이라 삭제하지 않았습니다. 최신 내용을 확인한 뒤 다시 삭제해주세요.", { latest: clone(latest) });
      }
    });
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    refresh,
    updateNote: (base, patch) => update("edu_notes", base, patch),
    updateItem: (base, patch) => update("edu_items", base, patch),
    createNote,
    removeNote: (base) => remove("edu_notes", base),
    removeItem: (base) => remove("edu_items", base),
    dispose: () => { active = false; controller.abort(); listeners.clear(); },
  };
}
