import {
  Extension,
  InputRule,
  Mark,
  Node,
  mergeAttributes,
} from "@tiptap/core";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { closeHistory } from "@tiptap/pm/history";
import { TableMap } from "@tiptap/pm/tables";
import { Image } from "@tiptap/extension-image";
import {
  TableCell,
  TableHeader,
  TableRow,
  TableView,
} from "@tiptap/extension-table";
import { blankText, copy, TEXT_COLORS, uid } from "./documentModel.js";
import { resolveAsset } from "./repository.js";

export function findPosition(editor, id) {
  let found = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs.id === id) {
      found = { node, pos };
      return false;
    }
    return found === null;
  });
  return found;
}
export function replaceDocument(editor, json, focusId) {
  const node = editor.schema.nodeFromJSON(json);
  const tr = editor.state.tr.replaceWith(
    0,
    editor.state.doc.content.size,
    node.content,
  );
  let focusPos = null;
  tr.doc.descendants((n, pos) => {
    if (n.attrs.id === focusId && n.isTextblock) focusPos = pos + 1;
  });
  if (focusPos !== null)
    tr.setSelection(TextSelection.create(tr.doc, focusPos));
  else
    tr.setSelection(
      TextSelection.near(
        tr.doc.resolve(
          Math.min(tr.doc.content.size, editor.state.selection.from),
        ),
      ),
    );
  editor.view.dispatch(tr);
  editor.view.focus();
}
export function currentBlock(editor) {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === "paragraph") {
      if (depth > 1 && $from.node(depth - 1).type.name === "outline")
        return {
          node: $from.node(depth - 1),
          pos: $from.before(depth - 1),
          head: node,
          headPos: $from.before(depth),
        };
      return {
        node,
        pos: $from.before(depth),
        head: node,
        headPos: $from.before(depth),
      };
    }
  }
  return null;
}
export function setKind(editor, kind, id = "") {
  const item = id ? findPosition(editor, id) : currentBlock(editor);
  if (!item) return;
  const head =
    item.node.type.name === "outline" ? item.node.firstChild : item.node;
  if (head.type.name !== "paragraph") return;
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(
      item.node.type.name === "outline" ? item.pos + 1 : item.pos,
      undefined,
      { ...head.attrs, kind },
    ),
  );
  editor.view.focus();
}
export function toggleOutline(editor, id = "") {
  const item = id ? findPosition(editor, id) : currentBlock(editor);
  if (!item || !["paragraph", "outline"].includes(item.node.type.name)) return;
  const { node, pos } = item;
  let replacement;
  if (node.type.name === "outline") {
    if (node.attrs.toggle) {
      replacement = node.type.create(
        { ...node.attrs, toggle: false, open: true },
        node.content,
      );
    } else
      replacement = node.type.create(
        { ...node.attrs, toggle: true, open: true },
        node.content,
      );
  } else {
    replacement = editor.schema.nodes.outline.create(
      { id: node.attrs.id, toggle: true, open: true },
      [
        node.type.create(
          { ...node.attrs, id: `${node.attrs.id}:head` },
          node.content,
        ),
        editor.schema.nodes.outlineBody.create(
          null,
          editor.schema.nodes.paragraph.create({ id: uid() }),
        ),
      ],
    );
  }
  const tr = editor.state.tr.replaceWith(pos, pos + node.nodeSize, replacement);
  tr.setSelection(
    TextSelection.near(
      tr.doc.resolve(pos + (replacement.type.name === "outline" ? 2 : 1)),
    ),
  );
  editor.view.dispatch(tr);
  editor.view.focus();
}
export function setColumns(editor, count, id = "") {
  let item = id ? findPosition(editor, id) : currentBlock(editor);
  if (!item) return;
  if (count === 1 && item.node.type.name !== "columnSet") {
    const $pos = editor.state.doc.resolve(item.pos + 1);
    for (let depth = $pos.depth; depth > 0; depth--) {
      if ($pos.node(depth).type.name === "columnSet") {
        item = { node: $pos.node(depth), pos: $pos.before(depth) };
        break;
      }
    }
  }
  let replacement;
  if (item.node.type.name === "columnSet") {
    const children = item.node.content.content.flatMap(
      (c) => c.content.content,
    );
    if (count === 1) replacement = children;
    else {
      const columns = [];
      for (let i = 0; i < count; i++)
        columns.push(
          editor.schema.nodes.column.create(
            null,
            i === 0
              ? children
              : editor.schema.nodes.paragraph.create({ id: uid() }),
          ),
        );
      replacement = editor.schema.nodes.columnSet.create(
        item.node.attrs,
        columns,
      );
    }
  } else if (count > 1) {
    replacement = editor.schema.nodes.columnSet.create(
      { id: uid() },
      Array.from({ length: count }, (_, i) =>
        editor.schema.nodes.column.create(
          null,
          i === 0
            ? item.node
            : editor.schema.nodes.paragraph.create({ id: uid() }),
        ),
      ),
    );
  } else return;
  editor.view.dispatch(
    editor.state.tr.replaceWith(
      item.pos,
      item.pos + item.node.nodeSize,
      replacement,
    ),
  );
  editor.view.focus();
}
export function exitOutline(editor) {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name !== "outlineBody") continue;
    const parentDepth = depth - 1;
    const index = $from.index(depth),
      body = $from.node(depth),
      outline = $from.node(parentDepth);
    const childOffset = body.content.content
      .slice(0, index)
      .reduce((size, node) => size + node.nodeSize, 0);
    const caretOffset =
      editor.state.selection.from - $from.start(depth) - childOffset;
    const children = body.content.content.slice(index);
    const remaining = body.content.content.slice(0, index);
    const nextOutline = outline.type.create(outline.attrs, [
      outline.firstChild,
      body.type.create(
        null,
        remaining.length
          ? remaining
          : editor.schema.nodes.paragraph.create({ id: uid() }),
      ),
    ]);
    const from = $from.before(parentDepth),
      to = from + outline.nodeSize;
    const tr = editor.state.tr.replaceWith(from, to, [
      nextOutline,
      ...children,
    ]);
    tr.setSelection(
      TextSelection.near(
        tr.doc.resolve(from + nextOutline.nodeSize + caretOffset),
      ),
    );
    editor.view.dispatch(tr);
    editor.view.focus();
    return true;
  }
  return false;
}

