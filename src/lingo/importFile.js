import Papa from "papaparse";
import { HEADERS } from "./model.js";

const templateUrl = new URL("./templates/japanese-template.xlsx", import.meta.url).href;
const exampleRows = [
  ["食べる", "먹다", "たべる", "食 먹을 식", "朝ご飯を食べます。", "あさごはんをたべます。", "아침밥을 먹습니다.", "동사", "N5", "음식;일상"],
  ["猫", "고양이", "ねこ", "猫 고양이 묘", "猫が窓のそばにいます。", "ねこがまどのそばにいます。", "고양이가 창문 옆에 있습니다.", "명사", "N5", "동물;일상"],
  ["勉強", "공부", "べんきょう", "勉 힘쓸 면\n強 강할 강", "図書館で日本語を勉強します。", "としょかんでにほんごをべんきょうします。", "도서관에서 일본어를 공부합니다.", "명사;する동사", "N5", "공부;일상"],
];
const toCsv = (rows) => `\uFEFF${Papa.unparse(rows, { newline: "\r\n" })}\r\n`;
export const templateCsv = toCsv([HEADERS]);
export const exampleCsv = toCsv([HEADERS, ...exampleRows]);

export function parseCsv(text) {
  const result = Papa.parse(text.replace(/^\uFEFF/, ""), { delimiter: ",", skipEmptyLines: false });
  if (result.errors.length) throw new Error(`CSV 형식 오류: ${result.errors.map((e) => `${(e.row ?? 0) + 1}행 ${e.message}`).join(" / ")}`);
  return result.data;
}

export async function openWordFile(file) {
  if (file.size > 10 * 1024 * 1024) throw new Error("파일은 10MB 이하로 올려 주세요.");
  const extension = file.name.split(".").pop().toLowerCase();
  if (extension === "csv") {
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
    catch { throw new Error("CSV는 UTF-8 형식으로 저장해 주세요."); }
    return [{ name: file.name, rows: parseCsv(text) }];
  }
  if (extension !== "xlsx") throw new Error(".xlsx 또는 UTF-8 .csv 파일을 선택해 주세요.");
  const { default: readExcel } = await import("read-excel-file/browser");
  const sheets = await readExcel(file);
  return sheets.map(({ sheet, data }) => ({ name: sheet, rows: data }));
}

export function downloadJson(name, value) {
  download(name, JSON.stringify(value, null, 2), "application/json;charset=utf-8");
}

export function download(name, text, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTemplate(format = "xlsx") {
  if (format === "csv") {
    download("lingo-japanese-template.csv", templateCsv);
    return;
  }
  const link = document.createElement("a");
  link.href = templateUrl;
  link.download = "lingo-japanese-template.xlsx";
  link.click();
}

export function downloadExample() {
  download("lingo-japanese-example.csv", exampleCsv);
}
