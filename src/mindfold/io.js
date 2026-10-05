import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import DOMPurify from "dompurify";
import { getHTMLFromFragment } from "@tiptap/core";
import {
  copy,
  documentText,
  validateWorkspace,
  visitNodes,
} from "./documentModel.js";
import { backupWorkspace, getAsset, restoreWorkspace } from "./repository.js";

export function download(name, contents, type = "application/octet-stream") {
  const blob =
    contents instanceof Blob ? contents : new Blob([contents], { type });
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportZip(userId) {
  const backup = await backupWorkspace(userId);
  if (!backup) throw new Error("백업할 문서가 없습니다.");
  const files = {},
    images = [];
  for (const asset of backup.assets) {
    const record = await getAsset(asset.id);
    files[`assets/${asset.id}`] = new Uint8Array(
      await record.blob.arrayBuffer(),
    );
    images.push({ id: asset.id, name: asset.name, type: asset.type });
  }
  files["mindfold.json"] = strToU8(
    JSON.stringify(
      { version: 3, workspace: backup.workspace, images },
      null,
      2,
    ),
  );
  download(
    `mindfold-${new Date().toISOString().slice(0, 10)}.zip`,
    zipSync(files, { level: 0 }),
    "application/zip",
  );
}
export async function importZip(userId, file) {
  if (file.size > 150 * 1024 * 1024)
    throw new Error("백업 파일이 너무 큽니다.");
  let total = 0;
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter(entry) {
      if (
        entry.name !== "mindfold.json" &&
        !/^assets\/[a-zA-Z0-9-]+$/.test(entry.name)
      )
        return false;
      if (
        entry.originalSize > 12 * 1024 * 1024 ||
        (total += entry.originalSize) > 200 * 1024 * 1024
      )
        throw new Error("백업 용량 제한을 초과했습니다.");
      return true;
    },
  });
  if (!files["mindfold.json"]) throw new Error("Mindfold 백업이 아닙니다.");
  const manifest = JSON.parse(strFromU8(files["mindfold.json"]));
  validateWorkspace(manifest.workspace);
  const assets = [];
  for (const image of manifest.images || []) {
    if (
      !files[`assets/${image.id}`] ||
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
        image.type,
      )
    )
      throw new Error("백업 이미지가 누락되거나 올바르지 않습니다.");
    const blob = new Blob([files[`assets/${image.id}`]], { type: image.type });
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    assets.push({ ...image, dataUrl });
  }
  return restoreWorkspace(userId, { workspace: manifest.workspace, assets });
}
function escapeMarkdown(value) {
  return value.replace(/[\\`*_\[\]]/g, "\\$&");
}
function inline(node) {
  if (node.type === "hardBreak") return "  \n";
  let text = escapeMarkdown(node.text || "");
  for (const mark of node.marks || []) {
    if (mark.type === "bold") text = `**${text}**`;
    if (mark.type === "italic") text = `*${text}*`;
    if (mark.type === "strike") text = `~~${text}~~`;
    if (mark.type === "link") text = `[${text}](${mark.attrs.href})`;
  }
  return text;
}
function markdown(node, depth = 0) {
  if (node.type === "paragraph") {
    const text = (node.content || []).map(inline).join(""),
      kind = node.attrs?.kind || "text";
    const prefix = kind.startsWith("heading-")
      ? "#".repeat(Number(kind.slice(-1))) + " "
      : kind === "check"
        ? `- [${node.attrs.checked ? "x" : " "}] `
        : kind === "bullet"
          ? "- "
          : ["quote", "callout"].includes(kind)
            ? "> "
            : "";
    return `${"  ".repeat(depth)}${prefix}${text}\n\n`;
  }
  if (node.type === "horizontalRule") return "---\n\n";
  if (node.type === "image")
    return `![${node.attrs.alt || node.attrs.caption || ""}](assets/${node.attrs.assetId})\n\n`;
  if (node.type === "table")
    return (
      (node.content || [])
        .map(
          (row, index) =>
            `| ${row.content.map((cell) => documentText(cell).replace(/\n/g, "<br>").replace(/\|/g, "\\|")).join(" | ")} |\n${index === 0 ? `| ${row.content.map(() => "---").join(" | ")} |\n` : ""}`,
        )
        .join("") + "\n"
    );
  return (node.content || [])
    .map((child) =>
      markdown(child, depth + (node.type === "outlineBody" ? 1 : 0)),
    )
    .join("");
}
export async function exportMarkdown(userId, page) {
  const files = {
    [`${safeName(page.label)}.md`]: strToU8(markdown(page.document)),
  };
  const assets = [];
  visitNodes(page.document, (node) => {
    if (node.type === "image" && node.attrs.assetId)
      assets.push(node.attrs.assetId);
  });
  for (const id of new Set(assets)) {
    const record = await getAsset(id);
    if (!record)
      throw new Error(
        "이미지가 아직 기기에 다운로드되지 않았습니다. ZIP 백업을 먼저 실행해 주세요.",
      );
    files[`assets/${id}`] = new Uint8Array(await record.blob.arrayBuffer());
  }
  download(
    `${safeName(page.label)}-markdown.zip`,
    zipSync(files, { level: 0 }),
    "application/zip",
  );
}
const safeName = (name) =>
  name.replace(/[<>:"/\\|?*]/g, "_").slice(0, 70) || "mindfold";
export async function exportHTML(editor, page, userId) {
  const document = copy(page.document);
  const images = [];
  visitNodes(document, (node) => {
    if (node.type === "image") images.push(node);
  });
  for (const image of images) {
    const record = await getAsset(image.attrs.assetId);
    if (!record) throw new Error("이미지가 아직 다운로드되지 않았습니다.");
    image.attrs.src = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(record.blob);
    });
  }
  const html = getHTMLFromFragment(
    editor.schema.nodeFromJSON(document).content,
    editor.schema,
  );
  const clean = DOMPurify.sanitize(html, {
    ADD_ATTR: [
      "data-kind",
      "data-outline",
      "data-outline-body",
      "data-columns",
      "data-column",
      "data-mask",
    ],
  });
  download(
    `${safeName(page.label)}.html`,
    `<!doctype html><html lang="ko"><meta charset="utf-8"><title>Mindfold</title><style>body{font-family:system-ui,sans-serif;max-width:1200px;margin:40px auto;padding:24px;color:#20252c}img{max-width:100%;height:auto}table{border-collapse:collapse;width:100%}td,th{border:1px solid #aab2bb;padding:8px;text-align:center;vertical-align:middle}[data-columns]{display:flex;gap:24px}[data-column]{flex:1;min-width:0}[data-outline-body]{margin-left:18px}[data-kind=heading-1]{font-size:2em;font-weight:bold}[data-kind=heading-2]{font-size:1.6em;font-weight:bold}[data-kind=heading-3]{font-size:1.3em;font-weight:bold}[data-kind=heading-4]{font-size:1.15em;font-weight:bold}[data-mask]{color:transparent;background:#333}[data-mask]:hover{color:inherit;background:transparent}figcaption{font-size:.85em;color:#65707b}@media(max-width:700px){[data-columns]{display:block}}</style><body>${clean}</body></html>`,
    "text/html",
  );
}
