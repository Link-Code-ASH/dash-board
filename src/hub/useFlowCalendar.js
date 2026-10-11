import { useEffect, useState } from "react";
import { addDays } from "../dashboard/model.js";

export default function useFlowCalendar(week, owner) {
  const [state, setState] = useState({ week: "", owner: "", byDate: {}, error: "" });
  useEffect(() => {
    let cancelled = false, generation = 0;
    let cleanup = () => {};
    const dates = Array.from({ length: 14 }, (_, index) => addDays(week, index));
    import("./moduleRegistry.js").then((registry) => {
      if (cancelled) return;
      let unsubscribers = [];
      const connect = () => {
        generation += 1;
        unsubscribers.forEach((stop) => stop());
        const sources = registry.getFlowSources();
        let failedSubscription = false;
        const refresh = async () => {
          const current = ++generation;
          const results = await Promise.allSettled(sources.flatMap((source) => dates.map(async (date) => {
            const items = await source.getItems(date);
            if (!Array.isArray(items) || items.some((item) => typeof item?.id !== "string" || typeof item.title !== "string")) throw new Error("Invalid Flow items");
            return { date, items: items.map((item) => ({ ...item, date, source })) };
          })));
          if (cancelled || generation !== current) return;
          const byDate = {};
          results.filter((result) => result.status === "fulfilled").forEach(({ value }) => { (byDate[value.date] ||= []).push(...value.items); });
          setState({ week, owner, byDate, error: results.some((result) => result.status === "rejected") ? "일부 연결된 일정을 불러오지 못했습니다." : failedSubscription ? "일부 일정의 변경 알림을 받지 못했습니다." : "" });
        };
        unsubscribers = sources.flatMap((source) => {
          try { return [source.subscribe(refresh)]; }
          catch { failedSubscription = true; return []; }
        });
        refresh();
      };
      const stopRegistry = registry.subscribeFlowSources(connect);
      cleanup = () => { stopRegistry(); unsubscribers.forEach((stop) => stop()); };
      connect();
    }).catch(() => { if (!cancelled) setState({ week, owner, byDate: {}, error: "연결된 일정을 불러오지 못했습니다." }); });
    return () => { cancelled = true; generation += 1; cleanup(); };
  }, [week, owner]);
  return state.week === week && state.owner === owner ? state : { byDate: {}, error: "" };
}
