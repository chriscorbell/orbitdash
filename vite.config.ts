import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Object form keeps changeOrigin off, so the backend sees the browser's
      // Host header; the API's cross-site guard compares it against Origin.
      "/api": { target: "http://localhost:3001" },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/zod/")) {
            return "validation";
          }

          if (!id.includes("node_modules")) {
            return;
          }

          if (
            id.includes("/node_modules/chart.js/") ||
            id.includes("/node_modules/react-chartjs-2/") ||
            id.includes("/node_modules/@kurkle/color/")
          ) {
            return "charts";
          }

          if (id.includes("@dnd-kit")) {
            return "drag-drop";
          }

          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) {
            return "react-vendor";
          }

          if (id.includes("lucide-react")) {
            return "icons";
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});
