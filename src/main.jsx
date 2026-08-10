import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./responsive.css";
import "./mindfold/mindfold.css";

createRoot(document.querySelector("#root")).render(
  React.createElement(React.StrictMode, null, React.createElement(App)),
);