function emit(dom, name, detail) {
  dom.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
}
function handle(dom, getPos, node) {
  const button = document.createElement("button");
  button.className = "mf3-block-handle";
  button.type = "button";
  button.contentEditable = "false";
  button.title = "블록 메뉴 · 끌어서 이동";
  button.setAttribute("aria-label", "블록 메뉴");
  button.innerHTML = "<span></span><span></span>";
  button.addEventListener("pointerdown", (event) => {
    if (event.button === 0)
      emit(dom, "mf:handle", { event, pos: getPos(), id: node().attrs.id });
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    emit(dom, "mf:blockmenu", { event, pos: getPos(), id: node().attrs.id });
  });
  return button;
}

function resizeControls(dom, label, start) {
  const controls = document.createElement("div");
  controls.className = "mf3-resize-controls";
  controls.contentEditable = "false";
  for (const [edge, action] of [
    ["right", "너비"],
    ["bottom", "높이"],
    ["corner", "크기"],
  ]) {
    const button = document.createElement("button");
    button.className = `mf3-resize-edge mf3-resize-${edge}`;
    button.type = "button";
    button.title = `${label} ${action} 조절`;
    button.setAttribute("aria-label", button.title);
    button.addEventListener("pointerdown", (event) => {
      if (event.button === 0) start(event, edge);
    });
    controls.appendChild(button);
  }
  dom.appendChild(controls);
  return controls;
}

function resizeGesture(event, move, end) {
  event.preventDefault();
  event.stopPropagation();
  const pointerId = event.pointerId;
  const onMove = (next) => {
    if (next.pointerId !== pointerId) return;
    next.preventDefault();
    move(next);
  };
  const cleanup = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", finish);
  };
  const finish = (next) => {
    if (next.pointerId !== pointerId) return;
    cleanup();
    end(next.type === "pointercancel");
  };
  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);
  return cleanup;
}

