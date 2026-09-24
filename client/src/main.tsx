import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./themes/fonts";
import "./index.css";

const _probe: number = "x";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
