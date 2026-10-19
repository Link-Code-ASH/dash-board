// Finds cover image candidates for a title from free, key-less sources that allow browser requests.
// Every source is optional: a failing or slow one is skipped and the others still show.
const enc = encodeURIComponent;

async function getJson(fetcher, url, init, signal) {
  const response = await fetcher(url, { ...init, signal });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
}

export async function wikipedia(fetcher, lang, title, signal) {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search` +
    `&gsrsearch=${enc(title)}&gsrlimit=6&prop=pageimages&piprop=thumbnail&pithumbsize=600&pilicense=any`;
  const data = await getJson(fetcher, url, {}, signal);
  return Object.values(data.query?.pages || {})
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .filter((page) => page.thumbnail?.source)
    .map((page) => ({ url: page.thumbnail.source, title: page.title, source: "위키백과" }));
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
      title { romaji english native } coverImage { extraLarge large } } } }`;
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
      source: "AniList",
    }));
}

// Best sources first for each kind of title.
const PLANS = {
  webtoon: [["anilist", "MANGA"], ["wiki", "ko"], ["wiki", "en"]],
  drama: [["itunes", "tvShow", "tvSeason"], ["wiki", "ko"], ["wiki", "en"]],
  movie: [["itunes", "movie", "movie"], ["wiki", "ko"], ["wiki", "en"]],
  anime: [["anilist", "ANIME"], ["wiki", "ko"]],
  novel: [["itunes", "ebook", "ebook"], ["anilist", "MANGA"], ["wiki", "ko"]],
  game: [["wiki", "ko"], ["wiki", "en"], ["itunes", "software", "software"]],
  etc: [["wiki", "ko"], ["wiki", "en"], ["itunes", "all", "allTrack"]],
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

export async function searchCovers(title, type, { fetcher = fetch, signal, limit = 12 } = {}) {
  const term = title.trim();
  if (term.length < 2) return [];
  const call = (fetchImpl) => ([kind, a, b]) =>
    kind === "wiki" ? wikipedia(fetchImpl, a, term, signal)
      : kind === "itunes" ? itunes(fetchImpl, term, a, b, signal)
        : anilist(fetchImpl, term, a, signal);
  const settled = await Promise.allSettled((PLANS[type] || PLANS.etc).map(call(fetcher)));
  if (signal?.aborted) return [];
  return interleave(settled.map((result) => result.status === "fulfilled" ? result.value : []), limit);
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
