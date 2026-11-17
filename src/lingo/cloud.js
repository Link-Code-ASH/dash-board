import { accountClient } from "../accountSync.js";

export function cloudAdapter(userId) {
  return {
    // `known` maps deck id -> revision already stored on this device. Only the small
    // revision list is fetched on every poll; full decks (up to ~1MB each) are downloaded
    // only when their revision differs, which keeps Supabase egress low.
    async read(known = new Map()) {
      const heads = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await accountClient.from("lingo_decks")
          .select("deck_id,revision").eq("user_id", userId).order("deck_id")
          .range(offset, offset + 999).abortSignal(AbortSignal.timeout(15000));
        if (error) throw error;
        heads.push(...data);
        if (data.length < 1000) break;
      }
      const changed = heads.filter((row) => known.get(row.deck_id) !== row.revision).map((row) => row.deck_id);
      const rows = [];
      for (let index = 0; index < changed.length; index += 20) {
        const { data, error } = await accountClient.from("lingo_decks")
          .select("deck_id,payload,revision").eq("user_id", userId).in("deck_id", changed.slice(index, index + 20))
          .order("deck_id").abortSignal(AbortSignal.timeout(30000));
        if (error) throw error;
        rows.push(...data);
      }
      return rows;
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
