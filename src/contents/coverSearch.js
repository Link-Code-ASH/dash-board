// Finds cover image candidates for a title from free, key-less sources that allow browser requests.
// Wikidata comes first: it knows Korean titles, tells works apart from people and places, and links each
// work to its English Wikipedia article (where posters live) and to its English name for the other sources.
// Every source is optional: a failing or slow one is skipped and the others still show.
const enc = encodeURIComponent;
const WIKIDATA = "https://www.wikidata.org/w/api.php?format=json&origin=*";

async function getJson(fetcher, url, init, signal) {
  const response = await fetcher(url, { ...init, signal });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
}

// Lowercase with spaces and punctuation removed, so "나 혼자만 레벨업!" and "나혼자만레벨업" match.
export const squash = (text = "") => text.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
// True when a result's name and one of the known names contain each other.
export function sameWork(name, names) {
  const a = squash(name);
  if (a.length < 2) return false;
  return names.some((known) => {
    const b = squash(known);
    return b.length >= 2 && (a.includes(b) || b.includes(a));
  });
}

// Wikidata classes ("instance of") for each kind, used to rank the matching kind first.
const KINDS = {
  movie: ["Q11424", "Q24869", "Q202866", "Q506240", "Q20650540"],
  drama: ["Q5398426", "Q526877", "Q15416", "Q1259759", "Q21191270"],
  anime: ["Q63952888", "Q1107", "Q20650540", "Q220898", "Q100269041"],
  webtoon: ["Q74262765", "Q562214", "Q8274", "Q21198342", "Q14406742", "Q1004", "Q838795"],
  novel: ["Q8261", "Q747381", "Q1667921", "Q7725634", "Q571", "Q47461344"],
  game: ["Q7889", "Q7058673", "Q865493", "Q1755420"],
};
const ALL_KINDS = new Set(Object.values(KINDS).flat());
// Properties only creative works carry: publication date, genre, author, director, cast, developer, publisher...
const WORK_PROPS = ["P577", "P136", "P50", "P57", "P58", "P161", "P170", "P178", "P123", "P449", "P750", "P400", "P1476", "P86"];
const NOT_WORKS = new Set(["Q5", "Q4167410", "Q13406463", "Q4167836", "Q101352", "Q12308941", "Q11879590"]);

const claimIds = (entity, prop) => (entity.claims?.[prop] || [])
  .map((claim) => claim.mainsnak?.datavalue?.value)
  .map((value) => typeof value === "object" ? value?.id : value)
  .filter(Boolean);

async function wikidataSearch(fetcher, term, language, signal) {
  const url = `${WIKIDATA}&action=wbsearchentities&type=item&limit=12&language=${language}&uselang=${language}&search=${enc(term)}`;
  const data = await getJson(fetcher, url, {}, signal);
  return (data.search || []).map((entry) => entry.id);
}

