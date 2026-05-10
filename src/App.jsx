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

function createDefaultMemoCards(globalMemos = {}) {
  return [
    { id: "memo-life", title: "Life", leftText: globalMemos.life || "", rightText: "" },
    { id: "memo-school", title: "School", leftText: globalMemos.school || "", rightText: "" },
    { id: "memo-ideas", title: "Ideas", leftText: "", rightText: "" },
  ];
}

function cloneCategories() {
  return defaultCategories.map((category) => ({ ...category }));
}

function clonePresets() {
  return defaultPresets.map((preset) => ({ ...preset }));
}

function parseScore(value, fallback) {
  if (value === "" || value === "-") return value;
  if (typeof value === "string" && /^\d+\s*(?:~|-|,)\s*\d*$/.test(value.trim())) return value.trim();
  const score = Number(value);
  return Number.isFinite(score) ? score : fallback;
}

function scoreNumber(value, fallback = 0) {
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

function normalizeDateMarkers(markers) {
  return Array.from({ length: 5 }, (_, index) => ({
    text: markers?.[index]?.text || "",
    date: markers?.[index]?.date || "",
  }));
}

function normalizeMemos(memos) {
  const global = memos?.global && typeof memos.global === "object" ? memos.global : { life: "", school: "" };
  const sourceCards = Array.isArray(memos?.cards) && memos.cards.length ? memos.cards : createDefaultMemoCards(global);
  const cards = sourceCards
    .filter((card) => card && card.id)
    .map((card, index) => ({
      id: card.id,
      title: String(card.title || `Memo ${index + 1}`).slice(0, 32),
      leftText: String(card.leftText ?? card.text ?? ""),
      rightText: String(card.rightText || ""),
    }));
  const safeCards = cards.length ? cards : createDefaultMemoCards(global);
  const activeMemoId = safeCards.some((card) => card.id === memos?.activeMemoId) ? memos.activeMemoId : safeCards[0].id;
  return {
    global,
    threeM: memos?.threeM || "",
    cards: safeCards,
    activeMemoId,
  };
}

function normalizeWork(work) {
  const legacyBlocks = [
    { id: "work-manual", title: "Manual", content: String(work?.manual || ""), open: true },
    { id: "work-process", title: "Process", content: String(work?.procedures || ""), open: true },
    { id: "work-notes", title: "Notes", content: String(work?.notes || ""), open: true },
  ];
  const normalizeBlocks = (blocks) =>
    blocks.map((block, index) => ({
      id: block.id || createKey("work"),
      title: String(block.title || `Work ${index + 1}`),
      content: String(block.content || ""),
      open: block.open !== false,
    }));
  if (Array.isArray(work?.categories) && work.categories.length) {
    return {
      categories: work.categories.map((category, index) => ({
        id: category.id || createKey("work-category"),
        title: String(category.title || `Category ${index + 1}`),
        open: category.open !== false,
        blocks: normalizeBlocks(Array.isArray(category.blocks) ? category.blocks : []),
      })),
    };
  }
  const sourceBlocks = Array.isArray(work?.blocks) && work.blocks.length ? work.blocks : legacyBlocks;
  return {
    categories: [
      {
        id: "work-category-main",
        title: "Main",
        open: true,
        blocks: normalizeBlocks(sourceBlocks),
      },
    ],
  };
}

function createFallbackState() {
  const categories = cloneCategories();
  return {
    days: {},
    memos: normalizeMemos(),
    calendar: {},
    routineAttempts: {},
    flaggedDate: "",
    carryResetDate: "",
    presets: clonePresets(),
    categories,
    weeklyPlan: createEmptyWeeklyPlan(categories),
    dateMarkers: normalizeDateMarkers(),
    work: normalizeWork(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeState(source) {
  const fallback = createFallbackState();
  const categories = normalizeCategories(source?.categories, fallback.categories);
  return {
    days: source?.days && typeof source.days === "object" ? source.days : {},
    memos: normalizeMemos(source?.memos),
    calendar: source?.calendar && typeof source.calendar === "object" ? source.calendar : {},
    routineAttempts: source?.routineAttempts && typeof source.routineAttempts === "object" ? source.routineAttempts : {},
    flaggedDate: source?.flaggedDate || "",
    carryResetDate: source?.carryResetDate || "",
    presets: normalizePresets(source?.presets),
    categories,
    weeklyPlan: normalizeWeeklyPlan(source?.weeklyPlan, categories),
    dateMarkers: normalizeDateMarkers(source?.dateMarkers),
    work: normalizeWork(source?.work),
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

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
  if (score === "" || score === "-") return String(score);
  const numericScore = scoreNumber(score);
  return numericScore > 0 ? `+${numericScore}` : String(numericScore);
}

function getWeekSerial(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return Math.floor(monday.getTime() / 604800000);
}

function addDays(dateKey, amount) {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

function getDateDiffDays(fromDateKey, toDateKeyValue) {
  if (!fromDateKey || !toDateKeyValue) return "";
  const from = new Date(`${fromDateKey}T00:00:00`);
  const to = new Date(`${toDateKeyValue}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return "";
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

function formatDDay(fromDateKey, toDateKeyValue) {
  const diff = getDateDiffDays(fromDateKey, toDateKeyValue);
  if (diff === "") return "D";
  if (diff === 0) return "D-Day";
  return diff > 0 ? `D+${diff}` : `D${diff}`;
}

function getWeekStart(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return addDays(dateKey, -((date.getDay() + 6) % 7));
}

function formatCompactDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const month = new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
  return { day: date.getDate(), month, weekday };
}

function getWeeklyPlanEntry(rawValue, dateKey) {
  const lines = String(rawValue || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return { cycleNumber: "", value: "Not Set" };
  const lineIndex = ((getWeekSerial(dateKey) % lines.length) + lines.length) % lines.length;
  return { cycleNumber: lines.length > 1 ? lineIndex + 1 : "", value: lines[lineIndex] };
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
    system: false,
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
    document.querySelectorAll(".collapsible-panel, .schedule-panel, .memo-panel, .today-plan-panel, .history-panel, .score-meter, .score-details > div, .today-plan-card, .preset-card, .entry-item, .calendar-month, .calendar-day").forEach((element) => {
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
  const weekday = getWeekdayMeta(selectedDate);
  const routineTried = Boolean(data.routineAttempts?.[selectedDate]);

  const getEntries = (dateKey = selectedDate) => (Array.isArray(data.days[dateKey]) ? data.days[dateKey] : []);
  const getDayTotal = (dateKey) => getEntries(dateKey).reduce((sum, entry) => sum + entry.score, 0);
  const getCarryTotal = () =>
    Object.entries(data.days).reduce((sum, [key, dayEntries]) => {
      if (key >= selectedDate || !Array.isArray(dayEntries)) return sum;
      if (data.carryResetDate && selectedDate >= data.carryResetDate && key < data.carryResetDate) return sum;
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

  const toggleRoutineAttempt = () => {
    saveData((draft) => {
      draft.routineAttempts = draft.routineAttempts || {};
      if (draft.routineAttempts[selectedDate]) delete draft.routineAttempts[selectedDate];
      else draft.routineAttempts[selectedDate] = true;
      return draft;
    });
  };

  const toggleFlaggedDate = () => {
    saveData((draft) => {
      draft.flaggedDate = draft.flaggedDate === selectedDate ? "" : selectedDate;
      return draft;
    });
  };

  const resetCarry = () => {
    saveData((draft) => {
      draft.carryResetDate = selectedDate;
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

  const setActiveMemo = (memoId) => {
    saveData((draft) => {
      draft.memos.activeMemoId = memoId;
      return draft;
    });
  };

  const updateMemoCard = (id, field, value) => {
    saveData((draft) => {
      const card = draft.memos.cards.find((item) => item.id === id);
      if (!card) return draft;
      if (field === "title") card.title = value;
      if (field === "leftText") card.leftText = value;
      if (field === "rightText") card.rightText = value;
      if (id === "memo-life") draft.memos.global.life = card.leftText || "";
      if (id === "memo-school") draft.memos.global.school = card.leftText || "";
      return draft;
    });
  };

  const addMemoCard = () => {
    saveData((draft) => {
      const card = { id: createKey("memo"), title: `Memo ${draft.memos.cards.length + 1}`, leftText: "", rightText: "" };
      draft.memos.cards.push(card);
      draft.memos.activeMemoId = card.id;
      return draft;
    });
  };

  const removeMemoCard = (id) => {
    const confirmed = window.confirm("Delete this memo?");
    if (!confirmed) return;
    saveData((draft) => {
      if (draft.memos.cards.length <= 1) return draft;
      const index = draft.memos.cards.findIndex((card) => card.id === id);
      draft.memos.cards = draft.memos.cards.filter((card) => card.id !== id);
      if (draft.memos.activeMemoId === id) {
        draft.memos.activeMemoId = draft.memos.cards[Math.max(0, index - 1)]?.id || draft.memos.cards[0].id;
      }
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
      if (field === "name") preset.name = value;
      if (field === "yScore") preset.yScore = value;
      if (field === "nScore") preset.nScore = value;
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
      if (field === "label") category.label = value;
      if (field === "yScore") category.yScore = value;
      if (field === "nScore") category.nScore = value;
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

  const updateDateMarker = (index, field, value) => {
    saveData((draft) => {
      const markers = normalizeDateMarkers(draft.dateMarkers);
      markers[index] = { ...markers[index], [field]: value };
      draft.dateMarkers = markers;
      return draft;
    });
  };

  const updateWorkBlock = (id, field, value) => {
    saveData((draft) => {
      draft.work = normalizeWork(draft.work);
      const block = draft.work.categories.flatMap((category) => category.blocks).find((item) => item.id === id);
      if (block) block[field] = value;
      return draft;
    });
  };

  const toggleWorkBlock = (id) => {
    saveData((draft) => {
      draft.work = normalizeWork(draft.work);
      const block = draft.work.categories.flatMap((category) => category.blocks).find((item) => item.id === id);
      if (block) block.open = !block.open;
      return draft;
    });
  };

  const addWorkCategory = () => {
    saveData((draft) => {
      draft.work = normalizeWork(draft.work);
      draft.work.categories.push({ id: createKey("work-category"), title: `Category ${draft.work.categories.length + 1}`, blocks: [] });
      return draft;
    });
  };

  const updateWorkCategory = (id, value) => {
    saveData((draft) => {
      draft.work = normalizeWork(draft.work);
      const category = draft.work.categories.find((item) => item.id === id);
      if (category) category.title = value;
      return draft;
    });
  };

  const toggleWorkCategory = (id) => {
    saveData((draft) => {
      draft.work = normalizeWork(draft.work);
      const category = draft.work.categories.find((item) => item.id === id);
      if (category) category.open = !category.open;
      return draft;
    });
  };

  const removeWorkCategory = (id) => {
    const confirmed = window.confirm("Delete this work category and all blocks inside it?");
    if (!confirmed) return;
    saveData((draft) => {
      draft.work = normalizeWork(draft.work);
      if (draft.work.categories.length <= 1) return draft;
      draft.work.categories = draft.work.categories.filter((category) => category.id !== id);
      return draft;
    });
  };

  const moveWorkCategory = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    saveData((draft) => {
      draft.work = normalizeWork(draft.work);
      const fromIndex = draft.work.categories.findIndex((category) => category.id === fromId);
      const toIndex = draft.work.categories.findIndex((category) => category.id === toId);
      if (fromIndex < 0 || toIndex < 0) return draft;
      const [category] = draft.work.categories.splice(fromIndex, 1);
      draft.work.categories.splice(toIndex, 0, category);
      return draft;
    });
  };

  const addWorkBlock = (categoryId) => {
    saveData((draft) => {
      draft.work = normalizeWork(draft.work);
      const category = draft.work.categories.find((item) => item.id === categoryId) || draft.work.categories[0];
      if (!category) return draft;
      category.blocks.push({ id: createKey("work"), title: `Work ${category.blocks.length + 1}`, content: "", open: true });
      return draft;
    });
  };

  const removeWorkBlock = (id) => {
    const confirmed = window.confirm("Delete this work block?");
    if (!confirmed) return;
    saveData((draft) => {
      draft.work = normalizeWork(draft.work);
      draft.work.categories.forEach((category) => {
        category.blocks = category.blocks.filter((block) => block.id !== id);
      });
      return draft;
    });
  };

  const moveWorkBlock = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    saveData((draft) => {
      draft.work = normalizeWork(draft.work);
      const category = draft.work.categories.find((item) => item.blocks.some((block) => block.id === fromId) && item.blocks.some((block) => block.id === toId));
      if (!category) return draft;
      const fromIndex = category.blocks.findIndex((block) => block.id === fromId);
      const toIndex = category.blocks.findIndex((block) => block.id === toId);
      if (fromIndex < 0 || toIndex < 0) return draft;
      const [block] = category.blocks.splice(fromIndex, 1);
      category.blocks.splice(toIndex, 0, block);
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

  const exportBackup = () => {
    const state = normalizeState(dataRef.current);
    const filename = `dashboard-backup-${toDateKey(new Date())}.json`;
    downloadTextFile(filename, JSON.stringify(state, null, 2));
  };

  const copyBackup = async () => {
    try {
      const state = normalizeState(dataRef.current);
      await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
      window.alert("Dashboard backup data was copied to the clipboard.");
    } catch {
      window.alert("Copy failed. Please try Download Data instead.");
    }
  };

  const importBackup = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const normalized = normalizeState(JSON.parse(text));
      const confirmed = window.confirm("This will replace the dashboard data in this browser with the selected backup file. Continue?");
      if (!confirmed) return;
      dataRef.current = normalized;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      setData(normalized);
      scheduleAutoSync();
    } catch {
      window.alert("Backup import failed. Please choose a valid dashboard backup JSON file.");
    }
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
          h(SchedulePanel, { calendar: data.calendar, selectedDate }),
    h(
      "div",
      { className: "daily-workspace" },
      h(
        "div",
        { className: "daily-left-rail" },
        h(ScorePanel, { entryCount: entries.length, onResetCarry: resetCarry, onToggleAttempt: toggleRoutineAttempt, routineTried, scoreInfo }),
        h(DateMarkerPanel, { dateMarkers: data.dateMarkers, selectedDate, updateDateMarker }),
      ),
      h(MemoPanel, {
        activeMemoId: data.memos.activeMemoId,
        addMemoCard,
        cards: data.memos.cards,
        removeMemoCard,
        setActiveMemo,
        updateMemoCard,
      }),
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
      updateCalendarNote,
    }),
    h(RecordPanel, {
      clearSelectedDay,
      entries,
      isOpen: openPanels.record,
      onToggle: () => togglePanel("record"),
      removeEntry,
    }),
    h(HistoryPanel, { flaggedDate: data.flaggedDate, getDayTotal, onToggleFlag: toggleFlaggedDate, routineAttempts: data.routineAttempts, selectedDate }),
        )
      : h(WorkView, {
          addWorkBlock,
          addWorkCategory,
          moveWorkBlock,
          moveWorkCategory,
          removeWorkBlock,
          removeWorkCategory,
          toggleWorkCategory,
          toggleWorkBlock,
          updateWorkBlock,
          updateWorkCategory,
          work: data.work,
        }),
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
    h(SystemPanel, {
      copyBackup,
      exportBackup,
      importBackup,
      isOpen: openPanels.system,
      onToggle: () => togglePanel("system"),
    }),
  );
}

function AppNavigation({ activeView, setActiveView }) {
  const items = [
    { key: "dashboard", label: "Dashboard" },
    { key: "work", label: "Work" },
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

function WorkView({ addWorkBlock, addWorkCategory, moveWorkBlock, moveWorkCategory, removeWorkBlock, removeWorkCategory, toggleWorkBlock, toggleWorkCategory, updateWorkBlock, updateWorkCategory, work }) {
  const categories = normalizeWork(work).categories;
  const [dragBlockId, setDragBlockId] = useState("");
  const [dragCategoryId, setDragCategoryId] = useState("");
  return h(
    "section",
    { className: "work-view", "aria-label": "Work" },
    h(
      "div",
      { className: "section-heading" },
      h("div", null, h("h2", null, "Work"), h("p", null, "A workspace for manuals, procedures, and work notes.")),
      h("button", { className: "text-button", type: "button", onClick: addWorkCategory }, "+ Category"),
    ),
    h(
      "div",
      { className: "work-category-list" },
      categories.map((category) =>
        h(
          "section",
          {
            className: `work-category ${category.open ? "" : "collapsed"} ${dragCategoryId === category.id ? "dragging" : ""}`,
            draggable: true,
            key: category.id,
            onDragStart: (event) => {
              if (panelClickIsInteractive(event.target) || event.target.closest?.(".work-manual-card")) {
                event.preventDefault();
                return;
              }
              setDragCategoryId(category.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/work-category", category.id);
            },
            onDragOver: (event) => {
              if (!dragCategoryId) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            },
            onDrop: (event) => {
              const fromId = event.dataTransfer.getData("text/work-category") || dragCategoryId;
              if (!fromId) return;
              event.preventDefault();
              moveWorkCategory(fromId, category.id);
              setDragCategoryId("");
            },
            onDragEnd: () => setDragCategoryId(""),
          },
          h(
            "div",
            { className: "work-category-heading" },
            h("input", {
              type: "text",
              value: category.title,
              "aria-label": "Work category title",
              onChange: (event) => updateWorkCategory(category.id, event.target.value),
              onKeyDown: (event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              },
            }),
            h("button", {
              className: "work-category-toggle-zone",
              type: "button",
              "aria-expanded": String(category.open),
              "aria-label": category.open ? "Close work category" : "Open work category",
              onClick: () => toggleWorkCategory(category.id),
            }),
            h(
              "div",
              { className: "work-category-actions" },
              h("button", { className: "text-button", type: "button", onClick: () => addWorkBlock(category.id) }, "+ Block"),
              h("button", { className: "mini-button danger", type: "button", disabled: categories.length <= 1, title: "Delete work category", onClick: () => removeWorkCategory(category.id) }, "\u00d7"),
            ),
          ),
          h(
            "div",
            { className: "work-manual-grid" },
            category.open
              ? category.blocks.map((block) =>
                  h(
                    "article",
                    {
                      className: `work-manual-card ${block.open ? "" : "collapsed"} ${dragBlockId === block.id ? "dragging" : ""}`,
                      draggable: true,
                      key: block.id,
                      onDragStart: (event) => {
                        event.stopPropagation();
                        if (panelClickIsInteractive(event.target)) {
                          event.preventDefault();
                          return;
                        }
                        setDragBlockId(block.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", block.id);
                      },
                      onDragOver: (event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      },
                      onDrop: (event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        const fromId = event.dataTransfer.getData("text/plain") || dragBlockId;
                        moveWorkBlock(fromId, block.id);
                        setDragBlockId("");
                      },
                      onDragEnd: () => setDragBlockId(""),
                    },
                    h(
                      "div",
                      { className: "work-manual-heading" },
                      h("input", {
                        type: "text",
                        value: block.title,
                        "aria-label": "Work block title",
                        onChange: (event) => updateWorkBlock(block.id, "title", event.target.value),
                        onKeyDown: (event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                        },
                      }),
                      h(
                        "button",
                        {
                          className: "work-toggle-zone",
                          type: "button",
                          "aria-expanded": String(block.open),
                          "aria-label": block.open ? "Close work block" : "Open work block",
                          onClick: () => toggleWorkBlock(block.id),
                        },
                      ),
                      h(
                        "div",
                        { className: "work-block-actions" },
                        h("button", { className: "mini-button danger", type: "button", title: "Delete work block", onClick: () => removeWorkBlock(block.id) }, "\u00d7"),
                      ),
                    ),
                    block.open
                      ? h("textarea", {
                          className: "work-manual-textarea",
                          placeholder: "Write work manuals, procedures, notes, links, or templates...",
                          value: block.content,
                          onChange: (event) => updateWorkBlock(block.id, "content", event.target.value),
                        })
                      : null,
                  ),
                )
              : null,
          ),
        ),
      ),
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

function SystemPanel({ copyBackup, exportBackup, importBackup, isOpen, onToggle }) {
  const fileInputRef = useRef(null);
  return h(CollapsiblePanel, {
    className: "system-panel",
    controls: "systemBody",
    description: "Export or restore dashboard data.",
    isOpen,
    onToggle,
    title: "System",
    children: {
      body: h(
        "div",
        { className: "system-body", id: "systemBody" },
        h(
          "button",
          { className: "system-action export-action", type: "button", onClick: exportBackup },
          h("span", null, "Download Data"),
          h("strong", null, "Save a JSON backup file"),
        ),
        h(
          "button",
          { className: "system-action copy-action", type: "button", onClick: copyBackup },
          h("span", null, "Copy Data"),
          h("strong", null, "Copy backup JSON to clipboard"),
        ),
        h(
          "button",
          {
            className: "system-action import-action",
            type: "button",
            onClick: () => fileInputRef.current?.click(),
          },
          h("span", null, "Upload Data"),
          h("strong", null, "Restore from a JSON backup"),
        ),
        h("input", {
          ref: fileInputRef,
          type: "file",
          accept: "application/json,.json",
          className: "backup-file-input",
          onChange: (event) => {
            importBackup(event.target.files?.[0]);
            event.target.value = "";
          },
        }),
      ),
    },
  });
}

function SchedulePanel({ calendar, selectedDate }) {
  const weekStart = getWeekStart(selectedDate);
  const weeks = [0, 7].map((offset) => Array.from({ length: 7 }, (_, index) => addDays(weekStart, offset + index)));
  return h(
    "section",
    { className: "schedule-panel two-week-schedule", "aria-label": "Two-week schedule" },
    h("div", { className: "section-heading" }, h("div", null, h("h2", null, "Today's Schedule"))),
    h(
      "div",
      { className: "schedule-weeks" },
      weeks.map((week, weekIndex) =>
        h(
          "div",
          { className: "schedule-week", key: `week-${weekIndex}` },
          h("div", { className: "schedule-week-title" }, weekIndex === 0 ? "This Week" : "Next Week"),
          h(
            "div",
            { className: "schedule-week-scroll" },
            h("div", { className: "schedule-weekdays" }, weekDays.map((day) => h("span", { key: day.key }, day.label))),
            h(
              "div",
              { className: "schedule-week-grid" },
          week.map((dateKey) => {
            const schedule = calendar[dateKey]?.trim() || "";
            const lines = schedule.split(/\n+/).filter(Boolean);
            const dateLabel = formatCompactDate(dateKey);
            return h(
              "article",
              { className: `schedule-day ${dateKey === selectedDate ? "selected" : ""}`, key: dateKey },
              h("div", { className: "schedule-date" }, h("b", null, `${dateLabel.month} ${dateLabel.day}`), h("span", null, dateLabel.weekday)),
              h(
                "div",
                { className: `schedule-day-items ${lines.length ? "" : "empty"}` },
                lines.length ? lines.map((line, index) => h("span", { key: `${dateKey}-${index}` }, line)) : h("i", null, "No schedule"),
              ),
            );
          }),
            ),
          ),
        ),
      ),
    ),
  );
}

function MemoPanel({ activeMemoId, addMemoCard, cards, removeMemoCard, setActiveMemo, updateMemoCard }) {
  const [drag, setDrag] = useState({ active: false, startX: 0, deltaX: 0 });
  const activeIndex = Math.max(0, cards.findIndex((card) => card.id === activeMemoId));
  const goToOffset = (offset) => {
    if (!cards.length) return;
    const nextIndex = (activeIndex + offset + cards.length) % cards.length;
    setActiveMemo(cards[nextIndex].id);
  };
  const handlePointerDown = (event) => {
    if (panelClickIsInteractive(event.target)) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ active: true, startX: event.clientX, deltaX: 0 });
  };
  const handlePointerMove = (event) => {
    if (!drag.active) return;
    setDrag((current) => ({ ...current, deltaX: event.clientX - current.startX }));
  };
  const endDrag = () => {
    if (!drag.active) return;
    if (drag.deltaX > 64) goToOffset(-1);
    if (drag.deltaX < -64) goToOffset(1);
    setDrag({ active: false, startX: 0, deltaX: 0 });
  };
  return h(
    "section",
    { className: "memo-panel stacked-memo-panel", "aria-label": "Memo" },
    h(
      "div",
      { className: "memo-stack-layout" },
      h(
        "div",
        {
          className: `memo-stack ${drag.active ? "dragging" : ""}`,
          onPointerDown: handlePointerDown,
          onPointerMove: handlePointerMove,
          onPointerUp: endDrag,
          onPointerCancel: endDrag,
          style: { "--drag-x": `${drag.deltaX}px` },
        },
        cards.map((card, index) => {
          const stackIndex = (index - activeIndex + cards.length) % cards.length;
          const visible = stackIndex < Math.min(cards.length, 4);
          const isActive = index === activeIndex;
          return h(
            "article",
            {
              className: `memo-card ${isActive ? "active" : ""} ${visible ? "" : "hidden"}`,
              key: card.id,
              style: { "--stack-index": stackIndex },
              onClick: () => {
                if (!isActive) setActiveMemo(card.id);
              },
            },
            h(
              "div",
              { className: "memo-card-grip" },
              h("span", null, String(index + 1).padStart(2, "0")),
              h("input", {
                type: "text",
                maxLength: 32,
                "aria-label": "Memo title",
                value: card.title,
                onChange: (event) => updateMemoCard(card.id, "title", event.target.value),
                disabled: !isActive,
              }),
              h("button", { className: "mini-button danger", type: "button", disabled: cards.length <= 1 || !isActive, title: "Delete memo", onClick: () => removeMemoCard(card.id) }, "\u00d7"),
            ),
            isActive
              ? h(
                  "div",
                  { className: "memo-card-columns" },
                  h(MemoBlockColumn, { cardId: card.id, field: "leftText", updateMemoCard, value: card.leftText || "" }),
                  h(MemoBlockColumn, { cardId: card.id, field: "rightText", updateMemoCard, value: card.rightText || "" }),
                )
              : h(
                  "div",
                  { className: "memo-card-preview-grid" },
                  h("p", { className: "memo-card-preview" }, card.leftText || "Empty memo"),
                  h("p", { className: "memo-card-preview" }, card.rightText || "Empty memo"),
                ),
          );
        }),
      ),
      h(
        "div",
        { className: "memo-index", "aria-label": "Memo cards" },
        h("button", { className: "memo-index-button add-memo", type: "button", title: "Add memo", onClick: addMemoCard }, "+"),
        cards.map((card, index) =>
          h(
            "button",
            {
              className: `memo-index-button ${index === activeIndex ? "active" : ""}`,
              key: card.id,
              type: "button",
              onClick: () => setActiveMemo(card.id),
            },
            index + 1,
          ),
        ),
      ),
    ),
  );
}

function getMemoBlocks(value) {
  return String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function growMemoTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function MemoBlockColumn({ cardId, field, updateMemoCard, value }) {
  const [quickMemo, setQuickMemo] = useState("");
  const addQuickMemo = () => {
    const text = quickMemo.trim();
    if (!text) return;
    updateMemoCard(cardId, field, value ? `${text}\n${value}` : text);
    setQuickMemo("");
  };
  return h(
    "section",
    { className: "memo-block-column" },
    h("textarea", {
      className: "memo-quick-textarea",
      placeholder: "Quick add...",
      rows: 1,
      value: quickMemo,
      onChange: (event) => setQuickMemo(event.target.value),
      onKeyDown: (event) => {
        event.stopPropagation();
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          addQuickMemo();
        }
      },
    }),
    h("textarea", {
      className: "memo-large-textarea",
      placeholder: "Write freely...",
      value,
      onChange: (event) => updateMemoCard(cardId, field, event.target.value),
      onKeyDown: (event) => event.stopPropagation(),
    }),
  );
}

function ScorePanel({ entryCount, onResetCarry, onToggleAttempt, routineTried, scoreInfo }) {
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
      h(
        "button",
        {
          className: `attempt-check ${routineTried ? "checked" : ""}`,
          type: "button",
          "aria-pressed": String(routineTried),
          "aria-label": "Tried today",
          title: "Tried today",
          onClick: onToggleAttempt,
        },
        routineTried ? "\u2713" : "",
      ),
      h("div", { className: "score-track", "aria-hidden": "true" }, h("span", { className: fillClass, style: { width: `${Math.max(0, Math.min(100, 50 + scoreInfo.total * 2))}%` } })),
    ),
    h(
      "div",
      { className: "score-details" },
      h(
        "div",
        { className: "carry-detail" },
        h("span", { className: "detail-label" }, "Carry"),
        h("button", { className: "carry-reset-button", type: "button", title: "Reset Carry", onClick: onResetCarry }, "Reset"),
        h("strong", null, formatScore(scoreInfo.carry)),
      ),
      h("div", null, h("span", { className: "detail-label" }, "Plus"), h("strong", null, formatScore(scoreInfo.plus))),
      h("div", null, h("span", { className: "detail-label" }, "Minus"), h("strong", null, formatScore(scoreInfo.minus))),
      h("div", null, h("span", { className: "detail-label" }, "Records"), h("strong", null, entryCount)),
    ),
  );
}

function DateMarkerPanel({ dateMarkers, selectedDate, updateDateMarker }) {
  return h(
    "section",
    { className: "date-marker-panel", "aria-label": "Date markers" },
    h(
      "div",
      { className: "date-marker-list" },
      normalizeDateMarkers(dateMarkers).map((marker, index) =>
        h(
          "label",
          { className: "date-marker", key: `marker-${index}` },
          h("input", {
            className: "date-marker-text",
            type: "text",
            maxLength: 36,
            placeholder: `Marker ${index + 1}`,
            value: marker.text,
            onChange: (event) => updateDateMarker(index, "text", event.target.value),
          }),
          h("input", {
            className: "date-marker-date",
            type: "date",
            value: marker.date,
            onChange: (event) => updateDateMarker(index, "date", event.target.value),
          }),
          h("span", { className: `date-marker-dday ${marker.date ? "" : "empty"}` }, formatDDay(marker.date, selectedDate)),
        ),
      ),
    ),
  );
}

function isRangeCategory(category) {
  const label = String(category?.label || "").toUpperCase().replace(/\s+/g, "");
  return label === "R.ORG" || label === "D.ORG";
}

function parseScoreRange(value) {
  if (typeof value === "number" && Number.isFinite(value)) return [value];
  const text = String(value || "").trim();
  const rangeMatch = text.match(/^(\d+)\s*(?:~|-|,)\s*(\d+)$/);
  if (!rangeMatch) {
    const score = scoreNumber(text, 0);
    return [score];
  }
  const start = Number(rangeMatch[1]);
  const end = Number(rangeMatch[2]);
  const step = start <= end ? 1 : -1;
  const length = Math.min(31, Math.abs(end - start) + 1);
  return Array.from({ length }, (_, index) => start + index * step);
}

function getCategoryScoreRange(category) {
  return parseScoreRange(category.yScore).filter((score) => score > 0);
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
            onToggle: (choice) => toggleChoice({ planKey, choice, name: `Daily: ${preset.name} (${choice})`, score: scoreNumber(choice === "Y" ? preset.yScore : preset.nScore) }),
          };
        }),
      }),
      h(PlanRow, {
        className: "weekly-plan-row",
        title: "Weekly",
        cards: categories.map((category) => {
          const planEntry = getWeeklyPlanEntry(weeklyPlan[category.key]?.[weekday.key], selectedDate);
          const value = planEntry.value;
          const planKey = `plan:${selectedDate}:${category.key}`;
          const selectedEntry = entries.find((entry) => entry.planKey === planKey);
          if (isRangeCategory(category)) {
            return {
              key: category.key,
              isRangeCard: true,
              label: planEntry.cycleNumber ? `${category.label} ${planEntry.cycleNumber}` : category.label,
              scoreRange: getCategoryScoreRange(category),
              selectedChoice: selectedEntry?.choice || "",
              value,
              nScore: category.nScore,
              onToggle: (choice) =>
                toggleChoice({
                  planKey,
                  choice: choice === "N" ? "N" : String(choice),
                  name: `${category.label}: ${value} (${choice === "N" ? "N" : formatScore(choice)})`,
                  score: choice === "N" ? scoreNumber(category.nScore) : scoreNumber(choice),
                }),
            };
          }
          return {
            key: category.key,
            label: planEntry.cycleNumber ? `${category.label} ${planEntry.cycleNumber}` : category.label,
            value,
            yScore: category.yScore,
            nScore: category.nScore,
            selectedChoice: selectedEntry?.choice || "",
            onToggle: (choice) => toggleChoice({ planKey, choice, name: `${category.label}: ${value} (${choice})`, score: scoreNumber(choice === "Y" ? category.yScore : category.nScore) }),
          };
        }),
      }),
    ),
  );
}

function PlanRow({ cards, className = "", title }) {
  return h("section", { className: `plan-row ${className}` }, h("h3", null, title), h("div", { className: "plan-card-grid" }, cards.map((card) => h(PlanCard, { ...card }))));
}

function PlanCard({ label, nScore, onToggle, scoreRange, selectedChoice, value, yScore }) {
  const selectedScore = scoreNumber(selectedChoice, 0);
  const isRangeCard = Array.isArray(scoreRange);
  return h(
    "article",
    { className: `today-plan-card ${isRangeCard ? "range-card" : ""} ${selectedChoice ? "done" : ""} ${selectedChoice === "N" || (isRangeCard && selectedScore < 0) ? "no" : ""}` },
    h("span", { className: "edge-light", "aria-hidden": "true" }),
    h("span", { className: "plan-label" }, label),
    h("strong", { className: "plan-title" }, value),
    isRangeCard
      ? h(
        "div",
        { className: "range-score-buttons" },
          ...scoreRange.map((score) =>
            h(
              "button",
              { className: `range-score-button ${String(score) === selectedChoice ? "selected" : ""}`, key: score, type: "button", onClick: () => onToggle(score) },
              formatScore(score),
            ),
          ),
          h("button", { className: `range-score-button no ${selectedChoice === "N" ? "selected" : ""}`, type: "button", onClick: () => onToggle("N") }, formatScore(nScore)),
        )
      : h(
          "div",
          { className: "choice-buttons" },
          h("button", { className: `choice-button yes ${selectedChoice === "Y" ? "selected" : ""}`, type: "button", onClick: () => onToggle("Y") }, h("i", null, "Y"), h("b", null, formatScore(yScore))),
          h("button", { className: `choice-button no ${selectedChoice === "N" ? "selected" : ""}`, type: "button", onClick: () => onToggle("N") }, h("i", null, "N"), h("b", null, formatScore(nScore))),
        ),
  );
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
            h("label", { className: "score-field positive-score", title: "Y score" }, h("input", { className: "preset-score-input y-score", type: "text", inputMode: "numeric", value: preset.yScore, onChange: (event) => updatePreset(index, "yScore", event.target.value) })),
            h("label", { className: "score-field negative-score", title: "N score" }, h("input", { className: "preset-score-input n-score", type: "text", inputMode: "numeric", value: preset.nScore, onChange: (event) => updatePreset(index, "nScore", event.target.value) })),
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
            h("label", { className: `score-field y-field ${isRangeCategory(category) ? "range-score" : "positive-score"}`, title: isRangeCategory(category) ? "Y range" : "Y score" }, h("input", { className: "category-score-input y-score", type: "text", inputMode: isRangeCategory(category) ? "text" : "numeric", value: category.yScore, onChange: (event) => updateCategory(category.key, "yScore", event.target.value) })),
            h("label", { className: "score-field n-field negative-score", title: "N score" }, h("input", { className: "category-score-input n-score", type: "text", inputMode: "numeric", value: category.nScore, onChange: (event) => updateCategory(category.key, "nScore", event.target.value) })),
            h(
              "div",
              { className: "category-actions" },
              h("button", { className: "mini-button", type: "button", disabled: index === 0, onClick: () => moveCategory(category.key, -1) }, "\u2191"),
              h("button", { className: "mini-button", type: "button", disabled: index === categories.length - 1, onClick: () => moveCategory(category.key, 1) }, "\u2193"),
              h("button", { className: "mini-button danger", type: "button", disabled: categories.length <= 1, onClick: () => removeCategory(category.key) }, "\u00d7"),
            ),
          ),
          ...weekDays.map((day) =>
            h("textarea", {
              className: `weekly-input ${day.key === selectedWeekday ? "active" : ""}`,
              key: `${category.key}-${day.key}`,
              maxLength: 180,
              placeholder: `${day.label} ${category.label}`,
              value: weeklyPlan[category.key]?.[day.key] || "",
              onChange: (event) => updateWeeklyPlan(category.key, day.key, event.target.value),
              onKeyDown: (event) => event.stopPropagation(),
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

function HistoryPanel({ flaggedDate, getDayTotal, onToggleFlag, routineAttempts, selectedDate }) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${selectedDate}T00:00:00`);
    date.setDate(date.getDate() - (6 - index));
    const key = toDateKey(date);
    return { key, flagged: key === flaggedDate, total: getDayTotal(key), tried: Boolean(routineAttempts?.[key]) };
  });
  const maxAbs = Math.max(10, ...days.map((day) => Math.abs(day.total)));
  let uncheckedSinceFlag = 0;
  if (flaggedDate && flaggedDate < selectedDate) {
    let cursor = flaggedDate;
    let guard = 0;
    while (cursor < selectedDate && guard < 10000) {
      if (!routineAttempts?.[cursor]) uncheckedSinceFlag += 1;
      cursor = addDays(cursor, 1);
      guard += 1;
    }
  }
  const flagSummary = flaggedDate ? `Unchecked ${uncheckedSinceFlag} days` : "Set a flag";
  return h(
    "section",
    { className: "history-panel", "aria-label": "Last 7 days" },
    h(
      "div",
      { className: "section-heading history-heading" },
      h("h2", null, "Last 7 Days"),
      h(
        "div",
        { className: "history-heading-actions" },
        h("span", null, flagSummary),
        h(
          "button",
          {
            className: `flag-button ${flaggedDate === selectedDate ? "active" : ""}`,
            type: "button",
            title: flaggedDate === selectedDate ? "Remove flag from selected date" : "Flag selected date",
            "aria-pressed": String(flaggedDate === selectedDate),
            onClick: onToggleFlag,
          },
          "\u2691",
        ),
      ),
    ),
    h(
      "div",
      { className: "history-bars" },
      days.map((day) =>
        h(
          "div",
          { className: "history-day", key: day.key },
          h("div", { className: `history-fill ${day.total > 0 ? "plus" : day.total < 0 ? "minus" : ""}`, style: { height: `${Math.max(16, (Math.abs(day.total) / maxAbs) * 112)}px` } }),
          h("span", { className: `history-flag ${day.flagged ? "active" : ""}`, title: day.flagged ? "Flagged date" : "" }, day.flagged ? "\u2691" : ""),
          h("span", { className: `history-attempt ${day.tried ? "checked" : ""}`, title: day.tried ? "Routine tried" : "Routine not checked" }, day.tried ? "\u2713" : ""),
          h("span", { className: "history-date" }, day.key.slice(5).replace("-", ".")),
          h("strong", { className: "history-score" }, formatScore(day.total)),
        ),
      ),
    ),
  );
}

function CalendarPanel({ calendar, isOpen, onToggle, openMonths, selectedDate, setOpenMonths, updateCalendarNote }) {
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
            monthOpen ? h(MonthDays, { calendar, monthIndex, selectedDate, updateCalendarNote, year }) : null,
          );
        }),
      ),
    },
  });
}

