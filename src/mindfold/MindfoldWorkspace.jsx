import React, {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PanelLeft,
  Plus,
  FolderPlus,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Search,
  Star,
  FileText,
  Pencil,
  Trash2,
  X,
  RotateCcw,
  Cloud,
  CloudOff,
  AlertCircle,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import DocumentEditor from "./DocumentEditor.jsx";
import useDocuments from "./useDocuments.js";
import { documentText, duplicatePage, TRASH_MS, uid } from "./documentModel.js";
import { exportZip, importZip } from "./io.js";

const EmojiPicker = lazy(() => import("./EmojiPicker.jsx"));
const Tool = ({ icon: Icon, label, onClick, ...rest }) => (
  <button
    type="button"
    className="mf3-tool"
    title={label}
    aria-label={label}
    onClick={onClick}
    {...rest}
  >
    <Icon size={17} strokeWidth={1.7} />
  </button>
);

export default function MindfoldWorkspace({ legacy, displayMode }) {
  const { workspace, userId, status, mutate, setComposing, addPage } =
    useDocuments(legacy);
  const [sidebar, setSidebar] = useState(() => window.innerWidth > 1000),
    [search, setSearch] = useState(""),
    [trash, setTrash] = useState(false),
    [collapsed, setCollapsed] = useState([]),
    [rename, setRename] = useState(null),
    [confirm, setConfirm] = useState(null),
    [iconPage, setIconPage] = useState(""),
    [error, setError] = useState(""),
    [pageMenu, setPageMenu] = useState("");
  const editorRef = useRef(null),
    fileRef = useRef(null),
    dragged = useRef(null);
  const page =
    workspace?.pages.find(
      (p) => p.id === workspace.activePageId && !p.deletedAt,
    ) || workspace?.pages.find((p) => !p.deletedAt);
  const pages = useMemo(() => {
    if (!workspace) return [];
    const query = search.trim().toLocaleLowerCase();
    return [...workspace.pages]
      .filter(
        (p) =>
          !p.deletedAt &&
          (!query ||
            `${p.label}\n${documentText(p.document)}`
              .toLocaleLowerCase()
              .includes(query)),
      )
      .sort(
        (a, b) =>
          workspace.pageOrder.indexOf(a.id) - workspace.pageOrder.indexOf(b.id),
      );
  }, [workspace, search]);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 12000);
    return () => clearTimeout(timer);
  }, [error]);
  useEffect(() => {
    if (status.kind === "error" || status.kind === "conflict")
      setError(status.text);
  }, [status.kind, status.text]);
  const flush = () => editorRef.current?.flush();
  const select = (id) => {
    flush();
    mutate(
      (w) => {
        w.activePageId = id;
      },
      [],
      true,
    );
    setTrash(false);
    setPageMenu("");
    if (displayMode === "mobile" || window.innerWidth < 760) setSidebar(false);
  };
  const changePage = (id, patch) =>
    mutate(
      (w) => {
        const p = w.pages.find((v) => v.id === id);
        if (p) Object.assign(p, patch);
      },
      [id],
    );
  const duplicate = (source) => {
    flush();
    const next = duplicatePage(
      source.id === page?.id && editorRef.current?.editor
        ? { ...source, document: editorRef.current.editor.getJSON() }
        : source,
    );
    next.dirty = true;
    next.localEditId = uid();
    mutate(
      (w) => {
        w.pages.push(next);
        const index = w.pageOrder.indexOf(source.id);
        w.pageOrder.splice(index + 1, 0, next.id);
        w.activePageId = next.id;
      },
      [],
      true,
    );
    setPageMenu("");
  };
  const requestDelete = (p) =>
    setConfirm({
      title: "휴지통으로 이동",
      message: `“${p.label}” 페이지를 휴지통으로 옮길까요? 30일 동안 복원할 수 있습니다.`,
      action: () => {
        flush();
        mutate(
          (w) => {
            w.pages.find((v) => v.id === p.id).deletedAt =
              new Date().toISOString();
            if (w.activePageId === p.id)
              w.activePageId = w.pages.find((v) => !v.deletedAt)?.id || "";
          },
          [p.id],
          true,
        );
        setPageMenu("");
      },
    });
  const folderRename = (folder) =>
    setRename({ kind: "folder", id: folder.id, value: folder.label });
  const drop = (event, target) => {
    event.preventDefault();
    const item = dragged.current;
    if (!item) return;
    if (item.kind === "page") {
      const targetPage = workspace.pages.find((p) => p.id === target);
      mutate(
        (w) => {
          const p = w.pages.find((v) => v.id === item.id);
          if (targetPage) {
            p.folderId = targetPage.folderId;
            w.pageOrder = w.pageOrder.filter((id) => id !== p.id);
            w.pageOrder.splice(w.pageOrder.indexOf(target), 0, p.id);
          } else p.folderId = target === "root" ? "" : target;
        },
        [item.id],
        true,
      );
    } else if (
      item.kind === "folder" &&
      workspace.folders.some((f) => f.id === target)
    )
      mutate(
        (w) => {
          const from = w.folders.findIndex((f) => f.id === item.id);
          const moving = w.folders.splice(from, 1)[0];
          w.folders.splice(
            w.folders.findIndex((f) => f.id === target),
            0,
            moving,
          );
        },
        [],
        true,
      );
    dragged.current = null;
  };
  const row = (p, favorite = false) => (
    <div
      key={`${favorite ? "favorite-" : ""}${p.id}`}
      className={`mf3-page-row ${p.id === page?.id && !trash ? "is-active" : ""}`}
      draggable
      onDragStart={(e) => {
        dragged.current = { kind: "page", id: p.id };
        e.dataTransfer.setData("text/plain", p.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => drop(e, p.id)}
    >
      <button
        className="mf3-page-select"
        type="button"
        onClick={() => select(p.id)}
      >
        <span className="mf3-page-icon">
          {p.icon || <FileText size={15} />}
        </span>
        <span>{p.label}</span>
      </button>
      <div className="mf3-page-actions">
        <Tool
          icon={Pencil}
          label={`${p.label} 이름 수정`}
          onClick={() => setRename({ kind: "page", id: p.id, value: p.label })}
        />
        <Tool
          icon={Trash2}
          label={`${p.label} 삭제`}
          onClick={() => requestDelete(p)}
        />
      </div>
    </div>
  );
  if (!workspace)
    return (
      <div className="mf3-workspace">
        <div className="mf3-loading">{status.text}</div>
        {status.kind === "error" && (
          <p role="alert">원본 자료는 보존되어 있습니다.</p>
        )}
      </div>
    );
  return (
    <div
      className={`mf3-workspace ${sidebar ? "with-sidebar" : ""} ${displayMode === "mobile" ? "is-mobile" : ""}`}
    >
      {sidebar && (
        <>
          <button
            type="button"
            className="mf3-sidebar-backdrop"
            aria-label="페이지 목록 닫기"
            onClick={() => setSidebar(false)}
          />
          <aside className="mf3-sidebar" aria-label="페이지 목록">
            <div className="mf3-sidebar-title">
              <span>Mindfold</span>
              <Tool
                icon={PanelLeft}
                label="페이지 목록 닫기"
                onClick={() => setSidebar(false)}
              />
            </div>
            <label className="mf3-page-search">
              <Search size={16} />
              <input
                aria-label="제목·본문 검색"
                placeholder="검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="mf3-sidebar-tools">
              <button
                type="button"
                onClick={() => {
                  flush();
                  addPage();
                  setTrash(false);
                }}
              >
                <Plus size={16} />
                페이지
              </button>
              <Tool
                icon={FolderPlus}
                label="폴더 추가"
                onClick={() => {
                  const folder = { id: uid(), label: "새 폴더" };
                  mutate((w) => w.folders.push(folder), [], true);
                  folderRename(folder);
                }}
              />
            </div>
            <div className="mf3-page-list">
              {!search && pages.some((p) => p.favorite) && (
                <div className="mf3-page-group">
                  <div className="mf3-group-label">
                    <Star size={13} />
                    즐겨찾기
                  </div>
                  {pages.filter((p) => p.favorite).map((p) => row(p, true))}
                </div>
              )}
              <div
                className="mf3-page-group"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  if (e.target === e.currentTarget) drop(e, "root");
                }}
              >
                <div className="mf3-group-label">페이지</div>
                {pages
                  .filter(
                    (p) =>
                      search ||
                      !p.folderId ||
                      !workspace.folders.some((f) => f.id === p.folderId),
                  )
                  .map((p) => row(p))}
              </div>
              {!search &&
                workspace.folders.map((folder) => (
                  <div
                    className="mf3-folder"
                    key={folder.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.stopPropagation();
                      drop(e, folder.id);
                    }}
                  >
                    <div
                      className="mf3-folder-head"
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        dragged.current = { kind: "folder", id: folder.id };
                        e.dataTransfer.setData("text/plain", folder.id);
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsed((v) =>
                            v.includes(folder.id)
                              ? v.filter((id) => id !== folder.id)
                              : [...v, folder.id],
                          )
                        }
                      >
                        {collapsed.includes(folder.id) ? (
                          <ChevronRight size={13} />
                        ) : (
                          <ChevronDown size={13} />
                        )}
                        {collapsed.includes(folder.id) ? (
                          <Folder size={15} />
                        ) : (
                          <FolderOpen size={15} />
                        )}
                        <span>{folder.label}</span>
                      </button>
                      <div className="mf3-page-actions">
                        <Tool
                          icon={Plus}
                          label={`${folder.label}에 페이지 추가`}
                          onClick={() => {
                            flush();
                            addPage(folder.id);
                          }}
                        />
                        <Tool
                          icon={Pencil}
                          label="폴더 이름 수정"
                          onClick={() => folderRename(folder)}
                        />
                        <Tool
                          icon={Trash2}
                          label="폴더 삭제"
                          onClick={() =>
                            setConfirm({
                              title: "폴더 삭제",
                              message:
                                "폴더만 삭제하고 안의 페이지는 기본 목록으로 옮깁니다.",
                              action: () => {
                                const ids = workspace.pages
                                  .filter((p) => p.folderId === folder.id)
                                  .map((p) => p.id);
                                mutate(
                                  (w) => {
                                    w.folders = w.folders.filter(
                                      (f) => f.id !== folder.id,
                                    );
                                    w.pages.forEach((p) => {
                                      if (p.folderId === folder.id)
                                        p.folderId = "";
                                    });
                                  },
                                  ids,
                                  true,
                                );
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                    {!collapsed.includes(folder.id) && (
                      <div className="mf3-folder-pages">
                        {pages
                          .filter((p) => p.folderId === folder.id)
                          .map((p) => row(p))}
                      </div>
                    )}
                  </div>
                ))}
              {search && !pages.length && (
                <div className="mf3-empty-small">검색 결과가 없습니다.</div>
              )}
            </div>
            <button
              className={`mf3-trash-link ${trash ? "is-active" : ""}`}
              type="button"
              onClick={() => {
                flush();
                setTrash((v) => !v);
              }}
            >
              <Trash2 size={16} />
              <span>휴지통</span>
              <small>
                {
                  workspace.pages.filter(
                    (p) =>
                      p.deletedAt &&
                      Date.now() - Date.parse(p.deletedAt) < TRASH_MS,
                  ).length
                }
              </small>
            </button>
          </aside>
        </>
      )}
      <main className="mf3-main">
        <header className="mf3-pagebar">
          <div className="mf3-pagebar-start">
            <Tool
              icon={PanelLeft}
              label="페이지 목록 열고 닫기"
              onClick={() => setSidebar((v) => !v)}
            />
            {!trash && page && (
              <>
                <button
                  className="mf3-page-emoji"
                  type="button"
                  aria-label="페이지 아이콘 변경"
                  onClick={() => setIconPage(iconPage ? "" : page.id)}
                >
                  {page.icon || <FileText size={18} />}
                </button>
                <button
                  className="mf3-page-title"
                  type="button"
                  title="페이지 이름 수정"
                  onClick={() =>
                    setRename({ kind: "page", id: page.id, value: page.label })
                  }
                >
                  {page.label}
                </button>
              </>
            )}
            {trash && <strong>휴지통</strong>}
          </div>
          <div className="mf3-pagebar-end">
            <span
              className={`mf3-save-status ${status.kind}`}
              title={status.text}
              role="status"
            >
              {status.kind === "error" || status.kind === "conflict" ? (
                <AlertCircle size={14} />
              ) : userId ? (
                <Cloud size={14} />
              ) : (
                <CloudOff size={14} />
              )}
              <span>{status.text}</span>
            </span>
            {!trash && page && (
              <>
                <Tool
                  icon={Star}
                  label={page.favorite ? "즐겨찾기 해제" : "즐겨찾기"}
                  className={`mf3-tool ${page.favorite ? "is-active" : ""}`}
                  onClick={() =>
                    changePage(page.id, { favorite: !page.favorite })
                  }
                />
                <Tool
                  icon={ChevronDown}
                  label="페이지 관리"
                  onClick={() => setPageMenu(pageMenu ? "" : page.id)}
                />
              </>
            )}
          </div>
        </header>
        {error && (
          <div className="mf3-error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
            <Tool icon={X} label="알림 닫기" onClick={() => setError("")} />
          </div>
        )}
        {trash ? (
          <div className="mf3-trash-view">
            <div className="mf3-trash-heading">
              <Trash2 size={20} />
              <span>30일 동안 복원할 수 있습니다.</span>
            </div>
            {workspace.pages
              .filter(
                (p) =>
                  p.deletedAt &&
                  Date.now() - Date.parse(p.deletedAt) < TRASH_MS,
              )
              .map((p) => (
                <div key={p.id} className="mf3-trash-row">
                  <span>{p.icon || <FileText size={17} />}</span>
                  <strong>{p.label}</strong>
                  <small>
                    {Math.max(
                      0,
                      30 -
                        Math.floor(
                          (Date.now() - Date.parse(p.deletedAt)) / 86400000,
                        ),
                    )}
                    일 남음
                  </small>
                  <Tool
                    icon={RotateCcw}
                    label="페이지 복원"
                    onClick={() => changePage(p.id, { deletedAt: null })}
                  />
                </div>
              ))}
            {!workspace.pages.some(
              (p) =>
                p.deletedAt && Date.now() - Date.parse(p.deletedAt) < TRASH_MS,
            ) && <p className="mf3-empty-small">휴지통이 비어 있습니다.</p>}
          </div>
        ) : page ? (
          <DocumentEditor
            key={`${userId || "local"}:${page.id}`}
            ref={editorRef}
            page={page}
            userId={userId}
            onChange={(document) => changePage(page.id, { document })}
            onComposition={setComposing}
            onError={setError}
            onZip={async () => {
              flush();
              await new Promise((resolve) => setTimeout(resolve, 0));
              await exportZip(userId);
            }}
            onImport={() => fileRef.current.click()}
          />
        ) : (
          <div className="mf3-no-page">
            <button type="button" onClick={() => addPage()}>
              <Plus size={18} />
              페이지 만들기
            </button>
          </div>
        )}
        {pageMenu && page && (
          <div className="mf3-page-menu mf3-sheet">
            <div className="mf3-popover-head">
              <span>페이지 관리</span>
              <Tool
                icon={X}
                label="페이지 메뉴 닫기"
                onClick={() => setPageMenu("")}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setRename({ kind: "page", id: page.id, value: page.label });
                setPageMenu("");
              }}
            >
              <Pencil size={16} />
              이름 변경
            </button>
            <button type="button" onClick={() => duplicate(page)}>
              <FileText size={16} />
              페이지 복제
            </button>
            {[
              [-1, ArrowUp, "위로 이동"],
              [1, ArrowDown, "아래로 이동"],
            ].map(([direction, Icon, label]) => (
              <button
                type="button"
                key={direction}
                onClick={() =>
                  mutate(
                    (w) => {
                      const index = w.pageOrder.indexOf(page.id),
                        target = index + direction;
                      if (target >= 0 && target < w.pageOrder.length)
                        [w.pageOrder[index], w.pageOrder[target]] = [
                          w.pageOrder[target],
                          w.pageOrder[index],
                        ];
                    },
                    [],
                    true,
                  )
                }
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
            <label>
              폴더
              <select
                value={page.folderId}
                onChange={(e) =>
                  changePage(page.id, { folderId: e.target.value })
                }
              >
                <option value="">기본 목록</option>
                {workspace.folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="danger"
              type="button"
              onClick={() => requestDelete(page)}
            >
              <Trash2 size={16} />
              휴지통으로 이동
            </button>
          </div>
        )}
      </main>
      {iconPage && (
        <div
          className="mf3-overlay"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setIconPage("");
          }}
        >
          <div className="mf3-icon-dialog">
            <div className="mf3-popover-head">
              <span>페이지 아이콘</span>
              <Tool icon={X} label="닫기" onClick={() => setIconPage("")} />
            </div>
            <Suspense fallback={<div className="mf3-loading" />}>
              <EmojiPicker
                onPick={(icon) => {
                  changePage(iconPage, { icon });
                  setIconPage("");
                }}
              />
            </Suspense>
            <button
              className="mf3-icon-remove"
              type="button"
              onClick={() => {
                changePage(iconPage, { icon: "" });
                setIconPage("");
              }}
            >
              아이콘 제거
            </button>
          </div>
        </div>
      )}
      {rename && (
        <div
          className="mf3-overlay"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setRename(null);
          }}
        >
          <form
            className="mf3-dialog"
            onSubmit={(e) => {
              e.preventDefault();
              const value = rename.value.trim();
              if (!value) return;
              if (rename.kind === "page")
                changePage(rename.id, { label: value.slice(0, 120) });
              else
                mutate(
                  (w) => {
                    w.folders.find((f) => f.id === rename.id).label =
                      value.slice(0, 80);
                  },
                  [],
                  true,
                );
              setRename(null);
            }}
          >
            <div className="mf3-dialog-head">
              <strong>
                {rename.kind === "page" ? "페이지 이름" : "폴더 이름"}
              </strong>
              <Tool icon={X} label="닫기" onClick={() => setRename(null)} />
            </div>
            <input
              autoFocus
              aria-label="이름"
              value={rename.value}
              maxLength={120}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setRename({ ...rename, value: e.target.value })}
            />
            <div className="mf3-dialog-actions">
              <button type="button" onClick={() => setRename(null)}>
                취소
              </button>
              <button type="submit">저장</button>
            </div>
          </form>
        </div>
      )}
      {confirm && (
        <div className="mf3-overlay">
          <section
            className="mf3-dialog"
            role="alertdialog"
            aria-labelledby="mf3-confirm-title"
          >
            <div className="mf3-dialog-head">
              <strong id="mf3-confirm-title">{confirm.title}</strong>
              <Tool icon={X} label="닫기" onClick={() => setConfirm(null)} />
            </div>
            <p>{confirm.message}</p>
            <div className="mf3-dialog-actions">
              <button type="button" onClick={() => setConfirm(null)}>
                취소
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  confirm.action();
                  setConfirm(null);
                }}
              >
                확인
              </button>
            </div>
          </section>
        </div>
      )}
      <input
        type="file"
        accept=".zip"
        ref={fileRef}
        hidden
        onChange={(e) => {
          const file = e.target.files[0];
          e.target.value = "";
          if (file)
            setConfirm({
              title: "백업 복원",
              message:
                "현재 Mindfold를 선택한 백업으로 복원할까요? 현재 자료는 복구용 사본으로 보존합니다. Dashboard 자료는 변경하지 않습니다.",
              action: () => {
                flush();
                importZip(userId, file)
                  .then(() => setError("백업을 복원했습니다."))
                  .catch((error) => setError(error.message));
              },
            });
        }}
      />
    </div>
  );
}
