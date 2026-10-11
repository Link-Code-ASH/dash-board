const TABLES = new Set(["edu_notes", "edu_items"]);
const NOTE_FIELDS = ["title", "body", "kind", "scope", "tags", "source"];
const ITEM_FIELDS = ["feedback", "review_state", "usage", "difficulty"];
const CHOICES = {
  review_state: new Set(["unreviewed", "feedback", "applied"]),
  usage: new Set(["hold", "use", "revise", "discard"]),
  difficulty: new Set(["", "최상", "상", "중", "하"]),
};
// The app may only create production principles; Claude writes every other note kind.
const NEW_NOTE_KINDS = new Set(["principle"]);

export function labFailure(code, message, details = {}) {
  return Object.assign(new Error(message), { code, ...details });
}

export function editableLabFields(table) {
  if (!TABLES.has(table)) throw labFailure("LAB_TABLE", "문항 연구소의 테이블이 아닙니다.");
  return table === "edu_notes" ? NOTE_FIELDS : ITEM_FIELDS;
}

export function validateLabPatch(table, patch) {
  const allowed = editableLabFields(table);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw labFailure("LAB_PATCH", "저장할 내용을 확인해주세요.");
  }
  for (const [field, value] of Object.entries(patch)) {
    if (!allowed.includes(field)) throw labFailure("LAB_PATCH", `앱에서 수정할 수 없는 칸입니다: ${field}`);
    if (field === "tags") {
      if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
        throw labFailure("LAB_PATCH", "태그는 글자 목록이어야 합니다.");
      }
    } else if (typeof value !== "string") {
      throw labFailure("LAB_PATCH", `${field}에는 글자를 입력해주세요.`);
    }
    if (Object.hasOwn(CHOICES, field) && !CHOICES[field].has(value)) throw labFailure("LAB_PATCH", "문항 속성 값을 확인해주세요.");
  }
  return { ...patch };
}

export function validateNewNote(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw labFailure("LAB_PATCH", "저장할 내용을 확인해주세요.");
  const note = { kind: input.kind, title: input.title, body: input.body, scope: input.scope ?? "전 과목" };
  if (!NEW_NOTE_KINDS.has(note.kind)) throw labFailure("LAB_PATCH", "앱에서는 제작 원칙만 새로 만들 수 있습니다.");
  for (const field of ["title", "body", "scope"]) {
    if (typeof note[field] !== "string") throw labFailure("LAB_PATCH", `${field}에는 글자를 입력해주세요.`);
  }
  if (!note.title.trim() && !note.body.trim()) throw labFailure("LAB_PATCH", "제목이나 본문을 입력해주세요.");
  return note;
}

/** This adapter can only read, PATCH, soft delete, or add principles to the two Lab tables. */
export function createLabCloud(client, userId, { signal, pageSize = 100, timeoutMs = 15000 } = {}) {
  if (!userId) throw labFailure("LAB_ACCOUNT", "문항 연구소를 사용하려면 로그인해주세요.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new Error("Invalid page size");
  const check = () => {
    if (signal?.aborted) throw labFailure("LAB_ACCOUNT_CHANGED", "계정이 변경되어 작업을 중단했습니다.");
  };
  const request = async (build) => {
    check();
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      const { data, error } = await build().abortSignal(controller.signal);
      check();
      if (error) throw error;
      return data;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  };
  return {
    async read(table) {
      editableLabFields(table);
      const rows = [];
      for (let offset = 0; ; offset += pageSize) {
        const page = await request(() => client.from(table).select("*")
          .eq("user_id", userId).is("deleted_at", null).order("id", { ascending: true })
          .range(offset, offset + pageSize - 1));
        if (!Array.isArray(page)) throw labFailure("LAB_DATA", "문항 연구소의 목록을 읽지 못했습니다.");
        rows.push(...page);
        if (page.length < pageSize) return rows;
      }
    },
    async readRow(table, id) {
      editableLabFields(table);
      return request(() => client.from(table).select("*").eq("user_id", userId).eq("id", id).maybeSingle());
    },
    async update(table, id, revision, patch) {
      const changes = validateLabPatch(table, patch);
      if (typeof id !== "string" || !id || !Number.isSafeInteger(revision) || revision < 1) {
        throw labFailure("LAB_DATA", "문항 연구소의 행과 revision을 확인해주세요.");
      }
      const row = await request(() => client.from(table).update({ ...changes, revision: revision + 1 })
        .eq("user_id", userId).eq("id", id).eq("revision", revision).is("deleted_at", null)
        .select("*").maybeSingle());
      if (!row) throw labFailure("LAB_CAS_MISS", "다른 곳에서 변경된 내용을 확인합니다.");
      return row;
    },
    async insertNote(id, input) {
      const note = validateNewNote(input);
      if (typeof id !== "string" || !/^principle-[0-9a-f-]{36}$/.test(id)) throw labFailure("LAB_DATA", "새 원칙의 ID를 확인해주세요.");
      return request(() => client.from("edu_notes").insert({ ...note, id, user_id: userId, revision: 1 }).select("*").maybeSingle());
    },
    // Soft delete is a revision-checked update; rows are never physically removed.
    async remove(table, id, revision) {
      editableLabFields(table);
      if (typeof id !== "string" || !id || !Number.isSafeInteger(revision) || revision < 1) {
        throw labFailure("LAB_DATA", "문항 연구소의 행과 revision을 확인해주세요.");
      }
      const row = await request(() => client.from(table).update({ deleted_at: new Date().toISOString(), revision: revision + 1 })
        .eq("user_id", userId).eq("id", id).eq("revision", revision).is("deleted_at", null)
        .select("*").maybeSingle());
      if (!row) throw labFailure("LAB_CAS_MISS", "다른 곳에서 변경된 내용을 확인합니다.");
      return row;
    },
  };
}
