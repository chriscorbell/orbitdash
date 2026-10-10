import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { serviceStatusesResponseSchema, statusHistorySchema } from "@shared/status-schemas";
import type { Service } from "@shared/types";
import { app } from "../app";
import { getDb } from "../db";
import { publish } from "../events";
import { initializeServer, shutdown } from "../runtime";
import { unknownStatus } from "../status/state";
import { recordCheckResult } from "../status/store";
import { cleanupTestDatabase, createTestDataDir } from "../test-utils";

let testDataDir: string;
const decoder = new TextDecoder();

beforeEach(() => {
  testDataDir = createTestDataDir("orbitdash-status-routes-");
  initializeServer({
    dataDir: testDataDir,
    logStartup: false,
    registerSignalHandlers: false,
    startJobs: false,
    startMetrics: false,
  });
});

afterEach(() => {
  shutdown();
  cleanupTestDatabase(testDataDir);
});

async function createService(body: Record<string, unknown>): Promise<Service> {
  const response = await app.request("/api/services", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Orbit", url: "http://nas.lan:8080/", ...body }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as Service;
}

describe("GET /api/status", () => {
  it("lists only services with checks on, unknown until checked", async () => {
    const checked = await createService({ name: "Checked", check_enabled: true });
    await createService({ name: "Plain" });

    const response = await app.request("/api/status");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(serviceStatusesResponseSchema.parse(await response.json())).toEqual({
      statuses: [
        {
          id: checked.id,
          state: "unknown",
          latencyMs: null,
          statusCode: null,
          error: null,
          checkedAt: null,
          changedAt: null,
        },
      ],
    });
  });

  it("returns the stored status once checked", async () => {
    const service = await createService({ check_enabled: true });
    recordCheckResult(
      getDb(),
      { ...unknownStatus(service.id, "http http://nas.lan:8080/"), state: "up", latencyMs: 12 },
      { ok: true, latencyMs: 12, statusCode: 200, error: null },
      Date.now()
    );

    const { statuses } = serviceStatusesResponseSchema.parse(
      await (await app.request("/api/status")).json()
    );
    expect(statuses).toMatchObject([{ id: service.id, state: "up", latencyMs: 12 }]);
  });
});

describe("GET /api/status/:id/history", () => {
  it("serves 48 half hours by default and 30 days on request", async () => {
    const service = await createService({ check_enabled: true });

    const day = statusHistorySchema.parse(
      await (await app.request(`/api/status/${service.id}/history`)).json()
    );
    expect(day).toMatchObject({ id: service.id, range: "24h", uptime: null });
    expect(day.buckets).toHaveLength(48);

    const month = statusHistorySchema.parse(
      await (await app.request(`/api/status/${service.id}/history?range=30d`)).json()
    );
    expect(month.buckets).toHaveLength(30);
  });

  it("rejects unknown ranges and services", async () => {
    const service = await createService({});
    const badRange = await app.request(`/api/status/${service.id}/history?range=1y`);
    expect(badRange.status).toBe(400);
    expect(await badRange.json()).toEqual({ error: "range must be one of 24h, 30d" });

    expect((await app.request("/api/status/missing/history")).status).toBe(404);
  });
});

describe("status topic", () => {
  it("streams status events to clients that asked for them", async () => {
    const controller = new AbortController();
    const response = await app.request("/api/events?topics=status", {
      signal: controller.signal,
    });
    const reader = response.body!.getReader();
    let buffer = "";
    const next = async (name: string) => {
      for (;;) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary !== -1) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (/^event: (.*)$/m.exec(block)?.[1] === name) {
            return JSON.parse(/^data: (.*)$/m.exec(block)![1]) as unknown;
          }
          continue;
        }
        const { value } = await reader.read();
        buffer += decoder.decode(value, { stream: true });
      }
    };

    expect(await next("ready")).toEqual({ topics: ["status"] });
    publish({ type: "config.changed", scope: "all", origin: null });
    publish({ type: "status", id: "svc", status: null });
    expect(await next("status")).toEqual({ type: "status", id: "svc", status: null });

    controller.abort();
    void reader.cancel().catch(() => {});
  });
});
