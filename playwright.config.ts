import { defineConfig, devices } from "@playwright/test";

const port = 4319;

export default defineConfig({
  testDir: "./e2e",
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    // The production server on a fresh data directory, serving a fresh build.
    command: "vite build --logLevel warn && node e2e/server.ts",
    env: { PORT: String(port), ORBITDASH_DATA_DIR: ".e2e-data" },
    url: `http://127.0.0.1:${port}/readyz`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
