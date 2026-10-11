import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDashboardData } from "../hub/context.jsx";
import { registerFlowSource } from "../hub/moduleRegistry.js";
import { applyEduAction, normalizeEdu, reconcilePromotions, seoulDateKey, seoulYear } from "./model.js";
import { createEduFlowSource } from "./flow.js";

const Context = createContext(null);
const emptyEdu = { version: 1, students: [], consultations: [], events: [] };
const DAY = 24 * 60 * 60 * 1000;
const automaticTask = (needsRetry = false) => ({ running: false, queued: false, needsRetry, failed: new Set(), failedDay: "" });
export const useEdu = () => useContext(Context);

function AccountEdu({ owner, dashboard, children }) {
  const [today, setToday] = useState(() => seoulDateKey(new Date()));
  const [pending, setPending] = useState(0);
  const [saveError, setSaveError] = useState(null);
  const parsed = useMemo(() => {
    try { return { edu: normalizeEdu(dashboard.data.edu), error: "" }; }
    catch (error) {
      return { edu: emptyEdu, error: `원생 데이터를 열지 못했습니다. 백업과 데이터를 확인해주세요. ${error.message}` };
    }
  }, [dashboard.data.edu]);
  const ready = Boolean(dashboard.accountStorageReady && !parsed.error);
  const current = useRef(null);
  current.current = { dashboard, edu: parsed.edu, ready, today };
  const lifecycle = useRef({ active: true, generation: 0 });
  const listeners = useRef(new Set());
  const automatic = useRef(automaticTask());

  useLayoutEffect(() => {
    lifecycle.current.active = true;
    lifecycle.current.generation += 1;
    // StrictMode replays effects on the same component. Start fresh bookkeeping
    // while retaining the need to flush any optimistic edit from the previous run.
    const previousTask = automatic.current;
    automatic.current = automaticTask(previousTask.running || previousTask.needsRetry);
    setPending(0);
    return () => {
      lifecycle.current.active = false;
      lifecycle.current.generation += 1;
      listeners.current.clear();
    };
  }, []);

  const persist = useCallback(async (updater, { automatic: isAutomatic = false } = {}) => {
    const session = lifecycle.current;
    const generation = session.generation;
    if (!session.active || !current.current.ready) throw new Error("계정의 원생 데이터를 준비 중입니다. 잠시 후 다시 시도해주세요.");
    const isCurrent = () => session.active && session.generation === generation;
    setPending((count) => count + 1);
    try {
      let result;
      await current.current.dashboard.saveData((draft) => {
        if (!isCurrent() || !current.current.ready) throw new Error("계정이 변경되어 작업을 중단했습니다.");
        result = updater(normalizeEdu(draft.edu));
        return { ...draft, edu: result };
      }, { expectedOwner: owner });
      if (!isCurrent()) throw new Error("계정이 변경되어 작업을 중단했습니다.");
      // A durable flush saves the whole current dashboard, including earlier pending Edu edits.
      automatic.current.needsRetry = false;
      setSaveError(null);
      return result;
    } catch (error) {
      if (isCurrent()) setSaveError({
        message: error.message || "저장하지 못했습니다. 입력 내용을 확인하고 다시 저장해주세요.",
        automatic: isAutomatic,
      });
      throw error;
    } finally {
      if (isCurrent()) setPending((count) => Math.max(0, count - 1));
    }
  }, [owner]);

  const save = useCallback((action) => {
    const now = new Date();
    return persist((edu) => applyEduAction(edu, action, { now, actor: owner }));
  }, [owner, persist]);

  const reconcile = useCallback(async (force = false) => {
    if (!lifecycle.current.active || !current.current.ready) return;
    const task = automatic.current;
    if (task.running) { task.queued = true; return; }
    const snapshot = current.current;
    if (snapshot.today !== task.failedDay) {
      task.failed.clear();
      task.failedDay = snapshot.today;
    }
    if (!force && task.failed.has(snapshot.edu)) return;
    const now = new Date();
    if (reconcilePromotions(snapshot.edu, now) === snapshot.edu && !task.needsRetry) return;
    task.running = true;
    const generation = lifecycle.current.generation;
    const isCurrentTask = () => lifecycle.current.active
      && lifecycle.current.generation === generation && automatic.current === task;
    try {
      await persist((edu) => reconcilePromotions(edu, now), { automatic: true });
    } catch {
      if (!isCurrentTask()) return;
      // Suppress immediate retries of a failed snapshot; focus or a real data edit can retry.
      // The dashboard updates optimistically, so retry durability even if events already exist.
      task.needsRetry = true;
      task.failed.clear();
      task.failed.add(snapshot.edu);
      task.failed.add(current.current.edu);
    } finally {
      if (isCurrentTask()) {
        task.running = false;
        if (task.queued) {
          task.queued = false;
          void reconcile();
        }
      }
    }
  }, [persist]);

  useEffect(() => { void reconcile(); }, [parsed.edu, today, ready, reconcile]);

  useEffect(() => {
    let timer;
    const updateDay = () => {
      const now = new Date();
      setToday(seoulDateKey(now));
      const [year, month, day] = seoulDateKey(now).split("-").map(Number);
      const nextMidnight = Date.UTC(year, month - 1, day + 1) - 9 * 60 * 60 * 1000;
      clearTimeout(timer);
      timer = setTimeout(updateDay, Math.min(DAY, Math.max(100, nextMidnight - now.getTime() + 50)));
    };
    const resume = () => { updateDay(); void reconcile(true); };
    const onVisibility = () => { if (document.visibilityState === "visible") resume(); };
    updateDay();
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reconcile]);

  useEffect(() => {
    if (!ready) return;
    const source = createEduFlowSource({
      getEdu: () => {
        if (!lifecycle.current.active || !current.current.ready) throw new Error("원생 연결이 종료되었습니다.");
        return current.current.edu;
      },
      subscribe: (listener) => {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
      save,
    });
    return registerFlowSource(source);
  }, [ready, save]);

  useEffect(() => {
    for (const listener of [...listeners.current]) listener();
  }, [parsed.edu, today]);

  const value = useMemo(() => ({
    edu: parsed.edu, today, year: seoulYear(new Date(`${today}T00:00:00+09:00`)),
    ready, busy: pending > 0, error: parsed.error || saveError?.message || "", save, scope: owner,
  }), [parsed, today, ready, pending, saveError, save, owner]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export default function EduProvider({ children }) {
  const dashboard = useDashboardData();
  const owner = dashboard.account.user?.id || "local";
  const phase = dashboard.account.loading ? "loading" : "ready";
  return <AccountEdu key={`${owner}:${phase}`} owner={owner} dashboard={dashboard}>{children}</AccountEdu>;
}
