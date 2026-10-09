const flowSources = new Map();
const flowSourceListeners = new Set();
const backupProviders = new Map();

function notifyFlowSources() {
  for (const notify of [...flowSourceListeners]) {
    try { notify(); } catch (error) {
      // Observer errors must not strand a registration or interrupt teardown.
      queueMicrotask(() => { throw error; });
    }
  }
}

function validateRegistration(value, registry, methods) {
  if (!value || typeof value.id !== "string" || !value.id.trim()) {
    throw new TypeError("A non-empty module id is required");
  }
  if (registry.has(value.id)) throw new Error(`Module already registered: ${value.id}`);
  for (const method of methods) {
    if (typeof value[method] !== "function") throw new TypeError(`${value.id}.${method} must be a function`);
  }
}

/** Return a snapshot of registered source facades, in registration order. */
export function getFlowSources() {
  return Object.freeze([...flowSources.values()]);
}

/** Notify listener() synchronously after registry changes; return a teardown. */
export function subscribeFlowSources(listener) {
  if (typeof listener !== "function") throw new TypeError("Registry listener must be a function");
  const notify = () => {
    if (flowSourceListeners.has(notify)) listener();
  };
  flowSourceListeners.add(notify);
  return () => { flowSourceListeners.delete(notify); };
}

/** Register { id, getItems(date), subscribe(cb), openTarget(itemId), execute? }. */
export function registerFlowSource(source) {
  validateRegistration(source, flowSources, ["getItems", "subscribe", "openTarget"]);
  if (source.execute !== undefined && typeof source.execute !== "function") {
    throw new TypeError(`${source.id}.execute must be a function`);
  }
  const id = source.id;
  const getItems = source.getItems.bind(source);
  const subscribe = source.subscribe.bind(source);
  const openTarget = source.openTarget.bind(source);
  const execute = source.execute?.bind(source);
  let active = true;
  const subscriptions = new Set();
  function checkActive() {
    if (!active) throw new Error(`Flow source is unregistered: ${id}`);
  }
  const facade = Object.freeze({
    id,
    getItems(date) { checkActive(); return getItems(date); },
    openTarget(itemId) { checkActive(); return openTarget(itemId); },
    ...(execute ? { execute(itemId, command, payload) { checkActive(); return execute(itemId, command, payload); } } : {}),
    subscribe(callback) {
      checkActive();
      if (typeof callback !== "function") throw new TypeError("Subscription callback must be a function");
      let listening = true;
      let cleanup;
      const stop = () => {
        if (!listening) return;
        listening = false;
        subscriptions.delete(stop);
        cleanup?.();
      };
      subscriptions.add(stop);
      try {
        cleanup = subscribe((...args) => {
          if (active && listening) callback(...args);
        });
        if (typeof cleanup !== "function") throw new TypeError(`${id}.subscribe must return a teardown function`);
        // A synchronous initial notification may have unregistered this source.
        if (!listening) cleanup();
      } catch (error) {
        listening = false;
        subscriptions.delete(stop);
        throw error;
      }
      return stop;
    },
  });
  flowSources.set(id, facade);
  notifyFlowSources();
  return () => {
    if (!active) return;
    active = false;
    flowSources.delete(id);
    const errors = [];
    for (const stop of [...subscriptions]) {
      try { stop(); } catch (error) { errors.push(error); }
    }
    notifyFlowSources();
    if (errors.length) throw new AggregateError(errors, `Subscription teardown failed: ${id}`);
  };
}

/** Register { id, exportBackup(), restoreBackup(payload) }; callbacks may be async. */
export function registerBackupProvider(provider) {
  validateRegistration(provider, backupProviders, ["exportBackup", "restoreBackup"]);
  const id = provider.id;
  backupProviders.set(id, {
    exportBackup: provider.exportBackup.bind(provider),
    restoreBackup: provider.restoreBackup.bind(provider),
  });
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    backupProviders.delete(id);
  };
}

// Validate while copying so unsupported values and properties cannot disappear
// or change meaning when the caller serializes a backup as JSON.
function backupCopy(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || ancestors.has(value)) throw new TypeError("Module backups must contain acyclic JSON values");
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new TypeError("Module backups must contain plain JSON objects");
  }
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === "length") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !descriptor.enumerable || !("value" in descriptor)
      || (Array.isArray(value) && (!Number.isInteger(Number(key)) || Number(key) < 0
        || Number(key) >= value.length || String(Number(key)) !== key))) {
      throw new TypeError("Module backups cannot contain non-JSON properties");
    }
  }
  ancestors.add(value);
  const result = Array.isArray(value)
    ? Array.from(value, (item) => backupCopy(item, ancestors))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, backupCopy(item, ancestors)]));
  ancestors.delete(value);
  return result;
}

export async function exportModuleBackups() {
  const entries = [];
  for (const [id, provider] of [...backupProviders]) {
    entries.push([id, backupCopy(await provider.exportBackup())]);
  }
  return Object.fromEntries(entries);
}

/** Reject unknown modules before any writes. Restore is sequential, not transactional. */
export async function restoreModuleBackups(backups) {
  if (!backups || typeof backups !== "object" || Array.isArray(backups)) {
    throw new TypeError("Module backups must be an object keyed by module id");
  }
  const entries = Object.entries(backupCopy(backups));
  const providers = new Map(backupProviders);
  const unknown = entries.map(([id]) => id).filter((id) => !providers.has(id));
  if (unknown.length) throw new Error(`Unknown backup modules: ${unknown.join(", ")}`);
  const restored = [];
  for (const [id, payload] of entries) {
    try {
      await providers.get(id).restoreBackup(payload);
      restored.push(id);
    } catch (cause) {
      const error = new Error(`Module restore failed: ${id}`, { cause });
      error.moduleId = id;
      error.restored = [...restored];
      throw error;
    }
  }
  return { restored };
}
