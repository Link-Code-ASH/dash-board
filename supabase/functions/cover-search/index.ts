// Cover search for Contents through the Naver image search API, which knows Korean titles well.
// The keys stay here as secrets (NAVER_CLIENT_ID, NAVER_CLIENT_SECRET); only signed-in HUB users can call it.
// { query, type } returns candidates; { image } fetches one picked image so the app can keep its own copy.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// A word added to the title so the search leans towards posters and covers.
const HINTS: Record<string, string> = {
  movie: "영화 포스터", drama: "드라마 포스터", anime: "애니 포스터", webtoon: "웹툰 표지",
  novel: "소설 표지", game: "게임 표지", etc: "포스터",
};
const MAX_IMAGE = 8 * 1024 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function search(query: string, type: string) {
  const id = Deno.env.get("NAVER_CLIENT_ID");
  const secret = Deno.env.get("NAVER_CLIENT_SECRET");
  if (!id || !secret) return json({ error: "not_configured" }, 503);
  const term = `${query} ${HINTS[type] || HINTS.etc}`;
  const url = `https://openapi.naver.com/v1/search/image?query=${encodeURIComponent(term)}&display=30&sort=sim&filter=large`;
  const response = await fetch(url, { headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret } });
  if (!response.ok) return json({ error: `naver_${response.status}` }, 502);
  const data = await response.json();
  const items = (data.items || []).map((item: Record<string, string>) => ({
    url: item.link,
    thumb: item.thumbnail,
    title: String(item.title || "").replace(/<[^>]+>/g, ""),
    width: Number(item.sizewidth) || 0,
    height: Number(item.sizeheight) || 0,
  })).filter((item: { url: string }) => /^https?:\/\//.test(item.url));
  // Portrait images (posters, book covers) first, keeping Naver's order within each group.
  const portrait = (item: { width: number; height: number }) => item.width && item.height >= item.width * 1.15;
  return json({ items: [...items.filter(portrait), ...items.filter((item: { width: number; height: number }) => !portrait(item))] });
}

async function image(link: string) {
  let url: URL;
  try { url = new URL(link); } catch { return json({ error: "bad_url" }, 400); }
  if (!/^https?:$/.test(url.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(url.hostname)) return json({ error: "bad_url" }, 400);
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 HUB cover fetch", Referer: `${url.origin}/` } });
  const type = response.headers.get("content-type") || "";
  if (!response.ok || !/^image\/(png|jpeg|webp|gif)/.test(type)) return json({ error: "not_image" }, 502);
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength > MAX_IMAGE) return json({ error: "too_large" }, 413);
  return new Response(body, { headers: { ...CORS, "Content-Type": type.split(";")[0] } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  try {
    const body = await req.json();
    if (typeof body.image === "string") return await image(body.image);
    const query = typeof body.query === "string" ? body.query.trim().slice(0, 100) : "";
    if (query.length < 2) return json({ items: [] });
    return await search(query, typeof body.type === "string" ? body.type : "etc");
  } catch (error) {
    return json({ error: String(error?.message || error) }, 500);
  }
});
