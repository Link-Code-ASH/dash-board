import React, { createContext, useContext, useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { useHubRuntime } from "../hub/context.jsx";
import { registerBackupProvider } from "../hub/moduleRegistry.js";
import { createLingoStore } from "./store.js";
import { localStorageAdapter, accountLock } from "./storage.js";
import { cloudAdapter } from "./cloud.js";
import { clearGoogleToken } from "./google.js";

const Context = createContext(null);
export const useLingo = () => useContext(Context);
const initial = { decks: [], ready: false, status: "계정 확인 중…", recoveryCount: 0 };
const noSubscribe = () => () => {};

function AccountLingo({ userId, loading, children }) {
  const [store, setStore] = useState(null);
  useLayoutEffect(() => {
    if (loading) return;
    const next = createLingoStore(userId || "local", {
      storage: localStorageAdapter, cloud: userId ? cloudAdapter(userId) : null, lock: accountLock,
    });
    setStore(next);
    return () => { next.dispose(); clearGoogleToken(); };
  }, [userId, loading]);
  const snapshot = useSyncExternalStore(store?.subscribe || noSubscribe, store?.getSnapshot || (() => initial));
  useEffect(() => {
    if (!store) return;
    let running = false;
    const sync = async () => {
      if (running) return;
      running = true;
      try { await store.sync(); } catch { /* Store exposes the error and keeps pending edits. */ }
      finally { running = false; }
    };
    store.load().then(sync).catch(() => {});
    const unregister = registerBackupProvider({ id: "lingo", exportBackup: store.exportBackup,
      restoreBackup: async (value) => { await store.restoreBackup(value); void sync(); } });
    const timer = setInterval(sync, 30000);
    const onVisible = () => { if (document.visibilityState === "visible") void sync(); };
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onVisible);
    return () => { unregister(); clearInterval(timer); window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync); document.removeEventListener("visibilitychange", onVisible); };
  }, [store]);
  const change = async (...args) => {
    const deck = await store.change(...args);
    void store.sync().catch(() => {});
    return deck;
  };
  return <Context.Provider value={{ ...snapshot, store, change, userId }}>{children}</Context.Provider>;
}

export default function LingoProvider({ children }) {
  const { account } = useHubRuntime();
  const userId = account.user?.id || null;
  return <AccountLingo key={`${account.loading ? "loading" : "ready"}:${userId || "local"}`} userId={userId} loading={account.loading}>{children}</AccountLingo>;
}
