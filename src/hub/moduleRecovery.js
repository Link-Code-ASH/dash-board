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
