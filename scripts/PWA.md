# HUB PWA Infrastructure

## Entry Pages and Deployment

`vite.config.js` uses `base: "./"`, Vite's built-in automatic React JSX transform, and the local `scripts/pwa-vite.js` plugin. No new package dependencies, package scripts, or lockfile changes are required. Root HTML metadata names HUB and sets the browser theme to `#f5f6f8`; existing icons are reused.

The plugin serves real HTML responses in development and emits these physical build files from the same root `index.html` and `/src/main.jsx` entry:

| URL | Build file | Manifest name |
| --- | --- | --- |
| `/hub/` | `dist/hub/index.html` | HUB |
| `/flow/` | `dist/flow/index.html` | Flow |
| `/routine/` | `dist/routine/index.html` | Schedule |
| `/edu/` | `dist/edu/index.html` | Edu |
| `/lingo/` | `dist/lingo/index.html` | Lingo |
| `/mindfold/` | `dist/mindfold/index.html` | Mindfold |

Paths above are relative to the deployment root, including `/dash-board/` on GitHub Pages. Both trailing-slash and explicit `index.html` URLs work. Dev/preview redirect bare module paths to their trailing-slash forms. GitHub Pages provides the directory redirect in production. Hash routes such as `flow/#/flow/week?date=2026-10-09` are client-side only and do not change shell selection.

Each sibling has its own `public/<module>/manifest.webmanifest`. Its relative `id`, `start_url`, and `scope` resolve to that module's unique directory. All use the existing shared PNG icons one directory above. Built JS/CSS and root favicon links use `../` from sibling pages. The plugin injects `meta[name="hub-base"]` (`./` at root, `../` in siblings) for registration URL resolution.

Root `/` and `/index.html` remain usable and run exactly the same React entry. The parent controls the root Flow fallback and all pathname/hash detection. The root manifest identifies the same HUB installation as `/hub/`, launching `/hub/`; it does not create a seventh app. Its new identity differs from the former DASH BOARD manifest's implicit root identity, so an old installed DASH shortcut may need manual removal/reinstallation. No existing shortcut is removed automatically.

Do not publish `public/` or source HTML directly. Run the existing `npm run build` and deploy the complete `dist/` directory. The existing GitHub Pages workflow already does this. The production worker is generated during the build; the source `public/sw.js` intentionally remains inert without its build metadata.

## Parent Integration Contract

The parent owns `src/main.jsx`, Settings, entry detection, and auth. Infrastructure does not edit them.

```js
import { registerPwa } from "./hub/pwa.js";
void registerPwa();
```

`registerPwa(): Promise<ServiceWorkerRegistration | null>` is idempotent while registration is pending or successful. It registers `<deployment-root>/sw.js` with the deployment-root scope in secure production contexts. Development, SSR, unsupported/insecure contexts, missing base metadata, and registration failures return `null`. Failures log a warning and can be retried. Registration never reloads the page.

```js
const { available, installed, install } = useInstallPrompt();
// Call install() directly from the user's click/tap handler.
```

`useInstallPrompt()` returns:

| Field | Contract |
| --- | --- |
| `available` | A browser `beforeinstallprompt` event is ready for this document's manifest. |
| `installed` | Running standalone (including iOS), or `appinstalled` was observed in this document. |
| `install` | Async function returning `accepted`, `dismissed`, `unavailable`, `installed`, or `error`. Consumes each browser prompt once. |
| `installing` | The browser prompt is currently in progress. Duplicate calls are ignored. |
| `instructions` | Plain-text manual installation guidance, including Safari/iOS guidance. |
| `installInstructions` | Alias of `instructions` for UI integration convenience. |

The existing Settings fields `available`, `installed`, and `install` are supported without adaptation. `accepted` does not by itself mark installation complete; `appinstalled` or standalone mode does. `available: false` is normal on browsers without the prompt API. Show instructions as a fallback. Browsers do not expose a reliable cross-browser inventory of installed sibling apps: `installed` is not a durable device-wide check and is never written to local/session storage. Navigate to the target sibling page before offering its installation. No install UI is added by infrastructure.

## Cache, Auth, and Updates

- One repo-scoped worker supports all six narrower installation scopes.
- The build produces separate `precache` and `runtime` lists. Precache includes all seven HTML shells (directory and `index.html` aliases), the initial entry and its transitive **static** JS imports plus associated CSS/assets, manifests, and selected existing icons/logo. The graph walk does not follow dynamic imports. Unused lazy modules, including Mindfold and emoji chunks, are not downloaded during installation.
- The runtime allowlist contains only known content-hashed emitted JS/CSS/static assets outside that initial graph. A filename resembling a hash alone is insufficient: it must also be in this release's generated allowlist. Release contents determine the cache version, including worker and public-file changes.
- Installation fetches only precache entries, without cookies, rejecting redirects, failed/non-200 responses, and `no-store`/`private` responses. Incomplete installation removes its partial cache and leaves an existing worker intact.
- Runtime handling is GET-only and cache-first. A missing allowlisted lazy asset is fetched without cookies or redirects and cached on first use if its response is safe. Later requests reuse it offline. Storage quota failure does not block a successful network response. API/auth endpoints, non-allowlisted paths, cross-origin traffic, authorization/range headers, and query strings bypass interception. The only query exception is the existing public icons' `?v=5`.
- Root OAuth callbacks with query parameters therefore use the network. Hash fragments never reach HTTP requests; only the public shell can be cached, not tokens in the fragment. No auth code, callback URL, return-path validation, or session storage is changed. The parent owns the existing root callback and validated internal return path.
- No `skipWaiting`, `clients.claim`, controller-change reload, or forced refresh occurs. A new release waits for old controlled windows to close. Initial registration generally controls the next navigation/reopen, not the current document.
- HTML is pinned to the active release along with its assets. A new worker's installation never removes the old worker's caches, including lazy chunks used by existing clients. To apply a waiting update, close all tabs/windows for this repo and reopen. Normal activation happens only after the old controlled clients finish; only then are prior `hub-pwa:<deployment-path>:` caches removed. Application storage and other deployment caches are untouched.
- Offline support covers the shell, initial assets, and lazy feature assets already fetched through the controlling worker. A feature never used online, or only used before worker control, may not work offline. Remote APIs, authentication, remote media, and guaranteed synchronization are not covered. A newly activated release must fetch its own hashed lazy assets again on demand. No user-data migration, clearing, or storage-key change is performed.

## Verification

```sh
node --test scripts/pwa.test.js
npm run build
npm run preview -- --host 127.0.0.1 --port 4174 --strictPort
```

The infrastructure test creates and removes an isolated temporary fixture, starts and stops its own ephemeral dev/preview servers, and checks emitted HTML, root/project-relative assets, six manifest identities, dynamic JS/CSS exclusion from precache, first-use caching, preservation of old caches while an update waits, unsafe response rejection, quota failures, failed precaching, and the registration/install contract. It does not edit app source or package files. Run it explicitly; `npm test` is intentionally unchanged.

For real browser verification, open `/flow/`, `/routine/`, and root on the preview server. Inspect each manifest in DevTools. After worker activation reopen a page and visit the desired feature online before checking it offline. Verify that unvisited features were not precached, and that API/auth requests are not served by the worker. Test actual installation on Chromium and manual Add to Home Screen on iOS/Safari. Test an update with a tab left open: it should wait without reloading or deleting that client's cached lazy chunks. Native OS installation is not verified by the automated fixture; its install-event test is only a simulated API contract check.

Reference: [Vite plugin hooks](https://vite.dev/guide/api-plugin), [MDN service worker lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers), and [MDN install prompts](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt).
