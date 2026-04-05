import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { isDbInitialized } from "./db";
import { isCollectionRunning } from "./metrics";
import { initializeServer, shutdown } from "./runtime";
import { cleanupTestDatabase, createTestDataDir } from "./test-utils";

let testDataDir: string | null = null;

beforeEach(() => {
  shutdown();
  testDataDir = null;
});

afterEach(() => {
  shutdown();
  if (testDataDir) {
    cleanupTestDatabase(testDataDir);
  }
});

describe("runtime shutdown", () => {
  it("stops metrics collection and closes the database", () => {
    testDataDir = createTestDataDir("orbitdash-runtime-");

    initializeServer({
      dataDir: testDataDir,
      logStartup: false,
      registerSignalHandlers: false,
      startMetrics: true,
    });

    expect(isDbInitialized()).toBe(true);
    expect(isCollectionRunning()).toBe(true);

    shutdown();

    expect(isCollectionRunning()).toBe(false);
    expect(isDbInitialized()).toBe(false);
  });

  it("is safe to call shutdown more than once", () => {
    expect(() => shutdown()).not.toThrow();
    expect(() => shutdown()).not.toThrow();
  });
});
