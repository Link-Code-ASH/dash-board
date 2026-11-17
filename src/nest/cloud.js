import { accountClient } from "../accountSync.js";

const timeout = () => AbortSignal.timeout(20000);

// One row per creature, egg or decoration in `nest_items` (supabase/nest.sql), with optimistic revisions.
export function cloudAdapter(userId) {
  return {
    // Just ids and revisions: a few bytes per row, enough to tell what changed since the last sync.
    async revisions() {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await accountClient.from("nest_items")
          .select("item_id,revision").eq("user_id", userId).order("item_id")
          .range(offset, offset + 999).abortSignal(timeout());
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) return rows;
      }
    },
    // Whole rows, only for the given ids (or every row when ids is left out).
    async read(ids) {
      const rows = [];
      if (ids) {
        for (let start = 0; start < ids.length; start += 100) {
          const { data, error } = await accountClient.from("nest_items")
            .select("item_id,payload,revision").eq("user_id", userId).in("item_id", ids.slice(start, start + 100))
            .abortSignal(timeout());
          if (error) throw error;
          rows.push(...data);
        }
        return rows;
      }
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await accountClient.from("nest_items")
          .select("item_id,payload,revision").eq("user_id", userId).order("item_id")
          .range(offset, offset + 499).abortSignal(timeout());
        if (error) throw error;
        rows.push(...data);
        if (data.length < 500) return rows;
      }
    },
    async write(item, revision) {
      const value = { payload: item, revision: revision + 1 };
      const query = revision
        ? accountClient.from("nest_items").update(value).eq("user_id", userId).eq("item_id", item.id).eq("revision", revision)
        : accountClient.from("nest_items").insert({ ...value, user_id: userId, item_id: item.id });
      const { data, error } = await query.select("revision").maybeSingle().abortSignal(timeout());
      if (error?.code === "23505" || (!error && !data)) throw Object.assign(new Error("다른 기기의 변경을 다시 확인합니다."), { code: "NEST_CONFLICT" });
      if (error) throw error;
      return data.revision;
    },
  };
}