export const SizedTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      height: {
        default: null,
        parseHTML: (element) => parseFloat(element.style.height) || null,
        renderHTML: ({ height }) =>
          Number.isFinite(height) && height > 0
            ? { style: `height:${height}px` }
            : {},
      },
    };
  },
});

export class MindfoldTableView extends TableView {
  constructor(node, cellMinWidth, view, HTMLAttributes) {
    super(node, cellMinWidth, view, HTMLAttributes);
    this.view = view;
    this.wrapper = this.dom;
    this.dom = document.createElement("div");
    this.dom.className = "mf3-table";
    this.dom.appendChild(this.wrapper);
    this.getPos = () => {
      let found;
      this.view.state.doc.descendants((child, pos) => {
        if (child.attrs.id === this.node.attrs.id) {
          found = pos;
          return false;
        }
        return found === undefined;
      });
      return found;
    };
    this.grip = handle(this.dom, this.getPos, () => this.node);
    this.grip.setAttribute("aria-label", "표 블록 메뉴");
    this.grip.title = "표 메뉴 · 끌어서 이동";
    this.dom.appendChild(this.grip);
    this.controls = resizeControls(this.dom, "표", (event, edge) =>
      this.startResize(event, edge),
    );
    this.paint();
  }

  paint() {
    this.dom.dataset.mfId = this.node.attrs.id || "";
    // Collapsed cell borders add one pixel beyond the sum of column widths.
    this.dom.style.width = this.table.style.width
      ? `calc(${this.table.style.width} + 1px)`
      : "100%";
  }

  update(node) {
    if (!super.update(node)) return false;
    this.paint();
    return true;
  }

  startResize(event, edge) {
    this.stopResize?.();
    const sourceNode = this.node;
    const initial = this.table.getBoundingClientRect();
    const widths = [...this.colgroup.children].map((col) =>
      Math.max(this.cellMinWidth, col.getBoundingClientRect().width),
    );
    const rows = [...this.contentDOM.children];
    const heights = rows.map((row) => row.getBoundingClientRect().height);
    const horizontal = edge !== "bottom";
    const vertical = edge !== "right";
    let nextWidths = widths;
    let nextHeights = heights;
    let moved = false;
    this.dom.classList.add("is-resizing");
    this.stopResize = resizeGesture(
      event,
      (next) => {
        moved = true;
        if (horizontal) {
          const total = Math.max(
            widths.length * this.cellMinWidth,
            Math.min(10000, initial.width + next.clientX - event.clientX),
          );
          nextWidths = widths.map((width) =>
            Math.max(
              this.cellMinWidth,
              Math.round((width * total) / initial.width),
            ),
          );
          [...this.colgroup.children].forEach((col, index) => {
            col.style.width = `${nextWidths[index]}px`;
          });
          const width = `${nextWidths.reduce((sum, value) => sum + value, 0)}px`;
          this.table.style.width = width;
          this.table.style.minWidth = "";
          this.dom.style.width = `calc(${width} + 1px)`;
        }
        if (vertical) {
          const scale = Math.max(
            0.1,
            (initial.height + next.clientY - event.clientY) / initial.height,
          );
          nextHeights = heights.map((height) =>
            Math.max(32, Math.min(2000, Math.round(height * scale))),
          );
          rows.forEach((row, index) => {
            row.style.height = `${nextHeights[index]}px`;
          });
        }
      },
      (cancelled) => {
        this.stopResize = null;
        this.dom.classList.remove("is-resizing");
        const pos = this.getPos();
        const node = pos === undefined ? null : this.view.state.doc.nodeAt(pos);
        if (
          !cancelled &&
          moved &&
          node === sourceNode &&
          !this.view.isDestroyed
        ) {
          // TableMap keeps widths correct for merged cells and row spans.
          const map = TableMap.get(node);
          const tr = closeHistory(this.view.state.tr);
          node.forEach((row, rowOffset, rowIndex) => {
            const rowPos = pos + 1 + rowOffset;
            if (vertical)
              tr.setNodeMarkup(rowPos, undefined, {
                ...row.attrs,
                height: nextHeights[rowIndex],
              });
            if (horizontal)
              row.forEach((cell, cellOffset) => {
                const relative = rowOffset + 1 + cellOffset;
                const rect = map.findCell(relative);
                tr.setNodeMarkup(pos + 1 + relative, undefined, {
                  ...cell.attrs,
                  colwidth: nextWidths.slice(rect.left, rect.right),
                });
              });
          });
          this.view.dispatch(tr);
        } else {
          super.update(this.node);
          rows.forEach((row, index) => {
            const height =
              index < this.node.childCount
                ? this.node.child(index).attrs.height
                : null;
            row.style.height = height ? `${height}px` : "";
          });
          this.paint();
        }
      },
    );
  }

