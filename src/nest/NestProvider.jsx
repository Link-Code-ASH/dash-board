import React, { createContext, useContext, useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { useHubRuntime } from "../hub/context.jsx";
import { registerBackupProvider } from "../hub/moduleRegistry.js";
import { createNestStore } from "./store.js";
import { accountLock, localStorageAdapter } from "./storage.js";
import { cloudAdapter } from "./cloud.js";

const Context = createContext(null);
export const useNest = () => useContext(Context);
const initial = { items: [], ready: false, status: "계정 확인 중…", recoveryCount: 0 };
const noSubscribe = () => () => {};

function AccountNest({ userId, loading, children }) {
  const [store, setStore] = useState(null);
  useLayoutEffect(() => {
    if (loading) return;
    const next = createNestStore(userId || "local", {
      storage: localStorageAdapter, cloud: userId ? cloudAdapter(userId) : null, lock: accountLock,
    });
    setStore(next);
    return () => next.dispose();
  }, [userId, loading]);
  const snapshot = useSyncExternalStore(store?.subscribe || noSubscribe, store?.getSnapshot || (() => initial));
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    if (!store) return;
    let running = false;
    const sync = async () => {
      if (running) return;
      running = true;
      try { await store.sync(); } catch { /* The store shows the error and keeps pending edits. */ }
      finally { running = false; setSynced(true); }
    };
    store.load().then(sync).catch(() => {});
    const unregister = registerBackupProvider({ id: "nest", exportBackup: store.exportBackup,
      restoreBackup: async (value) => { await store.restoreBackup(value); void sync(); } });
    // Once a minute while the page is in view; a hidden tab checks again as soon as it comes back.
    const timer = setInterval(() => { if (document.visibilityState !== "hidden") void sync(); }, 60000);
    const onVisible = () => { if (document.visibilityState === "visible") void sync(); };
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onVisible);
    return () => { unregister(); clearInterval(timer); window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync); document.removeEventListener("visibilitychange", onVisible); };
  }, [store]);
  const changeMany = async (changes) => {
    const items = await store.changeMany(changes);
    void store.sync().catch(() => {});
    return items;
  };
  // With an account the garden can start only after the first sync attempt. Starter ids are fixed, so even an
  // offline start on two devices merges into one pair.
  const settled = snapshot.ready && (!userId || synced);
  return <Context.Provider value={{ ...snapshot, settled, store, changeMany, userId }}>{children}</Context.Provider>;
}

export default function NestProvider({ children }) {
  const { account } = useHubRuntime();
  const userId = account.user?.id || null;
  return <AccountNest key={`${account.loading ? "loading" : "ready"}:${userId || "local"}`} userId={userId} loading={account.loading}>{children}</AccountNest>;
}
