import React, { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "routine-scoreboard-clean-v1";
const SYNC_BACKEND_KEY = "dashboard-sync-backend-v1";
const SYNC_ID_KEY = `${SYNC_BACKEND_KEY}:sync-id`;
const SYNC_PIN_KEY = `${SYNC_BACKEND_KEY}:pin`;
const SYNC_REMEMBER_KEY = `${SYNC_BACKEND_KEY}:remember-device`;
const SYNC_KDF_ITERATIONS = 250000;

const h = React.createElement;

const weekDays = [
  { key: "mon", label: "Mon", full: "Monday" },
  { key: "tue", label: "Tue", full: "Tuesday" },
  { key: "wed", label: "Wed", full: "Wednesday" },
  { key: "thu", label: "Thu", full: "Thursday" },
  { key: "fri", label: "Fri", full: "Friday" },
  { key: "sat", label: "Sat", full: "Saturday" },
  { key: "sun", label: "Sun", full: "Sunday" },
];

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const defaultCategories = [
  { key: "books", label: "Books", yScore: 6, nScore: -3 },
  { key: "sports", label: "Sports", yScore: 5, nScore: -2 },
  { key: "content", label: "Content", yScore: 4, nScore: -2 },
  { key: "gr", label: "GR", yScore: 5, nScore: -2 },
];

const defaultPresets = [
  { key: "daily-exercise", name: "Exercise", yScore: 10, nScore: -4 },
  { key: "daily-reading", name: "Reading", yScore: 6, nScore: -3 },
  { key: "daily-focus", name: "Deep Work", yScore: 8, nScore: -4 },
  { key: "daily-sleep", name: "Enough Sleep", yScore: 7, nScore: -4 },
  { key: "daily-late-snack", name: "No Late Snack", yScore: 4, nScore: -8 },
  { key: "daily-scroll", name: "Less Scrolling", yScore: 4, nScore: -5 },
  { key: "daily-delay", name: "No Procrastination", yScore: 5, nScore: -7 },
  { key: "daily-late-sleep", name: "Late Sleep", yScore: -6, nScore: 3 },
];

function cloneCategories() {
  return defaultCategories.map((category) => ({ ...category }));
}

function clonePresets() {
  return defaultPresets.map((preset) => ({ ...preset }));
}

function parseScore(value, fallback) {
  const score = Number(value);
  return Number.isFinite(score) ? score : fallback;
}

function createEmptyWeeklyPlan(categories = defaultCategories) {
  return categories.reduce((plan, category) => {
    plan[category.key] = weekDays.reduce((days, day) => {
      days[day.key] = "";
      return days;
    }, {});
    return plan;
  }, {});
}

function normalizeCategories(savedCategories, fallbackCategories = cloneCategories()) {
  const source = Array.isArray(savedCategories) && savedCategories.length ? savedCategories : fallbackCategories;
  return source
    .filter((category) => category && category.key && category.label)
    .map((category) => ({
      key: category.key,
      label: category.label,
      yScore: parseScore(category.yScore, 5),
      nScore: parseScore(category.nScore, -2),
    }));
}

function normalizePresets(savedPresets) {
  const source = Array.isArray(savedPresets) && savedPresets.length ? savedPresets : clonePresets();
  return source
    .filter((preset) => preset && preset.key && preset.name)
    .map((preset) => ({
      key: preset.key,
      name: preset.name,
      yScore: parseScore(preset.yScore, 5),
      nScore: parseScore(preset.nScore, -2),
    }));
}

function normalizeWeeklyPlan(plan, categories) {
  const normalized = createEmptyWeeklyPlan(categories);
  categories.forEach((category) => {
    weekDays.forEach((day) => {
      normalized[category.key][day.key] = plan?.[category.key]?.[day.key] || "";
    });
  });
  return normalized;
}

function createFallbackState() {
  const categories = cloneCategories();
  return {
    days: {},
    memos: { global: { life: "", school: "" }, threeM: "" },
    calendar: {},
    presets: clonePresets(),
    categories,
    weeklyPlan: createEmptyWeeklyPlan(categories),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeState(source) {
  const fallback = createFallbackState();
  const categories = normalizeCategories(source?.categories, fallback.categories);
  return {
    days: source?.days && typeof source.days === "object" ? source.days : {},
    memos: source?.memos && typeof source.memos === "object" ? source.memos : fallback.memos,
    calendar: source?.calendar && typeof source.calendar === "object" ? source.calendar : {},
    presets: normalizePresets(source?.presets),
    categories,
    weeklyPlan: normalizeWeeklyPlan(source?.weeklyPlan, categories),
    updatedAt: source?.updatedAt || new Date().toISOString(),
  };
}

function loadState() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return createFallbackState();
  }
}

function loadSyncBackend() {
  try {
    const saved = JSON.parse(localStorage.getItem(SYNC_BACKEND_KEY));
    return {
      supabaseUrl: saved?.supabaseUrl || "",
      supabaseAnonKey: saved?.supabaseAnonKey || "",
    };
  } catch {
    return { supabaseUrl: "", supabaseAnonKey: "" };
  }
}

function toDateKey(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatDayLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
  return `${month} ${date.getDate()} (${weekday})`;
}

function formatScore(score) {
  return score > 0 ? `+${score}` : String(score);
}

function getWeekdayKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return weekDays[(date.getDay() + 6) % 7].key;
}

function getWeekdayMeta(dateKey) {
  return weekDays.find((day) => day.key === getWeekdayKey(dateKey));
}

function createKey(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function encodeBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function hashText(value) {
  return encodeBase64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function deriveSyncKey(syncId, pin) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(`dash-board-sync:${syncId}`),
      iterations: SYNC_KDF_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function createSyncDocId(syncId, pin) {
  return (await hashText(`dash-board-doc:${syncId}:${pin}`)).slice(0, 48);
}

function generateSyncIdValue() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join("").replace(/(.{4})/g, "$1-").replace(/-$/, "");
}

function normalizeSyncId(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(.{4})/g, "$1-").replace(/-$/, "");
}

