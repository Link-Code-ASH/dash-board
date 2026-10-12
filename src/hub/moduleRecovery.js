/** A rejected lazy import cannot recover by resetting React's error boundary. */
export function isModuleLoadError(error) {
  return error?.name === "ChunkLoadError" || /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|unable to preload css/i.test(error?.message || "");
}

/** Query navigation bypasses the release-pinned service-worker HTML cache. */
export function latestAppUrl(href, version = Date.now()) {
  const url = new URL(href);
  url.searchParams.set("hub-reload", String(version));
  return url.href;
}

const RECOVERY_KEY = "hub-module-recovery-at";
const RECOVERY_WINDOW_MS = 60_000;

/** Automatic recovery runs once per minute so a real outage cannot loop reloads. */
export function claimAutomaticRecovery(getStorage, now = Date.now()) {
  try {
    const storage = getStorage();
    const last = Number(storage.getItem(RECOVERY_KEY));
    if (Number.isFinite(last) && now - last >= 0 && now - last < RECOVERY_WINDOW_MS) return false;
    storage.setItem(RECOVERY_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

/**
 * The old release's lazy files no longer exist on the server, so let a waiting
 * release take over now instead of after every window closes. Resolves when the
 * new worker controls the page, there is nothing to activate, or after timeoutMs.
 */
export async function activateLatestRelease(serviceWorker, timeoutMs = 4000) {
  try {
    const registration = await serviceWorker?.getRegistration?.();
    if (!registration) return false;
    await registration.update().catch(() => {});
    const worker = registration.waiting || registration.installing;
    if (!worker) return false;
    return await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      const done = () => { clearTimeout(timer); resolve(true); };
      serviceWorker.addEventListener("controllerchange", done, { once: true });
      const send = () => worker.postMessage({ type: "HUB_ACTIVATE_RELEASE" });
      if (worker.state === "installed") send();
      else worker.addEventListener("statechange", () => { if (worker.state === "installed") send(); });
    });
  } catch {
    return false;
  }
}

/** Activate the newest release, then reopen the same screen from the network. */
export async function openLatestApp(win = window) {
  await activateLatestRelease(win.navigator?.serviceWorker);
  win.location.replace(latestAppUrl(win.location.href));
}
