import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { AuthGate } from "@/components/auth/AuthGate";
import { queryClient } from "@/lib/query-client";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGate />
    </QueryClientProvider>
  </StrictMode>
);
