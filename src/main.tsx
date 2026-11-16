import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/themes.css";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Once the first screen is up and the browser is idle, fetch the parts that load on demand,
// so opening them later is instant and works offline even before the service worker has cached them.
const warm = () => {
  void import("./components/TaskSheet");
  void import("./components/layouts/BoardColumns");
  void import("./components/layouts/CalendarLayout");
  void import("./components/layouts/TableLayout");
  void import("./views/Board");
  void import("./views/Done");
  void import("./views/Focus");
  void import("./views/Search");
  void import("./views/Settings");
};
if ("requestIdleCallback" in window) window.requestIdleCallback(warm, { timeout: 5000 });
else setTimeout(warm, 2500);

// The service worker makes the app work offline. Registering after load keeps it out of the first paint.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" });
  });
}
