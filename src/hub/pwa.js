import { useSyncExternalStore } from "react";

const listeners = new Set();
const serverState = { available: false, installed: false, installing: false };
let state = serverState;
let deferredPrompt = null;
let registrationPromise = null;
let initialized = false;

function publish(patch) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function initialize() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const standalone = window.matchMedia("(display-mode: standalone)");
  const isStandalone = () => standalone.matches || window.navigator.standalone === true;
  publish({ installed: isStandalone() });
  standalone.addEventListener?.("change", () => {
    publish({ installed: isStandalone(), available: !isStandalone() && Boolean(deferredPrompt) });
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    publish({ available: !state.installed });
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    publish({ installed: true, available: false, installing: false });
  });
}

initialize();

/** Register once in production. Resolves to a registration, or null when unavailable. */
export function registerPwa() {
  initialize();
  if (typeof window === "undefined" || import.meta.env?.DEV || !window.isSecureContext || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }
  if (!registrationPromise) {
    const base = document.querySelector('meta[name="hub-base"]')?.content;
    if (!base) return Promise.resolve(null);
    const root = new URL(base, document.baseURI);
    registrationPromise = navigator.serviceWorker.register(new URL("sw.js", root).href, {
      scope: root.pathname,
      updateViaCache: "none",
    }).catch((error) => {
      console.warn("HUB service worker registration failed:", error);
      registrationPromise = null;
      return null;
    });
  }
  return registrationPromise;
}

async function install() {
  if (state.installed) return "installed";
  const prompt = deferredPrompt;
  if (!prompt || state.installing) return "unavailable";
  deferredPrompt = null;
  publish({ available: false, installing: true });
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    return choice.outcome;
  } catch (error) {
    console.warn("HUB install prompt failed:", error);
    return "error";
  } finally {
    publish({ installing: false });
  }
}

function subscribe(listener) {
  initialize();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function installInstructions(installed) {
  if (installed) return "This app is installed and running standalone, or was installed in this session.";
  if (typeof navigator === "undefined") return "Use your browser menu to install this app or add it to your home screen.";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return "Open this page in Safari, tap Share, then Add to Home Screen. Enable Open as Web App if shown, then tap Add.";
  return "Use your browser's Install app or Add to Home screen menu. If neither is available, open this page in a browser that supports installation.";
}

/** Install state belongs to the current document's manifest, not every sibling app. */
export function useInstallPrompt() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => serverState);
  const instructions = installInstructions(snapshot.installed);
  return { ...snapshot, install, instructions, installInstructions: instructions };
}