  stopEvent(event) {
    return (
      this.grip.contains(event.target) || this.controls.contains(event.target)
    );
  }

  ignoreMutation(mutation) {
    if (
      this.stopResize &&
      mutation.type === "attributes" &&
      mutation.attributeName === "style" &&
      mutation.target.parentNode === this.contentDOM
    )
      return true;
    return super.ignoreMutation(mutation);
  }

  destroy() {
    this.stopResize?.();
  }
}

export const MindParagraph = Paragraph.extend({
  addAttributes() {
    return {
      id: { default: null },
      kind: { default: "text" },
      color: { default: "black" },
      checked: { default: false },
    };
  },
  parseHTML() {
    return [
      { tag: "p" },
      ...[1, 2, 3, 4].map((n) => ({
        tag: `h${n}`,
        getAttrs: () => ({ kind: `heading-${n}` }),
      })),
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "p",
      mergeAttributes(HTMLAttributes, {
        "data-mf-id": node.attrs.id,
        "data-kind": node.attrs.kind,
        style: `color:${TEXT_COLORS[node.attrs.color] || TEXT_COLORS.black}`,
      }),
      0,
    ];
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node;
      const dom = document.createElement("div"),
        contentDOM = document.createElement("div"),
        check = document.createElement("button");
      dom.className = "mf3-text";
      contentDOM.className = "mf3-text-content";
      const grip = handle(dom, getPos, () => current);
      check.className = "mf3-check";
      check.type = "button";
      check.contentEditable = "false";
      check.setAttribute("role", "checkbox");
      check.setAttribute("aria-label", "완료");
      check.addEventListener("pointerdown", (event) => event.preventDefault());
      check.addEventListener("click", () =>
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(getPos(), undefined, {
            ...current.attrs,
            checked: !current.attrs.checked,
          }),
        ),
      );
      dom.append(grip, check, contentDOM);
      const paint = () => {
        dom.dataset.mfId = current.attrs.id || "";
        dom.dataset.kind = current.attrs.kind;
        dom.dataset.checked = String(current.attrs.checked);
        dom.style.color = TEXT_COLORS[current.attrs.color] || TEXT_COLORS.black;
        check.hidden = current.attrs.kind !== "check";
        check.setAttribute("aria-checked", String(current.attrs.checked));
        check.textContent = current.attrs.checked ? "✓" : "";
      };
      paint();
      return {
        dom,
        contentDOM,
        update(next) {
          if (next.type !== current.type) return false;
          current = next;
          paint();
          return true;
        },
        stopEvent(event) {
          return grip.contains(event.target) || check.contains(event.target);
        },
        ignoreMutation(mutation) {
          return (
            mutation.type !== "selection" &&
            !contentDOM.contains(mutation.target)
          );
        },
      };
    };
  },
});