function panelClickIsInteractive(target) {
  return Boolean(target.closest("button, input, textarea, select, label, a, summary, details, .no-panel-toggle"));
}

function CollapsiblePanel({ children, className, controls, description, isOpen, onToggle, title }) {
  const handleClick = (event) => {
    if (panelClickIsInteractive(event.target)) return;
    onToggle();
  };
  const handleKeyDown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onToggle();
  };
  return h(
    "section",
    { className: `${className} collapsible-panel ${isOpen ? "" : "collapsed"}`, onClick: handleClick },
    h(
      "div",
      {
        className: "section-heading toggle-heading",
        role: "button",
        tabIndex: 0,
        "aria-controls": controls,
        "aria-expanded": String(isOpen),
        onKeyDown: handleKeyDown,
      },
      h("div", null, h("h2", null, title), description ? h("p", null, description) : null),
      children?.actions ? h("div", { className: "heading-actions" }, children.actions) : null,
    ),
    children?.body,
  );
}

function App() {
  const [data, setData] = useState(loadState);
  const [activeView, setActiveView] = useState("dashboard");
  const [selectedDate, setSelectedDate] = useState(toDateKey(new Date()));
  const [openPanels, setOpenPanels] = useState({
    sync: false,
    threeM: false,
    daily: false,
    weekly: false,
    record: false,
    calendar: false,
  });
  const [openMonths, setOpenMonths] = useState(() => new Set([new Date().getMonth()]));
  const [sync, setSync] = useState({
    backend: loadSyncBackend(),
    pin: localStorage.getItem(SYNC_REMEMBER_KEY) === "true" ? localStorage.getItem(SYNC_PIN_KEY) || "" : "",
    rememberDevice: localStorage.getItem(SYNC_REMEMBER_KEY) === "true",
    syncId: localStorage.getItem(SYNC_ID_KEY) || "",
    busy: false,
    status: localStorage.getItem(SYNC_REMEMBER_KEY) === "true" ? "Ready to auto connect." : "Not connected.",
  });

  const dataRef = useRef(data);
  const syncRef = useRef(sync);
  const pushTimerRef = useRef(null);
  const pollTimerRef = useRef(null);
  const autoConnectRef = useRef(false);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  const saveData = (updater, options = {}) => {
    setData((current) => {
      const next = typeof updater === "function" ? updater(JSON.parse(JSON.stringify(current))) : updater;
      const normalized = normalizeState({ ...next, updatedAt: new Date().toISOString() });
      dataRef.current = normalized;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      if (!options.skipSync) scheduleAutoSync();
      return normalized;
    });
  };

  const updateSync = (updater) => {
    setSync((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      syncRef.current = next;
      return next;
    });
  };

  const setSyncStatus = (status) => {
    updateSync((current) => ({ ...current, status }));
  };

  const syncBackendReady = () => {
    const { backend } = syncRef.current;
    return Boolean(backend.supabaseUrl && backend.supabaseAnonKey);
  };

  const syncIdentityReady = () => Boolean(syncRef.current.syncId && syncRef.current.pin);

  const getSupabaseBaseUrl = () => syncRef.current.backend.supabaseUrl.replace(/\/+$/, "");

  const encryptSyncPayload = async () => {
    const { syncId, pin } = syncRef.current;
    const key = await deriveSyncKey(syncId, pin);
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const state = dataRef.current;
    const body = JSON.stringify({ version: 1, state });
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(body));
    return {
      version: 1,
      cipher: "AES-GCM",
      kdf: "PBKDF2-SHA256",
      iterations: SYNC_KDF_ITERATIONS,
      updatedAt: state.updatedAt,
      iv: encodeBase64Url(iv),
      data: encodeBase64Url(encrypted),
    };
  };

  const decryptSyncPayload = async (payload) => {
    const { syncId, pin } = syncRef.current;
    const key = await deriveSyncKey(syncId, pin);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(decodeBase64Url(payload.iv)) },
      key,
      decodeBase64Url(payload.data),
    );
    return JSON.parse(new TextDecoder().decode(decrypted)).state;
  };

  const fetchRemoteSyncDoc = async (docId) => {
    const { backend } = syncRef.current;
    const response = await fetch(`${getSupabaseBaseUrl()}/rest/v1/rpc/get_dashboard_sync`, {
      method: "POST",
      headers: {
        apikey: backend.supabaseAnonKey,
        Authorization: `Bearer ${backend.supabaseAnonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_doc_id: docId }),
    });
    if (!response.ok) throw new Error(`Pull failed (${response.status})`);
    const rows = await response.json();
    return rows[0] || null;
  };

  const upsertRemoteSyncDoc = async (docId, payload) => {
    const { backend } = syncRef.current;
    const response = await fetch(`${getSupabaseBaseUrl()}/rest/v1/rpc/upsert_dashboard_sync`, {
      method: "POST",
      headers: {
        apikey: backend.supabaseAnonKey,
        Authorization: `Bearer ${backend.supabaseAnonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_doc_id: docId, p_payload: payload }),
    });
    if (!response.ok) throw new Error(`Push failed (${response.status})`);
  };

  const pushSyncData = async ({ silent = false } = {}) => {
    if (!syncBackendReady() || !syncIdentityReady()) {
      if (!silent) setSyncStatus("Enter Supabase URL, Public Key, Sync ID, and PIN first.");
      return;
    }
    updateSync((current) => ({ ...current, busy: true, status: silent ? current.status : "Encrypting and pushing..." }));
    try {
      const docId = await createSyncDocId(syncRef.current.syncId, syncRef.current.pin);
      const payload = await encryptSyncPayload();
      await upsertRemoteSyncDoc(docId, payload);
      setSyncStatus(`Synced at ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`);
    } catch (error) {
      setSyncStatus(error.message || "Sync push failed.");
    } finally {
      updateSync((current) => ({ ...current, busy: false }));
    }
  };

  const pullSyncData = async ({ silent = false, force = true } = {}) => {
    if (!syncBackendReady() || !syncIdentityReady()) {
      if (!silent) setSyncStatus("Enter Supabase URL, Public Key, Sync ID, and PIN first.");
      return false;
    }
    updateSync((current) => ({ ...current, busy: true, status: silent ? current.status : "Pulling and decrypting..." }));
    try {
      const docId = await createSyncDocId(syncRef.current.syncId, syncRef.current.pin);
      const row = await fetchRemoteSyncDoc(docId);
      if (!row) {
        if (!silent) setSyncStatus("No cloud data yet. Push this device to create it.");
        return false;
      }
      const remoteUpdatedAt = row.payload?.updatedAt || row.updated_at || "";
      if (!force && remoteUpdatedAt && dataRef.current.updatedAt && remoteUpdatedAt <= dataRef.current.updatedAt) {
        if (!silent) setSyncStatus("Already up to date.");
        return false;
      }
      const remoteState = await decryptSyncPayload(row.payload);
      const normalized = normalizeState(remoteState);
      dataRef.current = normalized;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      setData(normalized);
      setSyncStatus(`Pulled at ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`);
      return true;
    } catch {
      setSyncStatus("Pull failed. Check Supabase setup, Sync ID, and PIN.");
      return false;
    } finally {
      updateSync((current) => ({ ...current, busy: false }));
    }
  };

  const scheduleAutoSync = () => {
    if (!syncBackendReady() || !syncIdentityReady() || syncRef.current.busy) return;
    window.clearTimeout(pushTimerRef.current);
    pushTimerRef.current = window.setTimeout(() => {
      pushTimerRef.current = null;
      pushSyncData({ silent: true });
    }, 1400);
  };

  const startAutoSyncPolling = () => {
    window.clearInterval(pollTimerRef.current);
    if (!syncBackendReady() || !syncIdentityReady()) return;
    pollTimerRef.current = window.setInterval(() => {
      const active = document.activeElement;
      const isEditing = active?.matches?.("input, textarea, select");
      if (syncRef.current.busy || pushTimerRef.current || isEditing) return;
      pullSyncData({ silent: true, force: false });
    }, 10000);
  };

  useEffect(() => {
    startAutoSyncPolling();
    return () => {
      window.clearTimeout(pushTimerRef.current);
      window.clearInterval(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    document.querySelectorAll(".collapsible-panel, .schedule-panel, .score-meter, .score-details > div, .today-plan-card, .preset-card, .entry-item, .calendar-month, .calendar-day").forEach((element) => {
      if (element.dataset.glowReady) return;
      element.dataset.glowReady = "true";
      element.addEventListener("pointermove", (event) => {
        const rect = element.getBoundingClientRect();
        element.style.setProperty("--glow-x", `${event.clientX - rect.left}px`);
        element.style.setProperty("--glow-y", `${event.clientY - rect.top}px`);
      });
    });
  });

  const entries = data.days[selectedDate] || [];
  const memo = data.memos.global || { life: "", school: "" };
  const weekday = getWeekdayMeta(selectedDate);

  const getEntries = (dateKey = selectedDate) => (Array.isArray(data.days[dateKey]) ? data.days[dateKey] : []);
  const getDayTotal = (dateKey) => getEntries(dateKey).reduce((sum, entry) => sum + entry.score, 0);
  const getCarryTotal = () =>
    Object.entries(data.days).reduce((sum, [key, dayEntries]) => {
      if (key >= selectedDate || !Array.isArray(dayEntries)) return sum;
      return sum + dayEntries.reduce((daySum, entry) => daySum + entry.score, 0);
    }, 0);

  const scoreInfo = useMemo(() => {
    const plus = entries.filter((entry) => entry.score > 0).reduce((sum, entry) => sum + entry.score, 0);
    const minus = entries.filter((entry) => entry.score < 0).reduce((sum, entry) => sum + entry.score, 0);
    const carry = getCarryTotal();
    const total = carry + plus + minus;
    return { carry, plus, minus, total };
  }, [data, selectedDate]);

  const togglePanel = (key) => {
    setOpenPanels((current) => ({ ...current, [key]: !current[key] }));
  };

  const shiftDate = (days) => {
    const date = new Date(`${selectedDate}T00:00:00`);
    date.setDate(date.getDate() + days);
    setSelectedDate(toDateKey(date));
  };

  const toggleChoice = ({ planKey, choice, name, score }) => {
    saveData((draft) => {
      const currentEntries = Array.isArray(draft.days[selectedDate]) ? draft.days[selectedDate] : [];
      const existing = currentEntries.find((entry) => entry.planKey === planKey);
      if (existing?.choice === choice) {
        draft.days[selectedDate] = currentEntries.filter((entry) => entry.id !== existing.id);
      } else {
        draft.days[selectedDate] = currentEntries.filter((entry) => entry.planKey !== planKey);
        draft.days[selectedDate].push({
          id: crypto.randomUUID(),
          name,
          score,
          createdAt: new Date().toISOString(),
          planKey,
          choice,
        });
      }
      return draft;
    });
  };

  const removeEntry = (id) => {
    saveData((draft) => {
      draft.days[selectedDate] = getEntries().filter((entry) => entry.id !== id);
      return draft;
    });
  };

  const clearSelectedDay = () => {
    saveData((draft) => {
      draft.days[selectedDate] = [];
      return draft;
    });
  };

  const updateMemo = (field, value) => {
    saveData((draft) => {
      draft.memos.global = draft.memos.global || { life: "", school: "" };
      draft.memos.global[field] = value;
      return draft;
    });
  };

  const updateThreeM = (value) => {
    saveData((draft) => {
      draft.memos.threeM = value;
      return draft;
    });
  };

  const addPreset = () => {
    saveData((draft) => {
      draft.presets.push({ key: createKey("daily"), name: `New Record ${draft.presets.length + 1}`, yScore: 5, nScore: -2 });
      return draft;
    });
  };

  const updatePreset = (index, field, value) => {
    saveData((draft) => {
      const preset = draft.presets[index];
      if (!preset) return draft;
      if (field === "name") preset.name = value.trim() || preset.name;
      if (field === "yScore") preset.yScore = parseScore(value, preset.yScore);
      if (field === "nScore") preset.nScore = parseScore(value, preset.nScore);
      return draft;
    });
  };

  const movePreset = (index, direction) => {
    saveData((draft) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= draft.presets.length) return draft;
      const [preset] = draft.presets.splice(index, 1);
      draft.presets.splice(nextIndex, 0, preset);
      return draft;
    });
  };

  const removePreset = (index) => {
    saveData((draft) => {
      draft.presets.splice(index, 1);
      return draft;
    });
  };

  const addCategory = () => {
    saveData((draft) => {
      const category = { key: createKey("cat"), label: `New Category ${draft.categories.length + 1}`, yScore: 5, nScore: -2 };
      draft.categories.push(category);
      draft.weeklyPlan[category.key] = createEmptyWeeklyPlan([category])[category.key];
      return draft;
    });
  };

  const updateCategory = (key, field, value) => {
    saveData((draft) => {
      const category = draft.categories.find((item) => item.key === key);
      if (!category) return draft;
      if (field === "label") category.label = value.trim() || category.label;
      if (field === "yScore") category.yScore = parseScore(value, category.yScore);
      if (field === "nScore") category.nScore = parseScore(value, category.nScore);
      return draft;
    });
  };

  const moveCategory = (key, direction) => {
    saveData((draft) => {
      const index = draft.categories.findIndex((category) => category.key === key);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= draft.categories.length) return draft;
      const [category] = draft.categories.splice(index, 1);
      draft.categories.splice(nextIndex, 0, category);
      return draft;
    });
  };

  const removeCategory = (key) => {
    saveData((draft) => {
      if (draft.categories.length <= 1) return draft;
      draft.categories = draft.categories.filter((category) => category.key !== key);
      delete draft.weeklyPlan[key];
      return draft;
    });
  };

  const updateWeeklyPlan = (categoryKey, dayKey, value) => {
    saveData((draft) => {
      if (!draft.weeklyPlan[categoryKey]) draft.weeklyPlan[categoryKey] = createEmptyWeeklyPlan([{ key: categoryKey }])[categoryKey];
      draft.weeklyPlan[categoryKey][dayKey] = value;
      return draft;
    });
  };

  const updateCalendarNote = (dateKey, value) => {
    saveData((draft) => {
      const note = value.replace(/\r\n/g, "\n");
      if (note) draft.calendar[dateKey] = note;
      else delete draft.calendar[dateKey];
      return draft;
    });
  };

  const connectSync = async () => {
    const nextSyncId = normalizeSyncId(syncRef.current.syncId);
    updateSync((current) => ({ ...current, syncId: nextSyncId }));
    localStorage.setItem(SYNC_BACKEND_KEY, JSON.stringify(syncRef.current.backend));
    localStorage.setItem(SYNC_ID_KEY, nextSyncId);
    if (!syncBackendReady()) {
      setSyncStatus("Enter Supabase URL and Public Key.");
      return;
    }
    if (!syncIdentityReady()) {
      setSyncStatus("Enter Sync ID and PIN.");
      return;
    }
    if (syncRef.current.rememberDevice) {
      localStorage.setItem(SYNC_REMEMBER_KEY, "true");
      localStorage.setItem(SYNC_PIN_KEY, syncRef.current.pin);
    } else {
      localStorage.removeItem(SYNC_REMEMBER_KEY);
      localStorage.removeItem(SYNC_PIN_KEY);
    }
    startAutoSyncPolling();
    const pulled = await pullSyncData({ force: true });
    if (!pulled) await pushSyncData();
  };

  useEffect(() => {
    if (autoConnectRef.current) return;
    if (!sync.rememberDevice || !sync.backend.supabaseUrl || !sync.backend.supabaseAnonKey || !sync.syncId || !sync.pin) return;
    autoConnectRef.current = true;
    setSyncStatus("Auto connecting...");
    connectSync();
  }, []);

  const forgetThisDevice = () => {
    const confirmed = window.confirm(
      "This will remove local app data, Sync ID, saved PIN, Supabase URL, and public key from this browser only. Cloud data will not be deleted. Continue?",
    );
    if (!confirmed) return;
    window.clearTimeout(pushTimerRef.current);
    window.clearInterval(pollTimerRef.current);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SYNC_BACKEND_KEY);
    localStorage.removeItem(SYNC_ID_KEY);
    localStorage.removeItem(SYNC_PIN_KEY);
    localStorage.removeItem(SYNC_REMEMBER_KEY);
    window.location.reload();
  };

  return h(
    "main",
    { className: "app-shell" },
    h(AppNavigation, { activeView, setActiveView }),
    activeView === "dashboard"
      ? h(
          React.Fragment,
          null,
          h(Topbar, { selectedDate, setSelectedDate, shiftDate }),
    h(
      "div",
      { className: "daily-workspace" },
      h(
        "div",
        { className: "daily-left-rail" },
        h(SchedulePanel, { calendar: data.calendar, selectedDate }),
        h(ScorePanel, { entryCount: entries.length, scoreInfo }),
      ),
      h(MemoPanel, { memo, updateMemo }),
    ),
    h(TodayPlanPanel, {
      categories: data.categories,
      entries,
      presets: data.presets,
      selectedDate,
      weekday,
      weeklyPlan: data.weeklyPlan,
      toggleChoice,
    }),
    h(ThreeMPanel, {
      isOpen: openPanels.threeM,
      onToggle: () => togglePanel("threeM"),
      value: data.memos.threeM || "",
      updateThreeM,
    }),
    h(DailyPanel, {
      addPreset,
      isOpen: openPanels.daily,
      movePreset,
      onToggle: () => togglePanel("daily"),
      presets: data.presets,
      removePreset,
      updatePreset,
    }),
    h(WeeklyPanel, {
      addCategory,
      categories: data.categories,
      isOpen: openPanels.weekly,
      moveCategory,
      onToggle: () => togglePanel("weekly"),
      removeCategory,
      selectedDate,
      updateCategory,
      updateWeeklyPlan,
      weeklyPlan: data.weeklyPlan,
    }),
    h(CalendarPanel, {
      calendar: data.calendar,
      isOpen: openPanels.calendar,
      onToggle: () => togglePanel("calendar"),
      openMonths,
      selectedDate,
      setOpenMonths,
      setSelectedDate,
      updateCalendarNote,
    }),
    h(RecordPanel, {
      clearSelectedDay,
      entries,
      isOpen: openPanels.record,
      onToggle: () => togglePanel("record"),
      removeEntry,
    }),
    h(HistoryPanel, { getDayTotal, selectedDate }),
        )
      : h(PlannerView),
    h(SyncPanel, {
      forgetThisDevice,
      isOpen: openPanels.sync,
      onToggle: () => togglePanel("sync"),
      onConnect: connectSync,
      onGenerate: () => {
        const syncId = generateSyncIdValue();
        localStorage.setItem(SYNC_ID_KEY, syncId);
        updateSync((current) => ({ ...current, syncId }));
      },
      onPull: () => pullSyncData({ force: true }),
      onPush: () => pushSyncData(),
      setSync: updateSync,
      sync,
      syncReady: syncBackendReady() && Boolean(sync.syncId && sync.pin),
    }),
  );
}

