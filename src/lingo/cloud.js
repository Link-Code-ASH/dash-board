import { accountClient } from "../accountSync.js";

export function cloudAdapter(userId) {
  return {
    async read() {
      const rows = [];
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await accountClient.from("lingo_decks")
          .select("deck_id,payload,revision").eq("user_id", userId).order("deck_id")
          .range(offset, offset + 99).abortSignal(AbortSignal.timeout(15000));
        if (error) throw error;
        rows.push(...data);
        if (data.length < 100) return rows;
      }
    },
    async write(deck, revision) {
      const value = { payload: deck, revision: revision + 1 };
      const query = revision
        ? accountClient.from("lingo_decks").update(value).eq("user_id", userId).eq("deck_id", deck.id).eq("revision", revision)
        : accountClient.from("lingo_decks").insert({ ...value, user_id: userId, deck_id: deck.id });
      const { data, error } = await query.select("revision").maybeSingle().abortSignal(AbortSignal.timeout(15000));
      if (error?.code === "23505" || (!error && !data)) throw Object.assign(new Error("다른 기기의 변경을 다시 확인합니다."), { code: "LINGO_CONFLICT" });
      if (error) throw error;
      return data.revision;
    },
  };
}
