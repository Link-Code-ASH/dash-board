export const EDU_VERSION = 1;

export const GRADE_OPTIONS = Object.freeze(Array.from({ length: 13 }, (_, index) => Object.freeze({
  value: index + 1,
  label: index < 6 ? `초${index + 1}` : index < 9 ? `중${index - 5}` : index < 12 ? `고${index - 8}` : '졸업',
})));

const STATUSES = new Set(['scheduled', 'completed', 'cancelled']);
const PROFILE_FIELDS = ['name', 'birthYear', 'school', 'grade', 'studentPhone', 'guardianPhone'];
const CONSULTATION_FIELDS = ['studentId', 'title', 'date', 'time', 'notes', 'status'];
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
});
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const uid = () => globalThis.crypto.randomUUID();

function dateValue(now) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new TypeError('날짜를 확인해 주세요.');
  return date;
}

export function seoulDateKey(now = new Date()) {
  const parts = Object.fromEntries(dateFormatter.formatToParts(dateValue(now)).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function seoulYear(now = new Date()) {
  return Number(seoulDateKey(now).slice(0, 4));
}

function integerInput(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : NaN;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return NaN;
}

export function countingAge(birthYear, now = new Date()) {
  const year = seoulYear(now);
  const birth = integerInput(birthYear);
  return birth >= 1900 && birth <= year ? year - birth + 1 : null;
}

export function gradeLabel(grade) {
  return GRADE_OPTIONS.find((option) => option.value === integerInput(grade))?.label ?? '미정';
}

function assertInteger(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new TypeError(`${label}을 확인해 주세요.`);
}

function assertId(value, label = 'ID') {
  if (typeof value !== 'string' || !value || value.trim() !== value || value.length > 512 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError(`${label}을 확인해 주세요.`);
  }
}

function assertText(value, label, { required = false, max = 100000 } = {}) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw new TypeError(`${label}을 확인해 주세요.`);
  }
}

function assertTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(new Date(value).getTime())) {
    throw new TypeError('기록 시간을 확인해 주세요.');
  }
}

function assertDateKey(value, label = '상담 날짜') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError(`${label} 입력을 확인해 주세요.`);
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(`${value}T00:00:00Z`);
  if (year < 1900 || year > 9999 || !Number.isFinite(date.getTime()) || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new TypeError(`${label} 입력을 확인해 주세요.`);
  }
}

function assertTime(value, label = '상담 시간') {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new TypeError(`${label}을 확인해 주세요.`);
}

function assertStatus(value) {
  if (!STATUSES.has(value)) throw new TypeError('상담 상태를 확인해 주세요.');
}

function assertAcademic(academic) {
  if (!isRecord(academic)) throw new TypeError('학년 기준을 확인해 주세요.');
  assertInteger(academic.referenceGrade, 1, 13, '학년');
  assertInteger(academic.referenceYear, 1900, 9999, '기준 연도');
  assertId(academic.referenceId, '학년 기준 ID');
}

export function currentGrade(student, now = new Date()) {
  assertAcademic(student?.academic);
  return Math.min(13, student.academic.referenceGrade + Math.max(0, seoulYear(now) - student.academic.referenceYear));
}

