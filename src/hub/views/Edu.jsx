import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, Check, ChevronLeft, ChevronRight, GraduationCap, History, Plus, Search, Trash2, Users, X } from "lucide-react";
import { useEdu } from "../../edu/EduProvider.jsx";
import Admissions from "../../edu/Admissions.jsx";
import { GRADE_OPTIONS, countingAge, currentGrade, gradeLabel, pendingTransitions } from "../../edu/model.js";
import "../../edu/edu.css";

const STATUSES = { scheduled: "예약", completed: "완료", cancelled: "취소" };
const EVENT_TITLES = {
  "student.created": "원생 등록", "student.updated": "기본정보 수정", "memo.updated": "메모 수정",
  "consultation.created": "상담 등록", "consultation.updated": "상담 수정", "consultation.status": "상담 상태 변경", "consultation.deleted": "상담 삭제",
  "promotion.auto": "학년 자동 변경", "promotion.confirmed": "진학 확인 완료",
};
const FIELD_TITLES = {
  name: "이름", birthYear: "출생년도", school: "학교", grade: "학년", studentPhone: "본인 연락처",
  guardianPhone: "보호자 연락처", memo: "메모", title: "상담 제목", date: "상담 날짜", time: "상담 시간",
  notes: "상담 내용", status: "상담 상태", studentId: "상담 원생", promotionIds: "진학 확인", promotionConfirmed: "진학 확인",
};
const sortAppointments = (items) => [...items].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
const errorMessage = (error) => error?.message || "저장하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해 주세요.";
const seoulNow = (today) => new Date(`${today}T12:00:00+09:00`);
function shortDate(date) {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
}
function eventTime(at) {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? at : new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}
function EmptyState({ icon: Icon = Users, title, children, action }) {
  return <div className="edu-empty"><Icon size={28} strokeWidth={1.5} /><strong>{title}</strong><p>{children}</p>{action}</div>;
}
function Alert({ children }) {
  return children ? <p className="edu-error" role="alert">{children}</p> : null;
}
function Field({ label, hint, children, wide = false }) {
  return <label className={`edu-field${wide ? " edu-field-wide" : ""}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function Dialog({ title, subtitle, onClose, busy, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog className="edu-dialog" ref={ref} aria-labelledby="edu-dialog-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="edu-dialog-heading"><div><h2 id="edu-dialog-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" className="edu-icon-button" aria-label="닫기" disabled={busy} onClick={onClose}><X size={20} /></button></div>
    {children}
  </dialog>;
}
function studentValues(student, now) {
  return { name: student?.name || "", birthYear: student?.birthYear || "", school: student?.school || "", grade: student ? currentGrade(student, now) : 1, studentPhone: student?.studentPhone || "", guardianPhone: student?.guardianPhone || "" };
}
function rebaseDraft(base, draft, touched) {
  return { ...base, ...Object.fromEntries([...touched].map((field) => [field, draft[field]])) };
}
function StudentForm({ student, today, year, busy, save, onSaved, onCancel }) {
  const now = useMemo(() => seoulNow(today), [today]);
  const [createId] = useState(() => crypto.randomUUID());
  const touched = useRef(new Set());
  const [values, setValues] = useState(() => studentValues(student, now));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { setValues((draft) => rebaseDraft(studentValues(student, now), draft, touched.current)); }, [student, now]);
  const change = (field) => (event) => { const value = event.currentTarget.value; touched.current.add(field); setValues((previous) => ({ ...previous, [field]: value })); setDirty(true); setSaved(false); };
  const submit = async (event) => {
    event.preventDefault(); setError(""); setSaved(false);
    try {
      const rebased = rebaseDraft(studentValues(student, now), values, touched.current);
      const result = await save({ type: "student.save", ...(student ? { id: student.id } : { createId }), values: { ...rebased, birthYear: Number(rebased.birthYear), grade: Number(rebased.grade) } });
      touched.current.clear(); setDirty(false); setSaved(true);
      const savedStudent = result.students.find((entry) => entry.id === (student?.id || createId));
      if (savedStudent) setValues(studentValues(savedStudent, now));
      onSaved?.(savedStudent);
    } catch (failure) { setError(errorMessage(failure)); }
  };
  const age = countingAge(Number(values.birthYear), now);
  return <form className="edu-form" onSubmit={submit}>
    <div className="edu-form-grid">
      <Field label="이름 *"><input value={values.name} onChange={change("name")} required maxLength={100} autoFocus={!student} autoComplete="off" placeholder="원생 이름" disabled={busy} /></Field>
      <Field label="출생년도 *" hint={values.birthYear && age ? `올해 ${age}세 · 세는 나이` : "나이는 출생년도로 자동 계산합니다."}><input type="number" inputMode="numeric" value={values.birthYear} onChange={change("birthYear")} min="1900" max={year} required placeholder="예: 2012" disabled={busy} /></Field>
      <Field label="학교 *"><input value={values.school} onChange={change("school")} required maxLength={150} placeholder="현재 학교 이름" disabled={busy} /></Field>
      <Field label="학년 *" hint="매년 1월 1일 자동으로 올라갑니다."><select value={values.grade} onChange={change("grade")} disabled={busy}>{GRADE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
      <Field label="본인 연락처"><input type="tel" value={values.studentPhone} onChange={change("studentPhone")} maxLength={50} autoComplete="off" placeholder="선택 입력" disabled={busy} /></Field>
      <Field label="보호자 연락처"><input type="tel" value={values.guardianPhone} onChange={change("guardianPhone")} maxLength={50} autoComplete="off" placeholder="선택 입력" disabled={busy} /></Field>
    </div>
    <Alert>{error}</Alert>
    <div className="edu-form-footer"><span className="edu-save-hint" role="status">{saved ? "저장했습니다." : dirty ? "저장하지 않은 변경사항이 있습니다." : "* 필수 입력"}</span><div className="edu-actions">{onCancel && <button type="button" className="edu-button" disabled={busy} onClick={onCancel}>취소</button>}<button type="submit" className="edu-button edu-primary" disabled={busy || (!!student && !dirty)}>{busy ? "저장 중…" : student ? "변경사항 저장" : "원생 등록"}</button></div></div>
  </form>;
}
function MemoForm({ student, busy, save }) {
  const [memo, setMemo] = useState(student.memo || "");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (!dirty) setMemo(student.memo || ""); }, [student.memo, dirty]);
  const submit = async (event) => {
    event.preventDefault(); setError(""); setSaved(false);
    try { await save({ type: "memo.save", studentId: student.id, memo }); setDirty(false); setSaved(true); }
    catch (failure) { setError(errorMessage(failure)); }
  };
  return <form className="edu-form" onSubmit={submit}><Field label="원생 메모" hint="학습 특성, 전달사항 등 기억할 내용을 남겨 주세요." wide><textarea className="edu-memo" value={memo} onChange={(event) => { setMemo(event.target.value); setDirty(true); setSaved(false); }} placeholder="원생에 관한 메모를 입력하세요." disabled={busy} /></Field><Alert>{error}</Alert><div className="edu-form-footer"><span className="edu-save-hint" role="status">{saved ? "메모를 저장했습니다." : dirty ? "저장하지 않은 변경사항이 있습니다." : "저장할 때 변경 이력이 남습니다."}</span><button type="submit" className="edu-button edu-primary" disabled={busy || !dirty}>{busy ? "저장 중…" : "메모 저장"}</button></div></form>;
}
function consultationValues(item, studentId, date, edu) {
  return item ? { studentId: item.studentId, title: item.title, date: item.date, time: item.time, notes: item.notes || "", status: item.status } : { studentId: studentId || edu.students[0]?.id || "", title: "", date, time: "14:00", notes: "", status: "scheduled" };
}
function ConsultationForm({ item, studentId, date, complete = false, edu, busy, save, onClose }) {
  const [createId] = useState(() => crypto.randomUUID());
  const latest = edu.consultations.find((entry) => entry.id === (item?.id || createId));
  const touched = useRef(new Set(complete ? ["status"] : []));
  const [values, setValues] = useState(() => ({ ...consultationValues(latest || item, studentId, date, edu), ...(complete ? { status: "completed" } : {}) }));
  const [error, setError] = useState("");
  useEffect(() => { setValues((draft) => rebaseDraft(consultationValues(latest || item, studentId, date, edu), draft, touched.current)); }, [latest, item, studentId, date, edu.students]);
  const change = (field) => (event) => { const value = event.currentTarget.value; touched.current.add(field); setValues((previous) => ({ ...previous, [field]: value })); };
  const submit = async (event) => {
    event.preventDefault(); setError("");
    try {
      const rebased = rebaseDraft(consultationValues(latest || item, studentId, date, edu), values, touched.current);
      await save({ type: "consultation.save", ...(item ? { id: item.id } : { createId }), values: rebased }); onClose();
    }
    catch (failure) { setError(errorMessage(failure)); }
  };
  const remove = async () => {
    if (!window.confirm(`“${item.title}” 상담을 삭제할까요?`)) return;
    setError("");
    try { await save({ type: "consultation.delete", id: item.id }); onClose(); }
    catch (failure) { setError(errorMessage(failure)); }
  };
  const completing = values.status === "completed";
  // 취소 is no longer offered; it stays visible only on consultations that already have it.
  const statusOptions = Object.entries(STATUSES).filter(([value]) => value !== "cancelled" || values.status === "cancelled");
  return <Dialog title={complete ? "상담 완료" : item ? "상담 수정" : "상담 예약"} subtitle="모든 상담 시간은 한국 시간(Asia/Seoul)입니다." busy={busy} onClose={onClose}><form className="edu-form" onSubmit={submit}>
    <div className="edu-form-grid">
      <Field label="원생 *" wide><select value={values.studentId} onChange={change("studentId")} required disabled={busy}>{!values.studentId && <option value="">원생 선택</option>}{edu.students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.school}</option>)}</select></Field>
      <Field label="상담 제목 *" wide><input value={values.title} onChange={change("title")} required maxLength={200} placeholder="예: 학습 계획 상담" autoFocus={!complete} disabled={busy} /></Field>
      <Field label="날짜 *"><input type="date" value={values.date} onChange={change("date")} onInput={change("date")} required disabled={busy} /></Field>
      <Field label="시간 *"><input type="time" value={values.time} onChange={change("time")} onInput={change("time")} required disabled={busy} /></Field>
      <Field label="상태" wide><select value={values.status} onChange={change("status")} disabled={busy}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label={completing ? "상담 내용 *" : "상담 내용"} hint={completing ? "완료하려면 상담 내용을 입력해 주세요." : undefined} wide><textarea value={values.notes} onChange={change("notes")} placeholder="상담할 내용이나 결과를 기록하세요." rows={4} required={completing} autoFocus={complete} disabled={busy} /></Field>
    </div><Alert>{error}</Alert><div className="edu-form-footer"><span className="edu-save-hint">예약한 상담은 Flow에도 표시됩니다.</span><div className="edu-actions">{item && <button type="button" className="edu-button" disabled={busy} onClick={remove}><Trash2 size={15} />삭제</button>}<button type="button" className="edu-button" disabled={busy} onClick={onClose}>취소</button><button type="submit" className="edu-button edu-primary" disabled={busy}>{busy ? "저장 중…" : complete ? "완료 처리" : "상담 저장"}</button></div></div>
  </form></Dialog>;
}
function AppointmentList({ items, students, showStudent = false, onEdit, onComplete, onOpenStudent, busy }) {
  if (!items.length) return <EmptyState icon={CalendarDays} title="등록된 상담이 없습니다">상담을 예약하면 이곳에서 확인할 수 있습니다.</EmptyState>;
  return <div className="edu-appointments">{sortAppointments(items).map((item) => {
    const student = students.find((entry) => entry.id === item.studentId);
    return <article className={`edu-appointment edu-appointment-${item.status}`} key={item.id}>
      <div className="edu-appointment-time"><strong>{item.time}</strong><span>{item.date.replaceAll("-", ".")}</span><span className={`edu-status edu-status-${item.status}`}>{STATUSES[item.status]}</span></div>
      <div className="edu-appointment-body"><h3>{item.title}</h3>{showStudent && student && <button type="button" className="edu-text-button" onClick={() => onOpenStudent(student.id)}>{student.name} · {student.school}<ChevronRight size={14} /></button>}{item.notes && <p className="edu-appointment-notes">{item.notes}</p>}</div>
      <div className="edu-appointment-actions"><button type="button" className="edu-button" onClick={() => onEdit(item)} disabled={busy} aria-label={`${item.title} 수정`}>수정</button>{item.status === "scheduled" && <button type="button" className="edu-button edu-complete" onClick={() => onComplete(item)} disabled={busy} aria-label={`${item.title} 상담 완료`}><Check size={15} />완료</button>}</div>
    </article>;
  })}</div>;
}
function HistoryList({ events, students, consultations }) {
  const valueLabel = (change, value) => {
    if (value === "" || value == null) return "없음";
    if (change.field === "grade") return gradeLabel(Number(value));
    if (change.field === "status") return STATUSES[value] || String(value);
    if (change.field === "studentId") return students.find((student) => student.id === value)?.name || String(value);
    if (change.field === "promotionIds") return "확인 완료";
    if (change.field === "promotionConfirmed") return value ? "확인 완료" : "확인 필요";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };
  if (!events.length) return <EmptyState icon={History} title="변경 이력이 없습니다">원생 정보를 저장하거나 상담을 변경하면 이력이 남습니다.</EmptyState>;
  return <ol className="edu-history">{[...events].sort((a, b) => String(b.at).localeCompare(String(a.at)) || String(b.id).localeCompare(String(a.id))).map((event) => {
    const consultation = consultations.find((item) => item.id === event.consultationId);
    return <li key={event.id}>
    <div className="edu-history-heading"><strong>{EVENT_TITLES[event.type] || "정보 변경"}</strong><span className={`edu-history-actor${event.type === "promotion.auto" ? " edu-history-auto" : ""}`}>{event.type === "promotion.auto" || event.actor === "system" ? "자동 변경" : "직접 수정"}</span><time dateTime={event.at}>{eventTime(event.at)}</time></div>
    {event.type === "promotion.confirmed" && <p className="edu-history-confirmation">학교 정보를 확인하고 진학 알림을 해제했습니다.</p>}
    {consultation && <p className="edu-history-confirmation">{consultation.title} · {consultation.date} {consultation.time}</p>}
    {event.changes?.length > 0 && <dl className="edu-history-changes">{event.changes.map((change, index) => <div key={`${change.field}:${index}`}><dt>{FIELD_TITLES[change.field] || change.field}</dt><dd><span className="edu-history-before">{valueLabel(change, change.before)}</span><span className="edu-history-arrow" aria-label="변경 후">→</span><span>{valueLabel(change, change.after)}</span></dd></div>)}</dl>}
  </li>;
  })}</ol>;
}
function StudentDetail({ student, edu, today, year, busy, save, navigate, openConsultation, completeConsultation }) {
  const [tab, setTab] = useState("profile");
  const [error, setError] = useState("");
  const pending = pendingTransitions(edu, student.id);
  const now = seoulNow(today);
  const appointments = edu.consultations.filter((item) => item.studentId === student.id);
  const events = edu.events.filter((event) => event.studentId === student.id || event.changes?.some((change) => change.field === "studentId" && change.before === student.id));
  const confirm = async () => {
    setError("");
    try { await save({ type: "promotion.confirm", studentId: student.id }); }
    catch (failure) { setError(errorMessage(failure)); }
  };
  return <div className="edu-detail">
    <button type="button" className="edu-text-button edu-back" onClick={() => navigate("edu", "today")}><ArrowLeft size={17} />원생 목록</button>
    <div className="edu-detail-heading"><div className="edu-detail-identity"><span className="edu-avatar" aria-hidden="true">{student.name.slice(0, 1)}</span><div><h2>{student.name}</h2><p>{student.school} · {gradeLabel(currentGrade(student, now))} · {countingAge(student.birthYear, now)}세</p></div></div><button type="button" className="edu-button edu-primary" onClick={() => openConsultation({ studentId: student.id, date: today })} disabled={busy}><Plus size={16} />상담 예약</button></div>
    {pending.length > 0 && <div className="edu-promotion-alert"><span className="edu-warning-mark" aria-hidden="true">!</span><div><strong>고등학교 진학 정보를 확인해 주세요.</strong><p>중3에서 고1로 진급했습니다. 현재 학교명은 {student.school}입니다. 기본정보에서 학교를 확인·수정한 후 완료해 주세요.</p></div><button type="button" className="edu-button" disabled={busy} onClick={confirm}><Check size={16} />진학 확인 완료</button></div>}
    <Alert>{error}</Alert>
    <section className="edu-panel">
      <div className="edu-detail-tabs" role="tablist" aria-label="원생 상세">{[["profile", "기본정보"], ["memo", "메모"], ["consultations", "상담"], ["history", "변경 이력"]].map(([id, label]) => <button type="button" key={id} role="tab" id={`edu-tab-${id}`} aria-selected={tab === id} aria-controls={`edu-panel-${id}`} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}{id === "consultations" && <span className="edu-tab-count">{appointments.length}</span>}</button>)}</div>
      <div role="tabpanel" id="edu-panel-profile" aria-labelledby="edu-tab-profile" hidden={tab !== "profile"} className="edu-detail-panel"><StudentForm student={student} today={today} year={year} busy={busy} save={save} /></div>
      <div role="tabpanel" id="edu-panel-memo" aria-labelledby="edu-tab-memo" hidden={tab !== "memo"} className="edu-detail-panel"><MemoForm student={student} busy={busy} save={save} /></div>
      <div role="tabpanel" id="edu-panel-consultations" aria-labelledby="edu-tab-consultations" hidden={tab !== "consultations"} className="edu-detail-panel"><div className="edu-panel-heading"><div><h3>상담 기록</h3><p>예정된 상담과 지난 상담을 함께 확인합니다.</p></div></div><AppointmentList items={appointments} students={edu.students} onEdit={(item) => openConsultation({ item })} onComplete={completeConsultation} busy={busy} /></div>
      <div role="tabpanel" id="edu-panel-history" aria-labelledby="edu-tab-history" hidden={tab !== "history"} className="edu-detail-panel"><div className="edu-panel-heading"><div><h3>변경 이력</h3><p>등록, 수정, 자동 진급 이력 · 한국 시간 기준</p></div></div><HistoryList events={events} students={edu.students} consultations={edu.consultations} /></div>
    </section>
  </div>;
}
function StudentList({ edu, today, navigate, busy, onRegister }) {
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const now = seoulNow(today);
  const query = search.trim().toLocaleLowerCase();
  const visible = edu.students.filter((student) => (!query || `${student.name} ${student.school}`.toLocaleLowerCase().includes(query)) && (!grade || currentGrade(student, now) === Number(grade)) && (!pendingOnly || pendingTransitions(edu, student.id).length > 0)).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const pendingCount = edu.students.filter((student) => pendingTransitions(edu, student.id).length > 0).length;
  return <div className="edu-students">
    <div className="edu-section-heading"><div><h2>원생 관리 <span className="edu-heading-count">{edu.students.length}</span></h2><p>원생의 정보와 상담을 한곳에서 관리하세요.</p></div><button type="button" className="edu-button edu-primary" onClick={onRegister} disabled={busy}><Plus size={17} />원생 등록</button></div>
    <div className="edu-filters"><label className="edu-search"><Search size={18} aria-hidden="true" /><input aria-label="이름 또는 학교 검색" placeholder="이름 또는 학교 검색" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select aria-label="학년 필터" value={grade} onChange={(event) => setGrade(event.target.value)}><option value="">전체 학년</option>{GRADE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button type="button" className={`edu-filter-toggle${pendingOnly ? " active" : ""}`} aria-pressed={pendingOnly} onClick={() => setPendingOnly((value) => !value)}><span className="edu-warning-mark" aria-hidden="true">!</span>진학 확인 필요 <span>{pendingCount}</span></button></div>
    {visible.length > 0 ? <><p className="edu-results">{query || grade || pendingOnly ? `${edu.students.length}명 중 ${visible.length}명` : `전체 ${visible.length}명`}</p><div className="edu-student-grid">{visible.map((student) => {
      const pending = pendingTransitions(edu, student.id).length > 0;
      const next = sortAppointments(edu.consultations.filter((item) => item.studentId === student.id && item.status === "scheduled" && item.date >= today))[0];
      return <button type="button" className="edu-student-card" key={student.id} onClick={() => navigate("edu", `student:${student.id}`)} aria-label={`${student.name} 원생 상세${pending ? ", 진학 확인 필요" : ""}`}>
        <span className="edu-student-card-heading"><span className="edu-avatar" aria-hidden="true">{student.name.slice(0, 1)}</span><span className="edu-student-card-identity"><strong>{student.name}</strong><span>{student.birthYear}년생 · {countingAge(student.birthYear, now)}세</span></span>{pending && <span className="edu-warning-mark" title="고등학교 진학 확인 필요" aria-hidden="true">!</span>}<ChevronRight size={16} className="edu-card-chevron" /></span>
        <span className="edu-student-school"><span>{student.school}</span><span className="edu-grade">{gradeLabel(currentGrade(student, now))}</span></span>
        <span className={`edu-next-consultation${next ? " has-next" : ""}`}><CalendarDays size={15} /><span>{next ? `${next.date.slice(0, 4) !== today.slice(0, 4) ? `${next.date.slice(0, 4)}년 ` : ""}${shortDate(next.date)} ${next.time} · ${next.title}` : "예정된 상담 없음"}</span></span>
      </button>;
    })}</div></> : <section className="edu-panel">{edu.students.length === 0 ? <EmptyState title="첫 원생을 등록해 보세요" action={<button type="button" className="edu-button edu-primary" disabled={busy} onClick={onRegister}><Plus size={16} />원생 등록</button>}>이름과 학교, 학년을 입력하면 원생 관리가 시작됩니다.</EmptyState> : <EmptyState icon={Search} title="검색 결과가 없습니다" action={<button type="button" className="edu-button" onClick={() => { setSearch(""); setGrade(""); setPendingOnly(false); }}>필터 초기화</button>}>검색어나 학년, 진학 확인 필터를 변경해 주세요.</EmptyState>}</section>}
  </div>;
}
function calendarDates(month) {
  const [year, number] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1));
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const count = Math.ceil((first.getUTCDay() + days) / 7) * 7;
  return Array.from({ length: count }, (_, index) => new Date(Date.UTC(year, number - 1, index - first.getUTCDay() + 1)).toISOString().slice(0, 10));
}
function ConsultationCalendar({ edu, today, initialDate, busy, navigate, openConsultation, completeConsultation }) {
  const [month, setMonth] = useState((initialDate || today).slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(initialDate || today);
  const dates = useMemo(() => calendarDates(month), [month]);
  const appointmentsByDate = useMemo(() => {
    const result = {};
    sortAppointments(edu.consultations).forEach((item) => { (result[item.date] ||= []).push(item); });
    return result;
  }, [edu.consultations]);
  const changeMonth = (offset) => {
    const [year, number] = month.split("-").map(Number);
    const key = new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 10);
    setMonth(key.slice(0, 7)); setSelectedDate(key);
  };
  const selectDate = (date) => { setSelectedDate(date); setMonth(date.slice(0, 7)); };
  const monthCount = edu.consultations.filter((item) => item.date.startsWith(month) && item.status === "scheduled").length;
  return <div className="edu-calendar-view">
    <div className="edu-section-heading"><div><h2>상담 일정</h2><p>월별 예약과 상담 기록을 확인하세요.</p></div><button type="button" className="edu-button edu-primary" disabled={busy || !edu.students.length} onClick={() => openConsultation({ date: selectedDate })}><Plus size={17} />상담 예약</button></div>
    {!edu.students.length && <p className="edu-info">상담을 예약하려면 먼저 원생을 등록해 주세요.</p>}
    <div className="edu-calendar-layout"><section className="edu-panel edu-calendar-panel" aria-label="월별 상담 달력">
      <div className="edu-calendar-heading"><div><h3>{Number(month.slice(0, 4))}년 {Number(month.slice(5, 7))}월</h3><span>예약 {monthCount}건</span></div><div className="edu-actions"><button type="button" className="edu-icon-button" aria-label="이전 달" onClick={() => changeMonth(-1)}><ChevronLeft size={18} /></button><button type="button" className="edu-button" onClick={() => selectDate(today)}>오늘</button><button type="button" className="edu-icon-button" aria-label="다음 달" onClick={() => changeMonth(1)}><ChevronRight size={18} /></button></div></div>
      <div className="edu-calendar-weekdays" aria-hidden="true">{["일", "월", "화", "수", "목", "금", "토"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="edu-calendar-grid">{dates.map((date) => {
        const items = appointmentsByDate[date] || [];
        return <button type="button" key={date} className={`edu-calendar-day${date.startsWith(month) ? "" : " outside"}${date === today ? " today" : ""}${date === selectedDate ? " selected" : ""}`} aria-label={`${date}, 상담 ${items.length}건${date === today ? ", 오늘" : ""}`} aria-pressed={date === selectedDate} onClick={() => selectDate(date)}><span className="edu-calendar-number">{Number(date.slice(8, 10))}</span><span className="edu-calendar-entries">{items.slice(0, 2).map((item) => <span key={item.id} className={`edu-calendar-entry edu-calendar-entry-${item.status}`}><span aria-hidden="true" />{item.time} {edu.students.find((student) => student.id === item.studentId)?.name}</span>)}{items.length > 2 && <span className="edu-calendar-more">+{items.length - 2}건</span>}</span>{items.length > 0 && <span className="edu-calendar-mobile-count">{items.length}건</span>}</button>;
      })}</div>
      <div className="edu-calendar-legend"><span><i className="scheduled" />예약</span><span><i className="completed" />완료</span><span><i className="cancelled" />취소</span></div>
    </section><section className="edu-panel edu-agenda" aria-label="선택 날짜 상담"><div className="edu-panel-heading"><div><h3>{shortDate(selectedDate)} 상담</h3><p>{(appointmentsByDate[selectedDate] || []).length}건 · 시간순</p></div><input type="date" aria-label="상담 조회 날짜" value={selectedDate} onChange={(event) => { if (event.target.value) selectDate(event.target.value); }} /></div><AppointmentList items={appointmentsByDate[selectedDate] || []} students={edu.students} showStudent onEdit={(item) => openConsultation({ item })} onComplete={completeConsultation} onOpenStudent={(id) => navigate("edu", `student:${id}`)} busy={busy} /></section></div>
  </div>;
}
export default function Edu({ route, navigate }) {
  const { edu, today, year, ready, busy, error, save } = useEdu();
  const [registration, setRegistration] = useState(false);
  const [consultation, setConsultation] = useState(null);
  const [actionError, setActionError] = useState("");
  const section = route?.section || "today";
  const studentId = section.startsWith("student:") ? section.slice(8) : null;
  const student = edu.students.find((item) => item.id === studentId);
  const calendar = section === "calendar" || section.startsWith("consultation:");
  const admissions = section === "admissions" || section.startsWith("admissions:");
  useEffect(() => { setActionError(""); }, [section]);
  // Completing always goes through the form so the consultation notes get written.
  const completeConsultation = (item) => setConsultation({ item, complete: true });
  const linkedId = section.startsWith("consultation:") ? section.slice(13) : null;
  const linked = linkedId ? edu.consultations.find((item) => item.id === linkedId) : null;
  useEffect(() => {
    if (!ready || !linkedId) return;
    if (linked) setConsultation({ item: linked, fromLink: true });
    else setActionError("상담을 찾을 수 없습니다.");
  }, [ready, linkedId]);
  const closeConsultation = () => { if (consultation?.fromLink) navigate("edu", "calendar"); setConsultation(null); };
  return <div className="edu-workspace">
    <div className="edu-page-heading"><div><h1><GraduationCap size={28} strokeWidth={1.6} />Edu</h1><p>원생과 함께하는 매일의 기록</p></div><span className="edu-year-badge">{year}학년도</span></div>
    <nav className="edu-navigation" aria-label="Edu 메뉴"><button type="button" className={!calendar && !admissions ? "active" : ""} aria-current={!calendar && !admissions ? "page" : undefined} onClick={() => navigate("edu", "today")}><Users size={17} />원생 관리</button><button type="button" className={calendar ? "active" : ""} aria-current={calendar ? "page" : undefined} onClick={() => navigate("edu", "calendar")}><CalendarDays size={17} />상담 일정</button><button type="button" className={admissions ? "active" : ""} aria-current={admissions ? "page" : undefined} onClick={() => navigate("edu", "admissions")}><GraduationCap size={17} />입시 일정</button></nav>
    <Alert>{actionError || error}</Alert>
    {!ready ? <section className="edu-panel" aria-busy={!error}><EmptyState title={error ? "원생 데이터 확인이 필요합니다" : "원생 정보를 불러오는 중입니다"}>{error ? "위 오류를 확인하고 백업 또는 저장된 데이터를 점검해 주세요." : "잠시만 기다려 주세요."}</EmptyState></section> : admissions ? <Admissions edu={edu} today={today} busy={busy} save={save} selectedId={section.startsWith("admissions:") ? section.slice(11) : null} navigate={navigate} /> : studentId ? student ? <StudentDetail key={student.id} student={student} edu={edu} today={today} year={year} busy={busy} save={save} navigate={navigate} openConsultation={setConsultation} completeConsultation={completeConsultation} /> : <section className="edu-panel"><EmptyState title="원생을 찾을 수 없습니다" action={<button type="button" className="edu-button" onClick={() => navigate("edu", "today")}>원생 목록으로</button>}>원생 목록에서 다시 선택해 주세요.</EmptyState></section> : calendar ? <ConsultationCalendar initialDate={linked?.date} edu={edu} today={today} busy={busy} navigate={navigate} openConsultation={setConsultation} completeConsultation={completeConsultation} /> : <StudentList edu={edu} today={today} navigate={navigate} busy={busy} onRegister={() => setRegistration(true)} />}
    {registration && <Dialog title="원생 등록" subtitle="필수 정보를 입력한 뒤 원생을 등록하세요." busy={busy} onClose={() => setRegistration(false)}><StudentForm today={today} year={year} busy={busy} save={save} onSaved={(created) => { setRegistration(false); if (created) navigate("edu", `student:${created.id}`); }} onCancel={() => setRegistration(false)} /></Dialog>}
    {consultation && <ConsultationForm {...consultation} date={consultation.date || today} edu={edu} busy={busy} save={save} onClose={closeConsultation} />}
  </div>;
}
