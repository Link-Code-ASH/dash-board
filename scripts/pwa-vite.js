import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const apps = {
  hub: "HUB",
  flow: "Flow",
  routine: "Routine",
  edu: "Edu",
  lingo: "Lingo",
  mindfold: "Mindfold",
};

const entryPattern = new RegExp(`^/(${Object.keys(apps).join("|")})(?:/|/index\\.html)?$`);

function entryHtml(html, slug) {
  const name = apps[slug] || "HUB";
  const base = slug ? "../" : "./";
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${name}</title>`)
    .replace(/(<meta name="(?:application-name|apple-mobile-web-app-title)" content=")[^"]*("\s*\/?>)/g, `$1${name}$2`)
    .replace(/<link rel="manifest"[^>]*>/, `<link rel="manifest" href="./manifest.webmanifest" />`)
    .replace(/((?:src|href)=")\.\/(?!manifest\.webmanifest)([^"]*)"/g, `$1${base}$2"`)
    .replace(/<meta name="hub-base"[^>]*>\s*/g, "")
    .replace("</head>", `  <meta name="hub-base" content="${base}" />\n  </head>`);
}

function redirectEntry(req, res, next) {
  const url = new URL(req.url, "http://localhost");
  const match = url.pathname.match(entryPattern);
  if (match && url.pathname === `/${match[1]}`) {
    res.writeHead(308, { Location: `${url.pathname}/${url.search}` });
    res.end();
    return;
  }
  next();
}

export function hubPwa() {
  let config;
  return {
    name: "hub-pwa",
    enforce: "post",
    configResolved(resolved) {
      config = resolved;
    },
    configureServer(server) {
      server.middlewares.use(redirectEntry);
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, "http://localhost");
        const match = url.pathname.match(entryPattern);
        if (!match || !["GET", "HEAD"].includes(req.method)) return next();
        try {
          const template = await readFile(path.join(config.root, "index.html"), "utf8");
          const html = await server.transformIndexHtml(url.pathname, template, req.originalUrl);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
          res.end(req.method === "HEAD" ? undefined : html);
        } catch (error) {
          next(error);
        }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(redirectEntry);
    },
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        const slug = context.path.match(entryPattern)?.[1];
        return entryHtml(html, slug);
      },
    },
    async generateBundle(_options, bundle) {
      const root = bundle["index.html"];
      if (!root || root.type !== "asset") throw new Error("HUB PWA requires the root index.html entry.");
      for (const slug of Object.keys(apps)) {
        this.emitFile({ type: "asset", fileName: `${slug}/index.html`, source: entryHtml(String(root.source), slug) });
      }

      const shells = ["", "index.html", ...Object.keys(apps).flatMap((slug) => [`${slug}/`, `${slug}/index.html`])];
      const staticFiles = Object.values(bundle)
        .filter((file) => /-[\w-]{8,}\.(?:js|css|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf|wasm)$/.test(file.fileName))
        .map((file) => file.fileName);
      const initialFiles = new Set();
      // Follow only static imports. Dynamic chunks and their assets stay on demand.
      function visitInitial(fileName) {
        if (initialFiles.has(fileName)) return;
        const file = bundle[fileName];
        if (!file) return;
        initialFiles.add(fileName);
        if (file.type !== "chunk") return;
        for (const dependency of file.imports) visitInitial(dependency);
        for (const asset of file.viteMetadata?.importedCss || []) visitInitial(asset);
        for (const asset of file.viteMetadata?.importedAssets || []) visitInitial(asset);
      }
      for (const file of Object.values(bundle)) {
        if (file.type === "chunk" && file.isEntry) visitInitial(file.fileName);
      }
      const publicFiles = ["favicon-32.png", "favicon.png", "app-icon-180.png", "app-icon-192.png", "app-icon-512.png", "app-logo-transparent.png", "manifest.webmanifest", ...Object.keys(apps).map((slug) => `${slug}/manifest.webmanifest`)];
      const precache = [...new Set([...shells, ...initialFiles, ...publicFiles])].sort();
      const runtime = staticFiles.filter((file) => !precache.includes(file)).sort();
      const files = [...precache, ...runtime].sort();
      const worker = await readFile(path.join(config.publicDir, "sw.js"), "utf8");
      const hash = createHash("sha256").update(worker).update(JSON.stringify({ precache, runtime }));
      for (const file of Object.values(bundle).sort((a, b) => a.fileName.localeCompare(b.fileName))) {
        hash.update(file.fileName).update(file.type === "chunk" ? file.code : file.source);
      }
      for (const file of publicFiles) hash.update(await readFile(path.join(config.publicDir, file)));
      const source = worker.replace('"__HUB_PWA_BUILD__"', JSON.stringify({ version: hash.digest("hex").slice(0, 20), files, precache, runtime, shells }));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}