// Validate the entire envelope before a restore or migration so malformed or
// future data is never replaced by a seemingly valid empty workspace.
export function normalizeEdu(source) {
  if (source === undefined || source === null) return { version: EDU_VERSION, students: [], consultations: [], events: [], admissions: [] };
  if (!isRecord(source)) throw new TypeError('Edu 데이터 형식을 확인해 주세요.');
  if (source.version !== EDU_VERSION) throw new TypeError(`지원하지 않는 Edu 데이터 버전입니다: ${String(source.version)}`);
  for (const key of ['students', 'consultations', 'events', ...(source.admissions !== undefined ? ['admissions'] : [])]) {
    if (!Array.isArray(source[key])) throw new TypeError(`Edu ${key} 데이터 형식을 확인해 주세요.`);
    const ids = new Set();
    for (const record of source[key]) {
      if (!isRecord(record)) throw new TypeError(`Edu ${key} 항목을 확인해 주세요.`);
      assertId(record.id);
      if (ids.has(record.id)) throw new TypeError(`중복된 Edu ID입니다: ${record.id}`);
      ids.add(record.id);
    }
  }
  const students = new Set(source.students.map((student) => student.id));
  for (const admission of source.admissions || []) {
    assertText(admission.title, '입시 일정명', { required: true, max: 200 });
    assertText(admission.institution, '대학/기관', { max: 200 });
    assertText(admission.track, '전형', { max: 200 });
    assertText(admission.notes, '입시 메모');
    assertDateKey(admission.startDate, '입시 시작일');
    if (admission.endDate) {
      assertDateKey(admission.endDate, '입시 종료일');
      if (admission.endDate < admission.startDate) throw new TypeError('종료일은 시작일보다 빠를 수 없습니다.');
    }
    if (admission.time) assertTime(admission.time, '입시 시작 시간');
    assertTimestamp(admission.createdAt);
    assertTimestamp(admission.updatedAt);
  }
  for (const student of source.students) {
    assertText(student.name, '이름', { required: true, max: 100 });
    assertInteger(student.birthYear, 1900, 9999, '출생년도');
    assertText(student.school, '학교', { required: true, max: 200 });
    assertText(student.studentPhone, '본인 연락처', { max: 100 });
    assertText(student.guardianPhone, '보호자 연락처', { max: 100 });
    assertText(student.memo, '메모');
    assertAcademic(student.academic);
    assertTimestamp(student.createdAt);
    assertTimestamp(student.updatedAt);
  }
  for (const consultation of source.consultations) {
    assertId(consultation.studentId, '원생 ID');
    if (!students.has(consultation.studentId)) throw new TypeError('상담 원생을 찾을 수 없습니다.');
    assertText(consultation.title, '상담 제목', { required: true, max: 200 });
    assertDateKey(consultation.date);
    assertTime(consultation.time);
    assertText(consultation.notes, '상담 내용');
    assertStatus(consultation.status);
    assertTimestamp(consultation.createdAt);
    assertTimestamp(consultation.updatedAt);
  }
  for (const event of source.events) {
    assertId(event.studentId, '원생 ID');
    if (!students.has(event.studentId)) throw new TypeError('변경 이력의 원생을 찾을 수 없습니다.');
    assertText(event.type, '변경 종류', { required: true, max: 100 });
    assertText(event.actor, '변경 주체', { required: true, max: 512 });
    assertTimestamp(event.at);
    if (!Array.isArray(event.changes)) throw new TypeError('변경 항목을 확인해 주세요.');
    for (const change of event.changes) {
      if (!isRecord(change) || !Object.hasOwn(change, 'before') || !Object.hasOwn(change, 'after')) throw new TypeError('변경 전후 값을 확인해 주세요.');
      assertText(change.field, '변경 항목', { required: true, max: 100 });
    }
    if (event.consultationId !== undefined) assertId(event.consultationId, '상담 ID');
    if (event.promotionIds !== undefined) {
      if (!Array.isArray(event.promotionIds)) throw new TypeError('진학 확인 항목을 확인해 주세요.');
      event.promotionIds.forEach((id) => assertId(id, '진급 ID'));
    }
  }
  return source;
}

export function reconcilePromotions(edu, now = new Date()) {
  const source = normalizeEdu(edu);
  const year = seoulYear(now);
  const existing = new Set(source.events.map((event) => event.id));
  const added = [];
  for (const student of source.students) {
    const { referenceGrade, referenceYear, referenceId } = student.academic;
    const count = Math.min(Math.max(0, year - referenceYear), 13 - referenceGrade);
    for (let step = 1; step <= count; step += 1) {
      const effectiveYear = referenceYear + step;
      const id = `promotion:${student.id}:${referenceId}:${effectiveYear}`;
      if (existing.has(id)) continue;
      existing.add(id);
      added.push({
        id, type: 'promotion.auto', studentId: student.id,
        at: new Date(`${effectiveYear}-01-01T00:00:00+09:00`).toISOString(),
        actor: 'system', changes: [{ field: 'grade', before: referenceGrade + step - 1, after: referenceGrade + step }],
      });
    }
  }
  return added.length ? { ...source, events: [...source.events, ...added] } : source;
}

