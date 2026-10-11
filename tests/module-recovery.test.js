import assert from "node:assert/strict";
import test from "node:test";
import { isModuleLoadError, latestAppUrl } from "../src/hub/moduleRecovery.js";

test("missing deployment chunks offer recovery across supported browser errors", () => {
  for (const message of [
    "Failed to fetch dynamically imported module: https://example.test/assets/Edu-old.js",
    "error loading dynamically imported module",
    "Importing a module script failed.",
    "Unable to preload CSS for /assets/Edu-old.css",
  ]) assert.equal(isModuleLoadError(new TypeError(message)), true);
  assert.equal(isModuleLoadError({ name: "ChunkLoadError" }), true);
  assert.equal(isModuleLoadError(new Error("Cannot read properties of undefined")), false);
  assert.equal(isModuleLoadError(new Error("Failed to fetch")), false);
  assert.equal(isModuleLoadError(null), false);
});

test("fresh navigation retains deployment path and selected module while bypassing cached shells", () => {
  for (const path of ["/dash-board/", "/dash-board/edu/", "/dash-board/hub/index.html"]) {
    const current = `https://example.test${path}?source=shortcut&hub-reload=old#/edu/lab?date=2026-10-11`;
    const fresh = new URL(latestAppUrl(current, 42));
    assert.equal(fresh.origin, "https://example.test");
    assert.equal(fresh.pathname, path);
    assert.equal(fresh.hash, "#/edu/lab?date=2026-10-11");
    assert.equal(fresh.searchParams.get("source"), "shortcut");
    assert.deepEqual(fresh.searchParams.getAll("hub-reload"), ["42"]);
    assert.notEqual(fresh.href, current);
  }
});
