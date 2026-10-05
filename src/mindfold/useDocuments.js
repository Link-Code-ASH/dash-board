import { useCallback, useEffect, useRef, useState } from "react";
import { accountClient, readAccountData } from "../accountSync.js";
import {
  copy,
  duplicatePage,
  newPage,
  TRASH_MS,
  uid,
} from "./documentModel.js";
import {
  loadWorkspace,
  ownerKey,
  preserve,
  readCloud,
  saveCloudMetadata,
  saveCloudPage,
  saveLocal,
} from "./repository.js";

export default function useDocuments(legacy) {
  const [userId, setUserId] = useState(undefined);
  const [workspace, setWorkspace] = useState(null);
  const [status, setStatus] = useState({
    kind: "loading",
    text: "문서를 여는 중",
  });
  const current = useRef(null),
    user = useRef(undefined),
    busy = useRef(false),
    composing = useRef(false),
    timer = useRef(null),
    localQueue = useRef(Promise.resolve()),
    localFailure = useRef(null),
    cloudBlock = useRef(null),
    pullPending = useRef(false);
  const syncRef = useRef(null),
    refreshRef = useRef(null),
    legacyRef = useRef(legacy);
  legacyRef.current = legacy;
  const publish = useCallback((next, save = true) => {
    current.current = next;
    setWorkspace(next);
    if (save) {
      const owner = user.current;
      localQueue.current = saveLocal(owner, next)
        .then(() => {
          if (user.current === owner) localFailure.current = null;
        })
        .catch((error) => {
          if (user.current === owner) {
            localFailure.current = error;
            setStatus({
              kind: "error",
              text: `기기 저장 실패: ${error.message}`,
            });
          }
        });
    }
  }, []);
  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    if (cloudBlock.current) {
      setStatus({ kind: "error", text: cloudBlock.current });
      return;
    }
    setStatus({
      kind: user.current ? "pending" : "local",
      text: user.current ? "저장 중" : "이 기기에 저장됨",
    });
    timer.current = window.setTimeout(() => {
      timer.current = null;
      syncRef.current?.();
    }, 700);
  }, []);
  const mutate = useCallback(
    (recipe, pageIds = [], metadata = false) => {
      if (!current.current) return;
      const next = copy(current.current);
      recipe(next);
      next.pages.forEach((page) => {
        if (pageIds.includes(page.id)) {
          page.dirty = true;
          page.localEditId = uid();
        }
      });
      if (metadata) {
        next.dirtyMetadata = true;
        next.metadataEditId = uid();
      }
      publish(next);
      schedule();
    },
    [publish, schedule],
  );

  useEffect(() => {
    let alive = true;
    accountClient.auth.getSession().then(({ data }) => {
      if (alive) setUserId(data.session?.user.id || null);
    });
    const { data: listener } = accountClient.auth.onAuthStateChange(
      (_event, session) => {
        if (alive) setUserId(session?.user.id || null);
      },
    );
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (userId === undefined) return;
    let alive = true;
    clearTimeout(timer.current);
    user.current = userId;
    current.current = null;
    localFailure.current = null;
    cloudBlock.current = null;
    composing.current = false;
    pullPending.current = false;
    setWorkspace(null);
    (async () => {
      try {
        let accountLegacy = null;
        if (userId) {
          try {
            accountLegacy = (await readAccountData(userId))?.payload?.mindfold;
          } catch {
            /* A cached workspace stays available while offline. */
          }
        }
        let local = await loadWorkspace(
          userId,
          accountLegacy || legacyRef.current,
        );
        if (userId) {
          try {
            const remote = await readCloud(userId);
            if (remote) {
              if (local.pages.some((page) => page.dirty))
                await preserve(userId, local, "before-cloud-activation");
              // A first migration must not overwrite an already upgraded cloud workspace.
              if (!local.metadataRevision) local = remote;
              else local = mergeRemote(local, remote);
            }
          } catch (error) {
            if (alive) {
              if (error.code === "MINDFOLD_READ_ONLY")
                cloudBlock.current = error.message;
              setStatus({
                kind: "error",
                text: `클라우드 연결 실패: ${error.message}`,
              });
            }
          }
        }
        if (!alive) return;
        publish(local);
        schedule();
      } catch (error) {
        if (alive) setStatus({ kind: "error", text: error.message });
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, publish, schedule]);

  const refresh = useCallback(async () => {
    const owner = user.current;
    if (!owner || !current.current || document.hidden) return;
    if (busy.current || composing.current) {
      pullPending.current = true;
      return;
    }
    busy.current = true;
    try {
      const remote = await readCloud(owner, current.current);
      if (user.current === owner) cloudBlock.current = null;
      if (remote && user.current === owner && current.current) {
        if (composing.current) pullPending.current = true;
        else publish(mergeRemote(current.current, remote));
      }
    } catch (error) {
      if (user.current === owner) {
        if (error.code === "MINDFOLD_READ_ONLY")
          cloudBlock.current = error.message;
        setStatus({
          kind: "error",
          text: `동기화 확인 실패: ${error.message}`,
        });
      }
    } finally {
      busy.current = false;
      if (
        current.current?.pages.some((p) => p.dirty) ||
        current.current?.dirtyMetadata
      )
        schedule();
    }
  }, [publish, schedule]);
  refreshRef.current = refresh;

  const sync = useCallback(async () => {
    const owner = user.current;
    if (!owner || !current.current || cloudBlock.current) return;
    if (busy.current || composing.current) {
      schedule();
      return;
    }
    busy.current = true;
    try {
      await localQueue.current;
      if (user.current !== owner || !current.current) return;
      if (localFailure.current) {
        try {
          await saveLocal(owner, current.current);
          localFailure.current = null;
        } catch (error) {
          throw new Error(`기기 저장 실패: ${error.message}`);
        }
      }
      const snapshot = copy(current.current);
      for (const page of snapshot.pages.filter((p) => p.dirty)) {
        const revision = await saveCloudPage(owner, page);
        if (user.current !== owner) return;
        const next = copy(current.current),
          live = next.pages.find((p) => p.id === page.id);
        if (live) {
          live.revision = revision;
          if (live.localEditId === page.localEditId) live.dirty = false;
        }
        publish(next);
      }
      if (current.current.dirtyMetadata) {
        const metadataSnapshot = copy(current.current);
        const revision = await saveCloudMetadata(owner, metadataSnapshot);
        if (user.current !== owner) return;
        const next = copy(current.current);
        next.metadataRevision = revision;
        if (next.metadataEditId === metadataSnapshot.metadataEditId)
          next.dirtyMetadata = false;
        publish(next);
      }
      await localQueue.current;
      if (localFailure.current)
        throw new Error(`기기 저장 실패: ${localFailure.current.message}`);
      if (user.current === owner)
        setStatus({ kind: "synced", text: "모든 변경사항 저장됨" });
    } catch (error) {
      if (user.current !== owner || !current.current) return;
      if (error.message === "MINDFOLD_CONFLICT") {
        try {
          const remote = await readCloud(owner);
          if (remote && user.current === owner) {
            await preserve(owner, current.current, "sync-conflict");
            const local = current.current;
            for (const page of local.pages.filter(
              (p) =>
                p.dirty &&
                (remote.pages.find((r) => r.id === p.id)?.revision || 0) !==
                  p.revision,
            )) {
              const recovery = duplicatePage(page);
              recovery.label = `${page.label} (복구 사본)`;
              recovery.dirty = true;
              recovery.localEditId = uid();
              remote.pages.push(recovery);
              remote.pageOrder.push(recovery.id);
              remote.dirtyMetadata = true;
              remote.metadataEditId = uid();
            }
            const conflictedIds = new Set(
              local.pages
                .filter(
                  (p) =>
                    p.dirty &&
                    (remote.pages.find((r) => r.id === p.id)?.revision || 0) !==
                      p.revision,
                )
                .map((p) => p.id),
            );
            const pending = {
              ...local,
              dirtyMetadata: false,
              pages: local.pages.filter((p) => !conflictedIds.has(p.id)),
            };
            const merged = mergeRemote(pending, remote);
            if (
              local.dirtyMetadata &&
              local.metadataRevision !== remote.metadataRevision
            ) {
              const known = new Set(remote.folders.map((folder) => folder.id));
              merged.folders = [
                ...remote.folders,
                ...local.folders.filter((folder) => !known.has(folder.id)),
              ];
              for (const folder of local.folders) {
                const other = remote.folders.find((f) => f.id === folder.id);
                if (other && other.label !== folder.label)
                  merged.folders.push({
                    id: uid(),
                    label: `${folder.label} (복구 사본)`,
                  });
              }
              merged.pageOrder = [
                ...new Set([...remote.pageOrder, ...local.pageOrder]),
              ];
              merged.dirtyMetadata = true;
              merged.metadataEditId = uid();
            }
            if (remote.dirtyMetadata) {
              merged.dirtyMetadata = true;
              merged.metadataEditId = uid();
            }
            publish(merged);
            setStatus({
              kind: "conflict",
              text: "동시 수정 내용을 복구 사본으로 보존했습니다.",
            });
          }
        } catch (recoveryError) {
          if (recoveryError.code === "MINDFOLD_READ_ONLY")
            cloudBlock.current = recoveryError.message;
          setStatus({
            kind: "error",
            text: `충돌 복구 대기: ${recoveryError.message}`,
          });
        }
      } else
        setStatus({
          kind: "error",
          text: `${error.message.startsWith("기기 저장 실패") || error.message.startsWith("이미지 업로드 실패") ? error.message : `문서 동기화 실패: ${error.message}`} · 다시 시도합니다`,
        });
    } finally {
      busy.current = false;
      if (
        user.current === owner &&
        (current.current?.dirtyMetadata ||
          current.current?.pages.some((p) => p.dirty))
      ) {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => syncRef.current?.(), 5000);
      } else if (pullPending.current) {
        pullPending.current = false;
        refreshRef.current?.();
      }
    }
  }, [publish, schedule]);
  syncRef.current = sync;

  useEffect(() => {
    if (!userId) return;
    const channel = accountClient
      .channel(`mindfold-v3-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mindfold_pages",
          filter: `user_id=eq.${userId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mindfold_workspaces",
          filter: `user_id=eq.${userId}`,
        },
        refresh,
      )
      .subscribe();
    const interval = setInterval(refresh, 10000);
    const resume = () => {
      if (!document.hidden) {
        refresh();
        syncRef.current?.();
      }
    };
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      accountClient.removeChannel(channel);
      clearInterval(interval);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [userId, refresh]);
  useEffect(() => {
    const restored = (event) => {
      if (event.detail === ownerKey(user.current))
        loadWorkspace(user.current, legacyRef.current).then((next) => {
          publish(next);
          schedule();
        });
    };
    window.addEventListener("mindfold:restored", restored);
    return () => {
      window.removeEventListener("mindfold:restored", restored);
      clearTimeout(timer.current);
    };
  }, [publish, schedule]);

  return {
    workspace,
    userId,
    status,
    mutate,
    sync,
    setComposing(value) {
      composing.current = value;
      if (!value && pullPending.current) {
        pullPending.current = false;
        refreshRef.current?.();
      }
    },
    addPage(folderId = "") {
      const page = newPage();
      page.folderId = folderId;
      page.dirty = true;
      page.localEditId = uid();
      mutate(
        (next) => {
          next.pages.push(page);
          next.pageOrder.push(page.id);
          next.activePageId = page.id;
        },
        [],
        true,
      );
    },
  };
}

function mergeRemote(local, remote) {
  const metadata = local.dirtyMetadata
    ? { ...local }
    : { ...remote, activePageId: local.activePageId };
  const pages = remote.pages.map((r) => {
    const l = local.pages.find((p) => p.id === r.id);
    return l?.dirty ? l : r;
  });
  local.pages
    .filter((l) => l.dirty && !pages.some((p) => p.id === l.id))
    .forEach((l) => pages.push(l));
  metadata.pages = pages;
  // Expired trash is no longer shown; originals remain in recovery backups.
  metadata.pages = pages.filter(
    (p) => !p.deletedAt || Date.now() - Date.parse(p.deletedAt) < TRASH_MS,
  );
  metadata.pageOrder = [
    ...new Set([...(metadata.pageOrder || []), ...pages.map((p) => p.id)]),
  ];
  if (
    !metadata.pages.some((p) => p.id === metadata.activePageId && !p.deletedAt)
  )
    metadata.activePageId = metadata.pages.find((p) => !p.deletedAt)?.id || "";
  return metadata;
}
