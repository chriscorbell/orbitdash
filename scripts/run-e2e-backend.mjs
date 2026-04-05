import { mkdirSync, rmSync } from "fs";
import { spawn } from "child_process";
import path from "path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const dataDir = path.join(repoRoot, ".e2e-data");

rmSync(dataDir, { force: true, recursive: true });
mkdirSync(dataDir, { recursive: true });

const bunExecutable = process.platform === "win32" ? "bun.exe" : "bun";
const child = spawn(bunExecutable, ["server/index.ts"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    ORBITDASH_DATA_DIR: dataDir,
    PORT: "3001",
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