export function pendingTransitions(edu, studentId) {
  const confirmed = new Set(edu.events.filter((event) => event.type === 'promotion.confirmed' && event.studentId === studentId).flatMap((event) => event.promotionIds ?? []));
  return edu.events.filter((event) => event.studentId === studentId && event.type === 'promotion.auto' && !confirmed.has(event.id) && event.changes.some((change) => change.field === 'grade' && change.before === 9 && change.after === 10));
}

function inputText(value, label, options) {
  const text = value ?? '';
  assertText(text, label, options);
  return text.trim();
}

function profileInput(values, now) {
  if (!isRecord(values)) throw new TypeError('원생 정보를 확인해 주세요.');
  const birthYear = integerInput(values.birthYear);
  const grade = integerInput(values.grade);
  assertInteger(birthYear, 1900, seoulYear(now), '출생년도');
  assertInteger(grade, 1, 13, '학년');
  return {
    name: inputText(values.name, '이름', { required: true, max: 100 }), birthYear,
    school: inputText(values.school, '학교', { required: true, max: 200 }), grade,
    studentPhone: inputText(values.studentPhone, '본인 연락처', { max: 100 }),
    guardianPhone: inputText(values.guardianPhone, '보호자 연락처', { max: 100 }),
  };
}

function requireStudent(edu, studentId) {
  assertId(studentId, '원생 ID');
  const student = edu.students.find((item) => item.id === studentId);
  if (!student) throw new TypeError('원생을 찾을 수 없습니다.');
  return student;
}

function requireConsultation(edu, id) {
  assertId(id, '상담 ID');
  const consultation = edu.consultations.find((item) => item.id === id);
  if (!consultation) throw new TypeError('상담을 찾을 수 없습니다.');
  return consultation;
}

function changesFor(fields, before, after) {
  return fields.filter((field) => before?.[field] !== after[field]).map((field) => ({ field, before: before?.[field] ?? null, after: after[field] }));
}

function validateCreationId(action) {
  if (action.id !== undefined && action.createId !== undefined) throw new TypeError('수정 ID와 등록 ID를 동시에 사용할 수 없습니다.');
  if (action.createId !== undefined) assertId(action.createId, '등록 ID');
}