function AppNavigation({ activeView, setActiveView }) {
  const items = [
    { key: "dashboard", label: "Dashboard" },
    { key: "planner", label: "Planner" },
  ];
  return h(
    "nav",
    { className: "app-navigation", "aria-label": "Main menu" },
    h(
      "div",
      { className: "nav-buttons" },
      items.map((item) =>
        h(
          "button",
          {
            className: `nav-button ${activeView === item.key ? "active" : ""}`,
            key: item.key,
            type: "button",
            onClick: () => setActiveView(item.key),
          },
          item.label,
        ),
      ),
    ),
  );
}

function PlannerView() {
  return h(
    "section",
    { className: "planner-view", "aria-label": "Planner" },
    h("div", { className: "section-heading" }, h("div", null, h("h2", null, "Planner"), h("p", null, "A second workspace for new routines, projects, or notes."))),
    h(
      "div",
      { className: "planner-grid" },
      h("article", null, h("span", null, "Projects"), h("strong", null, "Ready for your next setup.")),
      h("article", null, h("span", null, "Notes"), h("strong", null, "Add a new system here.")),
      h("article", null, h("span", null, "Tracking"), h("strong", null, "We can connect this to sync later.")),
    ),
  );
}

function Topbar({ selectedDate, setSelectedDate, shiftDate }) {
  return h(
    "section",
    { className: "topbar", "aria-label": "Date selector" },
    h("div", null, h("p", { className: "eyebrow" }, "DASH BOARD"), h("h1", null, formatDayLabel(selectedDate))),
    h(
      "div",
      { className: "day-switcher" },
      h("button", { className: "icon-button", type: "button", title: "Previous day", "aria-label": "Previous day", onClick: () => shiftDate(-1) }, "\u2039"),
      h("input", { type: "date", value: selectedDate, "aria-label": "Record date", onChange: (event) => setSelectedDate(event.target.value || toDateKey(new Date())) }),
      h("button", { className: "icon-button", type: "button", title: "Next day", "aria-label": "Next day", onClick: () => shiftDate(1) }, "\u203a"),
    ),
  );
}

