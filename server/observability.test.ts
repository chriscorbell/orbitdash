import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { app } from "./app";
import { getLogLevel, getRequestLogLevel, recordRequest, writeLog } from "./observability";
import { initializeServer, shutdown } from "./runtime";
import { cleanupTestDatabase, createTestDataDir } from "./test-utils";

const originalLogLevel = process.env.LOG_LEVEL;
let testDataDir: string | null = null;

function captureConsole() {
  return {
    error: spyOn(console, "error").mockImplementation(() => {}),
    log: spyOn(console, "log").mockImplementation(() => {}),
    warn: spyOn(console, "warn").mockImplementation(() => {}),
  };
}

function parsedLines(spy: ReturnType<typeof spyOn>): Array<Record<string, unknown>> {
  return spy.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
}

beforeEach(() => {
  delete process.env.LOG_LEVEL;
});

afterEach(() => {
  mock.restore();
  if (originalLogLevel === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = originalLogLevel;
  }
  shutdown();
  if (testDataDir) {
    cleanupTestDatabase(testDataDir);
    testDataDir = null;
  }
});

describe("getLogLevel", () => {
  it("defaults to info", () => {
    expect(getLogLevel()).toBe("info");
  });

  it("accepts each known level, ignoring case and whitespace", () => {
    for (const level of ["debug", "info", "warn", "error"]) {
      process.env.LOG_LEVEL = ` ${level.toUpperCase()} `;
      expect(getLogLevel()).toBe(level);
    }
  });

  it("falls back to info for unknown values", () => {
    process.env.LOG_LEVEL = "verbose";
    expect(getLogLevel()).toBe("info");

    process.env.LOG_LEVEL = "toString";
    expect(getLogLevel()).toBe("info");
  });
});

describe("getRequestLogLevel", () => {
  it("logs routine successful traffic at debug", () => {
    for (const path of [
      "/healthz",
      "/readyz",
      "/api/health",
      "/api/metrics/stream",
      "/api/icons/svc.png",
      "/assets/index-abc123.js",
    ]) {
      expect(getRequestLogLevel(path, 200)).toBe("debug");
    }
  });

  it("logs other successful requests at info", () => {
    expect(getRequestLogLevel("/api/services", 200)).toBe("info");
    expect(getRequestLogLevel("/api/metrics", 200)).toBe("info");
    expect(getRequestLogLevel("/", 304)).toBe("info");
  });

  it("logs client errors at warn and server errors at error, even on quiet paths", () => {
    expect(getRequestLogLevel("/api/services", 404)).toBe("warn");
    expect(getRequestLogLevel("/api/icons/missing.png", 404)).toBe("warn");
    expect(getRequestLogLevel("/api/services", 500)).toBe("error");
    expect(getRequestLogLevel("/readyz", 503)).toBe("error");
  });
});

describe("writeLog", () => {
  it("routes each level to the matching console method", () => {
    process.env.LOG_LEVEL = "debug";
    const output = captureConsole();

    writeLog("debug", "test.debug");
    writeLog("info", "test.info", { detail: 1 });
    writeLog("warn", "test.warn");
    writeLog("error", "test.error");

    expect(parsedLines(output.log)).toEqual([
      expect.objectContaining({ event: "test.debug", level: "debug" }),
      expect.objectContaining({ event: "test.info", level: "info", detail: 1 }),
    ]);
    expect(parsedLines(output.warn)).toEqual([
      expect.objectContaining({ event: "test.warn", level: "warn" }),
    ]);
    expect(parsedLines(output.error)).toEqual([
      expect.objectContaining({ event: "test.error", level: "error" }),
    ]);
  });

  it("drops entries below the configured level", () => {
    process.env.LOG_LEVEL = "warn";
    const output = captureConsole();

    writeLog("debug", "test.debug");
    writeLog("info", "test.info");
    writeLog("warn", "test.warn");
    recordRequest("GET", "/api/services", 500, 3);

    expect(output.log).not.toHaveBeenCalled();
    expect(parsedLines(output.warn)).toEqual([expect.objectContaining({ event: "test.warn" })]);
    expect(parsedLines(output.error)).toEqual([
      expect.objectContaining({
        event: "request.completed",
        level: "error",
        method: "GET",
        path: "/api/services",
        status: 500,
      }),
    ]);
  });
});

describe("request logging", () => {
  function startServer() {
    testDataDir = createTestDataDir("orbitdash-logging-");
    initializeServer({
      dataDir: testDataDir,
      logStartup: false,
      registerSignalHandlers: false,
      startJobs: false,
      startMetrics: false,
    });
  }

  it("keeps healthchecks and icon fetches out of the default log", async () => {
    startServer();
    const output = captureConsole();

    await app.request("/healthz");
    await app.request("/readyz");
    await app.request("/api/health");
    await app.request("/api/services");
    await app.request("/api/icons/missing.png");

    expect(parsedLines(output.log)).toEqual([
      expect.objectContaining({ level: "info", path: "/api/services", status: 200 }),
    ]);
    expect(parsedLines(output.warn)).toEqual([
      expect.objectContaining({ level: "warn", path: "/api/icons/missing.png", status: 404 }),
    ]);
  });

  it("shows quiet requests at LOG_LEVEL=debug", async () => {
    startServer();
    process.env.LOG_LEVEL = "debug";
    const output = captureConsole();

    await app.request("/healthz");

    expect(parsedLines(output.log)).toEqual([
      expect.objectContaining({
        event: "request.completed",
        level: "debug",
        method: "GET",
        path: "/healthz",
        status: 200,
      }),
    ]);
  });
});
