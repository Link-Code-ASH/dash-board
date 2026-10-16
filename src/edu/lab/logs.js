import { labFailure } from "./cloud.js";

/** Reads the newest work-log rows Claude wrote. The app never writes this table. */
export async function readLabLogs(client, userId, { signal, limit = 60, timeoutMs = 15000 } = {}) {
  if (!userId) throw labFailure("LAB_ACCOUNT", "문항 연구소를 사용하려면 로그인해주세요.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const { data, error } = await client.from("edu_lab_logs").select("id, ran_at, title, body")
      .eq("user_id", userId).order("ran_at", { ascending: false }).limit(limit)
      .abortSignal(controller.signal);
    if (signal?.aborted) throw labFailure("LAB_ACCOUNT_CHANGED", "계정이 변경되어 작업을 중단했습니다.");
    if (error) {
      if (["PGRST205", "42P01"].includes(error.code)) throw labFailure("LAB_LOGS_MISSING", "작업 기록 테이블이 아직 없습니다.");
      throw error;
    }
    if (!Array.isArray(data)) throw labFailure("LAB_DATA", "작업 기록을 읽지 못했습니다.");
    return data.filter((row) => row && typeof row.id === "string");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

const SEOUL = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
});

export function logTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : SEOUL.format(date);
}