function MonthDays({ calendar, monthIndex, selectedDate, updateCalendarNote, year }) {
  const todayKey = toDateKey(new Date());
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstDayIndex = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const cells = [
    ...Array.from({ length: firstDayIndex }, (_, index) => ({ key: `blank-start-${monthIndex}-${index}`, type: "blank" })),
    ...Array.from({ length: daysInMonth }, (_, index) => ({ day: index + 1, key: `day-${monthIndex}-${index + 1}`, type: "day" })),
  ];
  const trailingBlanks = (7 - (cells.length % 7)) % 7;
  Array.from({ length: trailingBlanks }, (_, index) => cells.push({ key: `blank-end-${monthIndex}-${index}`, type: "blank" }));
  const weeks = Array.from({ length: Math.ceil(cells.length / 7) }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  return h(
    "div",
    { className: "calendar-weeks" },
    weeks.map((week, weekIndex) =>
      h(
      "div",
      { className: "calendar-week-scroll", key: `week-${monthIndex}-${weekIndex}` },
      h("div", { className: "calendar-weekdays" }, weekDays.map((day) => h("span", { key: day.key }, day.label))),
      h(
        "div",
        { className: "calendar-days" },
        week.map((cell, cellIndex) => {
          if (cell.type === "blank") return h("div", { className: "calendar-day-spacer", key: cell.key, "aria-hidden": "true" });
          const day = cell.day;
          const dateKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const date = new Date(`${dateKey}T00:00:00`);
          const weekday = weekDays[(date.getDay() + 6) % 7].label;
          return h(
            "label",
            { className: `calendar-day ${dateKey === selectedDate ? "selected" : ""} ${dateKey === todayKey ? "today" : ""}`, key: dateKey },
            h("span", { className: "calendar-date" }, h("b", null, day), h("i", null, weekday)),
            h("textarea", { maxLength: 600, placeholder: "Schedule", value: calendar[dateKey] || "", onChange: (event) => updateCalendarNote(dateKey, event.target.value), onKeyDown: (event) => event.stopPropagation() }),
          );
        }),
      ),
      ),
    ),
  );
}

export default App;
