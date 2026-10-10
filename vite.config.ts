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
    rolldownOptions: {
      output: {
        // A group also captures the dependencies of the modules it matches, so
        // React has to be claimed first (highest priority). Otherwise chart.js
        // or dnd-kit drag React into their chunk, the entry has to import that
        // chunk, and the lazy chart and settings imports stop being lazy.
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 40,
            },
            {
              // Zod only: the app's own schemas change with the app, so they
              // ship in the entry and keep this chunk's hash stable.
              name: "validation",
              test: /[\\/]node_modules[\\/]zod[\\/]/,
              priority: 30,
            },
            {
              name: "charts",
              test: /[\\/]node_modules[\\/](chart\.js|react-chartjs-2|@kurkle[\\/]color)[\\/]/,
              priority: 20,
            },
            {
              name: "drag-drop",
              test: /[\\/]node_modules[\\/]@dnd-kit[\\/]/,
              priority: 20,
            },
            {
              name: "icons",
              test: /[\\/]node_modules[\\/]lucide-react[\\/]/,
              priority: 10,
            },
            {
              // Remaining third-party code the first render needs (Radix,
              // Floating UI, tailwind-merge). `$initial` leaves packages that
              // only lazy chunks use, such as the Select and Tabs primitives,
              // in those lazy chunks.
              name: "vendor",
              test: /[\\/]node_modules[\\/]/,
              tags: ["$initial"],
              priority: 0,
            },
          ],
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
