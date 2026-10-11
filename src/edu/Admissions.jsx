import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, Clock3, GraduationCap, Pencil, Plus, Trash2, X } from 'lucide-react';
import './admissions.css';

function AdmissionForm({ item, today, busy, save, onClose }) {
  const dialog = useRef(null);
  const [values, setValues] = useState(() => ({ title: '', institution: '', track: '', startDate: today, endDate: '', time: '', notes: '', ...item }));
  const [error, setError] = useState('');
  const createId = useRef(crypto.randomUUID());
  useEffect(() => { if (!dialog.current.open) dialog.current.showModal(); }, []);
  const change = (field) => (event) => setValues((previous) => ({ ...previous, [field]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    try { await save({ type: 'admission.save', ...(item ? { id: item.id } : { createId: createId.current }), values }); onClose(); }
    catch (failure) { setError(failure.message); }
  };
  return <dialog className="edu-dialog admission-dialog" ref={dialog} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={submit}>
      <header className="admission-form-heading"><h2>{item ? '입시 일정 수정' : '입시 일정 등록'}</h2><button type="button" className="edu-icon-button" aria-label="닫기" disabled={busy} onClick={onClose}><X size={19} /></button></header>
      <fieldset disabled={busy} className="admission-form-fields">
        <label className="admission-wide">일정명<input required autoFocus maxLength={200} value={values.title} onChange={change('title')} /></label>
        <label>대학 / 기관<input maxLength={200} value={values.institution} onChange={change('institution')} /></label>
        <label>전형<input maxLength={200} value={values.track} onChange={change('track')} /></label>
        <label>시작일<input type="date" required value={values.startDate} onChange={change('startDate')} /></label>
        <label>종료일 · 선택<input type="date" min={values.startDate} value={values.endDate} onChange={change('endDate')} /></label>
        <label>시작 시간 · 선택<input type="time" value={values.time} onChange={change('time')} /></label>
        <label className="admission-wide">메모<textarea rows={4} value={values.notes} onChange={change('notes')} /></label>
      </fieldset>
      {error && <p role="alert" className="edu-alert">{error}</p>}
      <footer className="admission-form-actions"><button type="button" className="edu-button" disabled={busy} onClick={onClose}>취소</button><button type="submit" className="edu-button edu-primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</button></footer>
    </form>
  </dialog>;
}

export default function Admissions({ edu, today, busy, save, selectedId, navigate }) {
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [onlyUpcoming, setOnlyUpcoming] = useState(false);
  useEffect(() => {
    const selected = selectedId ? (edu.admissions || []).find((item) => item.id === selectedId) : null;
    setEditing(selected || null);
    setError(selectedId && !selected ? '입시 일정을 찾을 수 없습니다.' : '');
  }, [selectedId]);
  const close = () => { setEditing(null); if (selectedId) navigate('edu', 'admissions'); };
  const remove = async (item) => {
    if (!window.confirm(`“${item.title}” 입시 일정을 삭제할까요?`)) return;
    try { await save({ type: 'admission.delete', id: item.id }); setError(''); }
    catch (failure) { setError(failure.message); }
  };
  const items = [...(edu.admissions || [])].filter((item) => !onlyUpcoming || (item.endDate || item.startDate) >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.time || '').localeCompare(b.time || '') || a.id.localeCompare(b.id));
  return <section className="edu-admissions" aria-label="공통 입시 일정">
    <div className="edu-section-heading"><h2><GraduationCap size={21} />입시 일정</h2><button type="button" className="edu-button edu-primary" disabled={busy} onClick={() => setEditing('new')}><Plus size={17} />일정 등록</button></div>
    <div className="admission-list-toolbar"><span>공통 일정 {items.length}개</span><label><input type="checkbox" checked={onlyUpcoming} onChange={(event) => setOnlyUpcoming(event.target.checked)} />진행·예정 일정만</label></div>
    {error && <p className="edu-alert" role="alert">{error}</p>}
    <div className="admission-list">
      {items.map((item) => {
        const end = item.endDate || item.startDate;
        const status = today < item.startDate ? '예정' : today > end ? '종료' : today === end ? '오늘' : '진행';
        return <article className={`admission-row${today > end ? ' is-past' : ''}`} key={item.id}>
          <div className="admission-date"><CalendarDays size={16} /><time dateTime={item.startDate}>{item.startDate.replaceAll('-', '.')}</time>{end !== item.startDate && <time dateTime={end}>– {end.replaceAll('-', '.')}</time>}{item.time && <span><Clock3 size={13} />{item.time}</span>}</div>
          <div className="admission-description"><h3>{item.title}</h3><p>{[item.institution, item.track].filter(Boolean).join(' · ')}</p>{item.notes && <p className="admission-notes">{item.notes}</p>}</div>
          <span className={`admission-status is-${today > end ? 'past' : today < item.startDate ? 'upcoming' : 'active'}`}>{status}</span>
          <div className="admission-row-actions"><button type="button" className="edu-icon-button" aria-label={`${item.title} 수정`} title="수정" disabled={busy} onClick={() => setEditing(item)}><Pencil size={16} /></button><button type="button" className="edu-icon-button" aria-label={`${item.title} 삭제`} title="삭제" disabled={busy} onClick={() => remove(item)}><Trash2 size={16} /></button></div>
        </article>;
      })}
      {!items.length && <div className="edu-empty">등록된 입시 일정이 없습니다.</div>}
    </div>
    {editing && <AdmissionForm key={typeof editing === 'string' ? editing : editing.id} item={editing === 'new' ? null : editing} today={today} busy={busy} save={save} onClose={close} />}
  </section>;
}
