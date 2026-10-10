import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { test } from "node:test";
import { build, createServer, preview } from "vite";
import { apps, hubPwa } from "./pwa-vite.js";
import projectConfig from "../vite.config.js";

const repo = fileURLToPath(new URL("../", import.meta.url));
const template = await readFile(path.join(repo, "index.html"), "utf8");
const workerTemplate = await readFile(path.join(repo, "public/sw.js"), "utf8");

test("real sibling HTML, distinct manifests, relative deployment URLs, dev and preview", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hub-pwa-test-"));
  let dev;
  let production;
  try {
    await cp(path.join(repo, "public"), path.join(root, "public"), { recursive: true });
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "index.html"), template);
    await writeFile(path.join(root, "src/main.jsx"), 'import "./test.css"; import { shared } from "./shared.js"; const label = <span>{shared}</span>; document.querySelector("#root").textContent = label.props.children; globalThis.loadFeature = () => import("./lazy.js");');
    await writeFile(path.join(root, "src/test.css"), "body { color: black; }");
    await writeFile(path.join(root, "src/shared.js"), 'export const shared = globalThis.fixtureText || "PWA fixture";');
    await writeFile(path.join(root, "src/lazy.js"), 'import "./lazy.css"; import { shared } from "./shared.js"; export const label = shared; export const loadEmoji = () => import("./emoji.js");');
    await writeFile(path.join(root, "src/lazy.css"), ".lazy { color: red; }");
    await writeFile(path.join(root, "src/emoji.js"), 'export const emoji = "lazy fixture";');
    const config = {
      root, configFile: false, base: projectConfig.base, esbuild: projectConfig.esbuild,
      optimizeDeps: { noDiscovery: true },
      plugins: [hubPwa(), {
        name: "fixture-jsx-runtime",
        enforce: "pre",
        resolveId(id) { if (id === "react/jsx-runtime") return "\0fixture-jsx-runtime"; },
        load(id) { if (id === "\0fixture-jsx-runtime") return "export const jsx = (type, props) => ({ type, props });"; },
      }], logLevel: "silent",
    };
    await build(config);
    const dist = path.join(root, "dist");
    const identities = new Set();
    for (const slug of ["", ...Object.keys(apps)]) {
      const entry = slug ? `${slug}/index.html` : "index.html";
      const html = await readFile(path.join(dist, entry), "utf8");
      assert.match(html, new RegExp(`<title>${apps[slug] || "HUB"}</title>`));
      assert.match(html, /name="theme-color" content="#f5f6f8"/);
      assert.match(html, new RegExp(`name="hub-base" content="${slug ? "\\.\\./" : "\\./"}"`));
      for (const deployment of ["https://example.test/", "https://example.test/dash-board/"]) {
        const page = new URL(entry, deployment);
        for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
          const asset = new URL(match[1], page);
          assert.ok(asset.href.startsWith(deployment), asset.href);
          await readFile(path.join(dist, decodeURIComponent(asset.pathname.slice(new URL(deployment).pathname.length))));
        }
      }
      const manifestUrl = new URL(`${slug ? `${slug}/` : ""}manifest.webmanifest`, "https://example.test/dash-board/");
      const manifest = JSON.parse(await readFile(path.join(dist, slug, "manifest.webmanifest"), "utf8"));
      const identity = new URL(manifest.id, manifestUrl).href;
      assert.equal(identity, `https://example.test/dash-board/${slug || "hub"}/`);
      assert.equal(new URL(manifest.start_url, manifestUrl).href, identity);
      assert.equal(new URL(manifest.scope, manifestUrl).href, identity);
      assert.equal(manifest.name, apps[slug] || "HUB");
      if (slug) identities.add(identity);
      for (const icon of manifest.icons) assert.equal(new URL(icon.src, manifestUrl).pathname.split("/")[1], "dash-board");
    }
    assert.equal(identities.size, Object.keys(apps).length);
    const worker = await readFile(path.join(dist, "sw.js"), "utf8");
    assert.ok(!worker.includes("__HUB_PWA_BUILD__"));
    const metadata = JSON.parse(worker.match(/const BUILD = (.*);/)[1]);
    assert.deepEqual(metadata.shells.slice().sort(), [
      "", "index.html",
      ...Object.keys(apps).flatMap((slug) => [`${slug}/`, `${slug}/index.html`]),
    ].sort());
    assert.ok(metadata.files.some((file) => /^assets\/.*\.js$/.test(file)));
    assert.ok(metadata.files.some((file) => /^assets\/.*\.css$/.test(file)));
    assert.ok(!metadata.files.includes("sw.js"));
    assert.ok(metadata.precache.some((file) => /^assets\/index-.*\.js$/.test(file)));
    assert.ok(metadata.precache.some((file) => /^assets\/index-.*\.css$/.test(file)));
    assert.ok(metadata.runtime.some((file) => /^assets\/lazy-.*\.js$/.test(file)));
    assert.ok(metadata.runtime.some((file) => /^assets\/lazy-.*\.css$/.test(file)));
    assert.ok(metadata.runtime.some((file) => /^assets\/emoji-.*\.js$/.test(file)));
    assert.ok(metadata.precache.every((file) => !/\/(?:lazy|emoji)-/.test(file)));
    assert.ok(metadata.runtime.every((file) => !metadata.precache.includes(file)));
    assert.deepEqual([...metadata.precache, ...metadata.runtime].sort(), metadata.files);
    for (const icon of ["app-icon-192.png", "app-icon-512.png"]) assert.ok(metadata.precache.includes(icon));

    dev = await createServer({ ...config, server: { host: "127.0.0.1", port: 0 } });
    await dev.listen();
    production = await preview({ ...config, preview: { host: "127.0.0.1", port: 0 } });
    for (const server of [dev, production]) {
      const address = server.httpServer.address();
      const origin = `http://127.0.0.1:${address.port}`;
      for (const slug of Object.keys(apps)) {
        const redirect = await fetch(`${origin}/${slug}?source=test`, { redirect: "manual" });
        assert.equal(redirect.status, 308);
        assert.equal(redirect.headers.get("location"), `/${slug}/?source=test`);
        for (const route of [`/${slug}/`, `/${slug}/index.html`]) {
          const response = await fetch(origin + route);
          assert.equal(response.status, 200);
          const html = await response.text();
          assert.match(html, new RegExp(`<title>${apps[slug]}</title>`));
          assert.match(html, /href="\.\/manifest.webmanifest"/);
          if (server === dev) assert.match(html, /src="\/src\/main.jsx"/);
        }
        assert.equal((await fetch(`${origin}/${slug}/manifest.webmanifest`)).status, 200);
      }
    }
  } finally {
    await dev?.close();
    await production?.close();
    await rm(root, { recursive: true, force: true });
  }
});

