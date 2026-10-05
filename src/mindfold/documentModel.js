import {
  MINDFOLD_SCHEMA_REVISION,
  TEXT_COLOR_OPTIONS,
  TEXT_COLORS,
} from "./model.js";

export { TEXT_COLOR_OPTIONS, TEXT_COLORS };
export const DOCUMENT_VERSION = 3;
export const TRASH_MS = 30 * 24 * 60 * 60 * 1000;
export const uid = () => crypto.randomUUID();
export const copy = (value) => structuredClone(value);
export const blankText = (attrs = {}) => ({
  type: "paragraph",
  attrs: { id: uid(), kind: "text", color: "black", ...attrs },
});
export const blankDoc = () => ({ type: "doc", content: [blankText()] });
export const newPage = (label = "새 페이지") => ({
  id: uid(),
  label,
  icon: "",
  folderId: "",
  favorite: false,
  deletedAt: null,
  revision: 0,
  documentVersion: DOCUMENT_VERSION,
  document: blankDoc(),
});

function richText(block) {
  const text = String(block.text || "");
  const boundaries = [
    ...new Set([
      0,
      text.length,
      ...(block.marks || []).flatMap((r) => [r.start, r.end]),
      ...(block.masks || []).flatMap((r) => [r.start, r.end]),
    ]),
  ]
    .filter((n) => n >= 0 && n <= text.length)
    .sort((a, b) => a - b);
  const content = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i],
      end = boundaries[i + 1];
    if (end <= start) continue;
    const marks = (block.marks || [])
      .filter((r) => r.start <= start && r.end >= end)
      .flatMap((r) =>
        r.type?.startsWith("color-")
          ? [
              {
                type: "textStyle",
                attrs: {
                  color: TEXT_COLORS[r.type.slice(6)] || TEXT_COLORS.black,
                },
              },
            ]
          : ["bold", "italic", "underline", "strike"].includes(r.type)
            ? [{ type: r.type }]
            : [],
      );
    if ((block.masks || []).some((r) => r.start <= start && r.end >= end))
      marks.push({ type: "mask" });
    const segments = text.slice(start, end).split("\n");
    segments.forEach((segment, index) => {
      if (index) content.push({ type: "hardBreak" });
      if (segment)
        content.push({
          type: "text",
          text: segment,
          ...(marks.length ? { marks } : {}),
        });
    });
  }
  return content;
}

export function legacyBlock(block) {
  const id = block.id || uid();
  if (block.type === "columns")
    return {
      type: "columnSet",
      attrs: { id },
      content: Array.from(
        { length: Math.min(4, Math.max(2, block.columns || 2)) },
        (_, column) => ({
          type: "column",
          content: (block.children || [])
            .filter((b) => (b.column || 0) === column)
            .map(legacyBlock),
        }),
      ).map((c) => ({
        ...c,
        content: c.content.length ? c.content : [blankText()],
      })),
    };
  if (block.type === "divider")
    return { type: "horizontalRule", attrs: { id } };
  const paragraph = {
    type: "paragraph",
    attrs: {
      id,
      kind: block.type || "text",
      color: block.color || "black",
      checked: !!block.checked,
    },
    content: richText(block),
  };
  if (!block.toggle && !block.children?.length) return paragraph;
  paragraph.attrs.id = `${id}:head`;
  return {
    type: "outline",
    attrs: { id, toggle: !!block.toggle, open: block.open !== false },
    content: [
      paragraph,
      {
        type: "outlineBody",
        content: block.children?.length
          ? block.children.map(legacyBlock)
          : [blankText()],
      },
    ],
  };
}

export function migrateLegacy(source) {
  if (source?.engineVersion && source.engineVersion !== 2)
    throw new Error(
      "지원되지 않는 기존 Mindfold 버전입니다. 원본을 보존했습니다.",
    );
  if (source?.schemaRevision > MINDFOLD_SCHEMA_REVISION)
    throw new Error(
      "지원되지 않는 기존 Mindfold 버전입니다. 원본을 보존했습니다.",
    );
  const originals = Array.isArray(source?.tabs) ? source.tabs : [];
  const pages = [...originals, ...(source?.trash || [])].map((page) => ({
    ...newPage(page.label || "페이지"),
    id: page.id || uid(),
    deletedAt: page.deletedAt || null,
    document: {
      type: "doc",
      content: page.blocks?.length
        ? page.blocks.map(legacyBlock)
        : [blankText()],
    },
  }));
  if (!pages.some((page) => !page.deletedAt))
    pages.unshift(newPage("페이지 1"));
  return {
    version: DOCUMENT_VERSION,
    folders: [],
    pageOrder: pages.map((p) => p.id),
    activePageId: source?.activeTabId || pages[0].id,
    pages,
  };
}

