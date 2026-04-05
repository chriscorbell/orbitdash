import fs from "fs";
import os from "os";
import path from "path";
import { initializeDb, resetDbForTesting } from "./db";

export function createTestDataDir(prefix: string = "orbitdash-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function setupTestDatabase(prefix?: string): string {
  const dataDir = createTestDataDir(prefix);
  resetDbForTesting({ dataDir });
  initializeDb({ dataDir });
  return dataDir;
}

export function cleanupTestDatabase(dataDir: string): void {
  resetDbForTesting({ dataDir });
}