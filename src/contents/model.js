export const VERSION = 1;

export const TYPES = [
  { id: "webtoon", label: "웹툰" },
  { id: "drama", label: "드라마" },
  { id: "movie", label: "영화" },
  { id: "anime", label: "애니" },
  { id: "novel", label: "소설" },
  { id: "game", label: "게임" },
  { id: "etc", label: "기타" },
];
export const STATUSES = [
  { id: "done", label: "완료" },
  { id: "ongoing", label: "보는 중" },
  { id: "dropped", label: "중단" },
  { id: "upcoming", label: "출시 예정" },
];
// Rarity is derived from the rating only, never stored.
export const RARITIES = [
  { id: "legendary", label: "LEGENDARY", min: 4.75 },
  { id: "epic", label: "EPIC", min: 4 },
  { id: "rare", label: "RARE", min: 3 },
  { id: "uncommon", label: "UNCOMMON", min: 2 },
  { id: "common", label: "COMMON", min: 0.5 },
];
// Korean names for the gallery wings, one per rarity tier.
export const TIER_NAMES = { legendary: "전설의 전당", epic: "영웅 전시실", rare: "희귀 전시실", uncommon: "고급 전시실", common: "일반 전시실", unrated: "평가 대기" };
const typeIds = TYPES.map((type) => type.id);
const statusIds = STATUSES.map((status) => status.id);
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const DAY = 86400000;

export const uid = () => crypto.randomUUID();
export const typeLabel = (id) => TYPES.find((type) => type.id === id)?.label || "기타";
export const statusLabel = (id) => STATUSES.find((status) => status.id === id)?.label || "";
export const isUpcoming = (item) => item.status === "upcoming";
export const localDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
// Days until release: positive = still waiting, 0 = today, negative = already out. null when undated.
export const daysUntil = (releaseDate, today = localDateKey()) =>
  isDate(releaseDate || "") ? Math.round((Date.parse(`${releaseDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY) : null;
export const dDayLabel = (days) => days === null ? "미정" : days > 0 ? `D-${days}` : days === 0 ? "D-DAY" : "출시됨";
export const rarityOf = (rating) =>
  rating ? RARITIES.find((rarity) => rating >= rarity.min) || RARITIES.at(-1) : { id: "unrated", label: "UNRATED" };

export function emptyItem(id = uid(), now = new Date().toISOString()) {
  return {
    version: VERSION, id, title: "", type: "webtoon", rating: 0, status: "done",
    date: now.slice(0, 10), creator: "", platform: "", review: "", cover: null, coverUrl: "",
    releaseDate: "", hype: 0,
    createdAt: now, updatedAt: now, deletedAt: null,
  };
}

// Accepts older or partial rows by filling missing optional fields; never drops unknown fields.
export function validateItem(value) {
  if (!value || value.version !== VERSION || typeof value.id !== "string" || !value.id ||
      typeof value.title !== "string" || typeof value.type !== "string")
    throw new Error("지원하지 않거나 손상된 Contents 기록입니다.");
  const item = { ...emptyItem(value.id, value.createdAt || new Date(0).toISOString()), ...structuredClone(value) };
  if (!item.title.trim()) throw new Error("제목을 입력해 주세요.");
  if (!typeIds.includes(item.type)) item.type = "etc";
  if (!statusIds.includes(item.status)) item.status = "done";
  const rating = Number(item.rating);
  item.rating = Number.isFinite(rating) ? Math.min(5, Math.max(0, Math.round(rating * 2) / 2)) : 0;
  if (item.date !== "" && !isDate(item.date)) item.date = "";
  if (item.releaseDate !== "" && !isDate(item.releaseDate)) item.releaseDate = "";
  const hype = Number(item.hype);
  item.hype = Number.isFinite(hype) ? Math.min(5, Math.max(0, Math.round(hype * 2) / 2)) : 0;
  for (const field of ["creator", "platform", "review", "coverUrl"])
    if (typeof item[field] !== "string") item[field] = "";
  if (item.cover !== null && (typeof item.cover !== "string" || !item.cover)) item.cover = null;
  if (item.deletedAt !== null && typeof item.deletedAt !== "string") item.deletedAt = null;
  return item;
}

export function validateBackup(value) {
  if (!value || value.version !== VERSION || !Array.isArray(value.items))
    throw new Error("Contents 백업 형식이 아닙니다.");
  const items = value.items.map(validateItem);
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw new Error("Contents 백업에 같은 ID가 중복되어 있습니다.");
  return { version: VERSION, items };
}

const matches = (item, type, query) => {
  const needle = query.trim().toLowerCase();
  return !item.deletedAt && (type === "all" || item.type === type) &&
    (!needle || `${item.title} ${item.creator} ${item.platform} ${item.review}`.toLowerCase().includes(needle));
};

// Gallery of titles already enjoyed (upcoming ones wait on their own shelf).
export function visibleItems(items, { type = "all", sort = "recent", query = "" } = {}) {
  const list = items.filter((item) => !isUpcoming(item) && matches(item, type, query));
  const byDate = (a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt);
  const sorters = {
    recent: byDate,
    rating: (a, b) => b.rating - a.rating || byDate(a, b),
    tier: (a, b) => b.rating - a.rating || byDate(a, b),
    title: (a, b) => a.title.localeCompare(b.title, "ko"),
  };
  return list.sort(sorters[sort] || byDate);
}

// Splits a gallery list into rarity wings (legendary first, unrated last), keeping the list's order inside each.
export function rarityWings(list) {
  const order = [...RARITIES.map((rarity) => rarity.id), "unrated"];
  const wings = new Map(order.map((id) => [id, []]));
  for (const item of list) wings.get(rarityOf(item.rating).id).push(item);
  return order.filter((id) => wings.get(id).length).map((id) => ({ id, items: wings.get(id) }));
}

// Coming-soon shelf: soonest release first, undated last.
export function upcomingItems(items, { type = "all", query = "" } = {}) {
  return items.filter((item) => isUpcoming(item) && matches(item, type, query))
    .sort((a, b) => (a.releaseDate || "9999").localeCompare(b.releaseDate || "9999") || a.title.localeCompare(b.title, "ko"));
}

// Release dates shown in Flow's schedule.
export function releasesOn(items, date) {
  return items.filter((item) => !item.deletedAt && item.releaseDate === date)
    .sort((a, b) => a.title.localeCompare(b.title, "ko"));
}

export function collectionStats(items, year = new Date().getFullYear()) {
  const all = items.filter((item) => !item.deletedAt);
  const live = all.filter((item) => !isUpcoming(item));
  const rated = live.filter((item) => item.rating > 0);
  const counts = Object.fromEntries(TYPES.map((type) => [type.id, 0]));
  for (const item of all) counts[item.type] = (counts[item.type] || 0) + 1;
  return {
    all: all.length,
    upcoming: all.length - live.length,
    total: live.length,
    average: rated.length ? Math.round((rated.reduce((sum, item) => sum + item.rating, 0) / rated.length) * 10) / 10 : 0,
    legendary: live.filter((item) => rarityOf(item.rating).id === "legendary").length,
    thisYear: live.filter((item) => (item.date || "").startsWith(String(year))).length,
    counts,
  };
}
