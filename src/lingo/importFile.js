import Papa from "papaparse";

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

export function downloadTemplate() {
  download("lingo-japanese-template.csv", '\uFEFF일본어,한국어 뜻,읽는 법,예문,예문 해석\r\n食べる,먹다,たべる,朝ご飯を食べます。,아침밥을 먹습니다.\r\n猫,고양이,ねこ,,\r\n');
}
