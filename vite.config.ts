/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // Object form keeps changeOrigin off, so the server sees the browser's Host header; its
    // cross-site guard compares that against Origin.
    proxy: { "/api": { target: "http://localhost:3001" } },
  },
  test: {
    include: ["server/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
  },
});
