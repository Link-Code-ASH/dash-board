import { mergeDashboard } from "../hub/merge.js";

export const accountSnapshotKey = (userId) => `hub-account-base-v1:${userId}`;
export const pendingSnapshotPrefix = (key) => `${key}:pending:`;

export function readStoredSnapshot(storage, key) {
  const raw = storage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

export function sameDashboard(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) return left.length === right.length && left.every((item, index) => sameDashboard(item, right[index]));
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => key === "updatedAt" || sameDashboard(left[key], right[key]));
}

export function mergeAccountSnapshots(snapshot, local, remote) {
  if (!snapshot?.data || typeof snapshot.data !== "object" || Array.isArray(snapshot.data)
    || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) {
    // Without an acknowledged base, an old cache is not evidence of offline edits.
    return {
      data: remote,
      conflicts: sameDashboard(local, remote) ? [] : [{ path: "", kind: "missing-base" }],
    };
  }
  return mergeDashboard(snapshot.data, local, remote);
}

export function nextEditTimestamp(...states) {
  return new Date(Math.max(Date.now(), ...states.map((state) => (Date.parse(state?.updatedAt) || 0) + 1))).toISOString();
}

export function withDashboardLock(name, action, locks = globalThis.navigator?.locks) {
  return locks?.request ? locks.request(name, action) : Promise.resolve().then(action);
}

function pendingSnapshots(storage, key) {
  const prefix = pendingSnapshotPrefix(key);
  return Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((name) => name?.startsWith(prefix)).sort()
    .map((name) => ({ name, raw: storage.getItem(name) }))
    .filter(({ raw }) => raw)
    .map((entry) => ({ ...entry, snapshot: JSON.parse(entry.raw) }));
}

export function readRecoverableSnapshot(storage, key, onConflicts = () => {}) {
  let data = readStoredSnapshot(storage, key);
  for (const { snapshot } of pendingSnapshots(storage, key)) {
    const result = data ? mergeDashboard(snapshot.base, snapshot.data, data) : { data: snapshot.data, conflicts: [] };
    if (result.conflicts.length) onConflicts(result.conflicts);
    data = result.data;
  }
  return data;
}

// Journal before waiting for a lock: closing a window must not discard its edits.
export function stageDashboardSnapshot(storage, key, writerId, base, data) {
  storage.setItem(`${pendingSnapshotPrefix(key)}${writerId}`, JSON.stringify({ base, data }));
}

export function mergeStoredDashboard(storage, key, base, local, remote) {
  const result = remote ? mergeDashboard(base, local, remote) : { data: local, conflicts: [] };
  if (result.conflicts.length) {
    storage.setItem(`${key}:recovery:${Date.now()}:${crypto.randomUUID()}`, JSON.stringify({
      base, local, remote, conflicts: result.conflicts,
    }));
  }
  return result;
}

// Call under the storage-key lock. Keep journals on write failure for recovery.
export function flushDashboardSnapshots(storage, key) {
  const pending = pendingSnapshots(storage, key);
  const current = readStoredSnapshot(storage, key);
  let data = current;
  const conflicts = [];
  for (const { snapshot } of pending) {
    const result = mergeStoredDashboard(storage, key, snapshot.base, snapshot.data, data);
    conflicts.push(...result.conflicts);
    data = result.data;
  }
  if (!data) return { data: null, conflicts };
  if (!sameDashboard(current, data)) data = { ...data, updatedAt: nextEditTimestamp(current, data) };
  if (pending.length || !sameDashboard(current, data)) storage.setItem(key, JSON.stringify(data));
  for (const { name, raw } of pending) {
    if (storage.getItem(name) === raw) storage.removeItem(name);
  }
  return { data, conflicts };
}
