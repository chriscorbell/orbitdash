import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App.tsx";
import { registerServiceWorker, reloadOnStaleChunks, unregisterServiceWorker } from "@/lib/pwa";
import { queryClient } from "@/lib/query-client";

// The offline service worker is production only; in development it would serve stale files.
if (import.meta.env.PROD) {
  registerServiceWorker();
  reloadOnStaleChunks();
} else {
  unregisterServiceWorker();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
