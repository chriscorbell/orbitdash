import { describe, expect, it } from "bun:test";
import fs from "fs";
import path from "path";
import { createTestDataDir } from "./test-utils";

const repoRoot = path.resolve(import.meta.dirname, "..");

// Regression test: signal handlers must exit the process explicitly, otherwise
// docker stop hangs for the full grace period and ends in SIGKILL.
describe("process termination", () => {
  it("exits promptly on SIGTERM", async () => {
    const dataDir = createTestDataDir("orbitdash-shutdown-");
    const serverProcess = Bun.spawn(["bun", "server/index.ts"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        ORBITDASH_DATA_DIR: dataDir,
        PORT: "0",
      },
      stdout: "ignore",
      stderr: "ignore",
    });

    try {
      await Bun.sleep(1500);
      serverProcess.kill("SIGTERM");

      const result = await Promise.race([
        serverProcess.exited,
        Bun.sleep(5000).then(() => "timeout" as const),
      ]);

      expect(result).toBe(0);
    } finally {
      serverProcess.kill(9);
      fs.rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