function workerHarness({ failFetch = false, unbuilt = false, stores = new Map(), version = "test", responseOptions = {}, failPut = false } = {}) {
  const scope = "https://example.test/dash-board/";
  const listeners = {};
  const requests = [];
  const precache = ["", "hub/", "hub/index.html", "assets/app-12345678.js", "app-icon-192.png"];
  const runtime = ["assets/lazy-12345678.js", "assets/lazy-12345678.css"];
  const metadata = { version, files: [...precache, ...runtime], precache, runtime, shells: ["", "hub/", "hub/index.html"] };
  const context = {
    self: { registration: { scope }, addEventListener: (name, fn) => { listeners[name] = fn; } },
    URL, Request,
    caches: {
      open: async (name) => {
        if (!stores.has(name)) stores.set(name, new Map());
        return { put: async (url, response) => { if (failPut) throw new Error("quota"); stores.get(name).set(url, response); }, match: async (url) => stores.get(name).get(url) };
      },
      keys: async () => [...stores.keys()],
      delete: async (name) => stores.delete(name),
    },
    fetch: async (request) => {
      requests.push(request);
      if (failFetch) throw new Error("offline");
      return { ok: true, status: 200, type: "basic", redirected: false, headers: new Headers(), url: request.url, clone() { return this; }, ...responseOptions };
    },
  };
  vm.runInNewContext(unbuilt ? workerTemplate : workerTemplate.replace('"__HUB_PWA_BUILD__"', JSON.stringify(metadata)), context);
  const lifecycle = async (name) => { let pending; listeners[name]({ waitUntil: (value) => { pending = value; } }); await pending; };
  const intercept = (relative, options = {}) => {
    let response;
    listeners.fetch({ request: { url: new URL(relative, scope).href, method: "GET", headers: new Headers(), mode: "cors", ...options }, respondWith: (value) => { response = value; } });
    return response;
  };
  return { stores, requests, lifecycle, intercept, metadata, scope };
}