function SyncPanel({ forgetThisDevice, isOpen, onConnect, onGenerate, onPull, onPush, onToggle, setSync, sync, syncReady }) {
  return h(CollapsiblePanel, {
    className: "sync-panel",
    controls: "syncBody",
    description: "Connect devices with Sync ID + PIN.",
    isOpen,
    onToggle,
    title: "Sync",
    children: {
      body: h(
        "div",
        { className: "sync-body", id: "syncBody" },
        h(
          "div",
          { className: "sync-grid" },
          h("label", null, h("span", null, "Supabase URL"), h("input", { type: "url", autoComplete: "off", placeholder: "https://project.supabase.co", value: sync.backend.supabaseUrl, onChange: (event) => setSync((current) => ({ ...current, backend: { ...current.backend, supabaseUrl: event.target.value.trim() } })) })),
          h("label", null, h("span", null, "Public Key"), h("input", { type: "password", autoComplete: "off", placeholder: "anon public key", value: sync.backend.supabaseAnonKey, onChange: (event) => setSync((current) => ({ ...current, backend: { ...current.backend, supabaseAnonKey: event.target.value.trim() } })) })),
          h("label", null, h("span", null, "Sync ID"), h("input", { type: "text", autoComplete: "off", placeholder: "Generate or enter Sync ID", value: sync.syncId, onChange: (event) => setSync((current) => ({ ...current, syncId: event.target.value })) })),
          h("label", null, h("span", null, "PIN"), h("input", { type: "password", inputMode: "numeric", autoComplete: "current-password", placeholder: "PIN", value: sync.pin, onChange: (event) => setSync((current) => ({ ...current, pin: event.target.value.trim() })) })),
          h(
            "label",
            { className: "remember-device" },
            h("input", {
              type: "checkbox",
              checked: sync.rememberDevice,
              onChange: (event) =>
                setSync((current) => {
                  if (!event.target.checked) {
                    localStorage.removeItem(SYNC_REMEMBER_KEY);
                    localStorage.removeItem(SYNC_PIN_KEY);
                  }
                  return { ...current, rememberDevice: event.target.checked };
                }),
            }),
            h("span", null, "Remember this device"),
          ),
          h(
            "div",
            { className: "sync-actions" },
            h("button", { className: "text-button", type: "button", onClick: onGenerate }, "Generate"),
            h("button", { className: "text-button", type: "button", disabled: sync.busy, onClick: onConnect }, "Connect"),
            h("button", { className: "text-button", type: "button", disabled: sync.busy || !syncReady, onClick: onPull }, "Pull"),
            h("button", { className: "text-button", type: "button", disabled: sync.busy || !syncReady, onClick: onPush }, "Push"),
            h("button", { className: "text-button danger", type: "button", onClick: forgetThisDevice }, "Forget This Device"),
          ),
        ),
        h("p", { className: "sync-status" }, sync.status),
      ),
    },
  });
}

