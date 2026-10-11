/** Edu keeps consultation ownership; Flow only resolves and invokes this adapter. */
export function createEduFlowSource({ getEdu, subscribe, save }) {
  if ([getEdu, subscribe, save].some((callback) => typeof callback !== "function")) {
    throw new TypeError("Edu Flow callbacks are required");
  }

  const findConsultation = (id) => {
    const edu = getEdu();
    const consultation = edu.consultations.find((item) => item.id === id);
    const student = consultation && edu.students.find((item) => item.id === consultation.studentId);
    if (!consultation || !student) throw new Error("상담 또는 원생을 찾을 수 없습니다.");
    return { consultation, student };
  };

  return {
    id: "edu",
    getItems(date) {
      const edu = getEdu();
      const students = new Map(edu.students.map((student) => [student.id, student]));
      const consultations = edu.consultations
        .filter((item) => item.date === date && item.status === "scheduled" && students.has(item.studentId))
        .sort((left, right) => left.time.localeCompare(right.time) || left.id.localeCompare(right.id))
        .map((item) => ({
          id: item.id,
          title: `${item.time} · ${students.get(item.studentId).name} · ${item.title}`,
          displayTitle: `${students.get(item.studentId).name} · ${item.title}`,
          time: item.time, kind: 'consultation', sourceLabel: 'Edu · 상담',
          commands: [{ id: "complete", label: "상담 완료" }],
        }));
      const admissions = (edu.admissions || []).filter((item) => item.startDate <= date && (item.endDate || item.startDate) >= date).map((item) => ({
        id: `admission:${item.id}`, title: item.title, displayTitle: [item.institution, item.title].filter(Boolean).join(' · '),
        time: date === item.startDate ? item.time : '', kind: 'admission', sourceLabel: 'Edu · 입시',
        institution: item.institution, track: item.track, startDate: item.startDate, endDate: item.endDate || item.startDate,
        periodStatus: item.endDate && item.endDate !== item.startDate ? date === item.startDate ? '시작' : date === item.endDate ? '마감' : '진행' : '',
      }));
      return [...consultations, ...admissions];
    },
    subscribe,
    openTarget(id) {
      if (id.startsWith('admission:')) {
        const admissionId = id.slice('admission:'.length);
        if (!(getEdu().admissions || []).some((item) => item.id === admissionId)) throw new Error('입시 일정을 찾을 수 없습니다.');
        return { moduleId: 'edu', section: `admissions:${admissionId}` };
      }
      const { student } = findConsultation(id);
      return { moduleId: "edu", section: `student:${student.id}` };
    },
    async execute(id, command) {
      if (command !== "complete") throw new Error("지원하지 않는 상담 작업입니다.");
      const { consultation } = findConsultation(id);
      if (consultation.status === "cancelled") throw new Error("취소된 상담은 완료할 수 없습니다.");
      if (consultation.status === "completed") return;
      return save({ type: "consultation.status", id, status: "completed" });
    },
  };
}
