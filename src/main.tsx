import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App.tsx";
import { queryClient } from "@/lib/query-client";

// The offline service worker is production only; in development it would serve stale files. Its
// setup loads once the page has, so it stays out of the entry chunk and off the first paint.
const loadPwa = () => import("@/lib/pwa");
if (import.meta.env.PROD) {
  window.addEventListener(
    "load",
    () =>
      void loadPwa().then((pwa) => {
        pwa.reloadOnStaleChunks();
        pwa.registerServiceWorker();
      }),
    { once: true }
  );
} else {
  void loadPwa().then((pwa) => pwa.unregisterServiceWorker());
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