function SchedulePanel({ calendar, selectedDate }) {
  const schedule = calendar[selectedDate]?.trim() || "";
  const lines = schedule.split(/\n+/).filter(Boolean);
  return h(
    "section",
    { className: "schedule-panel", "aria-label": "Today's Schedule" },
    h("div", { className: "section-heading" }, h("div", null, h("h2", null, "Today's Schedule"), h("p", null, formatDayLabel(selectedDate)))),
    h(
      "div",
      { className: `schedule-content ${schedule ? "" : "empty"}` },
      schedule ? lines.map((line, index) => h("div", { className: "schedule-item", key: `${line}-${index}` }, line)) : h("span", null, "Calendar entries for the selected date will appear here."),
    ),
  );
}

function MemoPanel({ memo, updateMemo }) {
  return h(
    "section",
    { className: "memo-panel", "aria-label": "Memo" },
    h("div", { className: "section-heading" }, h("h2", null, "Memo")),
    h(
      "div",
      { className: "memo-grid" },
      h("label", null, h("span", null, "Life"), h("textarea", { maxLength: 1200, placeholder: "Life, body, mood, personal notes.", value: memo.life || "", onChange: (event) => updateMemo("life", event.target.value) })),
      h("label", null, h("span", null, "School"), h("textarea", { maxLength: 1200, placeholder: "Classes, assignments, study plans, school tasks.", value: memo.school || "", onChange: (event) => updateMemo("school", event.target.value) })),
    ),
  );
}

