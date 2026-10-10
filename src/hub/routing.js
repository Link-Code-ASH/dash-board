import { useCallback, useEffect, useState } from "react";
import { getWeekStart } from "../dashboard/model.js";
import { isValidMonth } from "./calendarMonth.js";

export const moduleIds = ["flow", "routine", "edu", "lingo", "mindfold", "stock"];
export function appBase(path = window.location.pathname) {
  return path
    .replace(/(?:hub|flow|routine|edu|lingo|mindfold|stock)\/(?:index\.html)?$/, "")
    .replace(/index\.html$/, "")
    .replace(/\/?$/, "/");
}
export function installedModule(path = window.location.pathname) {
  return (
    path.match(/\/(flow|routine|edu|lingo|mindfold|stock)\/(?:index\.html)?$/)?.[1] ||
    null
  );
}
export function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function readRoute() {
  const standalone = installedModule();
  const [path, query = ""] = window.location.hash
    .replace(/^#\/?/, "")
    .split("?");
  const [module, section] = path.split("/");
  const params = new URLSearchParams(query);
  const date = params.get("date");
  const selectedDate =
    /^\d{4}-\d{2}-\d{2}$/.test(date || "") &&
    !Number.isNaN(new Date(`${date}T12:00:00`).getTime())
      ? date
      : todayKey();
  const week = params.get("week");
  const month = params.get("month");
  return {
    module:
      module === "settings"
        ? "settings"
        : standalone || (moduleIds.includes(module) ? module : "flow"),
    section:
      section ||
      (module === "lingo" || standalone === "lingo" ? "ja" : "today"),
    date: selectedDate,
    month: isValidMonth(month) ? month : selectedDate.slice(0, 7),
    week: getWeekStart(
      /^\d{4}-\d{2}-\d{2}$/.test(week || "") &&
        !Number.isNaN(new Date(`${week}T12:00:00`).getTime())
        ? week
        : selectedDate,
    ),
  };
}
export function useHubRoute() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const sync = () => setRoute(readRoute());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);
  const navigate = useCallback(
    (
      module,
      section = module === "lingo" ? "ja" : "today",
      date,
      options = {},
    ) => {
      if (!moduleIds.includes(module) && module !== "settings") return;
      window.dispatchEvent(new Event("mindfold:flush"));
      const current = readRoute();
      const nextDate = date || current.date;
      const week = getWeekStart(
        options.week || (date ? nextDate : current.week),
      );
      const month = options.month || (date ? nextDate.slice(0, 7) : current.month);
      const query = new URLSearchParams({ date: nextDate, week });
      if (section === "calendar" && (module === "routine" || module === "flow"))
        query.set("month", isValidMonth(month) ? month : nextDate.slice(0, 7));
      const hash = `#/${module}/${section}?${query}`;
      if (
        installedModule() &&
        module !== "settings" &&
        module !== installedModule()
      ) {
        window.location[options.replace ? "replace" : "assign"](`${appBase()}${module}/${hash}`);
        return;
      }
      if (window.location.hash !== hash)
        window.history[options.replace ? "replaceState" : "pushState"](null, "", hash);
      setRoute(readRoute());
    },
    [],
  );
  return [route, navigate];
}
