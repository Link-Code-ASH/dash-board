import React, {
  forwardRef,
  lazy,
  Suspense,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { TextSelection } from "@tiptap/pm/state";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Undo2,
  Redo2,
  Table2,
  ImagePlus,
  Smile,
  Link2,
  Palette,
  EyeOff,
  Search,
  Download,
  Printer,
  X,
  ChevronDown,
  Trash2,
  Columns2,
  ChevronRight,
  Minus,
  Merge,
  Split,
  Rows3,
  Plus,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";
import {
  AssetImage,
  ColoredCell,
  ColoredHeader,
  Column,
  ColumnSet,
  currentBlock,
  exitOutline,
  findPosition,
  Mask,
  MindfoldTableView,
  MindfoldBehavior,
  MindParagraph,
  Outline,
  OutlineBody,
  replaceDocument,
  setColumns,
  setKind,
  SizedTableRow,
  toggleOutline,
} from "./extensions.js";
import {
  blankText,
  copy,
  deleteBlocks,
  TEXT_COLOR_OPTIONS,
  transformBlocks,
  uid,
} from "./documentModel.js";
import { addImage } from "./repository.js";
import { exportHTML, exportMarkdown } from "./io.js";

const EmojiPicker = lazy(() => import("./EmojiPicker.jsx"));
const kinds = [
  ["text", "본문"],
  ["heading-1", "제목 1"],
  ["heading-2", "제목 2"],
  ["heading-3", "제목 3"],
  ["heading-4", "제목 4"],
  ["bullet", "글머리표"],
  ["check", "체크"],
  ["quote", "인용"],
  ["callout", "강조"],
];
const IconButton = ({ icon: Icon, label, active, onClick, ...rest }) => (
  <button
    type="button"
    className={`mf3-tool ${active ? "is-active" : ""}`}
    title={label}
    aria-label={label}
    aria-pressed={active === undefined ? undefined : !!active}
    onPointerDown={(e) => {
      if (e.pointerType !== "touch") e.preventDefault();
    }}
    onClick={onClick}
    {...rest}
  >
    <Icon size={17} strokeWidth={1.7} />
  </button>
);

const DocumentEditor = forwardRef(function DocumentEditor(
  { page, userId, onChange, onComposition, onError, onZip, onImport },
  ref,
) {
  const [menu, setMenu] = useState(null),
    [emoji, setEmoji] = useState(false),
    [dialog, setDialog] = useState(null),
    [preview, setPreview] = useState(null),
    [marquee, setMarquee] = useState(null),
    [drag, setDrag] = useState(null),
    [findOpen, setFindOpen] = useState(false),
    [query, setQuery] = useState(""),
    [replacement, setReplacement] = useState(""),
    [findCount, setFindCount] = useState(0),
    [selectedCount, setSelectedCount] = useState(0);
  const editorRef = useRef(null),
    selected = useRef([]),
    dirty = useRef(null),
    persistTimer = useRef(null),
    callbacks = useRef({ onChange, onComposition, onError }),
    suppress = useRef(false),
    invalidContent = useRef(false),
    rootRef = useRef(null),
    fileRef = useRef(null),
    replaceImageId = useRef(""),
    selectionBookmark = useRef(null),
    dragRef = useRef(null),
    suppressClick = useRef(0),
    lastDocument = useRef(JSON.stringify(page.document));
  callbacks.current = { onChange, onComposition, onError };
  const flush = () => {
    clearTimeout(persistTimer.current);
    if (dirty.current) {
      const value = dirty.current;
      dirty.current = null;
      callbacks.current.onChange(value);
    }
    callbacks.current.onComposition(!!editorRef.current?.view.composing);
  };
  const changeSelection = (ids) => {
    selected.current = ids;
    setSelectedCount(ids.length);
    const editor = editorRef.current;
    if (editor && !editor.isDestroyed)
      editor.view.dispatch(editor.state.tr.setMeta("mfSelection", true));
  };
  const deleteSelected = (replace = false) => {
    const editor = editorRef.current;
    if (!editor || !selected.current.length) return false;
    const result = deleteBlocks(editor.getJSON(), selected.current, replace);
    changeSelection([]);
    replaceDocument(editor, result.document, result.insertedId);
    return true;
  };
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        paragraph: false,
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        blockquote: false,
        codeBlock: false,
        trailingNode: false,
        link: { openOnClick: false, protocols: ["http", "https", "mailto"] },
      }),
      MindParagraph,
      Outline,
      OutlineBody,
      Column,
      ColumnSet,
      Mask,
      TextStyle,
      Color,
      TableKit.configure({
        table: {
          resizable: true,
          cellMinWidth: 80,
          allowTableNodeSelection: true,
          View: MindfoldTableView,
        },
        tableCell: false,
        tableHeader: false,
        tableRow: false,
      }),
      ColoredCell,
      ColoredHeader,
      SizedTableRow,
      AssetImage(userId),
      MindfoldBehavior({
        selectedIds: () => selected.current,
        deleteSelected: () => deleteSelected(),
        composition: (value) => {
          if (value && selected.current.length) deleteSelected(true);
          callbacks.current.onComposition(value || !!dirty.current);
        },
        paste: (event) => {
          const files = [...(event.clipboardData?.files || [])].filter((file) =>
            file.type.startsWith("image/"),
          );
          if (!files.length) return false;
          event.preventDefault();
          insertImages(files);
          return true;
        },
        drop: (event) => {
          const files = [...(event.dataTransfer?.files || [])].filter((file) =>
            file.type.startsWith("image/"),
          );
          if (!files.length) return false;
          event.preventDefault();
          const at = editorRef.current?.view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });
          if (at) editorRef.current.commands.setTextSelection(at.pos);
          insertImages(files);
          return true;
        },
        requestToggle: (tr) => {
          const $from = tr.selection.$from;
          if (
            $from.depth > 1 &&
            $from.node($from.depth - 1).type.name === "outline"
          ) {
            const parent = $from.node($from.depth - 1);
            tr.setNodeMarkup($from.before($from.depth - 1), undefined, {
              ...parent.attrs,
              toggle: true,
              open: true,
            });
            return;
          }
          const pos = tr.selection.$from.before(),
            node = tr.doc.nodeAt(pos),
            schema = tr.doc.type.schema;
          const outline = schema.nodes.outline.create(
            { id: node.attrs.id || uid(), toggle: true, open: true },
            [
              schema.nodes.paragraph.create(
                { ...node.attrs, id: uid() },
                node.content,
              ),
              schema.nodes.outlineBody.create(
                null,
                schema.nodes.paragraph.create({ id: uid() }),
              ),
            ],
          );
          tr.replaceWith(pos, pos + node.nodeSize, outline);
          tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 2)));
        },
        keyDown: (view, event) => {
          if (
            event.keyCode === 229 &&
            !view.composing &&
            selected.current.length
          )
            deleteSelected(true);
          if (event.isComposing || view.composing || event.keyCode === 229)
            return false;
          const editor = editorRef.current;
          if (selected.current.length && (event.ctrlKey || event.metaKey)) {
            const key = event.key.toLowerCase();
            const mark = event.shiftKey
              ? { x: "strike", m: "mask" }[key]
              : { b: "bold", i: "italic", u: "underline" }[key];
            if (mark && !event.altKey) {
              event.preventDefault();
              callbacks.current.formatBlocks?.(mark);
              return true;
            }
          }
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "d"
          ) {
            event.preventDefault();
            const ids = (
              selected.current.length
                ? selected.current
                : [
                    currentBlock(editor)?.node.attrs.id ||
                      editor.state.selection.node?.attrs.id,
                  ]
            ).filter(Boolean);
            const blocks = [],
              added = [];
            editor.state.doc.descendants((node, pos) => {
              if (ids.includes(node.attrs.id)) {
                blocks.push({ node, pos });
                return false;
              }
            });
            const tr = editor.state.tr;
            blocks.reverse().forEach(({ node, pos }) => {
              const json = copy(node.toJSON());
              const renew = (child) => {
                if (child.attrs?.id) child.attrs.id = uid();
                child.content?.forEach(renew);
              };
              renew(json);
              added.push(json.attrs.id);
              tr.insert(pos + node.nodeSize, editor.schema.nodeFromJSON(json));
            });
            editor.view.dispatch(tr);
            changeSelection(added);
            return true;
          }
          if (
            (event.ctrlKey || event.metaKey) &&
            event.shiftKey &&
            ["ArrowUp", "ArrowDown"].includes(event.key)
          ) {
            event.preventDefault();
            const ids = (
              selected.current.length
                ? selected.current
                : [
                    currentBlock(editor)?.node.attrs.id ||
                      editor.state.selection.node?.attrs.id,
                  ]
            ).filter(Boolean);
            const items = ids
              .map((id) => findPosition(editor, id))
              .filter(Boolean)
              .sort((a, b) => a.pos - b.pos);
            const before = event.key === "ArrowUp",
              anchor = before ? items[0] : items.at(-1);
            if (anchor) {
              const $pos = editor.state.doc.resolve(anchor.pos),
                index = $pos.index() + (before ? -1 : 1),
                target =
                  index >= 0 && index < $pos.parent.childCount
                    ? $pos.parent.child(index)
                    : null;
              if (target?.attrs.id && !ids.includes(target.attrs.id)) {
                replaceDocument(
                  editor,
                  transformBlocks(
                    editor.getJSON(),
                    ids,
                    target.attrs.id,
                    before ? "before" : "after",
                  ),
                );
                changeSelection(ids.filter(Boolean));
              }
            }
            return true;
          }
          if (selected.current.length) {
            if (["Delete", "Backspace"].includes(event.key)) {
              event.preventDefault();
              return deleteSelected();
            }
            if (
              event.key.length === 1 &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey
            ) {
              deleteSelected(true);
              return false;
            }
            if (event.key === "Escape") {
              changeSelection([]);
              return true;
            }
          }
          if (event.key === "Escape") {
            setMenu(null);
            setEmoji(false);
            return false;
          }
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "f"
          ) {
            event.preventDefault();
            setFindOpen((v) => !v);
            return true;
          }
          if (
            event.key === "/" &&
            !event.ctrlKey &&
            !event.metaKey &&
            !view.state.selection.$from.parent.textContent
          ) {
            event.preventDefault();
            const rect = view.coordsAtPos(view.state.selection.from);
            saveSelection();
            setMenu({
              type: "insert",
              x: rect.left,
              y: rect.bottom + 6,
              slash: true,
            });
            return true;
          }
          if (event.key === "Tab" && !editor.isActive("table")) {
            event.preventDefault();
            if (event.shiftKey) return exitOutline(editor);
            const item = currentBlock(editor);
            if (!item) return true;
            const pos = item.pos,
              $pos = editor.state.doc.resolve(pos),
              index = $pos.index();
            if (index > 0) {
              const prev = $pos.parent.child(index - 1);
              replaceDocument(
                editor,
                transformBlocks(
                  editor.getJSON(),
                  [item.node.attrs.id],
                  prev.attrs.id,
                  "inside",
                ),
              );
            }
            return true;
          }
          return false;
        },
      }),
    ],
    [userId],
  );
  const editor = useEditor({
    extensions,
    content: page.document,
    shouldRerenderOnTransaction: false,
    enableContentCheck: true,
    editorProps: {
      attributes: {
        class: "mf3-prose",
        "aria-label": "문서 본문",
        spellcheck: "false",
      },
      transformPastedHTML: (html) => html,
    },
    onContentError: () => {
      invalidContent.current = true;
      callbacks.current.onError(
        "지원되지 않는 문서 구조입니다. 원본을 보존하고 편집을 잠갔습니다.",
      );
    },
    onCreate: ({ editor: next }) => {
      if (invalidContent.current) next.setEditable(false);
    },
    onUpdate: ({ editor: next }) => {
      if (suppress.current || invalidContent.current) return;
      const json = next.getJSON();
      lastDocument.current = JSON.stringify(json);
      dirty.current = json;
      callbacks.current.onComposition(true);
      clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(flush, 450);
    },
    onSelectionUpdate: () => {
      if (!dragRef.current && selected.current.length) changeSelection([]);
    },
    onTransaction: ({ editor: next, transaction }) => {
      if (!transaction.docChanged || !selected.current.length) return;
      const existing = new Set();
      next.state.doc.descendants((node) => {
        if (node.attrs.id) existing.add(node.attrs.id);
      });
      const ids = selected.current.filter((id) => existing.has(id));
      if (ids.length !== selected.current.length) changeSelection(ids);
    },
  });
  editorRef.current = editor;
  const active =
    useEditorState({
      editor,
      selector: ({ editor: e }) =>
        e
          ? {
              bold: e.isActive("bold"),
              italic: e.isActive("italic"),
              underline: e.isActive("underline"),
              strike: e.isActive("strike"),
              mask: e.isActive("mask"),
              table: e.isActive("table"),
              color: e.getAttributes("textStyle").color || "",
              kind: e.getAttributes("paragraph").kind || "text",
              image: e.isActive("image"),
            }
          : {},
    }) || {};

  useImperativeHandle(ref, () => ({ flush, editor }), [editor]);
  useEffect(() => () => flush(), []);
  useEffect(() => {
    const save = () => flush();
    window.addEventListener("mindfold:flush", save);
    window.addEventListener("pagehide", save);
    const hidden = () => {
      if (document.hidden) flush();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("mindfold:flush", save);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  useEffect(() => {
    if (!editor) return;
    const incoming = JSON.stringify(page.document);
    if (
      incoming === lastDocument.current ||
      dirty.current ||
      editor.view.composing
    )
      return;
    const selection = editor.state.selection;
    suppress.current = true;
    try {
      editor.schema.nodeFromJSON(page.document).check();
      editor
        .chain()
        .setContent(page.document, {
          emitUpdate: false,
          errorOnInvalidContent: true,
        })
        .command(({ tr }) => {
          tr.setMeta("addToHistory", false);
          return true;
        })
        .run();
      editor.commands.setTextSelection({
        from: Math.min(selection.from, editor.state.doc.content.size),
        to: Math.min(selection.to, editor.state.doc.content.size),
      });
      lastDocument.current = incoming;
    } catch (error) {
      callbacks.current.onError(`문서 표시 실패: ${error.message}`);
    } finally {
      suppress.current = false;
    }
  }, [editor, page.document]);

  const saveSelection = () => {
    if (editorRef.current)
      selectionBookmark.current =
        editorRef.current.state.selection.getBookmark();
  };
  const restoreSelection = () => {
    const e = editorRef.current;
    if (!e) return;
    try {
      if (selectionBookmark.current)
        e.view.dispatch(
          e.state.tr.setSelection(
            selectionBookmark.current.resolve(e.state.doc),
          ),
        );
    } catch {
      /* A remote update can invalidate an old menu bookmark. */
    }
    e.view.focus();
  };
  const run = (command) => {
    restoreSelection();
    command();
    setMenu(null);
    setEmoji(false);
  };
  const openMenu = (type, event) => {
    saveSelection();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu((v) =>
      v?.type === type ? null : { type, x: rect.left, y: rect.bottom + 6 },
    );
    setEmoji(false);
  };
  const handleError = (error) =>
    callbacks.current.onError(error.message || String(error));
  async function insertImages(files) {
    const e = editorRef.current;
    if (!e) return;
    const bookmark = e.state.selection.getBookmark(),
      targetId = replaceImageId.current;
    replaceImageId.current = "";
    try {
      const images = [];
      for (const file of files) {
        const record = await addImage(userId, file);
        images.push({
          type: "image",
          attrs: {
            id: uid(),
            assetId: record.id,
            src: "",
            alt: record.name,
            width: 70,
            align: "left",
            caption: "",
          },
        });
      }
      if (e.isDestroyed) return;
      try {
        e.view.dispatch(e.state.tr.setSelection(bookmark.resolve(e.state.doc)));
      } catch {
        /* Insert at the current caret if the document changed. */
      }
      const target = targetId && findPosition(e, targetId);
      if (target)
        e.view.dispatch(
          e.state.tr.setNodeMarkup(target.pos, undefined, {
            ...target.node.attrs,
            assetId: images[0].attrs.assetId,
            src: "",
            alt: target.node.attrs.caption || images[0].attrs.alt,
          }),
        );
      else
        e.chain()
          .focus()
          .insertContent([...images, blankText()])
          .run();
    } catch (error) {
      handleError(error);
    }
  }
  const contextMenu = (event) => {
    if (!editor || !event.target.closest(".mf3-prose")) return;
    event.preventDefault();
    const image = event.target.closest(".mf3-image");
    if (image) {
      saveSelection();
      setMenu({
        type: "block",
        id: image.dataset.mfId,
        x: event.clientX,
        y: event.clientY,
      });
      return;
    }
    const mask = event.target.closest("[data-mask]");
    if (editor.state.selection.empty && mask) {
      const at = editor.view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      });
      if (at) editor.commands.setTextSelection(at.pos);
      editor.commands.extendMarkRange("mask");
    }
    saveSelection();
    setMenu({
      type: editor.isActive("table") ? "table" : "text",
      x: event.clientX,
      y: event.clientY,
    });
  };

  useEffect(() => {
    if (!editor || !rootRef.current) return;
    const root = rootRef.current;
    const blockMenu = (event) => {
      if (Date.now() < suppressClick.current) return;
      saveSelection();
      setMenu({
        type: "block",
        id: event.detail.id,
        x: event.detail.event.clientX,
        y: event.detail.event.clientY + 12,
      });
    };
    const previewImage = (event) => setPreview(event.detail);
    const begin = (event) => {
      const { event: pointer, id } = event.detail;
      if (pointer.button !== 0) return;
      pointer.preventDefault();
      pointer.stopPropagation();
      const ids = selected.current.includes(id) ? [...selected.current] : [id];
      const origin = { x: pointer.clientX, y: pointer.clientY };
      let started = false;
      const move = (e) => {
        if (
          !started &&
          Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < 6
        )
          return;
        started = true;
        e.preventDefault();
        setMenu(null);
        const element = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest("[data-mf-id]");
        const target = element?.dataset.mfId,
          rect = element?.getBoundingClientRect();
        let placement = "after";
        if (rect) {
          placement =
            e.clientY < rect.top + rect.height / 2 ? "before" : "after";
          if (
            e.clientX > rect.left + 55 &&
            e.clientY > rect.top + rect.height * 0.25 &&
            e.clientY < rect.bottom - rect.height * 0.25 &&
            ["paragraph", "outline"].includes(
              findPosition(editor, target)?.node.type.name,
            )
          )
            placement = "inside";
        }
        const state = {
          ids,
          target,
          placement,
          x: e.clientX,
          y: e.clientY,
          rect: rect
            ? {
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
              }
            : null,
          text:
            ids.length > 1
              ? `${ids.length}개 블록`
              : (findPosition(editor, id)?.node.textContent || "빈 블록").slice(
                  0,
                  45,
                ),
        };
        dragRef.current = state;
        setDrag(state);
        if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 14);
        else if (e.clientY < 100) window.scrollBy(0, -14);
      };
      const end = (e) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        const state = dragRef.current;
        dragRef.current = null;
        setDrag(null);
        if (started) {
          suppressClick.current = Date.now() + 300;
          if (
            state?.target &&
            !ids.includes(state.target) &&
            e.type !== "pointercancel"
          ) {
            changeSelection([]);
            replaceDocument(
              editor,
              transformBlocks(
                editor.getJSON(),
                ids,
                state.target,
                state.placement,
              ),
            );
          }
        } else if (pointer.ctrlKey || pointer.metaKey)
          changeSelection(
            selected.current.includes(id)
              ? selected.current.filter((v) => v !== id)
              : [...selected.current, id],
          );
      };
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    };
    root.addEventListener("mf:blockmenu", blockMenu);
    root.addEventListener("mf:handle", begin);
    root.addEventListener("mf:preview", previewImage);
    return () => {
      root.removeEventListener("mf:blockmenu", blockMenu);
      root.removeEventListener("mf:handle", begin);
      root.removeEventListener("mf:preview", previewImage);
    };
  }, [editor]);
  useEffect(() => {
    if (!menu && !emoji) return;
    const close = (event) => {
      if (
        !event.target.closest(
          ".mf3-popover, .mf3-toolbar, .mf3-sheet, .mf3-block-handle",
        )
      ) {
        setMenu(null);
        setEmoji(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu, emoji]);

  const beginMarquee = (event) => {
    if (
      event.button !== 0 ||
      event.pointerType === "touch" ||
      event.target.closest(
        "button,input,textarea,.mf3-text-content,.mf3-toggle,.mf3-block-handle,.mf3-image,td,th,.mf3-popover,.mf3-sheet",
      )
    )
      return;
    if (!event.target.closest(".mf3-editing-surface")) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY };
    const previous = event.ctrlKey || event.metaKey ? selected.current : [];
    let moved = false;
    const move = (e) => {
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5)
        return;
      moved = true;
      e.preventDefault();
      const box = {
        left: Math.min(start.x, e.clientX),
        top: Math.min(start.y, e.clientY),
        right: Math.max(start.x, e.clientX),
        bottom: Math.max(start.y, e.clientY),
      };
      setMarquee(box);
      const hits = [...rootRef.current.querySelectorAll("[data-mf-id]")]
        .filter((element) => {
          if (
            element.matches(".mf3-columns") ||
            element.closest(
              'td,th,.mf3-outline[data-open="false"] [data-outline-body]',
            ) ||
            element.parentElement.matches(".mf3-outline-content")
          )
            return false;
          const target = element.matches(".mf3-outline")
            ? element.querySelector(".mf3-outline-content > .mf3-text")
            : element;
          const rect = target?.getBoundingClientRect();
          return (
            rect?.width &&
            rect.height &&
            rect.left < box.right &&
            rect.right > box.left &&
            rect.top < box.bottom &&
            rect.bottom > box.top
          );
        })
        .map((element) => element.dataset.mfId);
      changeSelection([...new Set([...previous, ...hits])]);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      setMarquee(null);
      if (!moved) changeSelection([]);
      editor.view.focus();
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end, { once: true });
  };
  const openLink = () => {
    saveSelection();
    setDialog({
      title: "링크",
      value: editor.getAttributes("link").href || "",
      commit(value) {
        restoreSelection();
        if (value.trim())
          editor
            .chain()
            .focus()
            .extendMarkRange("link")
            .setLink({ href: value.trim() })
            .run();
        else editor.chain().focus().extendMarkRange("link").unsetLink().run();
      },
    });
    setMenu(null);
  };
  const find = (replaceAll = false) => {
    if (!query || !editor) {
      setFindCount(0);
      return;
    }
    const hits = [];
    editor.state.doc.descendants((node, pos) => {
      if (!node.isTextblock) return;
      const text = node.textBetween(0, node.content.size, "", "\n");
      let from = 0,
        index;
      while (
        (index = text
          .toLocaleLowerCase()
          .indexOf(query.toLocaleLowerCase(), from)) >= 0
      ) {
        hits.push({
          from: pos + 1 + index,
          to: pos + 1 + index + query.length,
        });
        from = index + query.length;
      }
    });
    setFindCount(hits.length);
    if (replaceAll && hits.length) {
      let tr = editor.state.tr;
      hits
        .slice()
        .reverse()
        .forEach((hit) => {
          tr = tr.insertText(replacement, hit.from, hit.to);
        });
      editor.view.dispatch(tr);
    } else {
      const hit =
        hits.find((h) => h.from > editor.state.selection.from) || hits[0];
      if (hit)
        editor.chain().focus().setTextSelection(hit).scrollIntoView().run();
    }
  };
  if (!editor) return <div className="mf3-loading" />;
  const selectedRanges = () => {
    const ranges = [];
    editor.state.doc.descendants((node, pos, parent) => {
      if (selected.current.includes(node.attrs.id)) {
        if (node.isTextblock)
          ranges.push({ from: pos + 1, to: pos + node.nodeSize - 1 });
        else
          node.descendants((child, offset) => {
            if (child.isTextblock)
              ranges.push({
                from: pos + offset + 2,
                to: pos + offset + child.nodeSize,
              });
          });
        return false;
      }
    });
    return ranges;
  };
  const toggleMark = (name) =>
    run(() => {
      if (!selected.current.length)
        return editor.chain().focus().toggleMark(name).run();
      const ranges = selectedRanges(),
        mark = editor.schema.marks[name];
      let all = true;
      ranges.forEach(({ from, to }) =>
        editor.state.doc.nodesBetween(from, to, (node) => {
          if (node.isText && !mark.isInSet(node.marks)) all = false;
        }),
      );
      const tr = editor.state.tr;
      ranges.forEach(({ from, to }) =>
        all
          ? tr.removeMark(from, to, mark)
          : tr.addMark(from, to, mark.create()),
      );
      editor.view.dispatch(tr);
    });
  callbacks.current.formatBlocks = (name) => {
    saveSelection();
    toggleMark(name);
  };
  const applyColor = (color) =>
    run(() => {
      if (!selected.current.length)
        return color
          ? editor.chain().focus().setColor(color).run()
          : editor.chain().focus().unsetColor().run();
      const tr = editor.state.tr,
        mark = editor.schema.marks.textStyle;
      selectedRanges().forEach(({ from, to }) => {
        tr.removeMark(from, to, mark);
        if (color) tr.addMark(from, to, mark.create({ color }));
      });
      editor.view.dispatch(tr);
    });
  const menuStyle = menu
    ? {
        left: Math.min(menu.x, window.innerWidth - 290),
        top: Math.min(menu.y, window.innerHeight - 380),
      }
    : {};
  return (
    <section className="mf3-editor" ref={rootRef} onContextMenu={contextMenu}>
      <div className="mf3-toolbar" role="toolbar" aria-label="문서 편집 도구">
        <div className="mf3-tool-group">
          <IconButton
            icon={Undo2}
            label="실행 취소"
            onClick={() => editor.chain().focus().undo().run()}
          />
          <IconButton
            icon={Redo2}
            label="다시 실행"
            onClick={() => editor.chain().focus().redo().run()}
          />
        </div>
        <button
          className="mf3-type-select"
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={(e) => openMenu("kind", e)}
        >
          {kinds.find(([id]) => id === active.kind)?.[1] || "본문"}
          <ChevronDown size={13} />
        </button>
        <div className="mf3-tool-group">
          <IconButton
            icon={Bold}
            label="굵게"
            active={active.bold}
            onClick={() => {
              saveSelection();
              toggleMark("bold");
            }}
          />
          <IconButton
            icon={Italic}
            label="기울임"
            active={active.italic}
            onClick={() => {
              saveSelection();
              toggleMark("italic");
            }}
          />
          <IconButton
            icon={Underline}
            label="밑줄"
            active={active.underline}
            onClick={() => {
              saveSelection();
              toggleMark("underline");
            }}
          />
          <IconButton
            icon={Strikethrough}
            label="취소선"
            active={active.strike}
            onClick={() => {
              saveSelection();
              toggleMark("strike");
            }}
          />
          <IconButton
            icon={Palette}
            label="글자색"
            onClick={(e) => openMenu("color", e)}
          />
          <IconButton
            icon={EyeOff}
            label="마스킹"
            active={active.mask}
            onClick={() => {
              saveSelection();
              toggleMark("mask");
            }}
          />
          <IconButton icon={Link2} label="링크" onClick={openLink} />
        </div>
        <div className="mf3-tool-group">
          <IconButton
            icon={Table2}
            label="표 삽입·편집"
            active={active.table}
            onClick={(e) =>
              openMenu(active.table ? "table" : "insert-table", e)
            }
          />
          <IconButton
            icon={ImagePlus}
            label="이미지 삽입"
            onClick={() => fileRef.current.click()}
          />
          <IconButton
            icon={Smile}
            label="이모티콘"
            onClick={() => {
              saveSelection();
              setEmoji((v) => !v);
              setMenu(null);
            }}
          />
        </div>
        <div className="mf3-tool-group mf3-toolbar-end">
          <IconButton
            icon={Search}
            label="찾기·바꾸기"
            active={findOpen}
            onClick={() => setFindOpen((v) => !v)}
          />
          <IconButton
            icon={Download}
            label="내보내기·가져오기"
            onClick={(e) => openMenu("export", e)}
          />
          <IconButton
            icon={Printer}
            label="인쇄"
            onClick={() => {
              flush();
              window.print();
            }}
          />
        </div>
      </div>
      {findOpen && (
        <div className="mf3-findbar">
          <input
            aria-label="찾을 내용"
            placeholder="찾기"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") find();
            }}
          />
          <button type="button" onClick={() => find()}>
            다음
          </button>
          <span>{findCount}</span>
          <input
            aria-label="바꿀 내용"
            placeholder="바꾸기"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
          />
          <button type="button" onClick={() => find(true)}>
            모두 바꾸기
          </button>
          <IconButton
            icon={X}
            label="찾기 닫기"
            onClick={() => setFindOpen(false)}
          />
        </div>
      )}
      <div className="mf3-editing-surface" onPointerDown={beginMarquee}>
        <EditorContent editor={editor} />
      </div>
      {selectedCount > 0 && (
        <div className="mf3-selection-status">
          <span>{selectedCount}개 선택</span>
          <IconButton
            icon={Trash2}
            label="선택 블록 삭제"
            onClick={() => deleteSelected()}
          />
          <IconButton
            icon={X}
            label="선택 해제"
            onClick={() => changeSelection([])}
          />
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        hidden
        onChange={(event) => {
          insertImages([...event.target.files]);
          event.target.value = "";
        }}
      />
      {menu && (
        <div
          className="mf3-popover"
          style={menuStyle}
          onPointerDown={(e) => {
            if (!e.target.closest("input,textarea,select")) e.preventDefault();
          }}
        >
          <div className="mf3-popover-head">
            <span>
              {
                {
                  kind: "블록 유형",
                  block: "블록",
                  color: "글자색",
                  text: "텍스트",
                  table: "표 편집",
                  "insert-table": "표 만들기",
                  insert: "삽입",
                  export: "문서 파일",
                }[menu.type]
              }
            </span>
            <IconButton
              icon={X}
              label="메뉴 닫기"
              onClick={() => setMenu(null)}
            />
          </div>
          {["kind", "block", "insert"].includes(menu.type) && (
            <>
              {!(
                menu.type === "block" &&
                ["image", "table"].includes(
                  findPosition(editor, menu.id)?.node.type.name,
                )
              ) && (
                <>
                  <div className="mf3-menu-items">
                    {kinds.map(([id, label]) => (
                      <button
                        type="button"
                        key={id}
                        onClick={() =>
                          run(() => {
                            const ids = menu.id ? [menu.id] : selected.current;
                            if (ids.length)
                              ids.forEach((blockId) =>
                                setKind(editor, id, blockId),
                              );
                            else setKind(editor, id);
                          })
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="mf3-menu-divider" />
                  <button
                    type="button"
                    className="mf3-menu-row"
                    onClick={() => run(() => toggleOutline(editor, menu.id))}
                  >
                    <ChevronRight size={16} />
                    토글 전환
                  </button>
                  <div className="mf3-column-options">
                    {[1, 2, 3, 4].map((count) => (
                      <button
                        type="button"
                        key={count}
                        onClick={() =>
                          run(() => setColumns(editor, count, menu.id))
                        }
                      >
                        {count}열
                      </button>
                    ))}
                  </div>
                </>
              )}
              {menu.type === "insert" && (
                <>
                  <button
                    className="mf3-menu-row"
                    type="button"
                    onClick={() => setMenu({ ...menu, type: "insert-table" })}
                  >
                    <Table2 size={16} />표
                  </button>
                  <button
                    className="mf3-menu-row"
                    type="button"
                    onClick={() => {
                      setMenu(null);
                      fileRef.current.click();
                    }}
                  >
                    <ImagePlus size={16} />
                    이미지
                  </button>
                  <button
                    className="mf3-menu-row"
                    type="button"
                    onClick={() =>
                      run(() =>
                        editor.chain().focus().setHorizontalRule().run(),
                      )
                    }
                  >
                    <Minus size={16} />
                    구분선
                  </button>
                </>
              )}
              {menu.type === "block" && (
                <>
                  {findPosition(editor, menu.id)?.node.type.name ===
                    "table" && (
                    <button
                      type="button"
                      className="mf3-menu-row"
                      onClick={() => {
                        const item = findPosition(editor, menu.id);
                        if (!item) return;
                        editor.view.dispatch(
                          editor.state.tr.setSelection(
                            TextSelection.near(
                              editor.state.doc.resolve(item.pos + 3),
                            ),
                          ),
                        );
                        editor.view.focus();
                        saveSelection();
                        setMenu({ ...menu, type: "table" });
                      }}
                    >
                      <Table2 size={16} />표 편집
                    </button>
                  )}
                  {findPosition(editor, menu.id)?.node.type.name ===
                    "image" && (
                    <>
                      <div className="mf3-image-align">
                        {[
                          [AlignLeft, "left"],
                          [AlignCenter, "center"],
                          [AlignRight, "right"],
                        ].map(([Icon, align]) => (
                          <IconButton
                            key={align}
                            icon={Icon}
                            label={`${{ left: "왼쪽", center: "가운데", right: "오른쪽" }[align]} 정렬`}
                            onClick={() => {
                              const item = findPosition(editor, menu.id);
                              editor.view.dispatch(
                                editor.state.tr.setNodeMarkup(
                                  item.pos,
                                  undefined,
                                  { ...item.node.attrs, align },
                                ),
                              );
                            }}
                          />
                        ))}
                      </div>
                      <button
                        className="mf3-menu-row"
                        type="button"
                        onClick={() => {
                          const item = findPosition(editor, menu.id);
                          setDialog({
                            title: "이미지 설명",
                            value: item.node.attrs.caption || "",
                            commit(value) {
                              const at = findPosition(editor, menu.id);
                              if (at)
                                editor.view.dispatch(
                                  editor.state.tr.setNodeMarkup(
                                    at.pos,
                                    undefined,
                                    {
                                      ...at.node.attrs,
                                      caption: value,
                                      alt: value || at.node.attrs.alt,
                                    },
                                  ),
                                );
                            },
                          });
                          setMenu(null);
                        }}
                      >
                        설명 편집
                      </button>
                      <button
                        className="mf3-menu-row"
                        type="button"
                        onClick={() => {
                          replaceImageId.current = menu.id;
                          fileRef.current.click();
                          setMenu(null);
                        }}
                      >
                        이미지 교체
                      </button>
                    </>
                  )}
                  <button
                    className="mf3-menu-row"
                    type="button"
                    onClick={() => {
                      const item = findPosition(editor, menu.id);
                      if (item) {
                        const json = copy(item.node.toJSON());
                        const renew = (n) => {
                          if (n.attrs?.id) n.attrs.id = uid();
                          n.content?.forEach(renew);
                        };
                        renew(json);
                        editor.view.dispatch(
                          editor.state.tr.insert(
                            item.pos + item.node.nodeSize,
                            editor.schema.nodeFromJSON(json),
                          ),
                        );
                      }
                      setMenu(null);
                    }}
                  >
                    블록 복제
                  </button>
                  <button
                    className="mf3-menu-row danger"
                    type="button"
                    onClick={() => {
                      changeSelection([menu.id]);
                      deleteSelected();
                      setMenu(null);
                    }}
                  >
                    <Trash2 size={16} />
                    블록 삭제
                  </button>
                </>
              )}
            </>
          )}
          {["color", "text"].includes(menu.type) && (
            <>
              {menu.type === "text" && (
                <div className="mf3-context-tools">
                  {[
                    [Bold, "bold", "굵게"],
                    [Italic, "italic", "기울임"],
                    [Underline, "underline", "밑줄"],
                    [Strikethrough, "strike", "취소선"],
                    [EyeOff, "mask", active.mask ? "마스킹 해제" : "마스킹"],
                  ].map(([Icon, mark, label]) => (
                    <IconButton
                      key={mark}
                      icon={Icon}
                      label={label}
                      active={active[mark]}
                      onClick={() => toggleMark(mark)}
                    />
                  ))}
                  <IconButton icon={Link2} label="링크" onClick={openLink} />
                </div>
              )}
              <div className="mf3-swatches">
                {TEXT_COLOR_OPTIONS.map((color) => (
                  <button
                    type="button"
                    key={color.id}
                    title={color.label}
                    aria-label={`${color.label} 글자색`}
                    className={active.color === color.value ? "is-active" : ""}
                    style={{ "--swatch": color.value }}
                    onClick={() => applyColor(color.value)}
                  >
                    <span />
                    <small>{color.label}</small>
                  </button>
                ))}
              </div>
              <button
                className="mf3-menu-row"
                type="button"
                onClick={() => applyColor(null)}
              >
                기본 글자색
              </button>
            </>
          )}
          {menu.type === "insert-table" && (
            <TablePicker
              onPick={(rows, cols) =>
                run(() =>
                  editor
                    .chain()
                    .focus()
                    .insertTable({ rows, cols, withHeaderRow: true })
                    .run(),
                )
              }
            />
          )}
          {menu.type === "table" && (
            <>
              <div className="mf3-menu-items">
                {[
                  ["위에 행 추가", "addRowBefore"],
                  ["아래에 행 추가", "addRowAfter"],
                  ["왼쪽 열 추가", "addColumnBefore"],
                  ["오른쪽 열 추가", "addColumnAfter"],
                  ["행 삭제", "deleteRow"],
                  ["열 삭제", "deleteColumn"],
                  ["셀 병합", "mergeCells"],
                  ["셀 분리", "splitCell"],
                  ["헤더 행", "toggleHeaderRow"],
                  ["헤더 열", "toggleHeaderColumn"],
                ].map(([label, command]) => (
                  <button
                    type="button"
                    key={command}
                    onClick={() =>
                      run(() => editor.chain().focus()[command]().run())
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mf3-cell-colors">
                {[
                  "transparent",
                  "#f3dfe4",
                  "#dce7f2",
                  "#dfece3",
                  "#f4e8d9",
                  "#e7e0f1",
                ].map((color) => (
                  <button
                    type="button"
                    key={color}
                    aria-label={`${color} 셀 색상`}
                    style={{ background: color }}
                    onClick={() =>
                      run(() =>
                        editor
                          .chain()
                          .focus()
                          .setCellAttribute(
                            "backgroundColor",
                            color === "transparent" ? null : color,
                          )
                          .run(),
                      )
                    }
                  />
                ))}
              </div>
              <button
                className="mf3-menu-row danger"
                type="button"
                onClick={() =>
                  run(() => editor.chain().focus().deleteTable().run())
                }
              >
                <Trash2 size={16} />표 삭제
              </button>
            </>
          )}
          {menu.type === "export" && (
            <>
              {[
                [
                  "ZIP 전체 백업",
                  () => {
                    flush();
                    return onZip();
                  },
                ],
                ["ZIP 백업 가져오기", onImport],
                [
                  "Markdown 내보내기",
                  () => {
                    flush();
                    window.alert(
                      "Markdown에서는 토글·열·색상·마스킹이 동일하게 보존되지 않습니다. 완전한 복원은 ZIP 백업을 사용해 주세요.",
                    );
                    return exportMarkdown(userId, {
                      ...page,
                      document: editor.getJSON(),
                    });
                  },
                ],
                [
                  "HTML 내보내기",
                  () =>
                    exportHTML(
                      editor,
                      { ...page, document: editor.getJSON() },
                      userId,
                    ),
                ],
              ].map(([label, action]) => (
                <button
                  className="mf3-menu-row"
                  type="button"
                  key={label}
                  onClick={async () => {
                    setMenu(null);
                    try {
                      await action();
                    } catch (error) {
                      handleError(error);
                    }
                  }}
                >
                  <Download size={16} />
                  {label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
      {emoji && (
        <div className="mf3-popover mf3-emoji-popover">
          <Suspense fallback={<div className="mf3-loading">불러오는 중</div>}>
            <EmojiPicker
              onPick={(text) =>
                run(() => editor.chain().focus().insertContent(text).run())
              }
            />
          </Suspense>
        </div>
      )}
      {dialog && (
        <div
          className="mf3-overlay"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setDialog(null);
          }}
        >
          <form
            className="mf3-dialog"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                dialog.commit(dialog.value);
                setDialog(null);
              } catch (error) {
                handleError(error);
              }
            }}
          >
            <div className="mf3-dialog-head">
              <strong>{dialog.title}</strong>
              <IconButton
                icon={X}
                label="닫기"
                onClick={() => setDialog(null)}
              />
            </div>
            <input
              autoFocus
              aria-label={dialog.title}
              value={dialog.value}
              onChange={(e) => setDialog({ ...dialog, value: e.target.value })}
            />
            <div className="mf3-dialog-actions">
              <button type="button" onClick={() => setDialog(null)}>
                취소
              </button>
              <button type="submit">적용</button>
            </div>
          </form>
        </div>
      )}
      {preview && (
        <div
          className="mf3-overlay mf3-image-preview"
          onClick={() => setPreview(null)}
        >
          <IconButton
            icon={X}
            label="이미지 닫기"
            onClick={() => setPreview(null)}
          />
          <img src={preview.src} alt={preview.alt} />
        </div>
      )}
      {marquee && (
        <div
          className="mf3-marquee"
          style={{
            left: marquee.left,
            top: marquee.top,
            width: marquee.right - marquee.left,
            height: marquee.bottom - marquee.top,
          }}
        />
      )}
      {drag && (
        <>
          <div
            className="mf3-drag-ghost"
            style={{ left: drag.x + 16, top: drag.y + 10 }}
          >
            {drag.text}
          </div>
          {drag.rect && (
            <div
              className={`mf3-drop-guide ${drag.placement}`}
              style={{
                left: drag.rect.left,
                top:
                  drag.placement === "after" ? drag.rect.bottom : drag.rect.top,
                width: drag.rect.right - drag.rect.left,
                height:
                  drag.placement === "inside"
                    ? drag.rect.bottom - drag.rect.top
                    : 2,
              }}
            />
          )}
        </>
      )}
    </section>
  );
});
function TablePicker({ onPick }) {
  const [size, setSize] = useState([3, 3]);
  return (
    <div className="mf3-table-picker">
      <span>
        {size[0]}행 × {size[1]}열
      </span>
      <div>
        {Array.from({ length: 48 }, (_, i) => {
          const row = Math.floor(i / 8) + 1,
            col = (i % 8) + 1;
          return (
            <button
              type="button"
              key={i}
              className={row <= size[0] && col <= size[1] ? "is-active" : ""}
              aria-label={`${row}행 ${col}열 표`}
              onPointerEnter={() => setSize([row, col])}
              onClick={() => onPick(row, col)}
            />
          );
        })}
      </div>
    </div>
  );
}
export default DocumentEditor;