export const Outline = Node.create({
  name: "outline",
  group: "block",
  content: "paragraph outlineBody",
  defining: true,
  addAttributes() {
    return {
      id: { default: null },
      toggle: { default: true },
      open: { default: true },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-outline]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-outline": "" }), 0];
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node;
      const dom = document.createElement("div"),
        contentDOM = document.createElement("div"),
        button = document.createElement("button");
      dom.className = "mf3-outline";
      contentDOM.className = "mf3-outline-content";
      button.className = "mf3-toggle";
      button.type = "button";
      button.contentEditable = "false";
      button.setAttribute("aria-label", "토글 열고 닫기");
      const grip = handle(dom, getPos, () => current);
      button.addEventListener("pointerdown", (e) => e.preventDefault());
      button.addEventListener("click", () =>
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(getPos(), undefined, {
            ...current.attrs,
            open: !current.attrs.open,
          }),
        ),
      );
      dom.append(grip, button, contentDOM);
      const paint = () => {
        dom.dataset.mfId = current.attrs.id || "";
        dom.dataset.open = String(current.attrs.open);
        dom.dataset.toggle = String(current.attrs.toggle);
        button.hidden = !current.attrs.toggle;
        button.textContent = current.attrs.open ? "▾" : "▸";
        button.setAttribute("aria-expanded", String(current.attrs.open));
      };
      const observer = new ResizeObserver(() => {
        const head = contentDOM.firstElementChild;
        if (head) {
          const top = Math.max(0, head.getBoundingClientRect().height / 2 - 12);
          button.style.top = `${top}px`;
          grip.style.top = `${top}px`;
        }
      });
      observer.observe(contentDOM);
      paint();
      return {
        dom,
        contentDOM,
        update(next) {
          if (next.type !== current.type) return false;
          current = next;
          paint();
          return true;
        },
        stopEvent(e) {
          return button.contains(e.target) || grip.contains(e.target);
        },
        ignoreMutation(m) {
          return m.type !== "selection" && !contentDOM.contains(m.target);
        },
        destroy() {
          observer.disconnect();
        },
      };
    };
  },
});
export const OutlineBody = Node.create({
  name: "outlineBody",
  content: "block+",
  defining: true,
  parseHTML: () => [{ tag: "div[data-outline-body]" }],
  renderHTML: () => [
    "div",
    { "data-outline-body": "", class: "mf3-outline-body" },
    0,
  ],
});
export const Column = Node.create({
  name: "column",
  content: "block+",
  isolating: true,
  parseHTML: () => [{ tag: "div[data-column]" }],
  renderHTML: () => ["div", { "data-column": "", class: "mf3-column" }, 0],
});
export const ColumnSet = Node.create({
  name: "columnSet",
  group: "block",
  content: "column{2,4}",
  defining: true,
  isolating: true,
  addAttributes: () => ({ id: { default: null } }),
  parseHTML: () => [{ tag: "div[data-columns]" }],
  addNodeView() {
    return ({ node }) => {
      let current = node;
      const dom = document.createElement("div");
      dom.className = "mf3-columns";
      const paint = () => {
        dom.dataset.mfId = current.attrs.id || "";
        dom.dataset.columns = String(current.childCount);
        dom.style.setProperty("--columns", current.childCount);
      };
      paint();
      return {
        dom,
        contentDOM: dom,
        update(next) {
          if (next.type !== current.type) return false;
          current = next;
          paint();
          return true;
        },
        ignoreMutation(mutation) {
          return mutation.type === "attributes" && mutation.target === dom;
        },
      };
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-columns": node.childCount,
        "data-mf-id": node.attrs.id,
        class: "mf3-columns",
        style: `--columns:${node.childCount}`,
      }),
      0,
    ];
  },
});
export const Mask = Mark.create({
  name: "mask",
  inclusive: false,
  parseHTML: () => [{ tag: "span[data-mask]" }],
  renderHTML: () => ["span", { "data-mask": "", class: "mf3-mask" }, 0],
});

const cellAttributes = () => ({
  backgroundColor: {
    default: null,
    parseHTML: (element) => element.style.backgroundColor || null,
    renderHTML: (attrs) =>
      attrs.backgroundColor
        ? { style: `background-color:${attrs.backgroundColor}` }
        : {},
  },
});
export const ColoredCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes() };
  },
});
export const ColoredHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes() };
  },
});

