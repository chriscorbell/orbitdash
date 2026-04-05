import { defineConfig, devices } from "@playwright/test";

const frontendPort = 4173;
const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: isCi ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: [
    {
      command: "node scripts/run-e2e-backend.mjs",
      reuseExistingServer: !isCi,
      timeout: 120_000,
      url: "http://127.0.0.1:3001/readyz",
    },
    {
      command: `vite --host 127.0.0.1 --port ${frontendPort}`,
      reuseExistingServer: !isCi,
      timeout: 120_000,
      url: `http://127.0.0.1:${frontendPort}`,
    },
  ],
});
