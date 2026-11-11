import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initTheme } from "./theme";
import "./styles.css";

initTheme();

const host = document.getElementById("root");
if (!host) throw new Error("#root not found");

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);