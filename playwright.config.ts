import { defineConfig, devices } from "@playwright/test";
import { E2E_PASSWORD } from "./e2e/auth-backend";

const frontendPort = 4173;
const isCi = Boolean(process.env.CI);

// A second backend and frontend with password auth, for e2e/auth.spec.ts.
const authBackendPort = 3002;
const authFrontendPort = 4174;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: isCi ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}`,
    screenshot: "only-on-failure",
    // The suite runs against the Vite dev server, which never registers the offline worker; block
    // workers anyway so cached responses can never leak between tests.
    serviceWorkers: "block",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /auth\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "auth-password",
      testMatch: /auth\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://127.0.0.1:${authFrontendPort}`,
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
    {
      command: "node scripts/run-e2e-backend.mjs",
      env: {
        E2E_BACKEND_PORT: String(authBackendPort),
        ORBITDASH_AUTH: "password",
        ORBITDASH_PASSWORD: E2E_PASSWORD,
      },
      reuseExistingServer: !isCi,
      timeout: 120_000,
      url: `http://127.0.0.1:${authBackendPort}/readyz`,
    },
    {
      command: `vite --host 127.0.0.1 --port ${authFrontendPort}`,
      env: { ORBITDASH_API_PROXY: `http://127.0.0.1:${authBackendPort}` },
      reuseExistingServer: !isCi,
      timeout: 120_000,
      url: `http://127.0.0.1:${authFrontendPort}`,
    },
  ],
});
