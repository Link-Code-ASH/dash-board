import test from "node:test";
import assert from "node:assert/strict";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { TableKit } from "@tiptap/extension-table";
import {
  MindParagraph,
  Outline,
  OutlineBody,
  ColumnSet,
  Column,
  Mask,
  AssetImage,
  SizedTableRow,
} from "../src/mindfold/extensions.js";
import {
  blankText,
  deleteBlocks,
  migrateLegacy,
  transformBlocks,
  validateWorkspace,
} from "../src/mindfold/documentModel.js";

const schema = getSchema([
  StarterKit.configure({ paragraph: false, heading: false }),
  MindParagraph,
  Outline,
  OutlineBody,
  ColumnSet,
  Column,
  Mask,
  TextStyle,
  Color,
  TableKit.configure({ tableRow: false }),
  SizedTableRow,
  AssetImage(null),
]);
const text = (id, value = "") => ({
  ...blankText({ id }),
  ...(value ? { content: [{ type: "text", text: value }] } : {}),
});
const document = (...content) => ({ type: "doc", content });
const valid = (json) => schema.nodeFromJSON(json).check();

test("moving tables and images preserves their sizes and image references", () => {
  const table = {
    type: "table",
    attrs: { id: "table" },
    content: [{
      type: "tableRow",
      attrs: { height: 72 },
      content: [110, 160].map((width, index) => ({
        type: "tableCell",
        attrs: { colspan: 1, rowspan: 1, colwidth: [width] },
        content: [text(`cell-${index}`)],
      })),
    }],
  };
  const image = {
    type: "image",
    attrs: { id: "image", assetId: "private-image", width: 35, align: "center" },
  };
  const source = document(text("before", "Before"), table, image);
  const moved = transformBlocks(source, ["table", "image"], "before", "before");
  valid(moved);
  assert.deepEqual(moved.content[0], table);
  assert.deepEqual(moved.content[1], image);
  const parsed = schema.nodeFromJSON(moved);
  assert.equal(parsed.firstChild.firstChild.attrs.height, 72);
  assert.deepEqual(parsed.firstChild.firstChild.firstChild.attrs.colwidth, [110]);
  assert.equal(parsed.child(1).attrs.assetId, "private-image");
  assert.equal(parsed.child(1).attrs.width, 35);
});

test("legacy text, formatting, masks, nested toggles and columns are preserved", () => {
  const original = {
    engineVersion: 2,
    schemaRevision: 6,
    activeTabId: "page",
    tabs: [
      {
        id: "page",
        label: "공부",
        blocks: [
          {
            id: "toggle",
            type: "heading-2",
            text: "생물학",
            toggle: true,
            open: false,
            marks: [{ type: "bold", start: 0, end: 2 }],
            masks: [{ start: 2, end: 3 }],
            children: [
              {
                id: "columns",
                type: "columns",
                columns: 2,
                children: [
                  { id: "left", column: 0, text: "왼쪽" },
                  { id: "right", column: 1, text: "오른쪽" },
                ],
              },
            ],
          },
        ],
      },
    ],
    trash: [
      {
        id: "trash",
        label: "이전",
        deletedAt: new Date().toISOString(),
        blocks: [],
      },
    ],
  };
  const before = JSON.stringify(original),
    result = migrateLegacy(original);
  assert.equal(JSON.stringify(original), before);
  assert.equal(result.pages.length, 2);
  assert.equal(result.pages[0].document.content[0].attrs.open, false);
  assert.ok(
    result.pages[0].document.content[0].content[0].content.some((n) =>
      n.marks?.some((m) => m.type === "mask"),
    ),
  );
  result.pages.forEach((p) => valid(p.document));
});
test("unknown document versions are rejected without clearing originals", () => {
  assert.throws(() => migrateLegacy({ engineVersion: 99 }), /버전/);
  assert.throws(
    () => migrateLegacy({ engineVersion: 2, schemaRevision: 99 }),
    /버전/,
  );
  assert.throws(() => validateWorkspace({ version: 99, pages: [] }), /문서/);
});
test("moving one block does not collapse an editable empty column", () => {
  const source = document({
    type: "columnSet",
    attrs: { id: "cols" },
    content: [
      { type: "column", content: [text("a", "A"), text("b", "B")] },
      { type: "column", content: [text("empty")] },
    ],
  });
  const moved = transformBlocks(source, ["b"], "a", "before");
  valid(moved);
  assert.equal(moved.content[0].type, "columnSet");
  assert.equal(moved.content[0].content.length, 2);
  assert.equal(moved.content[0].content[0].content[0].attrs.id, "b");
});
test("blocks can move inside another block with their children intact", () => {
  const source = document(text("a", "A"), text("b", "B"));
  const moved = transformBlocks(source, ["b"], "a", "inside");
  valid(moved);
  assert.equal(moved.content[0].type, "outline");
  assert.equal(moved.content[0].content[1].content[0].attrs.id, "b");
});
test("moving a parent into its child is rejected", () => {
  const source = document({
    type: "outline",
    attrs: { id: "parent", open: true, toggle: true },
    content: [
      text("head", "A"),
      { type: "outlineBody", content: [text("child", "B")] },
    ],
  });
  assert.deepEqual(
    transformBlocks(source, ["parent"], "child", "inside"),
    source,
  );
});
test("deleting multiple blocks is one structural operation and leaves a caret target", () => {
  const result = deleteBlocks(
    document(text("a"), text("b"), text("c", "C")),
    ["a", "b"],
    true,
  );
  valid(result.document);
  assert.equal(result.document.content.length, 2);
  assert.ok(result.insertedId);
});
test("deleting the content of a column removes an empty layout", () => {
  const source = document({
    type: "columnSet",
    attrs: { id: "cols" },
    content: [
      { type: "column", content: [text("a", "A")] },
      { type: "column", content: [text("b", "B")] },
    ],
  });
  const result = deleteBlocks(source, ["b"]);
  valid(result.document);
  assert.equal(result.document.content[0].type, "paragraph");
  assert.equal(result.document.content[0].attrs.id, "a");
});
test("duplicate page IDs in an imported backup are rejected", () => {
  assert.throws(
    () =>
      validateWorkspace({
        version: 3,
        pages: [
          { id: "same", document: document(text("a")) },
          { id: "same", document: document(text("b")) },
        ],
      }),
    /구조/,
  );
});