test("worker caches only release allowlist; never auth, APIs, mutations or external traffic", async () => {
  const worker = workerHarness();
  await worker.lifecycle("install");
  assert.equal(worker.requests.length, worker.metadata.precache.length);
  for (const request of worker.requests) {
    assert.equal(request.credentials, "omit");
    assert.equal(request.redirect, "error");
  }
  assert.ok(await worker.intercept("hub/", { mode: "navigate" }));
  assert.ok(await worker.intercept("hub/index.html", { mode: "navigate" }));
  assert.ok(await worker.intercept("assets/app-12345678.js"));
  assert.ok(await worker.intercept("app-icon-192.png?v=5"));
  assert.equal(worker.requests.length, worker.metadata.precache.length);
  for (const url of ["api/data", "auth/callback", "rest/v1/data", "assets/unknown-12345678.js", "assets/lazy.js", "hub/?code=secret", "hub/?access_token=secret", "assets/lazy-12345678.js?token=secret", "https://external.test/assets/lazy-12345678.js"]) {
    for (const mode of ["navigate", "cors"]) assert.equal(worker.intercept(url, { mode }), undefined, url);
  }
  assert.equal(worker.intercept("assets/lazy-12345678.js", { method: "POST" }), undefined);
  assert.equal(worker.intercept("assets/lazy-12345678.js", { headers: new Headers({ Authorization: "Bearer token" }) }), undefined);
  assert.equal(worker.intercept("assets/lazy-12345678.js", { headers: new Headers({ Range: "bytes=0-10" }) }), undefined);
  assert.equal(worker.intercept("hub/"), undefined);
  assert.equal(worker.intercept("assets/lazy-12345678.js", { mode: "navigate" }), undefined);
  worker.stores.set("hub-pwa:/dash-board/:old", new Map());
  worker.stores.set("hub-pwa:/another-repo/:old", new Map());
  worker.stores.set("user-data", new Map());
  await worker.lifecycle("activate");
  assert.ok(!worker.stores.has("hub-pwa:/dash-board/:old"));
  assert.ok(worker.stores.has("hub-pwa:/another-repo/:old"));
  assert.ok(worker.stores.has("user-data"));
  assert.doesNotMatch(workerTemplate, /skipWaiting|clients\.claim/);
});

test("lazy assets cache only on first use and survive while a new release waits", async () => {
  const active = workerHarness();
  await active.lifecycle("install");
  const activeCache = active.stores.get("hub-pwa:/dash-board/:test");
  for (const file of active.metadata.runtime) assert.ok(!activeCache.has(new URL(file, active.scope).href));
  await active.intercept(active.metadata.runtime[0]);
  assert.equal(active.requests.length, active.metadata.precache.length + 1);
  assert.equal(active.requests.at(-1).credentials, "omit");
  assert.equal(active.requests.at(-1).redirect, "error");
  await active.intercept(active.metadata.runtime[0]);
  assert.equal(active.requests.length, active.metadata.precache.length + 1);
  const waiting = workerHarness({ stores: active.stores, version: "next" });
  await waiting.lifecycle("install");
  assert.ok(active.stores.has("hub-pwa:/dash-board/:test"));
  assert.equal(waiting.requests.length, waiting.metadata.precache.length);
  await active.intercept(active.metadata.runtime[1]);
  assert.ok(activeCache.has(new URL(active.metadata.runtime[1], active.scope).href));
  assert.ok(!active.stores.get("hub-pwa:/dash-board/:next").has(new URL(active.metadata.runtime[1], active.scope).href));
  // The browser invokes activation only after the previous controlled clients finish.
  await waiting.lifecycle("activate");
  assert.ok(!active.stores.has("hub-pwa:/dash-board/:test"));
  assert.ok(active.stores.has("hub-pwa:/dash-board/:next"));
});

