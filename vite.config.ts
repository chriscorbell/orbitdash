import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { serviceWorker } from "./scripts/vite-service-worker.ts";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker({ entry: "src/sw/service-worker.ts" })],
  server: {
    proxy: {
      // Object form keeps changeOrigin off, so the backend sees the browser's
      // Host header; the API's cross-site guard compares it against Origin.
      // ORBITDASH_API_PROXY points the dev server at another backend (the e2e
      // suite runs a second one with auth turned on).
      "/api": { target: process.env.ORBITDASH_API_PROXY ?? "http://localhost:3001" },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // A group also captures the dependencies of the modules it matches, so
        // React has to be claimed first (highest priority). Otherwise dnd-kit
        // drags React into its chunk, the entry has to import that chunk, and
        // the lazy drag-and-drop imports stop being lazy.
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 40,
            },
            {
              // zod/mini and the core it shares with full zod: what the browser
              // needs to parse API responses on first paint. Full zod (classic)
              // is left out so it lands in the lazy service-dialog chunk, the
              // only browser code that validates forms with it.
              name: "validation",
              test: /[\\/]node_modules[\\/]zod[\\/](v4[\\/](core|mini|locales)|mini|v4-mini)[\\/]/,
              priority: 30,
            },
            {
              name: "drag-drop",
              test: /[\\/]node_modules[\\/]@dnd-kit[\\/]/,
              priority: 20,
            },
            {
              // The live event channel: the first render opens it, and lazy chunks
              // (status dots, widgets) subscribe to it too. Its own chunk keeps it
              // from being folded into whichever chunk the bundler picks.
              name: "event-stream",
              test: /[\\/]src[\\/]lib[\\/]live[\\/]event-stream\.ts$/,
              priority: 15,
            },
            {
              // The browser's response schemas, with the settings defaults they
              // fill in: the first render parses with them, and lazy chunks (the
              // editor's bulk actions) do too. Named, so the bundler splits them
              // the same way every build, and they stay cached across app changes.
              name: "api-schemas",
              test: /[\\/]src[\\/]lib[\\/]api[\\/]schemas\.ts$/,
              priority: 14,
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