export function applyEduAction(edu, action, { now = new Date(), actor = 'local' } = {}) {
  const date = dateValue(now);
  const at = date.toISOString();
  assertText(actor, '변경 주체', { required: true, max: 512 });
  if (!isRecord(action)) throw new TypeError('Edu 작업을 확인해 주세요.');
  const source = reconcilePromotions(edu, date);
  const addEvent = (next, event) => ({ ...next, events: [...source.events, { id: uid(), at, actor, ...event }] });

  if (action.type === 'admission.save') {
    validateCreationId(action);
    const admissions = source.admissions || [];
    const previous = action.id !== undefined ? admissions.find((item) => item.id === action.id) : admissions.find((item) => item.id === action.createId);
    if (action.id !== undefined && !previous) throw new TypeError('입시 일정을 찾을 수 없습니다.');
    const values = action.values;
    if (!isRecord(values)) throw new TypeError('입시 정보를 확인해 주세요.');
    const next = {
      title: inputText(values.title, '입시 일정명', { required: true, max: 200 }),
      institution: inputText(values.institution, '대학/기관', { max: 200 }),
      track: inputText(values.track, '전형', { max: 200 }),
      startDate: values.startDate, endDate: values.endDate || '', time: values.time || '', notes: values.notes ?? '',
    };
    assertDateKey(next.startDate, '입시 시작일');
    if (next.endDate) { assertDateKey(next.endDate, '입시 종료일'); if (next.endDate < next.startDate) throw new TypeError('종료일은 시작일보다 빠를 수 없습니다.'); }
    if (next.time) assertTime(next.time, '입시 시작 시간');
    assertText(next.notes, '입시 메모');
    const item = { ...previous, ...next, id: previous?.id ?? action.createId ?? uid(), createdAt: previous?.createdAt ?? at, updatedAt: at };
    return { ...source, admissions: previous ? admissions.map((record) => record.id === item.id ? item : record) : [...admissions, item] };
  }

  if (action.type === 'admission.delete') {
    assertId(action.id, '입시 일정 ID');
    if (!(source.admissions || []).some((item) => item.id === action.id)) throw new TypeError('입시 일정을 찾을 수 없습니다.');
    return { ...source, admissions: source.admissions.filter((item) => item.id !== action.id) };
  }

  if (action.type === 'student.save') {
    validateCreationId(action);
    const values = profileInput(action.values, date);
    const { grade, ...profile } = values;
    const previous = action.id !== undefined ? requireStudent(source, action.id) : source.students.find((student) => student.id === action.createId) ?? null;
    const before = previous ? { ...previous, grade: currentGrade(previous, date) } : null;
    const changes = changesFor(PROFILE_FIELDS, before, values);
    if (!changes.length) return source;
    const academic = previous && before.grade === grade ? previous.academic : {
      referenceGrade: grade, referenceYear: seoulYear(date), referenceId: uid(),
    };
    const student = { ...previous, ...profile, id: previous?.id ?? action.createId ?? uid(), academic, memo: previous?.memo ?? '', createdAt: previous?.createdAt ?? at, updatedAt: at };
    const students = previous ? source.students.map((item) => item.id === previous.id ? student : item) : [...source.students, student];
    return addEvent({ ...source, students }, { type: previous ? 'student.updated' : 'student.created', studentId: student.id, changes });
  }

  if (action.type === 'memo.save') {
    const previous = requireStudent(source, action.studentId);
    const memo = action.memo ?? '';
    assertText(memo, '메모');
    if (previous.memo === memo) return source;
    const students = source.students.map((student) => student.id === previous.id ? { ...student, memo, updatedAt: at } : student);
    return addEvent({ ...source, students }, { type: 'memo.updated', studentId: previous.id, changes: [{ field: 'memo', before: previous.memo, after: memo }] });
  }

  if (action.type === 'consultation.save') {
    validateCreationId(action);
    const values = action.values;
    if (!isRecord(values)) throw new TypeError('상담 정보를 확인해 주세요.');
    const previous = action.id !== undefined ? requireConsultation(source, action.id) : source.consultations.find((consultation) => consultation.id === action.createId) ?? null;
    requireStudent(source, values.studentId);
    const next = {
      studentId: values.studentId, title: inputText(values.title, '상담 제목', { required: true, max: 200 }),
      date: values.date, time: values.time, notes: values.notes ?? '', status: values.status ?? previous?.status ?? 'scheduled',
    };
    assertDateKey(next.date);
    assertTime(next.time);
    assertText(next.notes, '상담 내용');
    assertStatus(next.status);
    const changes = changesFor(CONSULTATION_FIELDS, previous, next);
    if (!changes.length) return source;
    const consultation = { ...previous, ...next, id: previous?.id ?? action.createId ?? uid(), createdAt: previous?.createdAt ?? at, updatedAt: at };
    const consultations = previous ? source.consultations.map((item) => item.id === previous.id ? consultation : item) : [...source.consultations, consultation];
    return addEvent({ ...source, consultations }, { type: previous ? 'consultation.updated' : 'consultation.created', studentId: consultation.studentId, consultationId: consultation.id, changes });
  }

  if (action.type === 'consultation.status') {
    const previous = requireConsultation(source, action.id);
    assertStatus(action.status);
    if (previous.status === action.status) return source;
    const consultations = source.consultations.map((item) => item.id === previous.id ? { ...item, status: action.status, updatedAt: at } : item);
    return addEvent({ ...source, consultations }, {
      type: 'consultation.status', studentId: previous.studentId, consultationId: previous.id,
      changes: [{ field: 'status', before: previous.status, after: action.status }],
    });
  }

  if (action.type === 'promotion.confirm') {
    requireStudent(source, action.studentId);
    const pending = pendingTransitions(source, action.studentId);
    if (!pending.length) return source;
    return addEvent(source, {
      type: 'promotion.confirmed', studentId: action.studentId, promotionIds: pending.map((event) => event.id),
      changes: [{ field: 'promotionConfirmed', before: false, after: true }],
    });
  }

  throw new TypeError(`알 수 없는 Edu 작업입니다: ${String(action.type)}`);
}