test("runtime caching rejects unsafe responses and tolerates cache quota failures", async () => {
  for (const responseOptions of [
    { headers: new Headers({ "Cache-Control": "no-store" }) },
    { headers: new Headers({ "Cache-Control": "private, max-age=60" }) },
    { redirected: true }, { ok: false, status: 404 }, { status: 206 }, { type: "opaque" },
  ]) {
    const worker = workerHarness({ responseOptions });
    await worker.intercept(worker.metadata.runtime[0]);
    assert.equal(worker.stores.get("hub-pwa:/dash-board/:test").size, 0);
  }
  const full = workerHarness({ failPut: true });
  assert.equal((await full.intercept(full.metadata.runtime[0])).status, 200);
});

test("failed precache is removed and unbuilt dev worker remains inert", async () => {
  const failed = workerHarness({ failFetch: true });
  await assert.rejects(failed.lifecycle("install"), /offline/);
  assert.equal(failed.stores.size, 0);
  const dev = workerHarness({ unbuilt: true });
  await dev.lifecycle("install");
  await dev.lifecycle("activate");
  assert.equal(dev.intercept("hub/", { mode: "navigate" }), undefined);
  assert.equal(dev.stores.size, 0);
});

test("PWA registration and install hook match the parent integration contract", async () => {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    plugins: [{
      name: "pwa-test-react-snapshot",
      enforce: "pre",
      resolveId(id) { if (id === "react") return "\0react-test"; },
      load(id) { if (id === "\0react-test") return "export const useSyncExternalStore = (subscribe, getSnapshot) => getSnapshot();"; },
    }],
    build: { write: false, minify: false, lib: { entry: path.join(repo, "src/hub/pwa.js"), formats: ["iife"], name: "PwaTest" } },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const code = outputs.flatMap((output) => output.output).find((file) => file.type === "chunk").code;
  for (const page of ["https://example.test/dash-board/", "https://example.test/dash-board/flow/", "https://example.test/dash-board/mindfold/index.html"]) {
    const events = {};
    const registrations = [];
    const navigator = {
      userAgent: "iPhone", platform: "iPhone", maxTouchPoints: 1,
      serviceWorker: { register: async (...args) => { registrations.push(args); return { scope: args[1].scope }; } },
    };
    const window = {
      navigator, isSecureContext: true,
      matchMedia: () => ({ matches: false, addEventListener() {} }),
      addEventListener: (name, fn) => { events[name] = fn; },
    };
    const context = vm.createContext({
      window, navigator, URL, console,
      document: { baseURI: page, querySelector: () => ({ content: page === "https://example.test/dash-board/" ? "./" : "../" }) },
    });
    vm.runInContext(code, context);
    const api = context.PwaTest;
    await api.registerPwa();
    await api.registerPwa();
    assert.equal(registrations.length, 1);
    assert.equal(registrations[0][0], "https://example.test/dash-board/sw.js");
    assert.equal(registrations[0][1].scope, "/dash-board/");
    assert.equal(registrations[0][1].updateViaCache, "none");
    assert.equal(api.useInstallPrompt().available, false);
    assert.match(api.useInstallPrompt().instructions, /Safari/);
    assert.equal(await api.useInstallPrompt().install(), "unavailable");
    let prevented = false;
    let prompted = 0;
    events.beforeinstallprompt({
      preventDefault() { prevented = true; },
      async prompt() { prompted++; },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    assert.ok(prevented);
    assert.equal(api.useInstallPrompt().available, true);
    const installation = api.useInstallPrompt().install();
    assert.equal(api.useInstallPrompt().installing, true);
    assert.equal(await api.useInstallPrompt().install(), "unavailable");
    assert.equal(await installation, "accepted");
    assert.equal(prompted, 1);
    assert.equal(api.useInstallPrompt().available, false);
    assert.equal(api.useInstallPrompt().installed, false);
    events.appinstalled();
    assert.equal(api.useInstallPrompt().installed, true);
    assert.equal(await api.useInstallPrompt().install(), "installed");
  }
  const serverContext = vm.createContext({ console });
  vm.runInContext(code, serverContext);
  assert.equal(await serverContext.PwaTest.registerPwa(), null);
  assert.equal(serverContext.PwaTest.useInstallPrompt().installed, false);
});