function ScorePanel({ entryCount, scoreInfo }) {
  const totalClass = scoreInfo.total < 0 ? "negative" : scoreInfo.total === 0 ? "neutral" : "";
  const fillClass = scoreInfo.total > 0 ? "positive" : scoreInfo.total < 0 ? "negative" : "neutral";
  return h(
    "section",
    { className: "score-panel", "aria-label": "Score summary" },
    h(
      "div",
      { className: "score-meter" },
      h("span", { className: "score-kicker" }, "Total Score"),
      h("div", { className: `score-number ${totalClass}` }, formatScore(scoreInfo.total)),
      h("div", { className: "score-track", "aria-hidden": "true" }, h("span", { className: fillClass, style: { width: `${Math.max(0, Math.min(100, 50 + scoreInfo.total * 2))}%` } })),
    ),
    h(
      "div",
      { className: "score-details" },
      h("div", null, h("span", { className: "detail-label" }, "Carry"), h("strong", null, formatScore(scoreInfo.carry))),
      h("div", null, h("span", { className: "detail-label" }, "Plus"), h("strong", null, formatScore(scoreInfo.plus))),
      h("div", null, h("span", { className: "detail-label" }, "Minus"), h("strong", null, formatScore(scoreInfo.minus))),
      h("div", null, h("span", { className: "detail-label" }, "Records"), h("strong", null, entryCount)),
    ),
  );
}

function TodayPlanPanel({ categories, entries, presets, selectedDate, toggleChoice, weekday, weeklyPlan }) {
  return h(
    "section",
    { className: "today-plan-panel", "aria-label": "Today plan" },
    h("div", { className: "section-heading" }, h("h2", null, "Today"), h("span", null, weekday.full)),
    h(
      "div",
      { className: "today-plan-grid" },
      h(PlanRow, {
        className: "daily-plan-row",
        title: "Daily",
        cards: presets.map((preset) => {
          const planKey = `daily:${selectedDate}:${preset.key}`;
          return {
            key: preset.key,
            label: "",
            value: preset.name,
            yScore: preset.yScore,
            nScore: preset.nScore,
            selectedChoice: entries.find((entry) => entry.planKey === planKey)?.choice || "",
            onToggle: (choice) => toggleChoice({ planKey, choice, name: `Daily: ${preset.name} (${choice})`, score: choice === "Y" ? preset.yScore : preset.nScore }),
          };
        }),
      }),
      h(PlanRow, {
        className: "weekly-plan-row",
        title: "Weekly",
        cards: categories.map((category) => {
          const value = weeklyPlan[category.key]?.[weekday.key]?.trim() || "Not Set";
          const planKey = `plan:${selectedDate}:${category.key}`;
          return {
            key: category.key,
            label: category.label,
            value,
            yScore: category.yScore,
            nScore: category.nScore,
            selectedChoice: entries.find((entry) => entry.planKey === planKey)?.choice || "",
            onToggle: (choice) => toggleChoice({ planKey, choice, name: `${category.label}: ${value} (${choice})`, score: choice === "Y" ? category.yScore : category.nScore }),
          };
        }),
      }),
    ),
  );
}

function PlanRow({ cards, className = "", title }) {
  return h("section", { className: `plan-row ${className}` }, h("h3", null, title), h("div", { className: "plan-card-grid" }, cards.map((card) => h(PlanCard, { ...card }))));
}

