import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/ui/ErrorBoundary";
import "./themes/fonts";
import "./index.css";
import { applyCachedTheme } from "./themes/themeCache";
import { reloadOnceForNewVersion } from "./utils/reloadOnce";
import { removeLegacyPickerCaches } from "./utils/removeLegacyPickerCaches";

removeLegacyPickerCaches();

// Paint the theme this browser last showed before React renders, so the first
// frame is never unstyled or in the wrong colours
applyCachedTheme();

// After an upgrade, a page chunk of the old build is gone: reload once for the
// new build. When the guard says it already did, the error reaches the boundary.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadOnceForNewVersion()) event.preventDefault();
});

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
