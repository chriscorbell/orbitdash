import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { app } from "../app";
import { dockerMonitor } from "../docker/monitor";
import { initializeServer, shutdown } from "../runtime";
import { cleanupTestDatabase, setupTestDatabase } from "../test-utils";

let dataDir: string;

beforeEach(() => {
  dataDir = setupTestDatabase("orbitdash-docker-");
  initializeServer({
    dataDir,
    logStartup: false,
    registerSignalHandlers: false,
    startJobs: false,
    startMetrics: false,
  });
});

afterEach(() => {
  shutdown();
  cleanupTestDatabase(dataDir);
});

describe("docker routes", () => {
  it("returns the container snapshot and flags Docker in the system info", async () => {
    const snapshot = {
      configured: true,
      available: true,
      error: null,
      containers: [],
      updatedAt: 5,
    };
    const spy = spyOn(dockerMonitor, "snapshot").mockReturnValue(snapshot);

    const response = await app.request("/api/docker");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(snapshot);
    expect(((await (await app.request("/api/system")).json()) as { docker: boolean }).docker).toBe(
      true
    );

    spy.mockReturnValue({ ...snapshot, available: false });
    expect(((await (await app.request("/api/system")).json()) as { docker: boolean }).docker).toBe(
      false
    );
    spy.mockRestore();
  });
});
