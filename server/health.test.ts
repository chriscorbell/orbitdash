import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { app } from "./app";
import { isDbInitialized } from "./db";
import { cleanupTestDatabase, createTestDataDir } from "./test-utils";
import { initializeServer, shutdown } from "./runtime";

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

describe("health endpoints", () => {
  it("returns liveness without requiring database initialization", async () => {
    const response = await app.request("/healthz");

    expect(response.status).toBe(200);
    expect(isDbInitialized()).toBe(false);

    await expect(response.json()).resolves.toMatchObject({
      service: "orbitdash",
      status: "ok",
    });
  });

  it("reports readiness failure when the database has not been initialized", async () => {
    const readyResponse = await app.request("/readyz");
    const apiHealthResponse = await app.request("/api/health");

    expect(readyResponse.status).toBe(503);
    expect(apiHealthResponse.status).toBe(503);

    await expect(readyResponse.json()).resolves.toMatchObject({
      status: "error",
      checks: {
        database: "error",
      },
    });

    await expect(apiHealthResponse.json()).resolves.toMatchObject({
      status: "error",
      checks: {
        database: "error",
      },
    });
  });

  it("reports readiness success after explicit server initialization", async () => {
    testDataDir = createTestDataDir("orbitdash-health-");
    initializeServer({
      dataDir: testDataDir,
      logStartup: false,
      registerSignalHandlers: false,
      startMetrics: false,
    });

    const readyResponse = await app.request("/readyz");
    const apiHealthResponse = await app.request("/api/health");

    expect(readyResponse.status).toBe(200);
    expect(apiHealthResponse.status).toBe(200);

    await expect(readyResponse.json()).resolves.toMatchObject({
      status: "ok",
      checks: {
        database: "ok",
      },
    });

    await expect(apiHealthResponse.json()).resolves.toMatchObject({
      status: "ok",
      checks: {
        database: "ok",
      },
    });
  });

  it("keeps request counters out of the public health payloads", async () => {
    testDataDir = createTestDataDir("orbitdash-health-payload-");
    initializeServer({
      dataDir: testDataDir,
      logStartup: false,
      registerSignalHandlers: false,
      startMetrics: false,
    });

    await app.request("/api/missing");

    const liveness = (await (await app.request("/healthz")).json()) as Record<string, unknown>;
    expect(Object.keys(liveness).sort()).toEqual([
      "observedAt",
      "service",
      "status",
      "uptimeSeconds",
    ]);

    for (const endpoint of ["/readyz", "/api/health"]) {
      const readiness = (await (await app.request(endpoint)).json()) as Record<string, unknown>;
      expect(Object.keys(readiness).sort()).toEqual([
        "checks",
        "observedAt",
        "service",
        "status",
        "uptimeSeconds",
      ]);
    }
  });
});