async function pageImages(fetcher, lang, titles, signal) {
  if (!titles.length) return new Map();
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageimages` +
    `&piprop=thumbnail&pithumbsize=600&pilicense=any&titles=${enc(titles.join("|"))}`;
  const data = await getJson(fetcher, url, {}, signal);
  const renamed = new Map();
  for (const step of [...(data.query?.normalized || []), ...(data.query?.redirects || [])]) renamed.set(step.to, step.from);
  const original = (title) => { let name = title; while (renamed.has(name)) name = renamed.get(name); return name; };
  return new Map(Object.values(data.query?.pages || {})
    .filter((page) => page.thumbnail?.source)
    .map((page) => [original(page.title), page.thumbnail.source]));
}

// Works matching the title, best first, with their posters and their other names.
export async function wikidataWorks(fetcher, term, type, signal) {
  const found = await Promise.allSettled([wikidataSearch(fetcher, term, "ko", signal), wikidataSearch(fetcher, term, "en", signal)]);
  const ids = [...new Set(found.flatMap((result) => result.status === "fulfilled" ? result.value : []))].slice(0, 20);
  if (!ids.length) return { list: [], names: [] };
  const data = await getJson(fetcher, `${WIKIDATA}&action=wbgetentities&props=claims|sitelinks|labels|aliases&languages=ko|en|ja` +
    `&sitefilter=enwiki|kowiki&ids=${ids.join("|")}`, {}, signal);
  const want = new Set(KINDS[type] || []);
  const works = ids.map((id, order) => ({ entity: data.entities?.[id], order }))
    .filter(({ entity }) => entity && !entity.missing)
    .map(({ entity, order }) => {
      const kinds = claimIds(entity, "P31");
      const labels = ["ko", "en", "ja"].map((lang) => entity.labels?.[lang]?.value).filter(Boolean);
      const aliases = ["ko", "en"].flatMap((lang) => (entity.aliases?.[lang] || []).map((alias) => alias.value));
      const names = [...labels, ...aliases];
      const work = !kinds.some((kind) => NOT_WORKS.has(kind)) && (kinds.some((kind) => ALL_KINDS.has(kind)) || WORK_PROPS.some((prop) => entity.claims?.[prop]));
      const score = (kinds.some((kind) => want.has(kind)) ? 4 : kinds.some((kind) => ALL_KINDS.has(kind)) ? -1 : 0)
        + (names.some((name) => squash(name) === squash(term)) ? 3 : sameWork(term, names) ? 1 : -3) - order * 0.1;
      return {
        work, score, names,
        title: entity.labels?.ko?.value || entity.labels?.en?.value || term,
        en: entity.sitelinks?.enwiki?.title, ko: entity.sitelinks?.kowiki?.title,
        image: claimIds(entity, "P18")[0] || claimIds(entity, "P154")[0],
      };
    })
    .filter((entry) => entry.work && entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  const [en, ko] = await Promise.allSettled([
    pageImages(fetcher, "en", works.map((entry) => entry.en).filter(Boolean), signal),
    pageImages(fetcher, "ko", works.map((entry) => entry.ko).filter(Boolean), signal),
  ]);
  const posters = (result) => result.status === "fulfilled" ? result.value : new Map();
  const list = works.flatMap((entry) => [
    posters(en).get(entry.en),
    posters(ko).get(entry.ko),
    entry.image && `https://commons.wikimedia.org/w/index.php?title=Special:FilePath/${enc(entry.image)}&width=600`,
  ].filter(Boolean).map((url) => ({ url, title: entry.title, source: "위키백과" })));
  return { list, names: works.flatMap((entry) => entry.names) };
}

export async function itunes(fetcher, title, media, entity, signal) {
  const url = `https://itunes.apple.com/search?term=${enc(title)}&media=${media}&entity=${entity}&limit=8&country=KR`;
  const data = await getJson(fetcher, url, {}, signal);
  return (data.results || [])
    .filter((entry) => entry.artworkUrl100)
    .map((entry) => ({
      url: entry.artworkUrl100.replace(/\/\d+x\d+(bb)?\.(jpg|png|webp)$/, "/600x600bb.jpg"),
      title: entry.trackName || entry.collectionName || "",
      source: "Apple",
    }));
}

export async function anilist(fetcher, title, type, signal) {
  const query = `query ($search: String, $type: MediaType) {
    Page(perPage: 8) { media(search: $search, type: $type, sort: SEARCH_MATCH) {
      title { romaji english native } synonyms coverImage { extraLarge large } } } }`;
  const data = await getJson(fetcher, "https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { search: title, type } }),
  }, signal);
  return (data.data?.Page?.media || [])
    .filter((media) => media.coverImage?.extraLarge || media.coverImage?.large)
    .map((media) => ({
      url: media.coverImage.extraLarge || media.coverImage.large,
      title: media.title?.native || media.title?.english || media.title?.romaji || "",
      names: [media.title?.native, media.title?.english, media.title?.romaji, ...(media.synonyms || [])].filter(Boolean),
      source: "AniList",
    }));
}

