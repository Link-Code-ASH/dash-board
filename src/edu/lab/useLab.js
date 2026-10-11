import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { accountClient } from "../../accountSync.js";
import { useHubRuntime } from "../../hub/context.jsx";
import { createLabCloud, labFailure } from "./cloud.js";
import { createLabStore } from "./store.js";

const initial = { notes: [], items: [], loading: false, loaded: false, busy: false, error: "" };
const noSubscribe = () => () => {};

export default function useLab() {
  const { account, gate } = useHubRuntime();
  const userId = account.user?.id || null;
  const connected = Boolean(userId && !account.loading && !gate);
  const current = useRef(null);
  current.current = { userId, connected };
  const [binding, setBinding] = useState(null);
  useLayoutEffect(() => {
    if (!connected) { setBinding(null); return; }
    const controller = new AbortController();
    const store = createLabStore(userId, {
      controller,
      cloud: createLabCloud(accountClient, userId, { signal: controller.signal }),
      canWrite: () => current.current.userId === userId && current.current.connected,
    });
    setBinding({ userId, store });
    return () => store.dispose();
  }, [userId, connected]);
  const store = binding?.userId === userId && connected ? binding.store : null;
  const snapshot = useSyncExternalStore(store?.subscribe || noSubscribe, store?.getSnapshot || (() => initial));
  useEffect(() => {
    if (!store) return;
    const refresh = () => { void store.refresh().catch(() => {}); };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [store]);
  const withStore = useCallback((method, ...args) => {
    if (!store || !current.current.connected || current.current.userId !== userId) {
      return Promise.reject(labFailure("LAB_ACCOUNT_CHANGED", "계정 확인이 끝난 뒤 다시 시도해주세요."));
    }
    return store[method](...args);
  }, [store, userId]);
  return {
    ...snapshot, loading: account.loading || (connected && !store) || snapshot.loading,
    connected, userId, scope: `${account.loading ? "loading" : "ready"}:${userId || "local"}`,
    refresh: () => withStore("refresh"),
    updateNote: (base, patch) => withStore("updateNote", base, patch),
    updateItem: (base, patch) => withStore("updateItem", base, patch),
    createNote: (input) => withStore("createNote", input),
    removeNote: (base) => withStore("removeNote", base),
    removeItem: (base) => withStore("removeItem", base),
  };
}
