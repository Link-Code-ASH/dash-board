import React, { useEffect, useState } from "react";
import { accountClient } from "../../accountSync.js";
import LabMarkdown from "./LabMarkdown.jsx";
import { logTime, readLabLogs } from "./logs.js";

export default function LabLogs({ userId, version }) {
  const [state, setState] = useState({ rows: [], loading: true, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: "" }));
    readLabLogs(accountClient, userId, { signal: controller.signal })
      .then((rows) => setState({ rows, loading: false, error: "" }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({ rows: [], loading: false, error: error.code === "LAB_LOGS_MISSING" ? "" : error.message || "작업 기록을 불러오지 못했습니다." });
      });
    return () => controller.abort();
  }, [userId, version]);
  if (state.loading && !state.rows.length) return <div className="edu-lab-empty">작업 기록을 불러오는 중입니다…</div>;
  return <section className="edu-panel edu-lab-logs" aria-label="Claude 작업 기록">
    <p className="edu-lab-logs-hint">Claude가 3일마다 새벽 4시에 피드백을 확인하고, 한 일을 여기에 짧게 적습니다.</p>
    {state.error && <p className="edu-error" role="alert">{state.error}</p>}
    {state.rows.length ? <ol>{state.rows.map((row) => <li key={row.id}>
      <time dateTime={row.ran_at}>{logTime(row.ran_at)}</time>
      <strong>{row.title || "정기 점검"}</strong>
      {row.body && <LabMarkdown>{row.body}</LabMarkdown>}
    </li>)}</ol> : !state.error && <div className="edu-lab-empty">아직 기록이 없습니다. 다음 정기 점검 뒤에 여기에 나타납니다.</div>}
  </section>;
}