function PlanCard({ label, nScore, onToggle, selectedChoice, value, yScore }) {
  return h(
    "article",
    { className: `today-plan-card ${selectedChoice ? "done" : ""} ${selectedChoice === "N" ? "no" : ""}` },
    h("span", { className: "edge-light", "aria-hidden": "true" }),
    h("span", { className: "plan-label" }, label),
    h("strong", { className: "plan-title" }, value),
    h(
      "div",
      { className: "choice-buttons" },
      h("button", { className: `choice-button yes ${selectedChoice === "Y" ? "selected" : ""}`, type: "button", onClick: () => onToggle("Y") }, h("i", null, "Y"), h("b", null, formatScore(yScore))),
      h("button", { className: `choice-button no ${selectedChoice === "N" ? "selected" : ""}`, type: "button", onClick: () => onToggle("N") }, h("i", null, "N"), h("b", null, formatScore(nScore))),
    ),
  );
}

function ThreeMPanel({ isOpen, onToggle, updateThreeM, value }) {
  return h(CollapsiblePanel, {
    className: "memo-panel three-m-panel",
    controls: "threeMMemo",
    description: "Long-range 3M notes.",
    isOpen,
    onToggle,
    title: "3M",
    children: { body: h("textarea", { id: "threeMMemo", maxLength: 1200, placeholder: "Write your 3M notes.", value, onChange: (event) => updateThreeM(event.target.value) }) },
  });
}

function DailyPanel({ addPreset, isOpen, movePreset, onToggle, presets, removePreset, updatePreset }) {
  return h(CollapsiblePanel, {
    className: "quick-panel",
    controls: "presetGrid",
    description: "Set recurring daily checks and scores.",
    isOpen,
    onToggle,
    title: "Daily",
    children: {
      actions: h("button", { className: "text-button daily-tool", type: "button", onClick: addPreset }, "+ Daily"),
      body: h(
        "div",
        { className: "preset-grid", id: "presetGrid" },
        presets.map((preset, index) =>
          h(
            "article",
            { className: "preset-card", key: preset.key },
            h("input", { className: "preset-name-input", type: "text", maxLength: 32, "aria-label": "Daily name", value: preset.name, onChange: (event) => updatePreset(index, "name", event.target.value) }),
            h("label", { className: "score-field positive-score", title: "Y score" }, h("input", { className: "preset-score-input y-score", type: "number", min: -100, max: 100, step: 1, value: preset.yScore, onChange: (event) => updatePreset(index, "yScore", event.target.value) })),
            h("label", { className: "score-field negative-score", title: "N score" }, h("input", { className: "preset-score-input n-score", type: "number", min: -100, max: 100, step: 1, value: preset.nScore, onChange: (event) => updatePreset(index, "nScore", event.target.value) })),
            h("button", { className: "mini-button preset-up", type: "button", disabled: index === 0, onClick: () => movePreset(index, -1) }, "\u2191"),
            h("button", { className: "mini-button preset-down", type: "button", disabled: index === presets.length - 1, onClick: () => movePreset(index, 1) }, "\u2193"),
            h("button", { className: "mini-button danger", type: "button", onClick: () => removePreset(index) }, "\u00d7"),
          ),
        ),
      ),
    },
  });
}

function WeeklyPanel({ addCategory, categories, isOpen, moveCategory, onToggle, removeCategory, selectedDate, updateCategory, updateWeeklyPlan, weeklyPlan }) {
  const selectedWeekday = getWeekdayKey(selectedDate);
  return h(CollapsiblePanel, {
    className: "weekly-panel",
    controls: "weeklyGrid",
    description: "Create categories and assign plans for each weekday.",
    isOpen,
    onToggle,
    title: "Weekly",
    children: {
      actions: h("button", { className: "text-button weekly-tool", type: "button", onClick: addCategory }, "+ Category"),
      body: h(
        "div",
        { className: "weekly-grid", id: "weeklyGrid" },
        h("div", { className: "weekly-corner" }, "Category"),
        ...weekDays.map((day) => h("div", { className: `weekly-day ${day.key === selectedWeekday ? "active" : ""}`, key: day.key }, day.label)),
        ...categories.flatMap((category, index) => [
          h(
            "div",
            { className: "weekly-category", key: `${category.key}-label` },
            h("input", { className: "category-name-input", type: "text", maxLength: 24, value: category.label, onChange: (event) => updateCategory(category.key, "label", event.target.value) }),
            h("label", { className: "score-field y-field positive-score", title: "Y score" }, h("input", { className: "category-score-input y-score", type: "number", min: -100, max: 100, step: 1, value: category.yScore, onChange: (event) => updateCategory(category.key, "yScore", event.target.value) })),
            h("label", { className: "score-field n-field negative-score", title: "N score" }, h("input", { className: "category-score-input n-score", type: "number", min: -100, max: 100, step: 1, value: category.nScore, onChange: (event) => updateCategory(category.key, "nScore", event.target.value) })),
            h(
              "div",
              { className: "category-actions" },
              h("button", { className: "mini-button", type: "button", disabled: index === 0, onClick: () => moveCategory(category.key, -1) }, "\u2191"),
              h("button", { className: "mini-button", type: "button", disabled: index === categories.length - 1, onClick: () => moveCategory(category.key, 1) }, "\u2193"),
              h("button", { className: "mini-button danger", type: "button", disabled: categories.length <= 1, onClick: () => removeCategory(category.key) }, "\u00d7"),
            ),
          ),
          ...weekDays.map((day) =>
            h("input", {
              className: `weekly-input ${day.key === selectedWeekday ? "active" : ""}`,
              key: `${category.key}-${day.key}`,
              type: "text",
              maxLength: 40,
              placeholder: `${day.label} ${category.label}`,
              value: weeklyPlan[category.key]?.[day.key] || "",
              onChange: (event) => updateWeeklyPlan(category.key, day.key, event.target.value),
            }),
          ),
        ]),
      ),
    },
  });
}

