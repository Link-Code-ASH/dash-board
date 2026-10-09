import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./responsive.css";
import "./mindfold/document.css";
import "./hub/hub.css";
import { registerPwa } from "./hub/pwa.js";
import { restoreAuthReturn } from "./hub/authReturn.js";

registerPwa();
restoreAuthReturn();

createRoot(document.querySelector("#root")).render(
  React.createElement(React.StrictMode, null, React.createElement(App)),
);