export async function googleBooks(fetcher, title, signal) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${enc(`intitle:${title}`)}&maxResults=10&printType=books`;
  const data = await getJson(fetcher, url, {}, signal);
  return (data.items || [])
    .filter((item) => item.volumeInfo?.imageLinks?.thumbnail)
    .map((item) => ({
      url: item.volumeInfo.imageLinks.thumbnail.replace(/^http:/, "https:").replace("&edge=curl", ""),
      title: item.volumeInfo.title || "",
      source: "Google 도서",
    }));
}

// Naver image search through our own server function (it holds the API keys). "naver" is any
// function that takes { query, type } and returns { items } or throws; missing when signed out.
export async function naverImages(naver, title, type) {
  const data = await naver({ query: title, type });
  return (data?.items || []).slice(0, 12).map((item) => ({
    url: item.url, thumb: item.thumb || item.url, title: item.title || "", source: "네이버",
  }));
}

// Other sources for each kind, best first, after Wikidata.
const PLANS = {
  webtoon: [["anilist", "MANGA"], ["books"]],
  drama: [["itunes", "tvShow", "tvSeason"]],
  movie: [["itunes", "movie", "movie"]],
  anime: [["anilist", "ANIME"]],
  novel: [["books"], ["itunes", "ebook", "ebook"], ["anilist", "MANGA"]],
  game: [["itunes", "software", "software"]],
  etc: [["itunes", "all", "allTrack"], ["books"]],
};

// Takes the first of every source, then the second of every source, and so on, without repeats.
export function interleave(lists, limit = 12) {
  const seen = new Set();
  const out = [];
  for (let round = 0; out.length < limit && lists.some((list) => list.length > round); round += 1) {
    for (const list of lists) {
      const entry = list[round];
      if (!entry || seen.has(entry.url)) continue;
      seen.add(entry.url);
      out.push(entry);
      if (out.length >= limit) break;
    }
  }
  return out;
}

const settledList = (result) => result.status === "fulfilled" ? result.value : [];

export async function searchCovers(title, type, { fetcher = fetch, signal, limit = 12, naver = null } = {}) {
  const term = title.trim();
  if (term.length < 2) return [];
  const naverFound = naver ? naverImages(naver, term, type).catch(() => []) : Promise.resolve([]);
  const wiki = await wikidataWorks(fetcher, term, type, signal).catch(() => ({ list: [], names: [] }));
  if (signal?.aborted) return [];
  // The other sources also get the work's English name, since they rarely know Korean titles.
  const names = [term, ...wiki.names];
  const latin = wiki.names.find((name) => /^[\x20-\x7e]+$/.test(name) && squash(name) !== squash(term));
  const terms = latin ? [term, latin] : [term];
  const call = ([kind, a, b], query) => kind === "itunes" ? itunes(fetcher, query, a, b, signal)
    : kind === "anilist" ? anilist(fetcher, query, a, signal)
      : googleBooks(fetcher, query, signal);
  const plan = PLANS[type] || PLANS.etc;
  const settled = await Promise.allSettled(plan.map(async (source) => {
    const lists = await Promise.allSettled(terms.map((query) => call(source, query)));
    // Only results whose name matches one of the work's names, so unrelated covers stay out.
    return lists.flatMap(settledList).filter((entry) => [entry.title, ...(entry.names || [])].some((name) => sameWork(name, names)));
  }));
  const naverList = await naverFound;
  if (signal?.aborted) return [];
  return interleave([naverList, wiki.list, ...settled.map(settledList)], limit).map(({ names: _names, ...entry }) => entry);
}

// Downloads a chosen candidate so it can be kept in our own storage (null when the host refuses).
export async function downloadCover(url, { fetcher = fetch } = {}) {
  try {
    const response = await fetcher(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return /^image\/(png|jpeg|webp|gif)$/.test(blob.type) ? blob : null;
  } catch {
    return null;
  }
}