function RecordPanel({ clearSelectedDay, entries, isOpen, onToggle, removeEntry }) {
  return h(CollapsiblePanel, {
    className: "log-panel",
    controls: "entryList",
    isOpen,
    onToggle,
    title: "Record",
    children: {
      actions: h("button", { className: "text-button danger log-tool", type: "button", onClick: clearSelectedDay }, "Clear Today"),
      body: h(
        React.Fragment,
        null,
        h("div", { className: `empty-state ${entries.length ? "hidden" : ""}` }, h("strong", null, "No records yet."), h("span", null, "Press Y/N on Daily or Weekly cards to record points.")),
        h(
          "ul",
          { className: "entry-list", id: "entryList" },
          [...entries].reverse().map((entry) =>
            h(
              "li",
              { className: "entry-item", key: entry.id },
              h("div", { className: "entry-main" }, h("span", { className: "entry-name" }, entry.name), h("span", { className: "entry-time" }, new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(new Date(entry.createdAt)))),
              h("strong", { className: `entry-score ${entry.score > 0 ? "plus" : "minus"}` }, formatScore(entry.score)),
              h("button", { className: "icon-button remove-entry", type: "button", title: "Delete", "aria-label": "Delete", onClick: () => removeEntry(entry.id) }, "\u00d7"),
            ),
          ),
        ),
      ),
    },
  });
}

function HistoryPanel({ getDayTotal, selectedDate }) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${selectedDate}T00:00:00`);
    date.setDate(date.getDate() - (6 - index));
    const key = toDateKey(date);
    return { key, total: getDayTotal(key) };
  });
  const maxAbs = Math.max(10, ...days.map((day) => Math.abs(day.total)));
  let streak = 0;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index].total <= 0) break;
    streak += 1;
  }
  return h(
    "section",
    { className: "history-panel", "aria-label": "Last 7 days" },
    h("div", { className: "section-heading" }, h("h2", null, "Last 7 Days"), h("span", null, `Positive streak ${streak} days`)),
    h(
      "div",
      { className: "history-bars" },
      days.map((day) =>
        h(
          "div",
          { className: "history-day", key: day.key },
          h("div", { className: `history-fill ${day.total > 0 ? "plus" : day.total < 0 ? "minus" : ""}`, style: { height: `${Math.max(16, (Math.abs(day.total) / maxAbs) * 112)}px` } }),
          h("span", { className: "history-date" }, day.key.slice(5).replace("-", ".")),
          h("strong", { className: "history-score" }, formatScore(day.total)),
        ),
      ),
    ),
  );
}

function CalendarPanel({ calendar, isOpen, onToggle, openMonths, selectedDate, setOpenMonths, setSelectedDate, updateCalendarNote }) {
  const year = new Date(`${selectedDate}T00:00:00`).getFullYear();
  const toggleMonth = (monthIndex) => {
    setOpenMonths((current) => {
      const next = new Set(current);
      if (next.has(monthIndex)) next.delete(monthIndex);
      else next.add(monthIndex);
      return next;
    });
  };
  return h(CollapsiblePanel, {
    className: "calendar-panel",
    controls: "calendarMonths",
    description: "Open a month and write schedule notes for each date.",
    isOpen,
    onToggle,
    title: "Calendar",
    children: {
      body: h(
        "div",
        { className: "calendar-months", id: "calendarMonths" },
        monthNames.map((monthName, monthIndex) => {
          const prefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
          const noteCount = Object.keys(calendar).filter((dateKey) => dateKey.startsWith(prefix)).length;
          const monthOpen = openMonths.has(monthIndex);
          return h(
            "section",
            {
              className: `calendar-month ${monthOpen ? "open" : ""}`,
              key: monthName,
              onClick: (event) => {
                if (panelClickIsInteractive(event.target)) return;
                toggleMonth(monthIndex);
              },
            },
            h(
              "button",
              {
                className: "calendar-month-toggle",
                type: "button",
                "aria-expanded": String(monthOpen),
                onClick: (event) => {
                  event.stopPropagation();
                  toggleMonth(monthIndex);
                },
              },
              h("span", null, monthName),
              h("strong", null, `${noteCount} items`),
            ),
            monthOpen ? h(MonthDays, { calendar, monthIndex, selectedDate, setSelectedDate, updateCalendarNote, year }) : null,
          );
        }),
      ),
    },
  });
}

function MonthDays({ calendar, monthIndex, selectedDate, setSelectedDate, updateCalendarNote, year }) {
  const todayKey = toDateKey(new Date());
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstDayIndex = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const blanks = Array.from({ length: firstDayIndex }, (_, index) =>
    h("div", { className: "calendar-day-spacer", key: `blank-${monthIndex}-${index}`, "aria-hidden": "true" }),
  );
  return h(
    "div",
    { className: "calendar-days" },
    ...weekDays.map((day) => h("div", { className: "calendar-weekday", key: day.key }, day.label)),
    ...blanks,
    Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const dateKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const date = new Date(`${dateKey}T00:00:00`);
      const weekday = weekDays[(date.getDay() + 6) % 7].label;
      return h(
        "label",
        { className: `calendar-day ${dateKey === selectedDate ? "selected" : ""} ${dateKey === todayKey ? "today" : ""}`, key: dateKey },
        h("span", { className: "calendar-date" }, h("b", null, day), h("i", null, weekday)),
        h("textarea", { maxLength: 600, placeholder: "Schedule", value: calendar[dateKey] || "", onFocus: () => setSelectedDate(dateKey), onChange: (event) => updateCalendarNote(dateKey, event.target.value), onKeyDown: (event) => event.stopPropagation() }),
      );
    }),
  );
}

export default App;
