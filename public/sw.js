/* Vite replaces this marker only in production output. Dev never caches. */
const BUILD = "__HUB_PWA_BUILD__";
const ROOT = new URL(self.registration.scope);
const PREFIX = `hub-pwa:${ROOT.pathname}:`;
const CACHE = `${PREFIX}${BUILD.version}`;
const urls = new Set((BUILD.files || []).map((file) => new URL(file, ROOT).href));
const precache = new Set((BUILD.precache || []).map((file) => new URL(file, ROOT).href));
const runtime = new Set((BUILD.runtime || []).map((file) => new URL(file, ROOT).href));
const shells = new Set((BUILD.shells || []).map((file) => new URL(file, ROOT).href));

function cacheable(response) {
  return response.ok && response.status === 200 && response.type === "basic" && !response.redirected
    && !/\b(?:no-store|private)\b/i.test(response.headers.get("Cache-Control") || "");
}

self.addEventListener("install", (event) => {
  if (typeof BUILD === "string") return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      // Cache the shell and initial dependency graph, never lazy feature chunks.
      const results = await Promise.allSettled([...precache].map(async (url) => {
        const response = await fetch(new Request(url, { cache: "reload", credentials: "omit", redirect: "error" }));
        if (!cacheable(response)) {
          throw new Error(`Cannot precache ${url}`);
        }
        await cache.put(url, response);
      }));
      const failure = results.find((result) => result.status === "rejected");
      if (failure) throw failure.reason;
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});

self.addEventListener("activate", (event) => {
  if (typeof BUILD === "string") return;
  event.waitUntil((async () => {
    // Normal activation waits for the old worker's controlled clients to finish.
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    }
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (typeof BUILD === "string" || request.method !== "GET" || url.origin !== ROOT.origin || request.headers.has("Authorization") || request.headers.has("Range")) return;
  // Do not handle auth callbacks, queries, APIs, or arbitrary same-origin URLs.
  // Only the existing public icon version parameter is allowed for static files.
  const versionedIcon = /^v=5$/.test(url.search.slice(1)) && /\/(?:favicon(?:-32)?|app-icon-(?:180|192|512))\.png$/.test(url.pathname);
  if (url.search && !versionedIcon) return;
  url.search = "";
  url.hash = "";
  if (!urls.has(url.href)) return;
  if (request.mode === "navigate" && !shells.has(url.href)) return;
  if (request.mode !== "navigate" && shells.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Release-pinned HTML and assets keep an old open app consistent during updates.
    const cached = await cache.match(url.href);
    if (cached) return cached;
    if (!runtime.has(url.href)) return fetch(request);
    const response = await fetch(new Request(url.href, { credentials: "omit", redirect: "error" }));
    if (cacheable(response)) {
      try {
        await cache.put(url.href, response.clone());
      } catch {
        // Storage pressure must not prevent an otherwise successful feature load.
      }
    }
    return response;
  })());
});
