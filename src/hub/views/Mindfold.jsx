import React from "react";
import MindfoldWorkspace from "../../mindfold/MindfoldWorkspace.jsx";
import { useDashboardData } from "../context.jsx";

export default function Mindfold() {
  const d = useDashboardData();
  return (
    <MindfoldWorkspace
      legacy={d.data.mindfold}
      displayMode={d.effectiveDisplayMode}
    />
  );
}