export function AssetImage(userId) {
  return Image.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        id: { default: null },
        assetId: { default: null },
        width: { default: 100 },
        align: { default: "left" },
        caption: { default: "" },
      };
    },
    renderHTML({ node, HTMLAttributes }) {
      return [
        "figure",
        {
          "data-mf-id": node.attrs.id,
          style: `width:${node.attrs.width}%;${node.attrs.align === "center" ? "margin-left:auto;margin-right:auto" : `margin-${node.attrs.align === "right" ? "left" : "right"}:auto`}`,
        },
        [
          "img",
          mergeAttributes(HTMLAttributes, { style: "width:100%;height:auto" }),
        ],
        ["figcaption", {}, node.attrs.caption || ""],
      ];
    },
    addNodeView() {
      return ({ node, getPos, editor }) => {
        let current = node,
          sourceId = "",
          sourceUrl = "",
          stopResize = null,
          alive = true;
        const dom = document.createElement("figure"),
          img = document.createElement("img"),
          caption = document.createElement("figcaption");
        dom.className = "mf3-image";
        dom.contentEditable = "false";
        const grip = handle(dom, getPos, () => current);
        grip.setAttribute("aria-label", "이미지 블록 메뉴");
        grip.title = "이미지 메뉴 · 끌어서 이동";
        dom.append(grip, img, caption);
        const paint = async () => {
          dom.dataset.mfId = current.attrs.id || "";
          dom.dataset.align = current.attrs.align;
          dom.style.width = `${Math.min(100, Math.max(10, current.attrs.width || 100))}%`;
          caption.textContent = current.attrs.caption;
          caption.hidden = !current.attrs.caption;
          img.alt = current.attrs.alt || "";
          if (sourceId === current.attrs.assetId) return;
          sourceId = current.attrs.assetId;
          const pending = sourceId;
          try {
            const url = pending
              ? await resolveAsset(userId, pending)
              : current.attrs.src;
            if (!alive || sourceId !== pending) {
              if (pending) URL.revokeObjectURL(url);
              return;
            }
            if (sourceUrl) URL.revokeObjectURL(sourceUrl);
            sourceUrl = pending ? url : "";
            img.src = url;
            dom.classList.remove("has-error");
          } catch {
            if (alive && sourceId === pending) {
              sourceId = "";
              dom.classList.add("has-error");
              img.alt = "이미지를 불러오지 못했습니다. 다시 연결해 주세요.";
            }
          }
        };
        const retry = () => {
          if (dom.classList.contains("has-error")) paint();
        };
        window.addEventListener("online", retry);
        img.addEventListener("dblclick", () =>
          emit(dom, "mf:preview", { src: img.src, alt: img.alt }),
        );
        const controls = resizeControls(dom, "이미지", (event, edge) => {
          stopResize?.();
          const start = event.clientX,
            startY = event.clientY,
            rect = img.getBoundingClientRect(),
            width = rect.width,
            aspect = width / (rect.height || width),
            available = dom.parentElement.getBoundingClientRect().width;
          let moved = false;
          dom.classList.add("is-resizing");
          stopResize = resizeGesture(
            event,
            (next) => {
              const dx = next.clientX - start,
                dy = (next.clientY - startY) * aspect;
              const delta =
                edge === "right"
                  ? dx
                  : edge === "bottom"
                    ? dy
                    : Math.abs(dx) > Math.abs(dy)
                      ? dx
                      : dy;
              moved = true;
              dom.style.width = `${Math.min(100, Math.max(10, ((width + delta) / available) * 100))}%`;
            },
            (cancelled) => {
              stopResize = null;
              dom.classList.remove("is-resizing");
              const pos = getPos();
              if (
                !cancelled &&
                moved &&
                alive &&
                !editor.isDestroyed &&
                pos !== undefined
              ) {
                editor.view.dispatch(
                  closeHistory(editor.state.tr).setNodeMarkup(pos, undefined, {
                    ...current.attrs,
                    width: parseFloat(dom.style.width),
                  }),
                );
              } else if (alive) paint();
            },
          );
        });
        paint();
        return {
          dom,
          update(next) {
            if (next.type !== current.type) return false;
            current = next;
            paint();
            return true;
          },
          stopEvent(e) {
            return controls.contains(e.target) || grip.contains(e.target);
          },
          destroy() {
            alive = false;
            stopResize?.();
            window.removeEventListener("online", retry);
            if (sourceUrl) URL.revokeObjectURL(sourceUrl);
          },
        };
      };
    },
  });
}

