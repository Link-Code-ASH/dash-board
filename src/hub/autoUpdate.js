import { latestAppUrl } from "./moduleRecovery.js";

// New releases used to wait until every HUB window was closed, so devices kept
// running old code until someone pressed Ctrl+Shift+R. This checks for a new
// release regularly and applies it on its own once the window is idle: no
// focused text field, no typing or IME composition, and no input for a while
// (shorter when the window is in the background). Local saves are flushed first.

const CHECK_MS = 5 * 60_000;
const TICK_MS = 5_000;
const IDLE_VISIBLE_MS = 2 * 60_000;
const IDLE_HIDDEN_MS = 30_000;

/** True when reloading now cannot interrupt something the person is doing. */
export function isSafeToReload({ now, lastInput, hidden, composing, editing }) {
  if (composing || editing) return false;
  return now - lastInput >= (hidden ? IDLE_HIDDEN_MS : IDLE_VISIBLE_MS);
}

function isEditing(doc) {
  const active = doc.activeElement;
  return Boolean(active?.matches?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
}

export function startAutoUpdate(registrationPromise, { flush = async () => {}, win = window } = {}) {
  const serviceWorker = win.navigator?.serviceWorker;
  if (!serviceWorker) return;
  const doc = win.document;
  let lastInput = Date.now();
  let composing = false;
  let reloading = false;
  let wanted = false;
  let requested = null;
  let registration = null;

  const touch = () => { lastInput = Date.now(); };
  for (const name of ["keydown", "pointerdown", "wheel", "touchstart", "input"]) win.addEventListener(name, touch, { capture: true, passive: true });
  doc.addEventListener("compositionstart", () => { composing = true; touch(); }, true);
  doc.addEventListener("compositionend", () => { composing = false; touch(); }, true);

  const safe = () => isSafeToReload({ now: Date.now(), lastInput, hidden: doc.visibilityState === "hidden", composing, editing: isEditing(doc) });

  const reload = async () => {
    if (reloading) return;
    reloading = true;
    try { await flush(); } catch { reloading = false; return; }
    win.location.replace(latestAppUrl(win.location.href));
  };

  // Another window (or this one) activated the new release: this page now runs
  // old code under the new worker, so reopen it as soon as that is safe.
  serviceWorker.addEventListener("controllerchange", () => { wanted = true; });

  const tick = () => {
    if (reloading || !safe()) return;
    if (wanted) { reload(); return; }
    const waiting = registration?.waiting;
    // Ask once per waiting release; its activation fires controllerchange.
    if (waiting && serviceWorker.controller && requested !== waiting) {
      requested = waiting;
      waiting.postMessage({ type: "HUB_ACTIVATE_RELEASE" });
    }
  };

  const check = () => { registration?.update().catch(() => {}); };
  Promise.resolve(registrationPromise).then((value) => {
    if (!value) return;
    registration = value;
    check();
    win.setInterval(check, CHECK_MS);
    win.setInterval(tick, TICK_MS);
    doc.addEventListener("visibilitychange", () => { if (doc.visibilityState === "visible") check(); });
    win.addEventListener("online", check);
  });
}
