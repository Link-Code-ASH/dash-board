import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./responsive.css";
import "./mindfold/document.css";
import "./hub/hub.css";
import "./hub/desktop.css";
import "./hub/flow-planner-refresh.css";
import { registerPwa } from "./hub/pwa.js";
import { restoreAuthReturn } from "./hub/authReturn.js";
import { hubStorage, openHubStorage } from "./dashboard/hubStorage.js";
import { startAutoUpdate } from "./hub/autoUpdate.js";

startAutoUpdate(registerPwa(), { flush: () => hubStorage.flushed() });
restoreAuthReturn();

// HUB data lives in IndexedDB; load it before the first render reads it.
openHubStorage().finally(() => {
  createRoot(document.querySelector("#root")).render(
    React.createElement(React.StrictMode, null, React.createElement(App)),
  );
});
