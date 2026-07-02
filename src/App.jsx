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

function getOrderedMonthIndexes(startMonth = new Date().getMonth()) {
  return Array.from({ length: 12 }, (_, offset) => (startMonth + offset) % 12);
}

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

const calendarDutyOptions = [
  { key: "afterSchool", label: "방" },
  { key: "nightStudy", label: "야" },
  { key: "clubActivity", label: "동" },
];

const schoolNoteColors = ["cream", "sage", "peach", "blue", "rose", "lavender", "mint", "butter"];
const noteTabColors = ["kraft", "sage", "peach", "blue", "butter", "rose", "mint", "lavender"];

const defaultNoteTabs = [
  { id: "school", label: "School", color: "kraft" },
  { id: "univ", label: "UNIV", color: "sage" },
  { id: "progress", label: "Progress", color: "peach" },
  { id: "life", label: "Life", color: "blue" },
];

function createDefaultMemoCards(globalMemos = {}) {
  return [
    { id: "memo-life", title: "Life", leftTitle: "", leftText: globalMemos.life || "", leftExtraTitle: "", leftTextExtra: "", centerTitle: "", centerText: "", centerExtraTitle: "", centerTextExtra: "", rightTitle: "", rightText: "", rightExtraTitle: "", rightTextExtra: "", memoSplits: { leftText: 50, rightText: 50 } },
    { id: "memo-school", title: "School", leftTitle: "", leftText: globalMemos.school || "", leftExtraTitle: "", leftTextExtra: "", centerTitle: "", centerText: "", centerExtraTitle: "", centerTextExtra: "", rightTitle: "", rightText: "", rightExtraTitle: "", rightTextExtra: "", memoSplits: { leftText: 50, rightText: 50 } },
    { id: "memo-ideas", title: "Ideas", leftTitle: "", leftText: "", leftExtraTitle: "", leftTextExtra: "", centerTitle: "", centerText: "", centerExtraTitle: "", centerTextExtra: "", rightTitle: "", rightText: "", rightExtraTitle: "", rightTextExtra: "", memoSplits: { leftText: 50, rightText: 50 } },
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
    .filter((category) => category && category.key)
    .map((category) => ({
      key: category.key,
      label: String(category.label ?? ""),
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
  return Array.from({ length: 12 }, (_, index) => ({
    text: markers?.[index]?.text || "",
    date: markers?.[index]?.date || "",
  }));
}

function normalizeCalendarDuties(duties) {
  if (!duties || typeof duties !== "object") return {};
  return Object.entries(duties).reduce((normalized, [dateKey, value]) => {
    const flags = calendarDutyOptions.reduce((items, option) => {
      if (Boolean(value?.[option.key])) items[option.key] = true;
      return items;
    }, {});
    if (Object.keys(flags).length) normalized[dateKey] = flags;
    return normalized;
  }, {});
}

function normalizeCarryPenalties(penalties) {
  if (!penalties || typeof penalties !== "object") return {};
  return Object.entries(penalties).reduce((normalized, [dateKey, value]) => {
    if (value) normalized[dateKey] = true;
    return normalized;
  }, {});
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function normalizeMemos(memos) {
  const global = memos?.global && typeof memos.global === "object" ? memos.global : { life: "", school: "" };
  const sourceCards = Array.isArray(memos?.cards) && memos.cards.length ? memos.cards : createDefaultMemoCards(global);
  const cards = sourceCards
    .filter((card) => card && card.id)
    .map((card, index) => ({
      id: card.id,
      title: String(card.title == null ? `Memo ${index + 1}` : card.title).slice(0, 32),
      leftTitle: String(card.leftTitle || "").slice(0, 48),
      leftText: String(card.leftText ?? card.text ?? ""),
      leftExtraTitle: String(card.leftExtraTitle || "").slice(0, 48),
      leftTextExtra: String(card.leftTextExtra || ""),
      centerTitle: String(card.centerTitle || "").slice(0, 48),
      centerText: String(card.centerText || ""),
      centerExtraTitle: String(card.centerExtraTitle || "").slice(0, 48),
      centerTextExtra: String(card.centerTextExtra || ""),
      rightTitle: String(card.rightTitle || "").slice(0, 48),
      rightText: String(card.rightText || ""),
      rightExtraTitle: String(card.rightExtraTitle || "").slice(0, 48),
      rightTextExtra: String(card.rightTextExtra || ""),
      memoSplits: {
        leftText: clampNumber(card.memoSplits?.leftText ?? 50, 24, 76),
        rightText: clampNumber(card.memoSplits?.rightText ?? 50, 24, 76),
      },
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
      title: String(block.title == null ? `Work ${index + 1}` : block.title),
      content: String(block.content || ""),
      open: block.open !== false,
    }));
  if (Array.isArray(work?.categories) && work.categories.length) {
    return {
      categories: work.categories.map((category, index) => ({
        id: category.id || createKey("work-category"),
        title: String(category.title == null ? `Category ${index + 1}` : category.title),
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

function getStableSchoolColor(id, index = 0) {
  const text = String(id || "");
  const hash = Array.from(text).reduce((sum, character) => sum + character.charCodeAt(0), index);
  return schoolNoteColors[Math.abs(hash) % schoolNoteColors.length];
}

function normalizeSchool(school) {
  const sourceNotes = Array.isArray(school?.notes) && school.notes.length
    ? school.notes
    : [{ id: "school-note-main", title: "Memo 1", content: "", open: true }];
  const notes = sourceNotes
    .filter((note) => note && note.id)
    .map((note, index) => ({
      id: note.id,
      title: String(note.title == null ? `Memo ${index + 1}` : note.title).replace(/^School Memo\b/, "Memo").slice(0, 48),
      content: String(note.content || ""),
      open: note.open !== false,
      color: schoolNoteColors.includes(note.color) ? note.color : getStableSchoolColor(note.id, index),
    }));
  return {
    notes: notes.length ? notes : [{ id: "school-note-main", title: "Memo 1", content: "", open: true }],
  };
}

function normalizeNoteTabs(tabs) {
  const sourceTabs = Array.isArray(tabs) && tabs.length ? tabs : defaultNoteTabs;
  const seen = new Set();
  const normalized = sourceTabs
    .filter((tab) => tab && tab.id)
    .map((tab, index) => ({
      id: String(tab.id).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || createKey("note"),
      label: String(tab.label || tab.title || `Note ${index + 1}`).slice(0, 24),
      color: noteTabColors.includes(tab.color) ? tab.color : noteTabColors[index % noteTabColors.length],
    }))
    .filter((tab) => {
      if (seen.has(tab.id)) return false;
      seen.add(tab.id);
      return true;
    });
  return normalized.length ? normalized : defaultNoteTabs;
}

function createFallbackState() {
  const categories = cloneCategories();
  return {
    days: {},
    memos: normalizeMemos(),
    calendar: {},
    calendarDuties: {},
    routineAttempts: {},
    carryPenalties: {},
    flaggedDate: "",
    carryResetDate: "",
    carryAdjustment: 0,
    schoolPresets: clonePresets(),
    presets: clonePresets(),
    categories,
    weeklyPlan: createEmptyWeeklyPlan(categories),
    dateMarkers: normalizeDateMarkers(),
    work: normalizeWork(),
    school: normalizeSchool(),
    univ: normalizeSchool(),
    progress: normalizeSchool(),
    life: normalizeSchool(),
    noteTabs: normalizeNoteTabs(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeState(source) {
  const fallback = createFallbackState();
  const categories = normalizeCategories(source?.categories, fallback.categories);
  const noteTabs = normalizeNoteTabs(source?.noteTabs);
  const noteSections = noteTabs.reduce((sections, tab) => {
    sections[tab.id] = normalizeSchool(source?.[tab.id]);
    return sections;
  }, {});
  const knownKeys = new Set([
    "days",
    "memos",
    "calendar",
    "calendarDuties",
    "routineAttempts",
    "carryPenalties",
    "flaggedDate",
    "carryResetDate",
    "carryAdjustment",
    "schoolPresets",
    "presets",
    "categories",
    "weeklyPlan",
    "dateMarkers",
    "work",
    "school",
    "univ",
    "progress",
    "life",
    "noteTabs",
    "updatedAt",
  ]);
  const extraTabData =
    source && typeof source === "object"
      ? Object.fromEntries(Object.entries(source).filter(([key]) => !knownKeys.has(key)))
      : {};
  return {
    ...extraTabData,
    days: source?.days && typeof source.days === "object" ? source.days : {},
    memos: normalizeMemos(source?.memos),
    calendar: source?.calendar && typeof source.calendar === "object" ? source.calendar : {},
    calendarDuties: normalizeCalendarDuties(source?.calendarDuties),
    routineAttempts: source?.routineAttempts && typeof source.routineAttempts === "object" ? source.routineAttempts : {},
    carryPenalties: normalizeCarryPenalties(source?.carryPenalties),
    flaggedDate: source?.flaggedDate || "",
    carryResetDate: source?.carryResetDate || "",
    carryAdjustment: scoreNumber(source?.carryAdjustment, 0),
    schoolPresets: normalizePresets(source?.schoolPresets),
    presets: normalizePresets(source?.presets),
    categories,
    weeklyPlan: normalizeWeeklyPlan(source?.weeklyPlan, categories),
    dateMarkers: normalizeDateMarkers(source?.dateMarkers),
    work: normalizeWork(source?.work),
    school: normalizeSchool(source?.school),
    univ: normalizeSchool(source?.univ),
    progress: normalizeSchool(source?.progress),
    life: normalizeSchool(source?.life),
    noteTabs,
    ...noteSections,
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
    { className: `${className} collapsible-panel ${isOpen ? "" : "collapsed"}` },
    h(
      "div",
      {
        className: "section-heading toggle-heading",
        role: "button",
        tabIndex: 0,
        "aria-controls": controls,
        "aria-expanded": String(isOpen),
        onClick: handleClick,
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
  const [activeNoteView, setActiveNoteView] = useState("school");
  const [selectedDate, setSelectedDate] = useState(toDateKey(new Date()));
  const [openPanels, setOpenPanels] = useState({
    sync: false,
    system: false,
    schoolDaily: false,
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

  useEffect(() => {
    const tabs = normalizeNoteTabs(data.noteTabs);
    if (!tabs.some((tab) => tab.id === activeNoteView)) setActiveNoteView(tabs[0].id);
  }, [activeNoteView, data.noteTabs]);

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
  const carryPenaltyMarked = Boolean(data.carryPenalties?.[selectedDate]);

  const getEntries = (dateKey = selectedDate) => (Array.isArray(data.days[dateKey]) ? data.days[dateKey] : []);
  const getDayTotal = (dateKey) => getEntries(dateKey).reduce((sum, entry) => sum + entry.score, 0);
  const getCarryTotal = () => {
    const carryFromEntries = Object.entries(data.days).reduce((sum, [key, dayEntries]) => {
      if (key >= selectedDate || !Array.isArray(dayEntries)) return sum;
      if (data.carryResetDate && selectedDate >= data.carryResetDate && key < data.carryResetDate) return sum;
      return sum + dayEntries.reduce((daySum, entry) => daySum + entry.score, 0);
    }, 0);
    const carryPenaltyTotal = Object.entries(data.carryPenalties || {}).reduce((sum, [key, marked]) => {
      if (!marked || key > selectedDate) return sum;
      if (data.carryResetDate && selectedDate >= data.carryResetDate && key < data.carryResetDate) return sum;
      return sum - 2;
    }, 0);
    return carryFromEntries + carryPenaltyTotal + scoreNumber(data.carryAdjustment, 0);
  };

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
      draft.carryPenalties = normalizeCarryPenalties(draft.carryPenalties);
      if (draft.routineAttempts[selectedDate]) delete draft.routineAttempts[selectedDate];
      else {
        draft.routineAttempts[selectedDate] = true;
        delete draft.carryPenalties[selectedDate];
      }
      return draft;
    });
  };

  const toggleCarryPenalty = () => {
    saveData((draft) => {
      draft.routineAttempts = draft.routineAttempts || {};
      draft.carryPenalties = normalizeCarryPenalties(draft.carryPenalties);
      if (draft.carryPenalties[selectedDate]) delete draft.carryPenalties[selectedDate];
      else {
        draft.carryPenalties[selectedDate] = true;
        delete draft.routineAttempts[selectedDate];
      }
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
      draft.carryAdjustment = 0;
      return draft;
    });
  };

  const adjustCarry = (amount) => {
    saveData((draft) => {
      draft.carryAdjustment = scoreNumber(draft.carryAdjustment, 0) + amount;
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

  const moveMemoCard = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    saveData((draft) => {
      const fromIndex = draft.memos.cards.findIndex((card) => card.id === fromId);
      const toIndex = draft.memos.cards.findIndex((card) => card.id === toId);
      if (fromIndex < 0 || toIndex < 0) return draft;
      const [card] = draft.memos.cards.splice(fromIndex, 1);
      draft.memos.cards.splice(toIndex, 0, card);
      draft.memos.activeMemoId = card.id;
      return draft;
    });
  };

  const updateMemoCard = (id, field, value) => {
    saveData((draft) => {
      const card = draft.memos.cards.find((item) => item.id === id);
      if (!card) return draft;
      if (field === "title") card.title = value;
      if (field === "leftTitle") card.leftTitle = value;
      if (field === "leftText") card.leftText = value;
      if (field === "leftExtraTitle") card.leftExtraTitle = value;
      if (field === "leftTextExtra") card.leftTextExtra = value;
      if (field === "centerTitle") card.centerTitle = value;
      if (field === "centerText") card.centerText = value;
      if (field === "centerExtraTitle") card.centerExtraTitle = value;
      if (field === "centerTextExtra") card.centerTextExtra = value;
      if (field === "rightTitle") card.rightTitle = value;
      if (field === "rightText") card.rightText = value;
      if (field === "rightExtraTitle") card.rightExtraTitle = value;
      if (field === "rightTextExtra") card.rightTextExtra = value;
      if (field === "memoSplits") card.memoSplits = { ...(card.memoSplits || {}), ...value };
      if (id === "memo-life") draft.memos.global.life = card.leftText || "";
      if (id === "memo-school") draft.memos.global.school = card.leftText || "";
      return draft;
    });
  };

  const addMemoCard = () => {
    saveData((draft) => {
      const card = { id: createKey("memo"), title: `Memo ${draft.memos.cards.length + 1}`, leftTitle: "", leftText: "", leftExtraTitle: "", leftTextExtra: "", centerTitle: "", centerText: "", centerExtraTitle: "", centerTextExtra: "", rightTitle: "", rightText: "", rightExtraTitle: "", rightTextExtra: "", memoSplits: { leftText: 50, rightText: 50 } };
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

  const addPresetTo = (listKey, keyPrefix) => {
    saveData((draft) => {
      const presets = Array.isArray(draft[listKey]) ? draft[listKey] : [];
      presets.push({ key: createKey(keyPrefix), name: `New Record ${presets.length + 1}`, yScore: 5, nScore: -2 });
      draft[listKey] = presets;
      return draft;
    });
  };

  const updatePresetIn = (listKey, index, field, value) => {
    saveData((draft) => {
      const presets = Array.isArray(draft[listKey]) ? draft[listKey] : [];
      const preset = presets[index];
      if (!preset) return draft;
      if (field === "name") preset.name = value;
      if (field === "yScore") preset.yScore = value;
      if (field === "nScore") preset.nScore = value;
      draft[listKey] = presets;
      return draft;
    });
  };

  const movePresetIn = (listKey, fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return;
    saveData((draft) => {
      const presets = Array.isArray(draft[listKey]) ? draft[listKey] : [];
      const fromIndex = presets.findIndex((preset) => preset.key === fromKey);
      const toIndex = presets.findIndex((preset) => preset.key === toKey);
      if (fromIndex < 0 || toIndex < 0) return draft;
      const [preset] = presets.splice(fromIndex, 1);
      presets.splice(toIndex, 0, preset);
      draft[listKey] = presets;
      return draft;
    });
  };

  const removePresetFrom = (listKey, index) => {
    saveData((draft) => {
      const presets = Array.isArray(draft[listKey]) ? draft[listKey] : [];
      presets.splice(index, 1);
      draft[listKey] = presets;
      return draft;
    });
  };

  const addPreset = () => addPresetTo("presets", "daily");
  const updatePreset = (index, field, value) => updatePresetIn("presets", index, field, value);
  const movePreset = (fromKey, toKey) => movePresetIn("presets", fromKey, toKey);
  const removePreset = (index) => removePresetFrom("presets", index);
  const addSchoolPreset = () => addPresetTo("schoolPresets", "school");
  const updateSchoolPreset = (index, field, value) => updatePresetIn("schoolPresets", index, field, value);
  const moveSchoolPreset = (fromKey, toKey) => movePresetIn("schoolPresets", fromKey, toKey);
  const removeSchoolPreset = (index) => removePresetFrom("schoolPresets", index);

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

  const moveCategory = (fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return;
    saveData((draft) => {
      const fromIndex = draft.categories.findIndex((category) => category.key === fromKey);
      const toIndex = draft.categories.findIndex((category) => category.key === toKey);
      if (fromIndex < 0 || toIndex < 0) return draft;
      const [category] = draft.categories.splice(fromIndex, 1);
      draft.categories.splice(toIndex, 0, category);
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

  const toggleCalendarDuty = (dateKey, dutyKey) => {
    saveData((draft) => {
      draft.calendarDuties = normalizeCalendarDuties(draft.calendarDuties);
      const current = draft.calendarDuties[dateKey] || {};
      const next = { ...current, [dutyKey]: !current[dutyKey] };
      const active = Object.fromEntries(Object.entries(next).filter(([, value]) => value));
      if (Object.keys(active).length) draft.calendarDuties[dateKey] = active;
      else delete draft.calendarDuties[dateKey];
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

  const addMemoNote = (sectionKey, idPrefix) => {
    saveData((draft) => {
      draft[sectionKey] = normalizeSchool(draft[sectionKey]);
      const nextId = createKey(idPrefix);
      draft[sectionKey].notes.push({
        id: nextId,
        title: `Memo ${draft[sectionKey].notes.length + 1}`,
        content: "",
        open: true,
        color: schoolNoteColors[draft[sectionKey].notes.length % schoolNoteColors.length],
      });
      return draft;
    });
  };

  const updateMemoNote = (sectionKey, id, field, value) => {
    saveData((draft) => {
      draft[sectionKey] = normalizeSchool(draft[sectionKey]);
      const note = draft[sectionKey].notes.find((item) => item.id === id);
      if (!note) return draft;
      if (field === "title") note.title = value;
      if (field === "content") note.content = value;
      if (field === "color" && schoolNoteColors.includes(value)) note.color = value;
      return draft;
    });
  };

  const toggleMemoNote = (sectionKey, id) => {
    saveData((draft) => {
      draft[sectionKey] = normalizeSchool(draft[sectionKey]);
      const note = draft[sectionKey].notes.find((item) => item.id === id);
      if (note) note.open = !note.open;
      return draft;
    });
  };

  const removeMemoNote = (sectionKey, id, label) => {
    const confirmed = window.confirm(`Delete this ${label} memo?`);
    if (!confirmed) return;
    saveData((draft) => {
      draft[sectionKey] = normalizeSchool(draft[sectionKey]);
      if (draft[sectionKey].notes.length <= 1) return draft;
      draft[sectionKey].notes = draft[sectionKey].notes.filter((note) => note.id !== id);
      return draft;
    });
  };

  const moveMemoNote = (sectionKey, fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    saveData((draft) => {
      draft[sectionKey] = normalizeSchool(draft[sectionKey]);
      const fromIndex = draft[sectionKey].notes.findIndex((note) => note.id === fromId);
      const toIndex = draft[sectionKey].notes.findIndex((note) => note.id === toId);
      if (fromIndex < 0 || toIndex < 0) return draft;
      const [note] = draft[sectionKey].notes.splice(fromIndex, 1);
      draft[sectionKey].notes.splice(toIndex, 0, note);
      return draft;
    });
  };

  const addNoteTab = () => {
    const nextId = createKey("note");
    saveData((draft) => {
      draft.noteTabs = normalizeNoteTabs(draft.noteTabs);
      const nextLabel = `Note ${draft.noteTabs.length + 1}`;
      draft.noteTabs.push({ id: nextId, label: nextLabel, color: noteTabColors[draft.noteTabs.length % noteTabColors.length] });
      draft[nextId] = normalizeSchool({ notes: [{ id: createKey(`${nextId}-memo`), title: "Memo 1", content: "", open: true }] });
      return draft;
    });
    setActiveNoteView(nextId);
  };

  const updateNoteTab = (id, label) => {
    saveData((draft) => {
      draft.noteTabs = normalizeNoteTabs(draft.noteTabs).map((tab) => (tab.id === id ? { ...tab, label: label.slice(0, 24) } : tab));
      return draft;
    });
  };

  const removeNoteTab = (id) => {
    const tabs = normalizeNoteTabs(dataRef.current.noteTabs);
    if (tabs.length <= 1) return;
    const tab = tabs.find((item) => item.id === id);
    const confirmed = window.confirm(`Delete the ${tab?.label || "Note"} tab?`);
    if (!confirmed) return;
    const nextActive = activeNoteView === id ? tabs.find((item) => item.id !== id)?.id || tabs[0].id : activeNoteView;
    saveData((draft) => {
      draft.noteTabs = normalizeNoteTabs(draft.noteTabs).filter((item) => item.id !== id);
      delete draft[id];
      return draft;
    });
    setActiveNoteView(nextActive);
  };

  const moveNoteTab = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    saveData((draft) => {
      draft.noteTabs = normalizeNoteTabs(draft.noteTabs);
      const fromIndex = draft.noteTabs.findIndex((tab) => tab.id === fromId);
      const toIndex = draft.noteTabs.findIndex((tab) => tab.id === toId);
      if (fromIndex < 0 || toIndex < 0) return draft;
      const [tab] = draft.noteTabs.splice(fromIndex, 1);
      draft.noteTabs.splice(toIndex, 0, tab);
      return draft;
    });
  };

  const addSchoolNote = () => addMemoNote("school", "school-note");
  const updateSchoolNote = (id, field, value) => updateMemoNote("school", id, field, value);
  const toggleSchoolNote = (id) => toggleMemoNote("school", id);
  const removeSchoolNote = (id) => removeMemoNote("school", id, "school");
  const moveSchoolNote = (fromId, toId) => moveMemoNote("school", fromId, toId);
  const addUnivNote = () => addMemoNote("univ", "univ-note");
  const updateUnivNote = (id, field, value) => updateMemoNote("univ", id, field, value);
  const toggleUnivNote = (id) => toggleMemoNote("univ", id);
  const removeUnivNote = (id) => removeMemoNote("univ", id, "UNIV");
  const moveUnivNote = (fromId, toId) => moveMemoNote("univ", fromId, toId);
  const addProgressNote = () => addMemoNote("progress", "progress-note");
  const updateProgressNote = (id, field, value) => updateMemoNote("progress", id, field, value);
  const toggleProgressNote = (id) => toggleMemoNote("progress", id);
  const removeProgressNote = (id) => removeMemoNote("progress", id, "Progress");
  const moveProgressNote = (fromId, toId) => moveMemoNote("progress", fromId, toId);
  const addLifeNote = () => addMemoNote("life", "life-note");
  const updateLifeNote = (id, field, value) => updateMemoNote("life", id, field, value);
  const toggleLifeNote = (id) => toggleMemoNote("life", id);
  const removeLifeNote = (id) => removeMemoNote("life", id, "Life");
  const moveLifeNote = (fromId, toId) => moveMemoNote("life", fromId, toId);

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

  const dashboardView = h(
    React.Fragment,
    null,
    h(SchedulePanel, { calendar: data.calendar, calendarDuties: data.calendarDuties, selectedDate }),
    h(
      "div",
      { className: "daily-workspace" },
      h(MemoPanel, {
        activeMemoId: data.memos.activeMemoId,
        addMemoCard,
        cards: data.memos.cards,
        moveMemoCard,
        removeMemoCard,
        setActiveMemo,
        updateMemoCard,
      }),
      h(
        "div",
        { className: "daily-left-rail" },
        h(ScorePanel, { carryPenaltyMarked, entryCount: entries.length, onAdjustCarry: adjustCarry, onResetCarry: resetCarry, onToggleAttempt: toggleRoutineAttempt, onToggleCarryPenalty: toggleCarryPenalty, routineTried, scoreInfo }),
        h(DateMarkerPanel, { dateMarkers: data.dateMarkers, selectedDate, updateDateMarker }),
      ),
    ),
    h(TodayPlanPanel, {
      categories: data.categories,
      entries,
      presets: data.presets,
      schoolPresets: data.schoolPresets,
      selectedDate,
      weekday,
      weeklyPlan: data.weeklyPlan,
      toggleChoice,
    }),
    h(CalendarPanel, {
      calendar: data.calendar,
      calendarDuties: data.calendarDuties,
      isOpen: openPanels.calendar,
      onToggle: () => togglePanel("calendar"),
      openMonths,
      selectedDate,
      setOpenMonths,
      toggleCalendarDuty,
      updateCalendarNote,
    }),
    h(DailyPanel, {
      addPreset: addSchoolPreset,
      controlsId: "schoolPresetGrid",
      isOpen: openPanels.schoolDaily,
      movePreset: moveSchoolPreset,
      onToggle: () => togglePanel("schoolDaily"),
      presets: data.schoolPresets,
      removePreset: removeSchoolPreset,
      title: "School",
      updatePreset: updateSchoolPreset,
    }),
    h(DailyPanel, {
      addPreset,
      controlsId: "presetGrid",
      isOpen: openPanels.daily,
      movePreset,
      onToggle: () => togglePanel("daily"),
      presets: data.presets,
      removePreset,
      title: "Daily",
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
    h(RecordPanel, {
      clearSelectedDay,
      entries,
      isOpen: openPanels.record,
      onToggle: () => togglePanel("record"),
      removeEntry,
    }),
    h(HistoryPanel, { carryPenalties: data.carryPenalties, flaggedDate: data.flaggedDate, getDayTotal, onToggleFlag: toggleFlaggedDate, routineAttempts: data.routineAttempts, selectedDate }),
  );

  const noteTabs = normalizeNoteTabs(data.noteTabs);
  const activeNoteKey = noteTabs.some((tab) => tab.id === activeNoteView) ? activeNoteView : noteTabs[0].id;
  const memoView = {
    addSchoolNote: () => addMemoNote(activeNoteKey, `${activeNoteKey}-note`),
    moveSchoolNote: (fromId, toId) => moveMemoNote(activeNoteKey, fromId, toId),
    notes: normalizeSchool(data[activeNoteKey]).notes,
    removeSchoolNote: (id) => removeMemoNote(activeNoteKey, id, activeNoteKey),
    toggleSchoolNote: (id) => toggleMemoNote(activeNoteKey, id),
    updateSchoolNote: (id, field, value) => updateMemoNote(activeNoteKey, id, field, value),
  };

  return h(
    "main",
    { className: "app-shell" },
    h(Topbar, { activeView, selectedDate, setActiveView, setSelectedDate, shiftDate }),
    activeView === "note"
      ? h(NoteView, { activeNoteView: activeNoteKey, addNoteTab, memoView, moveNoteTab, noteTabs, removeNoteTab, setActiveNoteView, updateNoteTab })
      : dashboardView,
    activeView === "dashboard"
      ? h(
          React.Fragment,
          null,
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
        )
      : null,
  );
}

function AppNavigation({ activeView, setActiveView }) {
  const items = [
    { key: "dashboard", label: "Dash Board" },
    { key: "note", label: "Note" },
  ];
  const renderNavButton = (item) =>
    h(
      "button",
      {
        className: `nav-button ${activeView === item.key ? "active" : ""}`,
        key: item.key,
        type: "button",
        "aria-current": activeView === item.key ? "page" : undefined,
        onClick: () => setActiveView(item.key),
      },
      item.label,
    );
  return h(
    "nav",
    { className: "app-navigation", "aria-label": "Main menu" },
    h(
      "div",
      { className: "nav-buttons" },
      h("div", { className: "nav-row" }, items.map(renderNavButton)),
    ),
  );
}

function NoteView({ activeNoteView, addNoteTab, memoView, moveNoteTab, noteTabs, removeNoteTab, setActiveNoteView, updateNoteTab }) {
  const [dragTabId, setDragTabId] = useState("");
  const [editingTabId, setEditingTabId] = useState("");
  return h(
    React.Fragment,
    null,
    h(
      "nav",
      { className: "note-subnav", "aria-label": "Note categories" },
      h(
        "div",
        { className: "note-subnav-tabs" },
        noteTabs.map((item) =>
          h(
            "div",
            {
              className: `note-subnav-item ${activeNoteView === item.id ? "active" : ""} ${dragTabId === item.id ? "dragging" : ""}`,
              draggable: true,
              key: item.id,
              "data-color": item.color || "kraft",
              "aria-current": activeNoteView === item.id ? "page" : undefined,
              onClick: () => setActiveNoteView(item.id),
              onDragStart: (event) => {
                if (event.target.closest?.(".note-subnav-editor")) {
                  event.preventDefault();
                  return;
                }
                setDragTabId(item.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/note-tab", item.id);
              },
              onDragOver: (event) => {
                if (!dragTabId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              },
              onDrop: (event) => {
                const fromId = event.dataTransfer.getData("text/note-tab") || dragTabId;
                if (!fromId) return;
                event.preventDefault();
                moveNoteTab(fromId, item.id);
                setDragTabId("");
              },
              onDragEnd: () => setDragTabId(""),
            },
            editingTabId === item.id
              ? h("input", {
                  autoFocus: true,
                  className: "note-subnav-editor",
                  defaultValue: item.label,
                  "aria-label": "Edit note tab name",
                  onClick: (event) => event.stopPropagation(),
                  onBlur: (event) => {
                    updateNoteTab(item.id, event.currentTarget.value || "Note");
                    setEditingTabId("");
                  },
                  onKeyDown: (event) => {
                    event.stopPropagation();
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") setEditingTabId("");
                  },
                })
              : h("span", { className: "note-subnav-label" }, item.label),
          ),
        ),
      ),
      h(
        "div",
        { className: "note-tab-toolbar" },
        h("button", { className: "note-tab-tool note-tab-add", type: "button", onClick: addNoteTab, title: "Add note tab", "aria-label": "Add note tab" }, "+"),
        h("button", { className: "note-tab-tool note-tab-edit", type: "button", onClick: () => setEditingTabId(activeNoteView), title: "Rename selected tab", "aria-label": "Rename selected tab" }),
        h("button", { className: "note-tab-tool note-tab-delete", type: "button", disabled: noteTabs.length <= 1, onClick: () => removeNoteTab(activeNoteView), title: "Delete selected tab", "aria-label": "Delete selected tab" }),
      ),
    ),
    h(SchoolView, memoView),
  );
}

function SchoolView({ addSchoolNote, moveSchoolNote, notes, removeSchoolNote, toggleSchoolNote, updateSchoolNote }) {
  const [dragNoteId, setDragNoteId] = useState("");
  const [openColorNoteId, setOpenColorNoteId] = useState("");
  const dragJustEndedRef = useRef(false);
  useEffect(() => {
    if (!openColorNoteId) return undefined;
    const closeColorMenu = () => setOpenColorNoteId("");
    document.addEventListener("click", closeColorMenu);
    return () => document.removeEventListener("click", closeColorMenu);
  }, [openColorNoteId]);
  return h(
    "section",
    { className: "school-view", "aria-label": "School memos" },
    h(
      "div",
      { className: "school-note-list" },
      notes.map((note) =>
        h(
          "article",
          {
            className: `school-note ${note.open ? "" : "collapsed"} ${dragNoteId === note.id ? "dragging" : ""}`,
            draggable: true,
            key: note.id,
            "data-color": note.color || "cream",
            onClick: (event) => {
              if (dragJustEndedRef.current) {
                dragJustEndedRef.current = false;
                return;
              }
              if (panelClickIsInteractive(event.target)) return;
              toggleSchoolNote(note.id);
            },
            onDragStart: (event) => {
              if (panelClickIsInteractive(event.target)) {
                event.preventDefault();
                return;
              }
              dragJustEndedRef.current = true;
              setDragNoteId(note.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/school-note", note.id);
            },
            onDragOver: (event) => {
              if (!dragNoteId) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            },
            onDrop: (event) => {
              const fromId = event.dataTransfer.getData("text/school-note") || dragNoteId;
              if (!fromId) return;
              event.preventDefault();
              moveSchoolNote(fromId, note.id);
              setDragNoteId("");
            },
            onDragEnd: () => {
              setDragNoteId("");
              window.setTimeout(() => {
                dragJustEndedRef.current = false;
              }, 120);
            },
          },
          h(
            "div",
            { className: "school-note-heading" },
            h("textarea", {
              value: note.title,
              "aria-label": "School memo title",
              rows: Math.min(4, Math.max(1, String(note.title || "").split("\n").reduce((rows, line) => rows + Math.max(1, Math.ceil(line.length / 24)), 0))),
              onChange: (event) => updateSchoolNote(note.id, "title", event.target.value),
              onKeyDown: (event) => {
                event.stopPropagation();
                if (event.key === "Enter") event.currentTarget.blur();
              },
            }),
            h(
              "div",
              { className: "school-note-actions" },
              h(
                "div",
                { className: "school-color-picker" },
                h(
                  "button",
                  {
                    className: "school-color-button",
                    type: "button",
                    title: "Choose memo color",
                    "aria-label": "Choose memo color",
                    "aria-expanded": openColorNoteId === note.id,
                    onClick: (event) => {
                      event.stopPropagation();
                      setOpenColorNoteId((current) => (current === note.id ? "" : note.id));
                    },
                  },
                  h("img", { alt: "", "aria-hidden": "true", src: "./paint-brush.png" }),
                ),
                openColorNoteId === note.id
                  ? h(
                      "div",
                      { className: "school-color-menu", role: "menu", "aria-label": "Memo colors" },
                      schoolNoteColors.map((color) =>
                        h("button", {
                          className: `school-color-swatch ${note.color === color ? "active" : ""}`,
                          key: color,
                          type: "button",
                          title: color,
                          "aria-label": `Use ${color} memo color`,
                          "data-color": color,
                          onClick: (event) => {
                            event.stopPropagation();
                            updateSchoolNote(note.id, "color", color);
                            setOpenColorNoteId("");
                          },
                        }),
                      ),
                    )
                  : null,
              ),
              h("button", { className: "school-delete-note", type: "button", disabled: notes.length <= 1, title: "Delete memo", "aria-label": "Delete memo", onClick: () => removeSchoolNote(note.id) }, "\u00d7"),
            ),
          ),
          h("button", {
            className: `school-note-toggle-tab ${note.open ? "open" : ""}`,
            type: "button",
            title: note.open ? "Close memo" : "Open memo",
            "aria-label": note.open ? "Close memo" : "Open memo",
            onClick: (event) => {
              event.stopPropagation();
              toggleSchoolNote(note.id);
            },
          }),
          note.open
            ? h("textarea", {
                className: "school-note-textarea",
                placeholder: "Write school notes here...",
                value: note.content,
                onChange: (event) => updateSchoolNote(note.id, "content", event.target.value),
                onKeyDown: (event) => event.stopPropagation(),
              })
            : null,
        ),
      ),
      h("button", { className: "school-add-note", type: "button", onClick: addSchoolNote }, "+ Memo"),
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

function Topbar({ activeView, selectedDate, setActiveView, setSelectedDate, shiftDate }) {
  const viewLabels = {
    dashboard: "DASH BOARD",
    note: "NOTE",
  };
  const viewLabel = viewLabels[activeView] || "DASH BOARD";
  return h(
    "section",
    { className: "topbar", "aria-label": "Date selector", "data-view-label": viewLabel },
    h("div", null, h("p", { className: "eyebrow" }, viewLabel), h("h1", null, formatDayLabel(selectedDate))),
    h(
      "div",
      { className: "topbar-controls" },
      h(
        "div",
        { className: "day-switcher" },
        h("button", { className: "icon-button", type: "button", title: "Previous day", "aria-label": "Previous day", onClick: () => shiftDate(-1) }, "\u2039"),
        h("input", { type: "date", value: selectedDate, "aria-label": "Record date", onChange: (event) => setSelectedDate(event.target.value || toDateKey(new Date())) }),
        h("button", { className: "icon-button", type: "button", title: "Next day", "aria-label": "Next day", onClick: () => shiftDate(1) }, "\u203a"),
      ),
      h(AppNavigation, { activeView, setActiveView }),
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

function SchedulePanel({ calendar, calendarDuties, selectedDate }) {
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
            const dutyItems = calendarDutyOptions
              .filter((option) => calendarDuties?.[dateKey]?.[option.key])
              .map((option) => ({ type: "duty", label: option.label }));
            const lines = schedule.split(/\n+/).filter(Boolean).map((line) => ({ type: "note", label: line }));
            const items = [...dutyItems, ...lines];
            const dateLabel = formatCompactDate(dateKey);
            const isSelected = dateKey === selectedDate;
            return h(
              "article",
              { className: `schedule-day ${isSelected ? "selected today" : ""}`, key: dateKey },
              h("div", { className: "schedule-date" }, h("b", null, `${dateLabel.month} ${dateLabel.day}`)),
              h(
                "div",
                { className: `schedule-day-items ${items.length ? "" : "empty"}` },
                items.length
                  ? items.map((item, index) =>
                      h(
                        "span",
                        { className: item.type === "duty" ? "schedule-duty-item" : "", key: `${dateKey}-${index}` },
                        item.type === "duty" ? h("input", { type: "checkbox", checked: true, readOnly: true, tabIndex: -1 }) : null,
                        item.label,
                      ),
                    )
                  : h("i", null, "No schedule"),
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

function MemoPanel({ activeMemoId, addMemoCard, cards, moveMemoCard, removeMemoCard, setActiveMemo, updateMemoCard }) {
  const [drag, setDrag] = useState({ active: false, startX: 0, deltaX: 0 });
  const [dragMemoId, setDragMemoId] = useState("");
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
          const memoAreas = [
            { key: "left", titleField: "leftTitle", titleValue: card.leftTitle || "", field: "leftText", value: card.leftText || "" },
            { key: "center", titleField: "centerTitle", titleValue: card.centerTitle || "", field: "centerText", value: card.centerText || "" },
            { key: "right", titleField: "rightTitle", titleValue: card.rightTitle || "", field: "rightText", value: card.rightText || "" },
            { key: "left-extra", titleField: "leftExtraTitle", titleValue: card.leftExtraTitle || "", field: "leftTextExtra", value: card.leftTextExtra || "" },
            { key: "center-extra", titleField: "centerExtraTitle", titleValue: card.centerExtraTitle || "", field: "centerTextExtra", value: card.centerTextExtra || "" },
            { key: "right-extra", titleField: "rightExtraTitle", titleValue: card.rightExtraTitle || "", field: "rightTextExtra", value: card.rightTextExtra || "" },
          ];
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
                  { className: "memo-card-columns memo-six-grid" },
                  memoAreas.map((area) =>
                    h(MemoArea, {
                      cardId: card.id,
                      field: area.field,
                      key: area.key,
                      titleField: area.titleField,
                      titleValue: area.titleValue,
                      updateMemoCard,
                      value: area.value,
                    }),
                  ),
                )
              : h(
                  "div",
                  { className: "memo-card-preview-grid" },
                  memoAreas.slice(0, 6).map((area) => h("p", { className: "memo-card-preview", key: area.key }, area.value || "Empty memo")),
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
              className: `memo-index-button ${index === activeIndex ? "active" : ""} ${dragMemoId === card.id ? "dragging" : ""}`,
              draggable: true,
              key: card.id,
              type: "button",
              onDragStart: (event) => {
                setDragMemoId(card.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/memo-card", card.id);
              },
              onDragOver: (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              },
              onDrop: (event) => {
                event.preventDefault();
                const fromId = event.dataTransfer.getData("text/memo-card") || dragMemoId;
                moveMemoCard(fromId, card.id);
                setDragMemoId("");
              },
              onDragEnd: () => setDragMemoId(""),
              onClick: () => setActiveMemo(card.id),
            },
            index + 1,
          ),
        ),
      ),
    ),
  );
}

function MemoArea({ cardId, field, titleField, titleValue, updateMemoCard, value }) {
  const [quickMemo, setQuickMemo] = useState("");
  const addQuickMemo = () => {
    const text = quickMemo.trim();
    if (!text) return;
    const taggedText = text.startsWith("#") ? text : `# ${text}`;
    updateMemoCard(cardId, field, value ? `${taggedText}\n${value}` : taggedText);
    setQuickMemo("");
  };
  return h(
    "section",
    { className: "memo-area" },
    h("input", {
      className: "memo-title-input",
      maxLength: 48,
      placeholder: "Title",
      type: "text",
      value: titleValue,
      onChange: (event) => updateMemoCard(cardId, titleField, event.target.value),
      onKeyDown: (event) => event.stopPropagation(),
    }),
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

function MemoBlockColumn({ cardId, extraField, extraTitleField, extraTitleValue, extraValue, field, split, titleField, titleValue, updateMemoCard, value }) {
  const [quickMemo, setQuickMemo] = useState("");
  const [quickExtraMemo, setQuickExtraMemo] = useState("");
  const splitRef = useRef(null);
  const addQuickMemo = (targetField, currentValue, textValue, clearText) => {
    const text = textValue.trim();
    if (!text) return;
    const taggedText = text.startsWith("#") ? text : `# ${text}`;
    updateMemoCard(cardId, targetField, currentValue ? `${taggedText}\n${currentValue}` : taggedText);
    clearText("");
  };
  const startResize = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const container = splitRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pointerId = event.pointerId;
    event.currentTarget.setPointerCapture?.(pointerId);
    const move = (moveEvent) => {
      const next = clampNumber(((moveEvent.clientX - rect.left) / rect.width) * 100, 24, 76);
      updateMemoCard(cardId, "memoSplits", { [field]: Math.round(next) });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };
  const renderQuickInput = (targetField, currentValue, textValue, setTextValue) =>
    h("textarea", {
      className: "memo-quick-textarea",
      placeholder: "Quick add...",
      rows: 1,
      value: textValue,
      onChange: (event) => setTextValue(event.target.value),
      onKeyDown: (event) => {
        event.stopPropagation();
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          addQuickMemo(targetField, currentValue, textValue, setTextValue);
        }
      },
    });
  const renderTitleInput = (targetTitleField, currentTitle) =>
    h("input", {
      className: "memo-title-input",
      maxLength: 48,
      placeholder: "Title",
      type: "text",
      value: currentTitle,
      onChange: (event) => updateMemoCard(cardId, targetTitleField, event.target.value),
      onKeyDown: (event) => event.stopPropagation(),
    });
  const renderMemoTextarea = (targetField, currentValue) =>
    h("textarea", {
      className: "memo-large-textarea memo-split-textarea",
      placeholder: "Write freely...",
      value: currentValue,
      onChange: (event) => updateMemoCard(cardId, targetField, event.target.value),
      onKeyDown: (event) => event.stopPropagation(),
    });
  return h(
    "section",
    { className: "memo-block-column" },
    h(
      "div",
      {
        className: "memo-quick-split",
        style: { "--memo-split": `${clampNumber(split, 24, 76)}%` },
      },
      renderQuickInput(field, value, quickMemo, setQuickMemo),
      h("div", { className: "memo-quick-split-gap" }),
      renderQuickInput(extraField, extraValue, quickExtraMemo, setQuickExtraMemo),
    ),
    h(
      "div",
      {
        className: "memo-title-split",
        style: { "--memo-split": `${clampNumber(split, 24, 76)}%` },
      },
      renderTitleInput(titleField, titleValue),
      h("div", { className: "memo-title-split-gap" }),
      renderTitleInput(extraTitleField, extraTitleValue),
    ),
    h(
      "div",
      {
        className: "memo-split-editor",
        ref: splitRef,
        style: { "--memo-split": `${clampNumber(split, 24, 76)}%` },
      },
      renderMemoTextarea(field, value),
      h("button", {
        "aria-label": "Resize memo columns",
        className: "memo-split-handle",
        onPointerDown: startResize,
        type: "button",
      }),
      renderMemoTextarea(extraField, extraValue),
    ),
    h(
      "div",
      { className: "memo-mobile-flow" },
      h("div", { className: "memo-mobile-area" }, renderQuickInput(field, value, quickMemo, setQuickMemo), renderTitleInput(titleField, titleValue), renderMemoTextarea(field, value)),
      h("div", { className: "memo-mobile-area" }, renderQuickInput(extraField, extraValue, quickExtraMemo, setQuickExtraMemo), renderTitleInput(extraTitleField, extraTitleValue), renderMemoTextarea(extraField, extraValue)),
    ),
  );
}

function ScorePanel({ carryPenaltyMarked, entryCount, onAdjustCarry, onResetCarry, onToggleAttempt, onToggleCarryPenalty, routineTried, scoreInfo }) {
  const totalClass = scoreInfo.total < 0 ? "negative" : scoreInfo.total === 0 ? "neutral" : "";
  const fillClass = scoreInfo.total > 0 ? "positive" : scoreInfo.total < 0 ? "negative" : "neutral";
  return h(
    "section",
    { className: "score-panel", "aria-label": "Score summary" },
    h(
      "div",
      { className: "score-meter" },
      h("span", { className: "score-kicker" }, "Total Score"),
      h(
        "div",
        { className: "carry-controls score-carry-controls" },
        h("button", { className: "carry-adjust-button", type: "button", title: "Decrease Carry", "aria-label": "Decrease Carry", onClick: () => onAdjustCarry(-1) }, "-"),
        h("button", { className: "carry-reset-button", type: "button", title: "Reset Carry", "aria-label": "Reset Carry", onClick: onResetCarry }, "R"),
        h("button", { className: "carry-adjust-button", type: "button", title: "Increase Carry", "aria-label": "Increase Carry", onClick: () => onAdjustCarry(1) }, "+"),
      ),
      h("div", { className: `score-number ${totalClass}` }, formatScore(scoreInfo.total)),
      h(
        "div",
        { className: "score-checks" },
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
        h(
          "button",
          {
            className: `attempt-check penalty-check ${carryPenaltyMarked ? "checked" : ""}`,
            type: "button",
            "aria-pressed": String(carryPenaltyMarked),
            "aria-label": "Add -2 Carry",
            title: "Add -2 Carry",
            onClick: onToggleCarryPenalty,
          },
          carryPenaltyMarked ? "\u2713" : "",
        ),
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

function getPresetScoreRange(preset) {
  const range = parseScoreRange(preset.yScore).filter((score) => score > 0);
  return range.length > 1 ? range : null;
}

function TodayPlanPanel({ categories, entries, presets, schoolPresets, selectedDate, toggleChoice, weekday, weeklyPlan }) {
  return h(
    "section",
    { className: "today-plan-panel", "aria-label": "Today plan" },
    h("div", { className: "section-heading" }, h("h2", null, "Today"), h("span", null, weekday.full)),
    h(
      "div",
      { className: "today-plan-grid" },
      h(PlanRow, {
        className: "school-plan-row",
        title: "School",
        cards: schoolPresets.map((preset) => {
          const planKey = `school:${selectedDate}:${preset.key}`;
          const selectedEntry = entries.find((entry) => entry.planKey === planKey);
          const scoreRange = getPresetScoreRange(preset);
          if (scoreRange) {
            return {
              key: preset.key,
              label: "",
              scoreRange,
              selectedChoice: selectedEntry?.choice || "",
              value: preset.name,
              nScore: preset.nScore,
              onToggle: (choice) =>
                toggleChoice({
                  planKey,
                  choice: choice === "N" ? "N" : String(choice),
                  name: `School: ${preset.name} (${choice === "N" ? "N" : formatScore(choice)})`,
                  score: choice === "N" ? scoreNumber(preset.nScore) : scoreNumber(choice),
                }),
            };
          }
          return {
            key: preset.key,
            label: "",
            value: preset.name,
            yScore: preset.yScore,
            nScore: preset.nScore,
            selectedChoice: selectedEntry?.choice || "",
            onToggle: (choice) => toggleChoice({ planKey, choice, name: `School: ${preset.name} (${choice})`, score: scoreNumber(choice === "Y" ? preset.yScore : preset.nScore) }),
          };
        }),
      }),
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
              label: category.label,
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
            label: category.label,
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

function DailyPanel({ addPreset, controlsId = "presetGrid", isOpen, movePreset, onToggle, presets, removePreset, title = "Daily", updatePreset }) {
  const [dragPresetKey, setDragPresetKey] = useState("");
  return h(CollapsiblePanel, {
    className: "quick-panel",
    controls: controlsId,
    description: `Set recurring ${title.toLowerCase()} checks and scores.`,
    isOpen,
    onToggle,
    title,
    children: {
      actions: h("button", { className: "text-button daily-tool", type: "button", onClick: addPreset }, "+"),
      body: h(
        "div",
        { className: "preset-grid", id: controlsId },
        presets.map((preset, index) =>
          h(
            "article",
            {
              className: `preset-card ${dragPresetKey === preset.key ? "dragging" : ""}`,
              draggable: true,
              key: preset.key,
              onDragStart: (event) => {
                if (panelClickIsInteractive(event.target)) {
                  event.preventDefault();
                  return;
                }
                setDragPresetKey(preset.key);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData(`text/${controlsId}-preset`, preset.key);
              },
              onDragOver: (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              },
              onDrop: (event) => {
                event.preventDefault();
                const fromKey = event.dataTransfer.getData(`text/${controlsId}-preset`) || dragPresetKey;
                movePreset(fromKey, preset.key);
                setDragPresetKey("");
              },
              onDragEnd: () => setDragPresetKey(""),
            },
            h("span", { className: "drag-handle", title: "Drag to reorder", "aria-hidden": "true" }, "\u22ee\u22ee"),
            h("input", { className: "preset-name-input", type: "text", maxLength: 32, "aria-label": `${title} name`, value: preset.name, onChange: (event) => updatePreset(index, "name", event.target.value) }),
            h("label", { className: "score-field positive-score", title: "Y score" }, h("input", { className: "preset-score-input y-score", type: "text", inputMode: "numeric", value: preset.yScore, onChange: (event) => updatePreset(index, "yScore", event.target.value) })),
            h("label", { className: "score-field negative-score", title: "N score" }, h("input", { className: "preset-score-input n-score", type: "text", inputMode: "numeric", value: preset.nScore, onChange: (event) => updatePreset(index, "nScore", event.target.value) })),
            h("button", { className: "mini-button danger", type: "button", onClick: () => removePreset(index) }, "\u00d7"),
          ),
        ),
      ),
    },
  });
}

function WeeklyPanel({ addCategory, categories, isOpen, moveCategory, onToggle, removeCategory, selectedDate, updateCategory, updateWeeklyPlan, weeklyPlan }) {
  const [dragCategoryKey, setDragCategoryKey] = useState("");
  const selectedWeekday = getWeekdayKey(selectedDate);
  return h(CollapsiblePanel, {
    className: "weekly-panel",
    controls: "weeklyGrid",
    description: "Create categories and assign plans for each weekday.",
    isOpen,
    onToggle,
    title: "Weekly",
    children: {
      actions: h("button", { className: "text-button weekly-tool", type: "button", onClick: addCategory }, "+"),
      body: h(
        "div",
        { className: "weekly-grid", id: "weeklyGrid" },
        h("div", { className: "weekly-corner" }, "Category"),
        ...weekDays.map((day) => h("div", { className: `weekly-day ${day.key === selectedWeekday ? "active" : ""}`, key: day.key }, day.label)),
        ...categories.flatMap((category, index) => [
          h(
            "div",
            {
              className: `weekly-category ${dragCategoryKey === category.key ? "dragging" : ""}`,
              draggable: true,
              key: `${category.key}-label`,
              onDragStart: (event) => {
                if (panelClickIsInteractive(event.target)) {
                  event.preventDefault();
                  return;
                }
                setDragCategoryKey(category.key);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/weekly-category", category.key);
              },
              onDragOver: (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              },
              onDrop: (event) => {
                event.preventDefault();
                const fromKey = event.dataTransfer.getData("text/weekly-category") || dragCategoryKey;
                moveCategory(fromKey, category.key);
                setDragCategoryKey("");
              },
              onDragEnd: () => setDragCategoryKey(""),
            },
            h("span", { className: "drag-handle", title: "Drag to reorder", "aria-hidden": "true" }, "\u22ee\u22ee"),
            h("input", {
              className: "category-name-input",
              type: "text",
              maxLength: 24,
              value: category.label,
              onChange: (event) => updateCategory(category.key, "label", event.target.value),
              onKeyDown: (event) => event.stopPropagation(),
            }),
            h("label", { className: `score-field y-field ${isRangeCategory(category) ? "range-score" : "positive-score"}`, title: isRangeCategory(category) ? "Y range" : "Y score" }, h("input", { className: "category-score-input y-score", type: "text", inputMode: isRangeCategory(category) ? "text" : "numeric", value: category.yScore, onChange: (event) => updateCategory(category.key, "yScore", event.target.value), onKeyDown: (event) => event.stopPropagation() })),
            h("label", { className: "score-field n-field negative-score", title: "N score" }, h("input", { className: "category-score-input n-score", type: "text", inputMode: "numeric", value: category.nScore, onChange: (event) => updateCategory(category.key, "nScore", event.target.value), onKeyDown: (event) => event.stopPropagation() })),
            h(
              "div",
              { className: "category-actions" },
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

function HistoryPanel({ carryPenalties, flaggedDate, getDayTotal, onToggleFlag, routineAttempts, selectedDate }) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${selectedDate}T00:00:00`);
    date.setDate(date.getDate() - (6 - index));
    const key = toDateKey(date);
    const penalized = Boolean(carryPenalties?.[key]);
    return { key, flagged: key === flaggedDate, penalized, total: getDayTotal(key), tried: !penalized && Boolean(routineAttempts?.[key]) };
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
          h("span", { className: `history-attempt ${day.penalized ? "history-penalty checked" : day.tried ? "checked" : ""}`, title: day.penalized ? "Carry -2 marked" : day.tried ? "Routine tried" : "Not checked" }, day.penalized || day.tried ? "\u2713" : ""),
          h("span", { className: "history-date" }, day.key.slice(5).replace("-", ".")),
          h("strong", { className: "history-score" }, formatScore(day.total)),
        ),
      ),
    ),
  );
}

function CalendarPanel({ calendar, calendarDuties, isOpen, onToggle, openMonths, selectedDate, setOpenMonths, toggleCalendarDuty, updateCalendarNote }) {
  const year = new Date(`${selectedDate}T00:00:00`).getFullYear();
  const orderedMonthIndexes = getOrderedMonthIndexes();
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
    description: "Open a month and write schedule notes or duty checks for each date.",
    isOpen,
    onToggle,
    title: "Calendar",
    children: {
      body: h(
        "div",
        { className: "calendar-months no-panel-toggle", id: "calendarMonths" },
        orderedMonthIndexes.map((monthIndex) => {
          const monthName = monthNames[monthIndex];
          const prefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
          const dutyDates = Object.keys(calendarDuties || {}).filter((dateKey) => dateKey.startsWith(prefix));
          const noteCount = new Set([...Object.keys(calendar).filter((dateKey) => dateKey.startsWith(prefix)), ...dutyDates]).size;
          const monthOpen = openMonths.has(monthIndex);
          return h(
            "section",
            {
              className: `calendar-month ${monthOpen ? "open" : ""}`,
              key: monthName,
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
            monthOpen ? h(MonthDays, { calendar, calendarDuties, monthIndex, selectedDate, toggleCalendarDuty, updateCalendarNote, year }) : null,
          );
        }),
      ),
    },
  });
}

function MonthDays({ calendar, calendarDuties, monthIndex, selectedDate, toggleCalendarDuty, updateCalendarNote, year }) {
  const todayKey = toDateKey(new Date());
  const scrollStartRef = useRef(null);
  const handleCalendarTouchStart = (event) => {
    if (!event.target.closest("textarea")) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    scrollStartRef.current = { x: touch.clientX, y: touch.clientY, target: event.target };
  };
  const handleCalendarTouchMove = (event) => {
    const start = scrollStartRef.current;
    const touch = event.touches?.[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      start.target.blur();
      scrollStartRef.current = null;
    }
  };
  const handleCalendarTouchEnd = () => {
    scrollStartRef.current = null;
  };
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
    { className: "calendar-weeks", onTouchCancel: handleCalendarTouchEnd, onTouchEnd: handleCalendarTouchEnd, onTouchMove: handleCalendarTouchMove, onTouchStart: handleCalendarTouchStart },
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
          const duties = calendarDuties?.[dateKey] || {};
          return h(
            "article",
            { className: `calendar-day ${dateKey === selectedDate ? "selected" : ""} ${dateKey === todayKey ? "today" : ""}`, key: dateKey },
            h(
              "span",
              { className: "calendar-date" },
              h("b", null, day),
              h(
                "span",
                { className: "calendar-duty-checks" },
                calendarDutyOptions.map((option) =>
                  h(
                    "span",
                    { className: `calendar-duty ${duties[option.key] ? "checked" : ""}`, key: option.key },
                    h("input", {
                      type: "checkbox",
                      checked: Boolean(duties[option.key]),
                      "aria-label": `${dateKey} ${option.label}`,
                      onChange: () => toggleCalendarDuty(dateKey, option.key),
                      onClick: (event) => event.stopPropagation(),
                    }),
                    h("em", null, option.label),
                  ),
                ),
              ),
              h("i", null, weekday),
            ),
            h("textarea", {
              maxLength: 600,
              placeholder: "Schedule",
              value: calendar[dateKey] || "",
              onChange: (event) => updateCalendarNote(dateKey, event.target.value),
              onKeyDown: (event) => event.stopPropagation(),
            }),
          );
        }),
      ),
      ),
    ),
  );
}

export default App;
