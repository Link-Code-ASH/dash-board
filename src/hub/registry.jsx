import { lazy } from "react";
import {
  LayoutDashboard,
  ListChecks,
  GraduationCap,
  Languages,
  NotebookPen,
} from "lucide-react";

export const modules = [
  {
    id: "flow",
    name: "Flow",
    icon: LayoutDashboard,
    path: "flow/",
    Component: lazy(() => import("./views/Flow.jsx")),
  },
  {
    id: "routine",
    name: "Routine",
    icon: ListChecks,
    path: "routine/",
    Component: lazy(() => import("./views/Routine.jsx")),
  },
  {
    id: "edu",
    name: "Edu",
    icon: GraduationCap,
    path: "edu/",
    Component: lazy(() => import("./views/Edu.jsx")),
  },
  {
    id: "lingo",
    name: "Lingo",
    icon: Languages,
    path: "lingo/",
    Component: lazy(() => import("./views/Lingo.jsx")),
  },
  {
    id: "mindfold",
    name: "Mindfold",
    icon: NotebookPen,
    path: "mindfold/",
    Component: lazy(() => import("./views/Mindfold.jsx")),
  },
];
