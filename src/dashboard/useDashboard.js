import { useEffect, useMemo, useRef, useState } from "react";
import { backupWorkspace, restoreWorkspace } from "../mindfold/repository.js";
import { accountClient, createAccountData, readAccountData, readAccountRevision, updateAccountData } from "../accountSync.js";
import { mergeDashboard } from "../hub/merge.js";
import { exportModuleBackups, restoreModuleBackups } from "../hub/moduleRegistry.js";
import { prepareAuthReturn } from "../hub/authReturn.js";
import { listRecoverySnapshots, readRecoverySnapshot } from "./recovery.js";
import {
  accountSnapshotKey, pendingSnapshotPrefix, readStoredSnapshot, readRecoverableSnapshot,
  sameDashboard, mergeAccountSnapshots, nextEditTimestamp, withDashboardLock, stageDashboardSnapshot, flushDashboardSnapshots, mergeStoredDashboard,
} from "./syncState.js";
import {
  STORAGE_KEY,
  SYNC_BACKEND_KEY,
  SYNC_ID_KEY,
  SYNC_PIN_KEY,
  SYNC_REMEMBER_KEY,
  SYNC_KDF_ITERATIONS,
  ACCOUNT_OWNER_KEY,
  schoolNoteColors,
  noteTabColors,
  scoreNumber,
  createEmptyWeeklyPlan,
  normalizeDateMarkers,
  normalizeCalendarDuties,
  normalizeCarryPenalties,
  normalizeDisplayMode,
  normalizeMindfold,
  normalizeSchool,
  normalizeNoteTabs,
  createFallbackState,
  normalizeState,
  loadState,
  downloadTextFile,
  readFileAsDataUrl,
  putNoteImage,
  deleteNoteImage,
  restoreNoteImages,
  getNoteImagesForState,
  createBackupPayload,
  splitBackupPayload,
  loadSyncBackend,
  accountCacheKey,
  accountSyncedKey,
  preserveAccountDraft,
  latestAccountDraftKey,
  needsAccountGate,
  toDateKey,
  getWeekdayMeta,
  createKey,
  encodeBase64Url,
  decodeBase64Url,
  deriveSyncKey,
  createSyncDocId,
  normalizeSyncId,
} from "./model.js";

