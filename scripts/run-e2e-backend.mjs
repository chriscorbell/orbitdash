import { mkdirSync, rmSync } from "fs";
import { spawn } from "child_process";
import path from "path";

const repoRoot = path.resolve(import.meta.dirname, "..");
// A second backend (the auth e2e project) runs on another port with its own data.
const port = process.env.E2E_BACKEND_PORT ?? "3001";
const dataDir = path.join(repoRoot, port === "3001" ? ".e2e-data" : `.e2e-data-${port}`);

rmSync(dataDir, { force: true, recursive: true });
mkdirSync(dataDir, { recursive: true });

const bunExecutable = process.platform === "win32" ? "bun.exe" : "bun";
const child = spawn(bunExecutable, ["server/index.ts"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    ORBITDASH_DATA_DIR: dataDir,
    // The machine's own containers (or a CI runner's) shouldn't change what the tests see.
    ORBITDASH_DOCKER_HOST: "off",
    PORT: port,
  },
  stdio: "inherit",
});

const shutdown = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
