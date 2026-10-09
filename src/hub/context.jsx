import React, { createContext, useContext, useMemo } from "react";
import useDashboard from "../dashboard/useDashboard.js";

const DashboardContext = createContext(null);
const RuntimeContext = createContext(null);
export function DashboardProvider({ date, setDate, children }) {
  const dashboard = useDashboard(date, setDate);
  const runtime = useMemo(
    () => ({
      displayMode: dashboard.effectiveDisplayMode,
      gate: dashboard.accountGate,
      account: dashboard.account,
      localSync: dashboard.sync,
    }),
    [
      dashboard.effectiveDisplayMode,
      dashboard.accountGate,
      dashboard.account,
      dashboard.sync,
    ],
  );
  return (
    <RuntimeContext.Provider value={runtime}>
      <DashboardContext.Provider value={dashboard}>
        {children}
      </DashboardContext.Provider>
    </RuntimeContext.Provider>
  );
}
export const useDashboardData = () => useContext(DashboardContext);
export const useHubRuntime = () => useContext(RuntimeContext);
