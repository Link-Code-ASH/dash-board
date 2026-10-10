import React, { useEffect, useMemo, useRef, useState } from "react";
import { Upload, Download, X, FileSpreadsheet } from "lucide-react";
import { useLingo } from "./LingoProvider.jsx";
import { emptyDeck, HEADERS, FIELDS, importWords, inspectRows, uid } from "./model.js";
import { openWordFile, downloadTemplate } from "./importFile.js";
import { googleConfigured, openGoogleSheet, prepareGoogle } from "./google.js";

export default function ImportPanel({ initialDeckId, onClose, onImported }) {
  const { decks, change } = useLingo();
  const [target, setTarget] = useState(initialDeckId || "");
  const [name, setName] = useState("");
  const [workbook, setWorkbook] = useState(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [googleReady, setGoogleReady] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const sequence = useRef(0), abort = useRef(null), alive = useRef(true), fileInput = useRef(null);
  const selectedDeck = decks.find((deck) => deck.id === target);
  const preview = useMemo(() => rows ? inspectRows(rows, selectedDeck) : null, [rows, selectedDeck]);
  const prepare = () => {
    setGoogleError("");
    prepareGoogle().then(() => { if (alive.current) setGoogleReady(true); })
      .catch((e) => { if (alive.current) setGoogleError(e.message); });
  };
  useEffect(() => {
    alive.current = true;
    if (googleConfigured) prepare();
    return () => { alive.current = false; sequence.current++; abort.current?.abort(); };
  }, []);
  const run = async (action) => {
    const ticket = ++sequence.current;
    abort.current?.abort(); abort.current = new AbortController();
    setBusy(true); setError(""); setRows(null); setWorkbook(null);
    try {
      const next = await action(abort.current.signal);
      if (!alive.current || ticket !== sequence.current) return;
      if (!next.sheets.length) throw new Error("가져올 시트가 없습니다.");
      setWorkbook(next); setName(next.name.replace(/\.(xlsx|csv)$/i, ""));
      const remembered = selectedDeck?.source?.type === "google" && next.documentId === selectedDeck.source.documentId
        ? next.sheets.findIndex((sheet) => sheet.sheetId === selectedDeck.source.sheetId) : 0;
      setSheetIndex(Math.max(0, remembered));
    } catch (e) { if (alive.current && ticket === sequence.current) setError(e.message); }
    finally { if (alive.current && ticket === sequence.current) setBusy(false); }
  };
  useEffect(() => {
    if (!workbook) return;
    const controller = new AbortController();
    let current = true;
    const sheet = workbook.sheets[sheetIndex];
    setRows(null); setBusy(true); setError("");
    Promise.resolve().then(() => sheet.rows || sheet.read(controller.signal))
      .then((value) => { if (current) setRows(value); })
      .catch((e) => { if (current) setError(e.message); })
      .finally(() => { if (current) setBusy(false); });
    return () => { current = false; controller.abort(); };
  }, [workbook, sheetIndex]);
  const save = async () => {
    if (!preview || preview.errors.length || (!target && !name.trim())) return;
    setSaving(true); setError("");
    try {
      const id = target || uid();
      const sheet = workbook.sheets[sheetIndex];
      const source = { type: workbook.type, name: workbook.name, sheetName: sheet.name,
        ...(workbook.type === "google" ? { documentId: workbook.documentId, sheetId: sheet.sheetId } : {}) };
      await change(id, (current) => {
        if (target && !current) throw new Error("단어장을 다시 선택해 주세요.");
        return importWords(current || emptyDeck(name, id), preview, source);
      });
      if (alive.current) onImported(id);
    } catch (e) { if (alive.current) setError(e.message); }
    finally { if (alive.current) setSaving(false); }
  };
  return <section className="lingo-import lingo-panel" aria-labelledby="lingo-import-title">
    <div className="lingo-row"><div><p className="lingo-eyebrow">IMPORT WORDS</p><h2 id="lingo-import-title">나만의 단어장 가져오기</h2></div>
      <button aria-label="가져오기 닫기" disabled={saving} onClick={onClose}><X size={20} /></button></div>
    <p className="lingo-muted">일본어와 한국어 뜻은 필수예요. 읽는 법, 예문, 예문 해석도 함께 담을 수 있어요.</p>
    <div className="lingo-actions">
      <button onClick={downloadTemplate}><Download size={16} />양식·예시 다운로드</button>
      <button className="lingo-primary" disabled={busy || saving} onClick={() => fileInput.current.click()}><Upload size={16} />엑셀·CSV 선택</button>
      <input ref={fileInput} type="file" accept=".xlsx,.csv" hidden onChange={(event) => {
        const file = event.target.files[0]; event.target.value = "";
        if (file) void run(async () => ({ type: "file", name: file.name, sheets: await openWordFile(file) }));
      }} />
      <button disabled={!googleReady || busy || saving} onClick={() => run(async (signal) => ({ type: "google", ...await openGoogleSheet(null, signal) }))}><FileSpreadsheet size={16} />구글 시트 선택</button>
      {selectedDeck?.source?.type === "google" && <button disabled={!googleReady || busy || saving}
        onClick={() => run(async (signal) => ({ type: "google", ...await openGoogleSheet(selectedDeck.source, signal) }))}>연결한 시트 다시 읽기</button>}
    </div>
    {!googleConfigured && <p className="lingo-muted">구글 시트 연결 설정이 필요합니다. 지금은 엑셀·CSV 파일로 가져올 수 있어요.</p>}
    {googleError && <p role="alert">{googleError} <button onClick={prepare}>연결 다시 시도</button></p>}
    <div className="lingo-import-fields">
      <label>가져올 단어장<select value={target} disabled={saving} onChange={(e) => setTarget(e.target.value)}>
        <option value="">새 단어장 만들기</option>{decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
      </select></label>
      {!target && <label>새 단어장 이름<input value={name} maxLength={100} disabled={saving} onChange={(e) => setName(e.target.value)} placeholder="예: 일상 일본어" /></label>}
      {workbook && <label>시트 탭<select value={sheetIndex} disabled={busy || saving} onChange={(e) => setSheetIndex(Number(e.target.value))}>
        {workbook.sheets.map((sheet, i) => <option key={i} value={i}>{sheet.name}</option>)}
      </select></label>}
    </div>
    {busy && <p role="status">시트를 읽고 있습니다…</p>}
    {error && <p className="lingo-error" role="alert">{error}</p>}
    {preview && <>
      <div className="lingo-row"><p><strong>{preview.added}</strong>개 추가 · <strong>{preview.updated}</strong>개 갱신</p><span className="lingo-muted">기존 단계는 그대로 유지됩니다</span></div>
      {preview.errors.length > 0 && <div className="lingo-error" role="alert"><strong>파일을 수정한 뒤 다시 가져와 주세요.</strong>
        <ul>{preview.errors.slice(0, 30).map((item, i) => <li key={i}>{item.row ? `${item.row}행: ` : ""}{item.message}</li>)}</ul>
        {preview.errors.length > 30 && <p>외 {preview.errors.length - 30}개 오류</p>}</div>}
      <div className="lingo-table-scroll"><table><caption>가져올 단어 미리보기 · 최대 20개</caption><thead><tr>{HEADERS.map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>{preview.words.slice(0, 20).map((word, index) => <tr key={index}>{FIELDS.map((key) => <td key={key}>{word[key] || "—"}</td>)}</tr>)}</tbody></table></div>
      <div className="lingo-actions lingo-import-footer"><button className="lingo-primary" disabled={busy || saving || preview.errors.length > 0 || (!target && !name.trim())} onClick={save}>{saving ? "저장 중…" : "단어장에 가져오기"}</button>
        <span className="lingo-muted">원본에서 빠진 단어는 삭제하지 않습니다.</span></div>
    </>}
  </section>;
}
