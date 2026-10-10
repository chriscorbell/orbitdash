import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import fs from "fs";
import path from "path";
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

describe("runtime icon cleanup", () => {
  function seedIcons(dataDir: string): string {
    const iconsDir = path.join(dataDir, "icons");
    fs.mkdirSync(iconsDir, { recursive: true });
    fs.writeFileSync(path.join(iconsDir, "orphan.png"), "stale");
    return iconsDir;
  }

  it("removes orphaned icon files once the database is ready", () => {
    testDataDir = createTestDataDir("orbitdash-runtime-icons-");
    const iconsDir = seedIcons(testDataDir);
    const log = spyOn(console, "log").mockImplementation(() => {});

    initializeServer({
      dataDir: testDataDir,
      logStartup: false,
      registerSignalHandlers: false,
      startJobs: false,
      startMetrics: false,
    });

    expect(fs.readdirSync(iconsDir)).toEqual([]);
    expect(log.mock.calls.map(([line]) => JSON.parse(String(line)))).toContainEqual(
      expect.objectContaining({ event: "icons.cleanup", level: "info", removed: 1 })
    );
    log.mockRestore();
  });

  it("can skip the cleanup", () => {
    testDataDir = createTestDataDir("orbitdash-runtime-icons-skip-");
    const iconsDir = seedIcons(testDataDir);

    initializeServer({
      cleanupIcons: false,
      dataDir: testDataDir,
      logStartup: false,
      registerSignalHandlers: false,
      startJobs: false,
      startMetrics: false,
    });

    expect(fs.readdirSync(iconsDir)).toEqual(["orphan.png"]);
  });

  it("keeps starting when the cleanup fails", () => {
    testDataDir = createTestDataDir("orbitdash-runtime-icons-fail-");
    // A file where the icons directory should be makes the directory scan throw.
    fs.writeFileSync(path.join(testDataDir, "icons"), "not a directory");
    const errorLog = spyOn(console, "error").mockImplementation(() => {});

    initializeServer({
      dataDir: testDataDir,
      logStartup: false,
      registerSignalHandlers: false,
      startJobs: false,
      startMetrics: false,
    });

    expect(isDbInitialized()).toBe(true);
    expect(errorLog.mock.calls.map(([line]) => JSON.parse(String(line)))).toContainEqual(
      expect.objectContaining({ event: "icons.cleanup_failed", level: "error" })
    );
    errorLog.mockRestore();
  });
});