export function validateWorkspace(source) {
  if (source?.version !== DOCUMENT_VERSION || !Array.isArray(source.pages))
    throw new Error(
      "지원되지 않는 문서 파일입니다. 현재 자료는 변경하지 않았습니다.",
    );
  const ids = new Set();
  const nodes = new Set([
    "doc",
    "paragraph",
    "outline",
    "outlineBody",
    "columnSet",
    "column",
    "horizontalRule",
    "hardBreak",
    "text",
    "image",
    "table",
    "tableRow",
    "tableCell",
    "tableHeader",
  ]);
  const marks = new Set([
    "bold",
    "italic",
    "underline",
    "strike",
    "code",
    "link",
    "textStyle",
    "mask",
  ]);
  for (const page of source.pages) {
    if (
      !page.id ||
      ids.has(page.id) ||
      page.document?.type !== "doc" ||
      !Array.isArray(page.document.content)
    )
      throw new Error("페이지 구조가 올바르지 않습니다.");
    if (page.documentVersion && page.documentVersion !== DOCUMENT_VERSION)
      throw new Error("지원되지 않는 문서 버전입니다. 원본을 보존했습니다.");
    visitNodes(page.document, (node) => {
      if (
        !nodes.has(node.type) ||
        node.marks?.some((mark) => !marks.has(mark.type))
      )
        throw new Error("지원되지 않는 문서 내용입니다. 원본을 보존했습니다.");
    });
    ids.add(page.id);
  }
  if (!Array.isArray(source.folders) || !Array.isArray(source.pageOrder))
    throw new Error("작업공간 구조가 올바르지 않습니다.");
  return copy(source);
}

export function visitNodes(node, callback) {
  callback(node);
  node.content?.forEach((child) => visitNodes(child, callback));
}
export function documentText(document) {
  if (!document) return "";
  if (document.type === "text") return document.text || "";
  if (document.type === "hardBreak") return "\n";
  return (document.content || [])
    .map(documentText)
    .join(
      ["doc", "outlineBody", "column", "tableRow", "table"].includes(
        document.type,
      )
        ? "\n"
        : "",
    );
}
export function assetIds(workspace) {
  const ids = new Set();
  workspace.pages.forEach((page) =>
    visitNodes(page.document, (node) => {
      if (node.type === "image" && node.attrs?.assetId)
        ids.add(node.attrs.assetId);
    }),
  );
  return [...ids];
}
export function duplicatePage(page) {
  const next = copy(page);
  next.id = uid();
  next.label = `${page.label} 복사`;
  next.revision = 0;
  next.deletedAt = null;
  visitNodes(next.document, (node) => {
    if (node.attrs?.id) node.attrs.id = uid();
  });
  return next;
}

export function transformBlocks(document, ids, targetId, placement = "after") {
  const selected = new Set(ids);
  const moving = [];
  const result = copy(document);
  const remove = (parent) => {
    parent.content = (parent.content || []).filter((node) => {
      if (selected.has(node.attrs?.id)) {
        moving.push(node);
        return false;
      }
      if (node.content && node.type !== "text") remove(node);
      return true;
    });
  };
  remove(result);
  if (!moving.length) return document;
  if (
    targetId &&
    moving.some((node) => {
      let found = false;
      visitNodes(node, (n) => {
        if (n.attrs?.id === targetId) found = true;
      });
      return found;
    })
  )
    return document;
  let inserted = false;
  const insert = (parent) => {
    for (let i = 0; i < (parent.content || []).length; i++) {
      const node = parent.content[i];
      if (node.attrs?.id === targetId) {
        if (placement === "inside") {
          if (node.type === "outline") {
            node.attrs.open = true;
            node.content[1].content.push(...moving);
          } else if (node.type === "paragraph") {
            const head = copy(node);
            head.attrs.id = `${node.attrs.id}:head`;
            parent.content[i] = {
              type: "outline",
              attrs: { id: node.attrs.id, open: true, toggle: false },
              content: [head, { type: "outlineBody", content: moving }],
            };
          } else return;
        } else
          parent.content.splice(
            i + (placement === "after" ? 1 : 0),
            0,
            ...moving,
          );
        inserted = true;
        return;
      }
      if (node.content) insert(node);
      if (inserted) return;
    }
  };
  if (targetId) insert(result);
  else inserted = true;
  if (!inserted) return document;
  if (!targetId) result.content.push(...moving);
  return repairDocument(result);
}

export function repairDocument(document, collapseColumns = false) {
  const repair = (node) => {
    if (!node.content || node.type === "text") return;
    node.content.forEach(repair);
    if (node.type === "columnSet" && collapseColumns) {
      node.content = node.content.filter((c) =>
        c.content?.some((b) => b.type !== "paragraph" || b.content?.length),
      );
      if (!node.content.length)
        node.content = [{ type: "column", content: [blankText()] }];
    }
    node.content = node.content.flatMap((c) =>
      c.type === "columnSet" && c.content.length === 1
        ? c.content[0].content
        : [c],
    );
    if (
      ["doc", "column", "outlineBody", "tableCell", "tableHeader"].includes(
        node.type,
      ) &&
      !node.content.length
    )
      node.content.push(blankText());
  };
  repair(document);
  return document;
}

export function deleteBlocks(document, ids, replacement = false) {
  const result = copy(document),
    selected = new Set(ids);
  let insertedId = "";
  const remove = (node) => {
    node.content = (node.content || []).flatMap((child) => {
      if (selected.has(child.attrs?.id)) {
        if (replacement && !insertedId) {
          const blank = blankText();
          insertedId = blank.attrs.id;
          return [blank];
        }
        return [];
      }
      if (child.content) remove(child);
      return [child];
    });
  };
  remove(result);
  return { document: repairDocument(result, true), insertedId };
}
