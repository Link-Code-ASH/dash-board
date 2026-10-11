const TABLES = new Set(["edu_notes", "edu_items"]);
const NOTE_FIELDS = ["title", "body", "kind", "scope", "tags", "source"];
const ITEM_FIELDS = ["feedback", "status"];
const STATUSES = new Set(["draft", "review", "revise", "approved"]);

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
    if (field === "status" && !STATUSES.has(value)) throw labFailure("LAB_PATCH", "문항 상태를 확인해주세요.");
  }
  return { ...patch };
}

/** This adapter can only read or PATCH the two independent Lab tables. */
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
  };
}