export function useDashboard(selectedDate, setSelectedDate) {
  const [data, setData] = useState(() => {
    try { return normalizeState(readRecoverableSnapshot(localStorage, STORAGE_KEY) || loadState()); }
    catch { return loadState(); }
  });

  const [activeNoteView, setActiveNoteView] = useState("school");

  const [isNarrowViewport, setIsNarrowViewport] = useState(() => window.matchMedia("(max-width: 760px)").matches);

  const [openPanels, setOpenPanels] = useState({
    display: true,
    sync: false,
    system: false,
    schoolDaily: false,
    daily: false,
    weekly: false,
    calendar: false,
  });

  const [openMonths, setOpenMonths] = useState(() => new Set([new Date().getMonth()]));

  const [sync, setSync] = useState({
    backend: loadSyncBackend(),
    pin: localStorage.getItem(SYNC_REMEMBER_KEY) === "true" ? localStorage.getItem(SYNC_PIN_KEY) || "" : "",
    rememberDevice: localStorage.getItem(SYNC_REMEMBER_KEY) === "true",
    syncId: localStorage.getItem(SYNC_ID_KEY) || "",
    busy: false,
    status: localStorage.getItem(SYNC_REMEMBER_KEY) === "true" ? "Ready to auto connect." : "Not connected.",
  });

  const [account, setAccount] = useState({
    user: null,
    loading: true,
    connected: false,
    cloudAvailable: false,
    busy: false,
    status: "",
    mergeConflicts: [],
  });

  const [accountGate, setAccountGate] = useState(needsAccountGate);

  const dataRef = useRef(data);

  const syncRef = useRef(sync);

  const accountRef = useRef(account);

  const activeAccountIdRef = useRef(null);

  const accountRevisionRef = useRef(null);

  const accountSyncedAtRef = useRef("");
  const lastSyncedSnapshotRef = useRef(null);
  const accountGenerationRef = useRef(0);
  const accountConflictCountRef = useRef(0);
  const accountRetryPausedRef = useRef(false);
  const storageSnapshotRef = useRef({ key: STORAGE_KEY, data });
  const storageWriterRef = useRef(null);
  if (!storageWriterRef.current) storageWriterRef.current = crypto.randomUUID();
  const storageWriteRef = useRef(Promise.resolve());
  const broadcastRef = useRef(null);
  const composingRef = useRef(false);
  const deferredStorageRef = useRef(null);

  const accountWriteInFlightRef = useRef(false);

  const accountPullInFlightRef = useRef(false);

  const accountCheckInFlightRef = useRef(false);

  const accountRefreshPendingRef = useRef(false);

  const accountPushTimerRef = useRef(null);

  const accountPollTimerRef = useRef(null);

  const pushTimerRef = useRef(null);

  const pollTimerRef = useRef(null);

  const autoConnectRef = useRef(false);

  const mindfoldUndoRef = useRef([]);

  const mindfoldRedoRef = useRef([]);

  const mindfoldHistoryGroupRef = useRef({ key: "", timestamp: 0 });

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  useEffect(() => {
    accountRef.current = account;
  }, [account]);

  useEffect(() => {
    const { data: { subscription } } = accountClient.auth.onAuthStateChange((_event, session) => {
      const user = session?.user || null;
      if (accountRef.current.user?.id !== user?.id) {
        const previousUserId = accountRef.current.user?.id;
        accountGenerationRef.current += 1;
        window.clearTimeout(accountPushTimerRef.current);
        accountPushTimerRef.current = null;
        activeAccountIdRef.current = null;
        lastSyncedSnapshotRef.current = null;
        accountRevisionRef.current = null;
        accountSyncedAtRef.current = "";
        accountWriteInFlightRef.current = false;
        accountPullInFlightRef.current = false;
        accountCheckInFlightRef.current = false;
        accountConflictCountRef.current = 0;
        accountRetryPausedRef.current = false;
        deferredStorageRef.current = null;
        if (previousUserId) {
          const next = user ? createFallbackState() : loadState();
          dataRef.current = next;
          storageSnapshotRef.current = { key: STORAGE_KEY, data: next };
          setData(next);
          setAccountGate(true);
        }
        updateAccount((current) => ({ ...current, connected: false, cloudAvailable: false, busy: false, mergeConflicts: [], storageConflicts: [] }));
      }
      updateAccount((current) => ({ ...current, user, loading: false }));
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const updateViewport = () => setIsNarrowViewport(query.matches);
    updateViewport();
    query.addEventListener("change", updateViewport);
    return () => query.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    const tabs = normalizeNoteTabs(data.noteTabs);
    if (!tabs.some((tab) => tab.id === activeNoteView)) setActiveNoteView(tabs[0].id);
  }, [activeNoteView, data.noteTabs]);

  const saveData = (updater, options = {}) => {
    if (storageSnapshotRef.current.key !== currentStorageKey()) return;
    const current = dataRef.current;
    const previousMindfold = options.captureMindfold
      ? normalizeMindfold(JSON.parse(JSON.stringify(current.mindfold)))
      : null;
    const next = typeof updater === "function" ? updater(JSON.parse(JSON.stringify(current))) : updater;
    const normalized = normalizeState({ ...next, updatedAt: nextEditTimestamp(current) });
    if (previousMindfold && JSON.stringify(previousMindfold) !== JSON.stringify(normalized.mindfold)) {
      const now = Date.now();
      const historyGroup = String(options.historyGroup || "");
      const canMerge = historyGroup
        && mindfoldHistoryGroupRef.current.key === historyGroup
        && now - mindfoldHistoryGroupRef.current.timestamp < 800;
      if (!canMerge) {
        mindfoldUndoRef.current.push(previousMindfold);
        if (mindfoldUndoRef.current.length > 100) mindfoldUndoRef.current.shift();
      }
      mindfoldRedoRef.current = [];
      mindfoldHistoryGroupRef.current = { key: historyGroup, timestamp: now };
    }
    persistDashboard(normalized);
    accountConflictCountRef.current = 0;
    accountRetryPausedRef.current = false;
    if (!options.skipSync) scheduleAutoSync();
  };

  const currentStorageKey = () => activeAccountIdRef.current ? accountCacheKey(activeAccountIdRef.current) : STORAGE_KEY;
  const isCurrentAccount = (userId, generation) => accountRef.current.user?.id === userId && accountGenerationRef.current === generation;
  const hasAccountChanges = () => !sameDashboard(dataRef.current, lastSyncedSnapshotRef.current?.data);
  const deferAccountRefresh = () => {
    if (!composingRef.current) return false;
    accountRefreshPendingRef.current = true;
    return true;
  };
  const deferStorageSnapshot = (key, before) => {
    if (deferredStorageRef.current?.key !== key) deferredStorageRef.current = { key, before };
  };
  const notifyWindows = (userId = activeAccountIdRef.current) => broadcastRef.current?.postMessage({ userId, key: currentStorageKey() });
  const reportStorageConflicts = (conflicts) => {
    if (!conflicts.length) return;
    const status = `Merged ${conflicts.length} same-origin conflict(s). Both versions are preserved in local recovery storage.`;
    if (activeAccountIdRef.current) updateAccount((current) => ({ ...current, storageConflicts: conflicts, status }));
    else updateSync((current) => ({ ...current, storageConflicts: conflicts, status }));
    window.dispatchEvent(new CustomEvent("hub:dashboard-conflict", { detail: { key: currentStorageKey(), conflicts } }));
  };

  const acceptStorageSnapshot = (key, snapshot, before) => {
    if (!snapshot || key !== currentStorageKey()) return;
    if (composingRef.current) {
      deferStorageSnapshot(key, before);
      return;
    }
    const result = mergeStoredDashboard(localStorage, key, before, dataRef.current, snapshot);
    const merged = normalizeState(result.data);
    reportStorageConflicts(result.conflicts);
    storageSnapshotRef.current = { key, data: snapshot };
    if (!sameDashboard(dataRef.current, merged)) {
      merged.updatedAt = nextEditTimestamp(dataRef.current, snapshot);
      dataRef.current = merged;
      setData(merged);
    }
  };

  const persistDashboard = (next) => {
    const key = currentStorageKey();
    const generation = accountGenerationRef.current;
    dataRef.current = next;
    setData(next);
    let write;
    let staged = false;
    try {
      const base = storageSnapshotRef.current.key === key ? storageSnapshotRef.current.data : readStoredSnapshot(localStorage, key);
      stageDashboardSnapshot(localStorage, key, storageWriterRef.current, base, next);
      staged = true;
      write = withDashboardLock(`hub-storage:${key}`, () => {
        if (composingRef.current && generation === accountGenerationRef.current && key === currentStorageKey()) {
          deferStorageSnapshot(key, base);
          return { data: null, conflicts: [] };
        }
        return flushDashboardSnapshots(localStorage, key);
      })
        .then(({ data: saved, conflicts }) => {
          if (generation !== accountGenerationRef.current || key !== currentStorageKey()) return;
          acceptStorageSnapshot(key, saved, next);
          reportStorageConflicts(conflicts);
          notifyWindows();
        });
    } catch (error) {
      write = Promise.reject(error);
    }
    storageWriteRef.current = write;
    write.catch((error) => {
      if (generation !== accountGenerationRef.current || key !== currentStorageKey()) return;
      updateAccount((current) => ({
        ...current,
        localSaveFailed: true,
        status: `Local save failed; ${staged ? "recovery draft retained" : "changes remain in memory only; keep this window open"}: ${error.message}`,
      }));
    });
    return write;
  };

  const rememberAccountSnapshot = (userId, state, revision) => {
    const snapshot = { data: JSON.parse(JSON.stringify(state)), revision };
    const persisted = readStoredSnapshot(localStorage, accountSnapshotKey(userId));
    if (!persisted || persisted.revision <= revision) {
      localStorage.setItem(accountSnapshotKey(userId), JSON.stringify(snapshot));
      localStorage.setItem(accountSyncedKey(userId), state.updatedAt);
    }
    lastSyncedSnapshotRef.current = snapshot;
    accountRevisionRef.current = revision;
    accountSyncedAtRef.current = state.updatedAt;
  };

  const updateSync = (updater) => {
    const next = typeof updater === "function" ? updater(syncRef.current) : updater;
    syncRef.current = next;
    setSync(next);
  };

  const setSyncStatus = (status) => {
    updateSync((current) => ({ ...current, status }));
  };

  const updateAccount = (updater) => {
    const next = typeof updater === "function" ? updater(accountRef.current) : updater;
    accountRef.current = next;
    setAccount(next);
  };

  const setAccountStatus = (status) => {
    updateAccount((current) => ({ ...current, status }));
  };

  const signInWithGoogle = async () => {
    updateAccount((current) => ({ ...current, busy: true, status: "Google 로그인으로 이동합니다..." }));
    const { error } = await accountClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: prepareAuthReturn() },
    });
    if (error) updateAccount((current) => ({ ...current, busy: false, status: `로그인 실패: ${error.message}` }));
  };

  const signOutOfGoogle = async () => {
    const generation = accountGenerationRef.current;
    window.clearTimeout(accountPushTimerRef.current);
    window.clearInterval(accountPollTimerRef.current);
    const { error } = await accountClient.auth.signOut({ scope: "local" });
    if (accountRef.current.user && generation !== accountGenerationRef.current) return;
    if (error) {
      setAccountStatus(`로그아웃 실패: ${error.message}`);
      return;
    }
    activeAccountIdRef.current = null;
    accountRevisionRef.current = null;
    accountSyncedAtRef.current = "";
    lastSyncedSnapshotRef.current = null;
    accountRefreshPendingRef.current = false;
    const legacy = loadState();
    storageSnapshotRef.current = { key: STORAGE_KEY, data: legacy };
    dataRef.current = legacy;
    setData(legacy);
    updateAccount((current) => ({ ...current, user: null, connected: false, cloudAvailable: false, busy: false, mergeConflicts: [], storageConflicts: [], status: "로그아웃했습니다." }));
    setAccountGate(needsAccountGate());
  };

  const activateAccountData = async (userId, row, expectedUpdatedAt = null) => {
    const generation = accountGenerationRef.current;
    return withDashboardLock(`hub-cloud-push:${userId}`, async () => {
      if (!isCurrentAccount(userId, generation)) return false;
      if (deferAccountRefresh()) return false;
      const before = dataRef.current;
      const key = accountCacheKey(userId);
      const cacheBefore = storageSnapshotRef.current.key === key ? storageSnapshotRef.current.data : readStoredSnapshot(localStorage, key);
      const { images, state } = splitBackupPayload(row.payload);
      const normalized = normalizeState(state);
      await restoreNoteImages(images, { clear: false });
      if (deferAccountRefresh()) return false;
      if (!isCurrentAccount(userId, generation) || dataRef.current !== before
        || (expectedUpdatedAt && dataRef.current.updatedAt !== expectedUpdatedAt)) return false;
      if (readStoredSnapshot(localStorage, accountSnapshotKey(userId))?.revision > row.revision) return false;
      activeAccountIdRef.current = userId;
      localStorage.setItem(ACCOUNT_OWNER_KEY, userId);
      window.clearTimeout(pushTimerRef.current);
      window.clearInterval(pollTimerRef.current);
      storageSnapshotRef.current = { key, data: cacheBefore };
      await persistDashboard(normalized);
      if (!isCurrentAccount(userId, generation)) return false;
      rememberAccountSnapshot(userId, normalized, row.revision);
      updateAccount((current) => ({ ...current, connected: true, cloudAvailable: true, busy: false, status: "Google 계정과 동기화 중입니다." }));
      setAccountGate(false);
      return true;
    });
  };

  const mergeAccountData = async (userId, row, generation) => {
    return withDashboardLock(`hub-cloud-push:${userId}`, async () => {
      if (!isCurrentAccount(userId, generation) || activeAccountIdRef.current !== userId) return false;
      if (deferAccountRefresh()) return false;
      const { images, state } = splitBackupPayload(row.payload);
      const remote = normalizeState(state);
      await restoreNoteImages(images, { clear: false });
      if (!isCurrentAccount(userId, generation)) return false;
      const localImages = await getNoteImagesForState(dataRef.current);
      if (!isCurrentAccount(userId, generation)) return false;
      if (deferAccountRefresh()) return false;
      if (readStoredSnapshot(localStorage, accountSnapshotKey(userId))?.revision > row.revision) return false;
      const local = dataRef.current;
      if (!preserveAccountDraft(userId, createBackupPayload(local, localImages), "local") || !preserveAccountDraft(userId, row.payload, "remote")) {
        throw new Error("Recovery storage is full; merge stopped without replacing either draft.");
      }
      const { data: merged, conflicts } = mergeAccountSnapshots(lastSyncedSnapshotRef.current, local, remote);
      if (conflicts.length) updateAccount((current) => ({ ...current, mergeConflicts: [...(current.mergeConflicts || []), ...conflicts] }));
      const normalized = normalizeState({ ...merged, updatedAt: nextEditTimestamp(local, remote) });
      await persistDashboard(normalized);
      if (!isCurrentAccount(userId, generation)) return false;
      rememberAccountSnapshot(userId, remote, row.revision);
      updateAccount((current) => ({ ...current, busy: false, connected: true, cloudAvailable: true,
        status: conflicts.some((conflict) => conflict.kind === "missing-base")
          ? "동기화 기준 기록이 없는 기기입니다. 클라우드 자료를 불러왔고, 기존 기기 자료는 복구 사본에 보존했습니다."
          : conflicts.length ? `Merged changes; ${conflicts.length} conflict(s) kept this device's edits. Both drafts are backed up.` : "Merged changes from another device." }));
      return true;
    });
  };

  const loadAccountData = async () => {
    const userId = accountRef.current.user?.id;
    const generation = accountGenerationRef.current;
    if (!userId) return;
    updateAccount((current) => ({ ...current, busy: true, status: "계정 데이터를 확인하는 중입니다..." }));
    try {
      const row = await readAccountData(userId);
      if (!isCurrentAccount(userId, generation)) return;
      if (!row) {
        setAccountStatus("이 계정에는 아직 저장된 데이터가 없습니다. 현재 기기 자료를 올려주세요.");
        updateAccount((current) => ({ ...current, cloudAvailable: false, busy: false }));
        return;
      }
      const hasUnsyncedAccountChanges = activeAccountIdRef.current === userId
        && hasAccountChanges();
      if (hasUnsyncedAccountChanges || (!activeAccountIdRef.current && localStorage.getItem(STORAGE_KEY))) {
        downloadTextFile(`hub-before-google-${toDateKey(new Date())}.json`, JSON.stringify(createBackupPayload(dataRef.current, await getNoteImagesForState(dataRef.current)), null, 2));
      }
      if (!await activateAccountData(userId, row) && isCurrentAccount(userId, generation)) {
        updateAccount((current) => ({ ...current, busy: false, status: "Data changed while loading. Current edits were kept; try again." }));
      }
    } catch (error) {
      if (!isCurrentAccount(userId, generation)) return;
      updateAccount((current) => ({ ...current, busy: false, status: `가져오기 실패: ${error.message}` }));
    }
  };

  const listDashboardRecoveries = () => listRecoverySnapshots(localStorage, accountRef.current.user?.id || null);

  const downloadDashboardRecovery = (key, version = "local") => {
    try {
      const payload = readRecoverySnapshot(localStorage, accountRef.current.user?.id || null, key, version);
      downloadTextFile(`hub-recovery-${version}-${toDateKey(new Date())}.json`, JSON.stringify(payload, null, 2));
      return true;
    } catch (error) {
      setAccountStatus(`Recovery download failed: ${error.message}`);
      return false;
    }
  };

  const downloadAccountRecovery = async () => {
    const userId = accountRef.current.user?.id;
    const key = userId && latestAccountDraftKey(userId);
    if (!key) return;
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      const { images, state } = splitBackupPayload(saved);
      const payload = createBackupPayload(state, images.length ? images : await getNoteImagesForState(state));
      downloadTextFile(`hub-recovery-${toDateKey(new Date())}.json`, JSON.stringify(payload, null, 2));
    } catch (error) {
      setAccountStatus(`백업 다운로드 실패: ${error.message}`);
    }
  };

  const getAccountUploadState = (userId) => {
    if (activeAccountIdRef.current === userId) return dataRef.current;
    try {
      return JSON.parse(localStorage.getItem(accountCacheKey(userId)) || "null") || dataRef.current;
    } catch {
      return dataRef.current;
    }
  };

  const prepareAccountReplacement = async () => {
    const userId = accountRef.current.user?.id;
    const generation = accountGenerationRef.current;
    if (!userId) return null;
    try {
      const row = await readAccountData(userId);
      if (!isCurrentAccount(userId, generation)) return null;
      if (!row) {
        setAccountStatus("클라우드 자료가 없습니다. 계정 상태를 새로 확인해주세요.");
        return null;
      }
      return {
        userId,
        revision: row.revision,
        localUpdatedAt: getAccountUploadState(userId).updatedAt,
        cloudUpdatedAt: row.payload?.updatedAt || row.updated_at,
        sourceHost: window.location.host,
      };
    } catch (error) {
      if (!isCurrentAccount(userId, generation)) return null;
      setAccountStatus(`클라우드 확인 실패: ${error.message}`);
      return null;
    }
  };

  const uploadAccountData = async (replacement = null) => {
    const userId = accountRef.current.user?.id;
    const generation = accountGenerationRef.current;
    if (!userId) return false;
    const before = dataRef.current;
    const key = accountCacheKey(userId);
    const cacheBefore = storageSnapshotRef.current.key === key ? storageSnapshotRef.current.data : readStoredSnapshot(localStorage, key);
    const state = getAccountUploadState(userId);
    const row = await readAccountData(userId).catch((error) => {
      if (isCurrentAccount(userId, generation)) setAccountStatus(`클라우드 확인 실패: ${error.message}`);
      return undefined;
    });
    if (row === undefined || !isCurrentAccount(userId, generation)) return false;
    if (row && (!replacement || replacement.userId !== userId || replacement.revision !== row.revision || replacement.localUpdatedAt !== state.updatedAt)) {
      setAccountStatus("확인 후 자료가 변경되었습니다. 교체 내용을 다시 확인해주세요.");
      return false;
    }
    if (!row && replacement) {
      setAccountStatus("클라우드 상태가 변경되었습니다. 다시 확인해주세요.");
      return false;
    }
    if (!row && !window.confirm("현재 기기 자료가 가장 최신인지 확인하셨나요? 기존 PIN 동기화나 다른 기기에 더 최신 자료가 있을 수 있습니다. 이 자료를 Google 계정에 처음 저장하시겠습니까?")) return false;
    updateAccount((current) => ({ ...current, busy: true, status: "계정에 저장하는 중입니다..." }));
    try {
      return await withDashboardLock(`hub-cloud-push:${userId}`, async () => {
        if (!isCurrentAccount(userId, generation)) return false;
        if (row) downloadTextFile(`hub-cloud-before-replace-${toDateKey(new Date())}.json`, JSON.stringify(row.payload, null, 2));
        const payload = createBackupPayload(state, await getNoteImagesForState(state));
        if (!isCurrentAccount(userId, generation)) return false;
        const revision = row ? await updateAccountData(userId, payload, row.revision) : await createAccountData(userId, payload);
        if (revision === null || !isCurrentAccount(userId, generation)) return false;
        // The uploaded snapshot is the base, even if more edits arrived during upload.
        activeAccountIdRef.current = userId;
        localStorage.setItem(ACCOUNT_OWNER_KEY, userId);
        storageSnapshotRef.current = { key, data: cacheBefore };
        await persistDashboard(normalizeState(mergeDashboard(before, dataRef.current, state).data));
        if (!isCurrentAccount(userId, generation)) return false;
        rememberAccountSnapshot(userId, state, revision);
        updateAccount((current) => ({ ...current, busy: false, connected: true, cloudAvailable: true, status: "Google 계정에 저장되었습니다." }));
        setAccountGate(false);
        notifyWindows(userId);
        if (hasAccountChanges()) scheduleAutoSync();
        return true;
      });
    } catch (error) {
      if (!isCurrentAccount(userId, generation)) return false;
      updateAccount((current) => ({ ...current, busy: false, status: `저장 실패: ${error.message}` }));
      return false;
    }
  };

  const pushAccountData = async ({ automatic = false } = {}) => {
    const userId = activeAccountIdRef.current;
    if (!userId || accountRef.current.user?.id !== userId || !accountRef.current.connected || accountRef.current.busy || accountWriteInFlightRef.current) return;
    if (deferAccountRefresh()) return;
    if (automatic && accountRetryPausedRef.current) return;
    if (!automatic) {
      accountConflictCountRef.current = 0;
      accountRetryPausedRef.current = false;
    }
    if (accountPullInFlightRef.current) {
      scheduleAutoSync();
      return;
    }
    const generation = accountGenerationRef.current;
    const operation = {};
    accountWriteInFlightRef.current = operation;
    updateAccount((current) => ({ ...current, busy: true }));
    try {
      await withDashboardLock(`hub-cloud-push:${userId}`, async () => {
        await storageWriteRef.current.catch(() => {});
        if (!isCurrentAccount(userId, generation) || activeAccountIdRef.current !== userId) return;
        const key = accountCacheKey(userId);
        const { data: shared, conflicts } = await withDashboardLock(`hub-storage:${key}`, () => flushDashboardSnapshots(localStorage, key));
        if (!isCurrentAccount(userId, generation)) return;
        acceptStorageSnapshot(key, shared, storageSnapshotRef.current.data);
        reportStorageConflicts(conflicts);
        if (!hasAccountChanges()) {
          updateAccount((current) => ({ ...current, busy: false }));
          return;
        }
        const state = dataRef.current;
        const payload = createBackupPayload(state, await getNoteImagesForState(state));
        if (!isCurrentAccount(userId, generation)) return;
        const revision = await updateAccountData(userId, payload, accountRevisionRef.current);
        if (!isCurrentAccount(userId, generation)) return;
        rememberAccountSnapshot(userId, state, revision);
        accountConflictCountRef.current = 0;
        accountRetryPausedRef.current = false;
        updateAccount((current) => ({ ...current, busy: false, status: "Google 계정에 저장되었습니다." }));
        notifyWindows(userId);
        if (hasAccountChanges()) scheduleAutoSync();
        else if (accountRefreshPendingRef.current) {
          accountRefreshPendingRef.current = false;
          window.setTimeout(() => { if (isCurrentAccount(userId, generation)) pullAccountData(); }, 0);
        }
      });
    } catch (error) {
      if (!isCurrentAccount(userId, generation)) return;
      if (error.message === "CLOUD_CONFLICT") {
        try {
          const row = await readAccountData(userId);
          if (!isCurrentAccount(userId, generation)) return;
          if (!row) throw new Error("클라우드 자료를 찾을 수 없습니다.");
          const merged = await mergeAccountData(userId, row, generation);
          if (!isCurrentAccount(userId, generation)) return;
          updateAccount((current) => ({ ...current, busy: false }));
          if (!merged && composingRef.current) return;
          accountConflictCountRef.current += 1;
          if (accountConflictCountRef.current < 3) scheduleAutoSync();
          else {
            accountRetryPausedRef.current = true;
            setAccountStatus("Drafts are saved locally. Automatic retry paused after 3 conflicts; use Save to retry.");
          }
        } catch (conflictError) {
          if (!isCurrentAccount(userId, generation)) return;
          accountRetryPausedRef.current = true;
          updateAccount((current) => ({ ...current, busy: false, status: `자동 동기화 실패: ${conflictError.message}` }));
        }
      } else {
        updateAccount((current) => ({ ...current, busy: false, status: `동기화 실패: ${error.message}` }));
      }
    } finally {
      if (accountWriteInFlightRef.current === operation) accountWriteInFlightRef.current = false;
    }
  };

  const pullAccountData = async (remoteRevision = null) => {
    const userId = activeAccountIdRef.current;
    const generation = accountGenerationRef.current;
    if (!userId || accountRef.current.user?.id !== userId || !accountRef.current.connected) return;
    if (deferAccountRefresh()) return;
    if (remoteRevision !== null && remoteRevision <= accountRevisionRef.current) return;
    if (accountRef.current.busy || accountWriteInFlightRef.current || accountPushTimerRef.current || accountPullInFlightRef.current
      || hasAccountChanges()) {
      accountRefreshPendingRef.current = true;
      return;
    }
    const operation = {};
    accountPullInFlightRef.current = operation;
    const localUpdatedAt = dataRef.current.updatedAt;
    const localRevision = accountRevisionRef.current;
    accountRefreshPendingRef.current = false;
    try {
      const row = await readAccountData(userId);
      if (!isCurrentAccount(userId, generation)) return;
      if (!row || row.revision <= accountRevisionRef.current) return;
      if (dataRef.current.updatedAt !== localUpdatedAt || hasAccountChanges()) {
        accountRefreshPendingRef.current = true;
        return;
      }
      if (accountRevisionRef.current !== localRevision) {
        accountRefreshPendingRef.current = true;
        return;
      }
      if (!await activateAccountData(userId, row, localUpdatedAt)) accountRefreshPendingRef.current = true;
    } catch (error) {
      if (isCurrentAccount(userId, generation)) setAccountStatus(`새 자료 확인 실패: ${error.message}`);
    } finally {
      if (accountPullInFlightRef.current === operation) accountPullInFlightRef.current = false;
      if (isCurrentAccount(userId, generation) && accountRefreshPendingRef.current && !hasAccountChanges()
        && !composingRef.current && !accountPushTimerRef.current) window.setTimeout(() => { if (isCurrentAccount(userId, generation)) checkAccountUpdates(); }, 0);
    }
  };

  const checkAccountUpdates = async () => {
    const userId = activeAccountIdRef.current;
    const generation = accountGenerationRef.current;
    if (!userId || accountRef.current.user?.id !== userId || !accountRef.current.connected || document.hidden || accountCheckInFlightRef.current) return;
    const operation = {};
    accountCheckInFlightRef.current = operation;
    try {
      const revision = await readAccountRevision(userId);
      if (!isCurrentAccount(userId, generation)) return;
      if (revision !== null && revision > accountRevisionRef.current) await pullAccountData(revision);
    } catch (error) {
      if (isCurrentAccount(userId, generation)) setAccountStatus(`새 자료 확인 실패: ${error.message}`);
    } finally {
      if (accountCheckInFlightRef.current === operation) accountCheckInFlightRef.current = false;
    }
  };

  const syncBackendReady = () => {
    const { backend } = syncRef.current;
    return Boolean(backend.supabaseUrl && backend.supabaseAnonKey);
  };

  const syncIdentityReady = () => Boolean(syncRef.current.syncId && syncRef.current.pin);

  const getSupabaseBaseUrl = () => syncRef.current.backend.supabaseUrl.replace(/\/+$/, "");

  const encryptSyncPayload = async () => {
    const { syncId, pin } = syncRef.current;
    const key = await deriveSyncKey(syncId, pin);
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const state = dataRef.current;
    const body = JSON.stringify({ version: 1, state });
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(body));
    return {
      version: 1,
      cipher: "AES-GCM",
      kdf: "PBKDF2-SHA256",
      iterations: SYNC_KDF_ITERATIONS,
      updatedAt: state.updatedAt,
      iv: encodeBase64Url(iv),
      data: encodeBase64Url(encrypted),
    };
  };

  const decryptSyncPayload = async (payload) => {
    const { syncId, pin } = syncRef.current;
    const key = await deriveSyncKey(syncId, pin);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(decodeBase64Url(payload.iv)) },
      key,
      decodeBase64Url(payload.data),
    );
    return JSON.parse(new TextDecoder().decode(decrypted)).state;
  };

  const fetchRemoteSyncDoc = async (docId) => {
    const { backend } = syncRef.current;
    const response = await fetch(`${getSupabaseBaseUrl()}/rest/v1/rpc/get_dashboard_sync`, {
      method: "POST",
      headers: {
        apikey: backend.supabaseAnonKey,
        Authorization: `Bearer ${backend.supabaseAnonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_doc_id: docId }),
    });
    if (!response.ok) throw new Error(`Pull failed (${response.status})`);
    const rows = await response.json();
    return rows[0] || null;
  };

  const upsertRemoteSyncDoc = async (docId, payload) => {
    const { backend } = syncRef.current;
    const response = await fetch(`${getSupabaseBaseUrl()}/rest/v1/rpc/upsert_dashboard_sync`, {
      method: "POST",
      headers: {
        apikey: backend.supabaseAnonKey,
        Authorization: `Bearer ${backend.supabaseAnonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_doc_id: docId, p_payload: payload }),
    });
    if (!response.ok) throw new Error(`Push failed (${response.status})`);
  };

  const pushSyncData = async ({ silent = false } = {}) => {
    if (!syncBackendReady() || !syncIdentityReady()) {
      if (!silent) setSyncStatus("Enter Supabase URL, Public Key, Sync ID, and PIN first.");
      return;
    }
    updateSync((current) => ({ ...current, busy: true, status: silent ? current.status : "Encrypting and pushing..." }));
    try {
      const docId = await createSyncDocId(syncRef.current.syncId, syncRef.current.pin);
      const payload = await encryptSyncPayload();
      await upsertRemoteSyncDoc(docId, payload);
      setSyncStatus(`Synced at ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`);
    } catch (error) {
      setSyncStatus(error.message || "Sync push failed.");
    } finally {
      updateSync((current) => ({ ...current, busy: false }));
    }
  };

  const pullSyncData = async ({ silent = false, force = true } = {}) => {
    const generation = accountGenerationRef.current;
    const accountId = activeAccountIdRef.current;
    if (!syncBackendReady() || !syncIdentityReady()) {
      if (!silent) setSyncStatus("Enter Supabase URL, Public Key, Sync ID, and PIN first.");
      return false;
    }
    updateSync((current) => ({ ...current, busy: true, status: silent ? current.status : "Pulling and decrypting..." }));
    try {
      const docId = await createSyncDocId(syncRef.current.syncId, syncRef.current.pin);
      const row = await fetchRemoteSyncDoc(docId);
      if (!row) {
        if (!silent) setSyncStatus("No cloud data yet. Push this device to create it.");
        return false;
      }
      const remoteUpdatedAt = row.payload?.updatedAt || row.updated_at || "";
      if (!force && remoteUpdatedAt && dataRef.current.updatedAt && remoteUpdatedAt <= dataRef.current.updatedAt) {
        if (!silent) setSyncStatus("Already up to date.");
        return false;
      }
      const remoteState = await decryptSyncPayload(row.payload);
      if (generation !== accountGenerationRef.current || accountId !== activeAccountIdRef.current) return false;
      const normalized = normalizeState(remoteState);
      await persistDashboard(normalized);
      setSyncStatus(`Pulled at ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`);
      return true;
    } catch {
      setSyncStatus("Pull failed. Check Supabase setup, Sync ID, and PIN.");
      return false;
    } finally {
      updateSync((current) => ({ ...current, busy: false }));
    }
  };

  const scheduleAutoSync = () => {
    if (activeAccountIdRef.current) {
      if (!accountRef.current.connected || accountRetryPausedRef.current) return;
      const userId = activeAccountIdRef.current;
      const generation = accountGenerationRef.current;
      window.clearTimeout(accountPushTimerRef.current);
      accountPushTimerRef.current = window.setTimeout(() => {
        accountPushTimerRef.current = null;
        if (isCurrentAccount(userId, generation)) pushAccountData({ automatic: true });
      }, 1400);
      return;
    }
    if (!syncBackendReady() || !syncIdentityReady() || syncRef.current.busy) return;
    window.clearTimeout(pushTimerRef.current);
    pushTimerRef.current = window.setTimeout(() => {
      pushTimerRef.current = null;
      pushSyncData({ silent: true });
    }, 1400);
  };

  const startAutoSyncPolling = () => {
    window.clearInterval(pollTimerRef.current);
    if (localStorage.getItem(ACCOUNT_OWNER_KEY)) return;
    if (activeAccountIdRef.current) return;
    if (!syncBackendReady() || !syncIdentityReady()) return;
    pollTimerRef.current = window.setInterval(() => {
      const active = document.activeElement;
      const isEditing = active?.matches?.("input, textarea, select");
      if (syncRef.current.busy || pushTimerRef.current || isEditing) return;
      pullSyncData({ silent: true, force: false });
    }, 10000);
  };

  useEffect(() => {
    startAutoSyncPolling();
    return () => {
      window.clearTimeout(pushTimerRef.current);
      window.clearInterval(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let compositionTimer = null;
    const refresh = (key, includeStorage = false) => {
      if (disposed || key !== currentStorageKey()) return;
      if (composingRef.current) {
        deferStorageSnapshot(key, storageSnapshotRef.current.data);
        deferAccountRefresh();
        return;
      }
      if (activeAccountIdRef.current && !includeStorage) {
        // A notification is not a replacement payload. Pending edits must reach CAS/merge.
        checkAccountUpdates();
        return;
      }
      const before = deferredStorageRef.current?.key === key ? deferredStorageRef.current.before : storageSnapshotRef.current.data;
      deferredStorageRef.current = null;
      const generation = accountGenerationRef.current;
      withDashboardLock(`hub-storage:${key}`, () => flushDashboardSnapshots(localStorage, key))
        .then(({ data: saved, conflicts }) => {
          if (!disposed && generation === accountGenerationRef.current) {
            acceptStorageSnapshot(key, saved, before);
            reportStorageConflicts(conflicts);
            if (activeAccountIdRef.current && !composingRef.current) {
              if (hasAccountChanges()) scheduleAutoSync();
              checkAccountUpdates();
            }
          }
        })
        .catch((error) => { if (!disposed) setAccountStatus(`Local sync failed: ${error.message}`); });
    };
    const onCompositionStart = () => {
      window.clearTimeout(compositionTimer);
      composingRef.current = true;
    };
    const onCompositionEnd = () => {
      window.clearTimeout(compositionTimer);
      // Let the final input/onChange commit before reconciling external snapshots.
      compositionTimer = window.setTimeout(() => {
        if (disposed) return;
        composingRef.current = false;
        refresh(currentStorageKey(), true);
      }, 0);
    };
    const onStorage = (event) => {
      if (event.storageArea && event.storageArea !== localStorage) return;
      const key = currentStorageKey();
      if (event.newValue && (event.key === key || event.key?.startsWith(pendingSnapshotPrefix(key))
        || (activeAccountIdRef.current && event.key === accountSnapshotKey(activeAccountIdRef.current)))) refresh(key);
    };
    let channel;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("hub-dashboard-sync-v1");
      channel.onmessage = (event) => {
        if (event.data?.userId === activeAccountIdRef.current) refresh(event.data?.key);
      };
      broadcastRef.current = channel;
    }
    window.addEventListener("storage", onStorage);
    document.addEventListener("compositionstart", onCompositionStart, true);
    document.addEventListener("compositionend", onCompositionEnd, true);
    refresh(currentStorageKey());
    return () => {
      disposed = true;
      window.clearTimeout(compositionTimer);
      composingRef.current = false;
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("compositionstart", onCompositionStart, true);
      document.removeEventListener("compositionend", onCompositionEnd, true);
      channel?.close();
      if (broadcastRef.current === channel) broadcastRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (account.loading) return;
    const userId = account.user?.id;
    if (!userId) {
      window.clearTimeout(accountPushTimerRef.current);
      window.clearInterval(accountPollTimerRef.current);
      if (storageSnapshotRef.current.key !== STORAGE_KEY) {
        activeAccountIdRef.current = null;
        const legacy = normalizeState(readRecoverableSnapshot(localStorage, STORAGE_KEY) || loadState());
        storageSnapshotRef.current = { key: STORAGE_KEY, data: legacy };
        dataRef.current = legacy;
        setData(legacy);
      }
      updateAccount((current) => ({ ...current, connected: false, cloudAvailable: false, busy: false }));
      setAccountGate(needsAccountGate());
      return;
    }
    let cancelled = false;
    let retryTimer = null;
    const generation = accountGenerationRef.current;
    const savedOwner = localStorage.getItem(ACCOUNT_OWNER_KEY);
    if (savedOwner === userId) {
      try {
        const cached = readRecoverableSnapshot(localStorage, accountCacheKey(userId));
        const snapshot = readStoredSnapshot(localStorage, accountSnapshotKey(userId));
        if (cached) {
          activeAccountIdRef.current = userId;
          lastSyncedSnapshotRef.current = snapshot;
          accountRevisionRef.current = snapshot?.revision ?? null;
          accountSyncedAtRef.current = snapshot?.data?.updatedAt || "";
          const normalized = normalizeState(cached);
          dataRef.current = normalized;
          storageSnapshotRef.current = { key: accountCacheKey(userId), data: normalized };
          setData(normalized);
          setAccountGate(false);
        }
      } catch (error) {
        setAccountStatus(`Local account cache could not be read: ${error.message}`);
      }
    }
    const inspectAccount = async () => {
      updateAccount((current) => ({ ...current, busy: true, status: "계정 자료를 확인하는 중입니다..." }));
      try {
        const row = await readAccountData(userId);
        if (cancelled || !isCurrentAccount(userId, generation)) return;
        if (row) {
          if (activeAccountIdRef.current === userId && hasAccountChanges()) {
            if (await mergeAccountData(userId, row, generation)) scheduleAutoSync();
            else if (isCurrentAccount(userId, generation)) retryTimer = window.setTimeout(inspectAccount, 1400);
          } else {
            if (!await activateAccountData(userId, row) && isCurrentAccount(userId, generation)) {
              retryTimer = window.setTimeout(inspectAccount, 1400);
            }
          }
          return;
        }
        if (savedOwner && savedOwner !== userId) {
          const empty = createFallbackState();
          dataRef.current = empty;
          setData(empty);
          setAccountGate(true);
        } else if (savedOwner === userId) {
          const cached = readRecoverableSnapshot(localStorage, accountCacheKey(userId));
          if (cached) {
            activeAccountIdRef.current = userId;
            dataRef.current = normalizeState(cached);
            storageSnapshotRef.current = { key: accountCacheKey(userId), data: dataRef.current };
            setData(dataRef.current);
            setAccountGate(false);
          }
        }
        updateAccount((current) => ({ ...current, busy: false, connected: false, cloudAvailable: Boolean(row), status: row ? "이 기기에 다른 계정의 자료가 있습니다. 계정 자료를 확인한 뒤 가져와주세요." : "계정에 저장된 자료가 없습니다. 이 기기 자료를 옮길 수 있습니다." }));
      } catch (error) {
        if (!cancelled && isCurrentAccount(userId, generation)) {
          updateAccount((current) => ({ ...current, busy: false, status: `계정 확인 실패: ${error.message}` }));
          if (!error.message.startsWith("Recovery storage is full")) {
            retryTimer = window.setTimeout(inspectAccount, 10000);
          }
        }
      }
    };
    inspectAccount();
    return () => { cancelled = true; window.clearTimeout(retryTimer); };
  }, [account.loading, account.user?.id]);

  useEffect(() => {
    window.clearInterval(accountPollTimerRef.current);
    if (!account.connected || !account.user?.id) return;
    const userId = account.user.id;
    const generation = accountGenerationRef.current;
    const channel = accountClient.channel(`hub-user-data-${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "hub_user_data", filter: `user_id=eq.${userId}` },
        ({ new: row }) => { if (isCurrentAccount(userId, generation)) pullAccountData(row?.revision); })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") checkAccountUpdates();
      });
    const checkOnResume = () => { if (!document.hidden) checkAccountUpdates(); };
    window.addEventListener("focus", checkOnResume);
    document.addEventListener("visibilitychange", checkOnResume);
    accountPollTimerRef.current = window.setInterval(() => {
      if (!isCurrentAccount(userId, generation)) return;
      if (hasAccountChanges() && !accountPushTimerRef.current) pushAccountData({ automatic: true });
      else checkAccountUpdates();
    }, 10000);
    checkAccountUpdates();
    return () => {
      window.clearInterval(accountPollTimerRef.current);
      window.removeEventListener("focus", checkOnResume);
      document.removeEventListener("visibilitychange", checkOnResume);
      accountClient.removeChannel(channel);
    };
  }, [account.connected, account.user?.id]);

  const entries = data.days[selectedDate] || [];

  const weekday = getWeekdayMeta(selectedDate);

  const routineTried = Boolean(data.routineAttempts?.[selectedDate]);

  const carryPenaltyMarked = Boolean(data.carryPenalties?.[selectedDate]);

  const getEntries = (dateKey = selectedDate) => (Array.isArray(data.days[dateKey]) ? data.days[dateKey] : []);

  const getDayTotal = (dateKey) => getEntries(dateKey).reduce((sum, entry) => sum + entry.score, 0);

  const getCarryTotal = () => {
    const carryFromEntries = Object.entries(data.days).reduce((sum, [key, dayEntries]) => {
      if (key >= selectedDate || !Array.isArray(dayEntries)) return sum;
      if (data.carryResetDate && selectedDate >= data.carryResetDate && key < data.carryResetDate) return sum;
      return sum + dayEntries.reduce((daySum, entry) => daySum + entry.score, 0);
    }, 0);
    const carryPenaltyTotal = Object.entries(data.carryPenalties || {}).reduce((sum, [key, marked]) => {
      if (!marked || key > selectedDate) return sum;
      if (data.carryResetDate && selectedDate >= data.carryResetDate && key < data.carryResetDate) return sum;
      return sum - 2;
    }, 0);
    return carryFromEntries + carryPenaltyTotal + scoreNumber(data.carryAdjustment, 0);
  };

  const scoreInfo = useMemo(() => {
    const plus = entries.filter((entry) => entry.score > 0).reduce((sum, entry) => sum + entry.score, 0);
    const minus = entries.filter((entry) => entry.score < 0).reduce((sum, entry) => sum + entry.score, 0);
    const carry = getCarryTotal();
    const total = carry + plus + minus;
    return { carry, plus, minus, total };
  }, [data, selectedDate]);

  const togglePanel = (key) => {
    setOpenPanels((current) => ({ ...current, [key]: !current[key] }));
  };

  const shiftDate = (days) => {
    const date = new Date(`${selectedDate}T00:00:00`);
    date.setDate(date.getDate() + days);
    setSelectedDate(toDateKey(date));
  };

  const toggleChoice = ({ planKey, choice, name, score }) => {
    saveData((draft) => {
      const currentEntries = Array.isArray(draft.days[selectedDate]) ? draft.days[selectedDate] : [];
      const existing = currentEntries.find((entry) => entry.planKey === planKey);
      if (existing?.choice === choice) {
        draft.days[selectedDate] = currentEntries.filter((entry) => entry.id !== existing.id);
      } else {
        draft.days[selectedDate] = currentEntries.filter((entry) => entry.planKey !== planKey);
        draft.days[selectedDate].push({
          id: crypto.randomUUID(),
          name,
          score,
          createdAt: new Date().toISOString(),
          planKey,
          choice,
        });
      }
      return draft;
    });
  };

  const toggleRoutineAttempt = () => {
    saveData((draft) => {
      draft.routineAttempts = draft.routineAttempts || {};
      draft.carryPenalties = normalizeCarryPenalties(draft.carryPenalties);
      if (draft.routineAttempts[selectedDate]) delete draft.routineAttempts[selectedDate];
      else {
        draft.routineAttempts[selectedDate] = true;
        delete draft.carryPenalties[selectedDate];
      }
      return draft;
    });
  };

  const toggleCarryPenalty = () => {
    saveData((draft) => {
      draft.routineAttempts = draft.routineAttempts || {};
      draft.carryPenalties = normalizeCarryPenalties(draft.carryPenalties);
      if (draft.carryPenalties[selectedDate]) delete draft.carryPenalties[selectedDate];
      else {
        draft.carryPenalties[selectedDate] = true;
        delete draft.routineAttempts[selectedDate];
      }
      return draft;
    });
  };

  const resetCarry = () => {
    saveData((draft) => {
      draft.carryResetDate = selectedDate;
      draft.carryAdjustment = 0;
      return draft;
    });
  };

  const adjustCarry = (amount) => {
    saveData((draft) => {
      draft.carryAdjustment = scoreNumber(draft.carryAdjustment, 0) + amount;
      return draft;
    });
  };

  const setActiveMemo = (memoId) => {
    saveData((draft) => {
      draft.memos.activeMemoId = memoId;
      return draft;
    });
  };

  const moveMemoCard = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    saveData((draft) => {
      const fromIndex = draft.memos.cards.findIndex((card) => card.id === fromId);
      const toIndex = draft.memos.cards.findIndex((card) => card.id === toId);
      if (fromIndex < 0 || toIndex < 0) return draft;
      const [card] = draft.memos.cards.splice(fromIndex, 1);
      draft.memos.cards.splice(toIndex, 0, card);
      draft.memos.activeMemoId = card.id;
      return draft;
    });
  };

  const updateItemIcon = (key, icon) => {
    saveData((next) => {
      next.itemIcons ||= {};
      if (icon) next.itemIcons[key] = icon;
      else delete next.itemIcons[key];
      return next;
    });
  };

  const updateItemSymbol = (key, symbol) => {
    saveData((next) => {
      next.itemSymbols ||= {};
      if (symbol) next.itemSymbols[key] = symbol;
      else {
        delete next.itemSymbols[key];
        if (next.itemIcons) delete next.itemIcons[key];
      }
      return next;
    });
  };

  const updateMemoCard = (id, field, value) => {
    saveData((draft) => {
      const card = draft.memos.cards.find((item) => item.id === id);
      if (!card) return draft;
      if (field === "formattedText") {
        card[value.field] = value.text;
        card.textFormats = { ...card.textFormats, [value.field]: value.marks };
      }
      if (field === "title") card.title = value;
      if (field === "leftTitle") card.leftTitle = value;
      if (field === "leftText") card.leftText = value;
      if (field === "leftExtraTitle") card.leftExtraTitle = value;
      if (field === "leftTextExtra") card.leftTextExtra = value;
      if (field === "centerTitle") card.centerTitle = value;
      if (field === "centerText") card.centerText = value;
      if (field === "centerExtraTitle") card.centerExtraTitle = value;
      if (field === "centerTextExtra") card.centerTextExtra = value;
      if (field === "rightTitle") card.rightTitle = value;
      if (field === "rightText") card.rightText = value;
      if (field === "rightExtraTitle") card.rightExtraTitle = value;
      if (field === "rightTextExtra") card.rightTextExtra = value;
      if (field === "memoSplits") card.memoSplits = { ...(card.memoSplits || {}), ...value };
      if (id === "memo-life") draft.memos.global.life = card.leftText || "";
      if (id === "memo-school") draft.memos.global.school = card.leftText || "";
      return draft;
    });
  };

  const addMemoCard = () => {
    saveData((draft) => {
      const card = { id: createKey("memo"), title: `Memo ${draft.memos.cards.length + 1}`, leftTitle: "", leftText: "", leftExtraTitle: "", leftTextExtra: "", centerTitle: "", centerText: "", centerExtraTitle: "", centerTextExtra: "", rightTitle: "", rightText: "", rightExtraTitle: "", rightTextExtra: "", memoSplits: { leftText: 50, rightText: 50 } };
      draft.memos.cards.push(card);
      draft.memos.activeMemoId = card.id;
      return draft;
    });
  };

  const removeMemoCard = (id) => {
    const confirmed = window.confirm("Delete this memo?");
    if (!confirmed) return;
    saveData((draft) => {
      if (draft.memos.cards.length <= 1) return draft;
      const index = draft.memos.cards.findIndex((card) => card.id === id);
      draft.memos.cards = draft.memos.cards.filter((card) => card.id !== id);
      if (draft.memos.activeMemoId === id) {
        draft.memos.activeMemoId = draft.memos.cards[Math.max(0, index - 1)]?.id || draft.memos.cards[0].id;
      }
      return draft;
    });
  };

  const addPresetTo = (listKey, keyPrefix) => {
    saveData((draft) => {
      const presets = Array.isArray(draft[listKey]) ? draft[listKey] : [];
      presets.push({ key: createKey(keyPrefix), name: `New Record ${presets.length + 1}`, yScore: 5, nScore: -2 });
      draft[listKey] = presets;
      return draft;
    });
  };

  const updatePresetIn = (listKey, index, field, value) => {
    saveData((draft) => {
      const presets = Array.isArray(draft[listKey]) ? draft[listKey] : [];
      const preset = presets[index];
      if (!preset) return draft;
      if (field === "name") preset.name = value;
      if (field === "yScore") preset.yScore = value;
      if (field === "nScore") preset.nScore = value;
      draft[listKey] = presets;
      return draft;
    });
  };

  const movePresetIn = (listKey, fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return;
    saveData((draft) => {
      const presets = Array.isArray(draft[listKey]) ? draft[listKey] : [];
      const fromIndex = presets.findIndex((preset) => preset.key === fromKey);
      const toIndex = presets.findIndex((preset) => preset.key === toKey);
      if (fromIndex < 0 || toIndex < 0) return draft;
      const [preset] = presets.splice(fromIndex, 1);
      presets.splice(toIndex, 0, preset);
      draft[listKey] = presets;
      return draft;
    });
  };

  const removePresetFrom = (listKey, index) => {
    saveData((draft) => {
      const presets = Array.isArray(draft[listKey]) ? draft[listKey] : [];
      presets.splice(index, 1);
      draft[listKey] = presets;
      return draft;
    });
  };

  const addPreset = () => addPresetTo("presets", "daily");

  const updatePreset = (index, field, value) => updatePresetIn("presets", index, field, value);

  const movePreset = (fromKey, toKey) => movePresetIn("presets", fromKey, toKey);

  const removePreset = (index) => removePresetFrom("presets", index);

  const addSchoolPreset = () => {
    saveData((draft) => {
      const presets = Array.isArray(draft.schoolPresets) ? draft.schoolPresets : [];
      const preset = { key: createKey("school"), name: `New Record ${presets.length + 1}`, yScore: 5, nScore: -2 };
      presets.push(preset);
      draft.schoolPresets = presets;
      if (!draft.schoolWeeklyPlan) draft.schoolWeeklyPlan = {};
      draft.schoolWeeklyPlan[preset.key] = createEmptyWeeklyPlan([preset])[preset.key];
      return draft;
    });
  };

  const updateSchoolPreset = (key, field, value) => {
    saveData((draft) => {
      const preset = draft.schoolPresets.find((item) => item.key === key);
      if (!preset) return draft;
      if (field === "name") preset.name = value;
      if (field === "yScore") preset.yScore = value;
      if (field === "nScore") preset.nScore = value;
      return draft;
    });
  };

  const moveSchoolPreset = (fromKey, toKey) => movePresetIn("schoolPresets", fromKey, toKey);

  const removeSchoolPreset = (key) => {
    saveData((draft) => {
      if (draft.schoolPresets.length <= 1) return draft;
      draft.schoolPresets = draft.schoolPresets.filter((preset) => preset.key !== key);
      if (draft.schoolWeeklyPlan) delete draft.schoolWeeklyPlan[key];
      return draft;
    });
  };

  const updateSchoolSubject = (dayKey, value) => {
    saveData((draft) => {
      draft.schoolSubjects[dayKey] = value;
      return draft;
    });
  };

  const addCategory = () => {
    saveData((draft) => {
      const category = { key: createKey("cat"), label: `New Category ${draft.categories.length + 1}`, yScore: 5, nScore: -2 };
      draft.categories.push(category);
      draft.weeklyPlan[category.key] = createEmptyWeeklyPlan([category])[category.key];
      return draft;
    });
  };

  const updateCategory = (key, field, value) => {
    saveData((draft) => {
      const category = draft.categories.find((item) => item.key === key);
      if (!category) return draft;
      if (field === "label") category.label = value;
      if (field === "yScore") category.yScore = value;
      if (field === "nScore") category.nScore = value;
      return draft;
    });
  };

  const moveCategory = (fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return;
    saveData((draft) => {
      const fromIndex = draft.categories.findIndex((category) => category.key === fromKey);
      const toIndex = draft.categories.findIndex((category) => category.key === toKey);
      if (fromIndex < 0 || toIndex < 0) return draft;
      const [category] = draft.categories.splice(fromIndex, 1);
      draft.categories.splice(toIndex, 0, category);
      return draft;
    });
  };

  const removeCategory = (key) => {
    saveData((draft) => {
      if (draft.categories.length <= 1) return draft;
      draft.categories = draft.categories.filter((category) => category.key !== key);
      delete draft.weeklyPlan[key];
      return draft;
    });
  };

  const updateWeeklyPlan = (categoryKey, dayKey, value) => {
    saveData((draft) => {
      if (!draft.weeklyPlan[categoryKey]) draft.weeklyPlan[categoryKey] = createEmptyWeeklyPlan([{ key: categoryKey }])[categoryKey];
      draft.weeklyPlan[categoryKey][dayKey] = value;
      return draft;
    });
  };

  const updateCalendarNote = (dateKey, value) => {
    saveData((draft) => {
      const note = value.replace(/\r\n/g, "\n");
      if (note) draft.calendar[dateKey] = note;
      else delete draft.calendar[dateKey];
      return draft;
    });
  };

  const toggleCalendarDuty = (dateKey, dutyKey) => {
    saveData((draft) => {
      draft.calendarDuties = normalizeCalendarDuties(draft.calendarDuties);
      const current = draft.calendarDuties[dateKey] || {};
      const next = { ...current, [dutyKey]: !current[dutyKey] };
      const active = Object.fromEntries(Object.entries(next).filter(([, value]) => value));
      if (Object.keys(active).length) draft.calendarDuties[dateKey] = active;
      else delete draft.calendarDuties[dateKey];
      return draft;
    });
  };

  const updateDateMarker = (index, field, value) => {
    saveData((draft) => {
      const markers = normalizeDateMarkers(draft.dateMarkers);
      markers[index] = { ...markers[index], [field]: value };
      draft.dateMarkers = markers;
      return draft;
    });
  };

  const updateDisplayMode = (mode) => {
    saveData((draft) => {
      draft.displayMode = normalizeDisplayMode(mode);
      return draft;
    });
  };

  const addMemoNote = (sectionKey, idPrefix) => {
    saveData((draft) => {
      draft[sectionKey] = normalizeSchool(draft[sectionKey]);
      const nextId = createKey(idPrefix);
      draft[sectionKey].notes.push({
        id: nextId,
        title: `Memo ${draft[sectionKey].notes.length + 1}`,
        content: "",
        open: true,
        color: "lavender",
      });
      return draft;
    });
  };

  const updateMemoNote = (sectionKey, id, field, value) => {
    saveData((draft) => {
      draft[sectionKey] = normalizeSchool(draft[sectionKey]);
      const note = draft[sectionKey].notes.find((item) => item.id === id);
      if (!note) return draft;
      if (field === "title") note.title = value;
      if (field === "content") note.content = value;
      if (field === "color" && schoolNoteColors.includes(value)) note.color = value;
      if (field === "images") note.images = Array.isArray(value) ? value.filter((image) => image?.id).map((image) => ({ id: image.id, name: String(image.name || "Attached image") })) : [];
      return draft;
    });
  };

  const toggleMemoNote = (sectionKey, id) => {
    saveData((draft) => {
      draft[sectionKey] = normalizeSchool(draft[sectionKey]);
      const note = draft[sectionKey].notes.find((item) => item.id === id);
      if (note) note.open = !note.open;
      return draft;
    });
  };

  const removeMemoNote = async (sectionKey, id, label) => {
    const confirmed = window.confirm(`Delete this ${label} memo?`);
    if (!confirmed) return;
    const currentNotes = normalizeSchool(dataRef.current[sectionKey]).notes;
    if (currentNotes.length <= 1) return;
    const currentNote = currentNotes.find((note) => note.id === id);
    await Promise.all((currentNote?.images || []).map((image) => image.id).filter(Boolean).map(deleteNoteImage));
    saveData((draft) => {
      draft[sectionKey] = normalizeSchool(draft[sectionKey]);
      if (draft[sectionKey].notes.length <= 1) return draft;
      draft[sectionKey].notes = draft[sectionKey].notes.filter((note) => note.id !== id);
      return draft;
    });
  };

  const moveMemoNote = (sectionKey, fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    saveData((draft) => {
      draft[sectionKey] = normalizeSchool(draft[sectionKey]);
      const fromIndex = draft[sectionKey].notes.findIndex((note) => note.id === fromId);
      const toIndex = draft[sectionKey].notes.findIndex((note) => note.id === toId);
      if (fromIndex < 0 || toIndex < 0) return draft;
      const [note] = draft[sectionKey].notes.splice(fromIndex, 1);
      draft[sectionKey].notes.splice(toIndex, 0, note);
      return draft;
    });
  };

  const attachMemoImage = async (sectionKey, id, files) => {
    const imageFiles = Array.from(files || []).filter((file) => file.type?.startsWith("image/"));
    if (!imageFiles.length) {
      window.alert("Please choose an image file.");
      return;
    }
    const currentNote = normalizeSchool(dataRef.current[sectionKey]).notes.find((note) => note.id === id);
    try {
      const nextImages = [...(currentNote?.images || [])];
      for (const file of imageFiles) {
        const imageId = createKey("note-image");
        const dataUrl = await readFileAsDataUrl(file);
        await putNoteImage({ id: imageId, dataUrl, name: file.name, type: file.type, updatedAt: new Date().toISOString() });
        nextImages.push({ id: imageId, name: file.name });
      }
      updateMemoNote(sectionKey, id, "images", nextImages);
    } catch {
      window.alert("Image attach failed. Please try a different file.");
    }
  };

  const removeMemoImage = async (sectionKey, id, imageId) => {
    const currentNote = normalizeSchool(dataRef.current[sectionKey]).notes.find((note) => note.id === id);
    if (!imageId) return;
    await deleteNoteImage(imageId);
    updateMemoNote(sectionKey, id, "images", (currentNote?.images || []).filter((image) => image.id !== imageId));
  };

  const addNoteTab = () => {
    const nextId = createKey("note");
    saveData((draft) => {
      draft.noteTabs = normalizeNoteTabs(draft.noteTabs);
      const nextLabel = `Note ${draft.noteTabs.length + 1}`;
      draft.noteTabs.push({ id: nextId, label: nextLabel, color: noteTabColors[draft.noteTabs.length % noteTabColors.length] });
      draft[nextId] = normalizeSchool({ notes: [{ id: createKey(`${nextId}-memo`), title: "Memo 1", content: "", open: true }] });
      return draft;
    });
    setActiveNoteView(nextId);
  };

  const updateNoteTab = (id, label) => {
    saveData((draft) => {
      draft.noteTabs = normalizeNoteTabs(draft.noteTabs).map((tab) => (tab.id === id ? { ...tab, label: label.slice(0, 24) } : tab));
      return draft;
    });
  };

  const removeNoteTab = async (id) => {
    const tabs = normalizeNoteTabs(dataRef.current.noteTabs);
    if (tabs.length <= 1) return;
    const tab = tabs.find((item) => item.id === id);
    const confirmed = window.confirm(`Delete the ${tab?.label || "Note"} tab?`);
    if (!confirmed) return;
    await Promise.all(normalizeSchool(dataRef.current[id]).notes.flatMap((note) => note.images || []).map((image) => image.id).filter(Boolean).map(deleteNoteImage));
    const nextActive = activeNoteView === id ? tabs.find((item) => item.id !== id)?.id || tabs[0].id : activeNoteView;
    saveData((draft) => {
      draft.noteTabs = normalizeNoteTabs(draft.noteTabs).filter((item) => item.id !== id);
      delete draft[id];
      return draft;
    });
    setActiveNoteView(nextActive);
  };

  const moveNoteTab = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    saveData((draft) => {
      draft.noteTabs = normalizeNoteTabs(draft.noteTabs);
      const fromIndex = draft.noteTabs.findIndex((tab) => tab.id === fromId);
      const toIndex = draft.noteTabs.findIndex((tab) => tab.id === toId);
      if (fromIndex < 0 || toIndex < 0) return draft;
      const [tab] = draft.noteTabs.splice(fromIndex, 1);
      draft.noteTabs.splice(toIndex, 0, tab);
      return draft;
    });
  };

  const connectSync = async () => {
    const nextSyncId = normalizeSyncId(syncRef.current.syncId);
    updateSync((current) => ({ ...current, syncId: nextSyncId }));
    localStorage.setItem(SYNC_BACKEND_KEY, JSON.stringify(syncRef.current.backend));
    localStorage.setItem(SYNC_ID_KEY, nextSyncId);
    if (!syncBackendReady()) {
      setSyncStatus("Enter Supabase URL and Public Key.");
      return;
    }
    if (!syncIdentityReady()) {
      setSyncStatus("Enter Sync ID and PIN.");
      return;
    }
    if (syncRef.current.rememberDevice) {
      localStorage.setItem(SYNC_REMEMBER_KEY, "true");
      localStorage.setItem(SYNC_PIN_KEY, syncRef.current.pin);
    } else {
      localStorage.removeItem(SYNC_REMEMBER_KEY);
      localStorage.removeItem(SYNC_PIN_KEY);
    }
    startAutoSyncPolling();
    await pullSyncData({ force: true });
  };

  useEffect(() => {
    if (autoConnectRef.current) return;
    if (localStorage.getItem(ACCOUNT_OWNER_KEY)) return;
    if (!sync.rememberDevice || !sync.backend.supabaseUrl || !sync.backend.supabaseAnonKey || !sync.syncId || !sync.pin) return;
    autoConnectRef.current = true;
    setSyncStatus("Auto connecting...");
    connectSync();
  }, []);

  const forgetThisDevice = () => {
    const confirmed = window.confirm(
      "This will remove local app data, Sync ID, saved PIN, Supabase URL, and public key from this browser only. Cloud data will not be deleted. Continue?",
    );
    if (!confirmed) return;
    window.clearTimeout(pushTimerRef.current);
    window.clearInterval(pollTimerRef.current);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SYNC_BACKEND_KEY);
    localStorage.removeItem(SYNC_ID_KEY);
    localStorage.removeItem(SYNC_PIN_KEY);
    localStorage.removeItem(SYNC_REMEMBER_KEY);
    window.location.reload();
  };

  const createFullBackup = async () => {
    const userId = activeAccountIdRef.current;
    const generation = accountGenerationRef.current;
    const checkAccount = () => {
      if (generation !== accountGenerationRef.current || userId !== activeAccountIdRef.current) throw new Error("Account changed during backup. Please try again.");
    };
    window.dispatchEvent(new Event("mindfold:flush"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    checkAccount();
    const state = dataRef.current;
    const payload = createBackupPayload(state, await getNoteImagesForState(state));
    checkAccount();
    payload._mindfoldV3 = await backupWorkspace(userId);
    checkAccount();
    payload._moduleBackups = { ...(payload._moduleBackups || {}), ...await exportModuleBackups() };
    checkAccount();
    return payload;
  };

  const exportBackup = async () => {
    try {
      const payload = await createFullBackup();
      const filename = `dashboard-backup-${toDateKey(new Date())}.json`;
      downloadTextFile(filename, JSON.stringify(payload, null, 2));
    } catch (error) { window.alert(`Backup failed: ${error.message}`); }
  };

  const copyBackup = async () => {
    try {
      const payload = await createFullBackup();
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      window.alert("Dashboard backup data, including memo images, was copied to the clipboard.");
    } catch {
      window.alert("Copy failed. Please try Download Data instead.");
    }
  };

  const importBackup = async (file) => {
    if (!file) return;
    const userId = activeAccountIdRef.current;
    const generation = accountGenerationRef.current;
    const stillCurrent = () => generation === accountGenerationRef.current && userId === activeAccountIdRef.current;
    try {
      const text = await file.text();
      const { images, state, documents } = splitBackupPayload(JSON.parse(text));
      const normalized = normalizeState(state);
      if (!stillCurrent()) return;
      const confirmed = window.confirm("This will replace the dashboard data in this browser with the selected backup file. Continue?");
      if (!confirmed) return;
      // Registry validates all module IDs before invoking any provider or root writes.
      await restoreModuleBackups(normalized._moduleBackups ?? {});
      if (!stillCurrent()) return;
      await restoreNoteImages(images, { clear: !userId });
      if (!stillCurrent()) return;
      if (documents) await restoreWorkspace(userId, documents);
      if (!stillCurrent()) return;
      normalized.updatedAt = nextEditTimestamp(dataRef.current, normalized);
      await persistDashboard(normalized);
      if (!stillCurrent()) return;
      scheduleAutoSync();
    } catch (error) {
      window.alert(`Backup import failed: ${error.message}. Module restoration is sequential; earlier modules may already have been restored.`);
    }
  };

  const effectiveDisplayMode = data.displayMode === "auto" ? (isNarrowViewport ? "mobile" : "desktop") : data.displayMode;

  return {
    selectedDate,
    setSelectedDate,
    data,
    setData,
    activeNoteView,
    setActiveNoteView,
    isNarrowViewport,
    setIsNarrowViewport,
    openPanels,
    setOpenPanels,
    openMonths,
    setOpenMonths,
    sync,
    setSync,
    account,
    setAccount,
    accountGate,
    setAccountGate,
    saveData,
    updateSync,
    setSyncStatus,
    updateAccount,
    setAccountStatus,
    signInWithGoogle,
    signOutOfGoogle,
    activateAccountData,
    loadAccountData,
    downloadAccountRecovery,
    listDashboardRecoveries,
    downloadDashboardRecovery,
    getAccountUploadState,
    prepareAccountReplacement,
    uploadAccountData,
    pushAccountData,
    pullAccountData,
    checkAccountUpdates,
    syncBackendReady,
    syncIdentityReady,
    getSupabaseBaseUrl,
    encryptSyncPayload,
    decryptSyncPayload,
    fetchRemoteSyncDoc,
    upsertRemoteSyncDoc,
    pushSyncData,
    pullSyncData,
    scheduleAutoSync,
    startAutoSyncPolling,
    entries,
    weekday,
    routineTried,
    carryPenaltyMarked,
    getEntries,
    getDayTotal,
    getCarryTotal,
    scoreInfo,
    togglePanel,
    shiftDate,
    toggleChoice,
    toggleRoutineAttempt,
    toggleCarryPenalty,
    resetCarry,
    adjustCarry,
    setActiveMemo,
    moveMemoCard,
    updateMemoCard,
    updateItemIcon,
    updateItemSymbol,
    addMemoCard,
    removeMemoCard,
    addPresetTo,
    updatePresetIn,
    movePresetIn,
    removePresetFrom,
    addPreset,
    updatePreset,
    movePreset,
    removePreset,
    addSchoolPreset,
    updateSchoolPreset,
    moveSchoolPreset,
    removeSchoolPreset,
    updateSchoolSubject,
    addCategory,
    updateCategory,
    moveCategory,
    removeCategory,
    updateWeeklyPlan,
    updateCalendarNote,
    toggleCalendarDuty,
    updateDateMarker,
    updateDisplayMode,
    addMemoNote,
    updateMemoNote,
    toggleMemoNote,
    removeMemoNote,
    moveMemoNote,
    attachMemoImage,
    removeMemoImage,
    addNoteTab,
    updateNoteTab,
    removeNoteTab,
    moveNoteTab,
    connectSync,
    forgetThisDevice,
    exportBackup,
    copyBackup,
    importBackup,
    effectiveDisplayMode,
  };
}

export default useDashboard;