export function MindfoldBehavior(callbacks) {
  return Extension.create({
    name: "mindfoldBehavior",
    priority: 1000,
    addGlobalAttributes() {
      return [
        {
          types: ["horizontalRule", "table"],
          attributes: {
            id: {
              default: null,
              renderHTML: (attrs) => ({ "data-mf-id": attrs.id }),
            },
          },
        },
      ];
    },
    addKeyboardShortcuts() {
      const editor = this.editor;
      return {
        "Mod-Shift-m": () => editor.commands.toggleMark("mask"),
        "Mod-Enter": () => {
          const { $from } = editor.state.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth);
            if (node.type.name !== "outline" || !node.attrs.toggle) continue;
            const pos = $from.before(depth),
              tr = editor.state.tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                open: !node.attrs.open,
              });
            if (node.attrs.open)
              tr.setSelection(
                TextSelection.near(
                  tr.doc.resolve(pos + node.firstChild.nodeSize),
                ),
              );
            editor.view.dispatch(tr);
            return true;
          }
          return false;
        },
        "Shift-Enter": () =>
          exitOutline(editor) || editor.commands.setHardBreak(),
        Enter: () => {
          if (editor.view.composing) return false;
          const item = currentBlock(editor);
          if (!editor.state.selection.empty) return false;
          if (
            item?.node.type.name === "paragraph" &&
            !item.node.content.size &&
            item.node.attrs.kind !== "text"
          ) {
            setKind(editor, "text");
            return true;
          }
          if (item?.node.type.name !== "outline") return false;
          if (item.node.attrs.open) {
            const headEnd = item.pos + 1 + item.node.firstChild.nodeSize;
            const offset = editor.state.selection.$from.parentOffset;
            const suffix = item.node.firstChild.content.cut(offset);
            const tr = editor.state.tr.delete(
              editor.state.selection.from,
              headEnd - 1,
            );
            const insertion =
              item.pos + tr.doc.nodeAt(item.pos).firstChild.nodeSize + 2;
            const child = editor.schema.nodes.paragraph.create(
              { id: uid() },
              suffix,
            );
            const body = tr.doc.nodeAt(item.pos).lastChild;
            if (
              body.childCount === 1 &&
              body.firstChild.type.name === "paragraph" &&
              !body.firstChild.content.size
            )
              tr.replaceWith(
                insertion,
                insertion + body.firstChild.nodeSize,
                child,
              );
            else tr.insert(insertion, child);
            tr.setSelection(TextSelection.near(tr.doc.resolve(insertion + 1)));
            editor.view.dispatch(tr);
            return true;
          }
          const suffix = item.head.content.cut(
            editor.state.selection.$from.parentOffset,
          );
          const next = editor.schema.nodes.outline.create(
            {
              id: uid(),
              toggle: item.node.attrs.toggle,
              open: !item.node.attrs.toggle,
            },
            [
              editor.schema.nodes.paragraph.create(
                { ...item.head.attrs, id: uid(), checked: false },
                suffix,
              ),
              editor.schema.nodes.outlineBody.create(
                null,
                editor.schema.nodes.paragraph.create({ id: uid() }),
              ),
            ],
          );
          const tr = editor.state.tr.delete(
            editor.state.selection.from,
            item.pos + item.head.nodeSize,
          );
          const pos = item.pos + tr.doc.nodeAt(item.pos).nodeSize;
          tr.insert(pos, next);
          tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 2)));
          editor.view.dispatch(tr);
          return true;
        },
        Backspace: () => {
          if (callbacks.deleteSelected()) return true;
          const { $from, empty } = editor.state.selection;
          if (
            !empty ||
            $from.parentOffset !== 0 ||
            $from.parent.type.name !== "paragraph"
          )
            return false;
          if ($from.parent.attrs.kind !== "text") {
            setKind(editor, "text");
            return true;
          }
          if ($from.parent.content.size) return false;
          if (
            $from.depth > 1 &&
            $from.node($from.depth - 1).type.name === "column" &&
            $from.node($from.depth - 1).childCount === 1
          ) {
            const depth = $from.depth - 2,
              set = $from.node(depth),
              from = $from.before(depth);
            const columns = set.content.content.filter(
              (_node, index) => index !== $from.index(depth),
            );
            const replacement =
              columns.length === 1
                ? columns[0].content
                : set.type.create(set.attrs, columns);
            const tr = editor.state.tr.replaceWith(
              from,
              from + set.nodeSize,
              replacement,
            );
            tr.setSelection(TextSelection.near(tr.doc.resolve(from)));
            editor.view.dispatch(tr);
            return true;
          }
          const item = currentBlock(editor);
          if (item?.node.type.name === "outline") {
            const tr = editor.state.tr.replaceWith(
              item.pos,
              item.pos + item.node.nodeSize,
              [
                editor.schema.nodes.paragraph.create({ id: uid() }),
                ...item.node.lastChild.content.content,
              ],
            );
            tr.setSelection(TextSelection.near(tr.doc.resolve(item.pos + 1)));
            editor.view.dispatch(tr);
            return true;
          }
          return exitOutline(editor);
        },
        Delete: () => callbacks.deleteSelected() || false,
      };
    },
    addInputRules() {
      return [
        new InputRule({
          find: /^(#{1,4})\s$/,
          handler: ({ state, range, match }) => {
            const tr = state.tr.delete(range.from, range.to);
            const pos = tr.selection.$from.before();
            tr.setNodeMarkup(pos, undefined, {
              ...tr.selection.$from.parent.attrs,
              kind: `heading-${match[1].length}`,
            });
          },
        }),
        new InputRule({
          find: /^(\*|-|\[\]|\[ \])\s$/,
          handler: ({ state, range, match }) => {
            const tr = state.tr.delete(range.from, range.to);
            tr.setNodeMarkup(tr.selection.$from.before(), undefined, {
              ...tr.selection.$from.parent.attrs,
              kind: match[1].startsWith("[") ? "check" : "bullet",
              checked: false,
            });
          },
        }),
        new InputRule({
          find: /^>\s$/,
          handler: ({ state, range }) => {
            const tr = state.tr.delete(range.from, range.to);
            callbacks.requestToggle(tr);
          },
        }),
        new InputRule({
          find: /^---$/,
          handler: ({ state, range }) => {
            const $from = state.doc.resolve(range.from),
              from = $from.before(),
              node = state.doc.nodeAt(from);
            if (node.type.name !== "paragraph") return null;
            const suffix = node.content.cut(range.to - from - 1);
            const replacement = [
              state.schema.nodes.horizontalRule.create({ id: uid() }),
              state.schema.nodes.paragraph.create({ id: uid() }, suffix),
            ];
            const head =
              $from.depth > 1 &&
              $from.node($from.depth - 1).type.name === "outline";
            const start = head ? $from.before($from.depth - 1) : from,
              original = head ? $from.node($from.depth - 1) : node;
            if (head) replacement.push(...original.lastChild.content.content);
            const tr = state.tr.replaceWith(
              start,
              start + original.nodeSize,
              replacement,
            );
            tr.setSelection(TextSelection.near(tr.doc.resolve(start + 2)));
          },
        }),
      ];
    },
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("mindfold-stable-ids"),
          appendTransaction(transactions, _old, state) {
            if (!transactions.some((t) => t.docChanged)) return null;
            const seen = new Set(),
              tr = state.tr;
            state.doc.descendants((node, pos) => {
              if (!Object.hasOwn(node.attrs, "id")) return;
              if (!node.attrs.id || seen.has(node.attrs.id))
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: uid() });
              seen.add(tr.doc.nodeAt(pos)?.attrs.id);
            });
            return tr.docChanged ? tr : null;
          },
          props: {
            handleKeyDown(view, event) {
              return callbacks.keyDown(view, event);
            },
            handleDOMEvents: {
              compositionstart() {
                callbacks.composition(true);
                return false;
              },
              compositionend() {
                callbacks.composition(false);
                return false;
              },
              paste(_view, event) {
                return callbacks.paste(event);
              },
              drop(_view, event) {
                return callbacks.drop(event);
              },
            },
            decorations(state) {
              const ids = callbacks.selectedIds(),
                decorations = [];
              state.doc.descendants((node, pos) => {
                if (ids.includes(node.attrs.id))
                  decorations.push(
                    Decoration.node(pos, pos + node.nodeSize, {
                      class: "mf3-block-selected",
                    }),
                  );
              });
              return DecorationSet.create(state.doc, decorations);
            },
          },
        }),
      ];
    },
  });
}
