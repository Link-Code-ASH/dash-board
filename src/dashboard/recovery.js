import { ACCOUNT_RECOVERY_PREFIX, STORAGE_KEY, accountCacheKey } from "./model.js";

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function describeKey(key, userId) {
  if (typeof key !== "string") return null;
  const scopes = [{ prefix: `${STORAGE_KEY}:recovery:`, source: "same-origin", userId: null }];
  if (userId) scopes.push(
    { prefix: `${accountCacheKey(userId)}:recovery:`, source: "same-origin", userId },
    { prefix: `${ACCOUNT_RECOVERY_PREFIX}${userId}:`, source: "account-draft", userId },
  );
  const scope = scopes.find(({ prefix }) => key.startsWith(prefix));
  if (!scope) return null;
  const match = key.slice(scope.prefix.length).match(/^(\d+)(?::(local|remote))?(?::[^:]+)?$/);
  if (!match) return null;
  const timestamp = Number(match[1]);
  if (!Number.isFinite(timestamp) || Number.isNaN(new Date(timestamp).getTime())) return null;
  return { key, source: scope.source, userId: scope.userId, createdAt: new Date(timestamp).toISOString(), side: match[2] || "local" };
}

function availableVersions(description, saved) {
  if (!isRecord(saved)) return [];
  if (description.source === "account-draft") return [description.side];
  return ["local", "remote"].filter((version) => Object.prototype.hasOwnProperty.call(saved, version) && isRecord(saved[version]));
}

export function listRecoverySnapshots(storage, userId = null) {
  const recoveries = [];
  for (let index = 0; index < storage.length; index += 1) {
    const description = describeKey(storage.key(index), userId);
    if (!description) continue;
    try {
      const saved = JSON.parse(storage.getItem(description.key));
      const versions = availableVersions(description, saved);
      if (!versions.length) continue;
      const { side, ...metadata } = description;
      recoveries.push({ ...metadata, versions, conflictCount: description.source === "same-origin" && Array.isArray(saved.conflicts) ? saved.conflicts.length : 0 });
    } catch {
      // A damaged entry must not hide other recoverable snapshots.
    }
  }
  return recoveries.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.key.localeCompare(left.key));
}

export function readRecoverySnapshot(storage, userId, key, version = "local") {
  if (version !== "local" && version !== "remote") throw new Error("Recovery version must be local or remote.");
  const description = describeKey(key, userId);
  if (!description) throw new Error("Recovery is outside the current workspace or account.");
  const saved = JSON.parse(storage.getItem(key));
  if (!availableVersions(description, saved).includes(version)) throw new Error("This recovery version is unavailable.");
  return description.source === "account-draft" ? saved : saved[version];
}
