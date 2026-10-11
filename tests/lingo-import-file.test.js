import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import readExcel from "read-excel-file/node";
import { unzipSync, strFromU8 } from "fflate";
import { exampleCsv, templateCsv, parseCsv, openWordFile } from "../src/lingo/importFile.js";
import { inspectRows } from "../src/lingo/model.js";

const headers = ["일본어", "한국어 뜻", "읽는 법", "한자 훈음", "예문", "예문 읽는 법", "예문 해석", "품사", "JLPT", "특성"];
const asset = new URL("../src/lingo/templates/japanese-template.xlsx", import.meta.url);

test("downloadable native XLSX contains a blank template, matching examples and a guide", async () => {
  const bytes = await readFile(asset);
  const sheets = await readExcel(bytes);
  assert.deepEqual(sheets.map(({ sheet }) => sheet), ["단어 양식", "예시", "작성 안내"]);
  assert.deepEqual(sheets[0].data[0], headers);
  assert.equal(inspectRows(sheets[0].data).words.length, 0);
  assert.deepEqual(sheets[1].data[0], headers);
  const preview = inspectRows(sheets[1].data);
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.words.length, 3);
  assert.equal(preview.words[0].hanja, "食 먹을 식");
  assert.equal(preview.words[2].hanja, "勉 힘쓸 면\n強 강할 강");
  assert.equal(preview.words[2].exampleReading, "としょかんでにほんごをべんきょうします。");
  assert.deepEqual(preview.words[2].partsOfSpeech, ["명사", "する동사"]);
  assert.deepEqual(preview.words[2].topics, ["공부", "일상"]);
  assert.equal(preview.words[0].jlpt, "N5");
  const guide = sheets[2].data.flat().filter(Boolean).join("\n");
  for (const description of ["필수", "UTF-8", "한국식 훈음", "세미콜론", "기존 5열", "새 열이 없으면", "N5", "미분류"]) assert.ok(guide.includes(description), description);
  const files = unzipSync(bytes);
  const sheetXml = strFromU8(files["xl/worksheets/sheet1.xml"]);
  assert.ok(/<(?:\w+:)?pane\b[^>]*ySplit="1"/.test(sheetXml), "template header stays frozen");
  assert.ok(/<(?:\w+:)?dataValidation\b[^>]*type="list"/.test(sheetXml), "JLPT column has a list validation");
  assert.match(sheetXml, /N5,N4,N3,N2,N1/);
});

test("UTF-8 CSV template and examples use the same ten columns and quoted hanja line breaks", async () => {
  assert.ok(templateCsv.startsWith("\uFEFF"));
  assert.ok(exampleCsv.startsWith("\uFEFF"));
  assert.deepEqual(parseCsv(templateCsv)[0], headers);
  assert.equal(inspectRows(parseCsv(templateCsv)).words.length, 0);
  const parsed = parseCsv(exampleCsv);
  assert.deepEqual(parsed[0], headers);
  const workbook = await openWordFile(new File([exampleCsv], "일본어-예시.csv"));
  assert.deepEqual(workbook[0].rows, parsed);
  const preview = inspectRows(parsed);
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.words[2].hanja, "勉 힘쓸 면\n強 강할 강");
  const sheets = await readExcel(await readFile(asset));
  assert.deepEqual(parsed.slice(0, 4), sheets[1].data);
});
