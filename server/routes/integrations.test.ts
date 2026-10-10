import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { app } from "../app";
import { dockerMonitor } from "../docker/monitor";
import { subscribeEvents } from "../events";
import { createIntegrationPoller } from "../integrations/poller";
import { integrationPoller } from "../integrations/poller-instance";
import { resetSecretKeyForTesting } from "../integrations/secrets";
import { initializeServer, shutdown } from "../runtime";
import { listServices } from "../services/service-operations";
import { cleanupTestDatabase, setupTestDatabase } from "../test-utils";
import type { ServerEvent } from "@shared/events";

let dataDir: string;
let target: ReturnType<typeof Bun.serve>;
let serviceId: string;

beforeEach(async () => {
  dataDir = setupTestDatabase("orbitdash-integration-routes-");
  resetSecretKeyForTesting();
  initializeServer({
    dataDir,
    logStartup: false,
    registerSignalHandlers: false,
    startJobs: false,
    startMetrics: false,
  });
  // A stand-in AdGuard Home.
  target = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      if (
        request.headers.get("authorization") !== `Basic ${Buffer.from("me:pw").toString("base64")}`
      ) {
        return new Response("no", { status: 401 });
      }
      return Response.json({
        num_dns_queries: 10,
        num_blocked_filtering: 1,
        avg_processing_time: 0.002,
      });
    },
  });
  const form = new FormData();
  form.set("name", "DNS");
  form.set("url", `http://127.0.0.1:${target.port}`);
  const created = await app.request("/api/services", { method: "POST", body: form });
  serviceId = ((await created.json()) as { id: string }).id;
});

afterEach(() => {
  target.stop(true);
  shutdown();
  resetSecretKeyForTesting();
  cleanupTestDatabase(dataDir);
});

function send(method: string, path: string, body?: unknown) {
  return app.request(`/api/integrations${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("integration routes", () => {
  it("lists types without anything secret", async () => {
    const { types } = (await (await app.request("/api/integrations/types")).json()) as {
      types: Array<{ id: string; fields: Array<{ key: string }> }>;
    };
    expect(types.map((type) => type.id)).toContain("proxmox");
    // Docker is only offered where it's set up (this machine may well have a socket).
    const docker = spyOn(dockerMonitor, "snapshot").mockReturnValue({
      configured: false,
      available: false,
      error: null,
      containers: [],
      updatedAt: null,
    });
    const withoutDocker = (await (await app.request("/api/integrations/types")).json()) as {
      types: Array<{ id: string }>;
    };
    expect(withoutDocker.types.map((type) => type.id)).not.toContain("docker");
    docker.mockReturnValue({
      configured: true,
      available: true,
      error: null,
      containers: [],
      updatedAt: 1,
    });
    const withDocker = (await (await app.request("/api/integrations/types")).json()) as {
      types: Array<{ id: string }>;
    };
    expect(withDocker.types.map((type) => type.id)).toContain("docker");
    docker.mockRestore();
    expect(types.find((type) => type.id === "adguard")?.fields.map((field) => field.key)).toEqual([
      "url",
      "username",
      "password",
      "ignoreTls",
    ]);
  });

  it("saves, reads back without secrets, tests and deletes a service's integration", async () => {
    expect(await (await send("GET", `/services/${serviceId}`)).json()).toEqual({
      integration: null,
    });

    const tested = await send("POST", "/test", {
      serviceId,
      url: `http://127.0.0.1:${target.port}`,
      type: "adguard",
      values: { username: "me", password: "pw" },
    });
    const reading = (await tested.json()) as {
      type: string;
      error: string | null;
      stats: unknown[];
    };
    expect(reading).toMatchObject({ type: "adguard", error: null });
    expect(reading.stats[0]).toEqual({ label: "Queries", value: "10" });

    const saved = await send("PUT", `/services/${serviceId}`, {
      type: "adguard",
      values: { username: "me", password: "pw" },
    });
    expect(await saved.json()).toEqual({
      integration: { type: "adguard", values: { username: "me" }, secretsSet: ["password"] },
    });
    expect(
      JSON.stringify(await (await send("GET", `/services/${serviceId}`)).json())
    ).not.toContain("pw");

    // Testing an edit without retyping the password uses the stored one.
    const retest = await send("POST", "/test", {
      serviceId,
      url: `http://127.0.0.1:${target.port}`,
      type: "adguard",
      values: { username: "me" },
    });
    expect(((await retest.json()) as { error: string | null }).error).toBeNull();

    await integrationPoller.refresh(true);
    const { readings } = (await (await send("GET", "/data")).json()) as {
      readings: Record<string, { stats: Array<{ value: string }> }>;
    };
    expect(readings[serviceId].stats[0].value).toBe("10");

    expect((await send("DELETE", `/services/${serviceId}`)).status).toBe(200);
    expect((await send("DELETE", `/services/${serviceId}`)).status).toBe(404);
  });

  it("explains bad input", async () => {
    expect((await send("PUT", "/services/missing", { type: "adguard", values: {} })).status).toBe(
      404
    );
    const missing = await send("PUT", `/services/${serviceId}`, {
      type: "adguard",
      values: { username: "me" },
    });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "Password is required" });
    expect(
      (await send("POST", "/test", { url: "ftp://x", type: "adguard", values: {} })).status
    ).toBe(400);
    expect(
      (await send("POST", "/test", { url: "http://x.lan", type: "nope", values: {} })).status
    ).toBe(400);
  });
});

describe("integration poller", () => {
  it("polls due integrations, publishes readings and forgets removed ones", async () => {
    await send("PUT", `/services/${serviceId}`, {
      type: "adguard",
      values: { username: "me", password: "pw" },
    });
    // Saving starts a refresh on the server's own poller; let it finish before listening.
    await Bun.sleep(100);
    let now = Date.now();
    const poller = createIntegrationPoller({ listServices, now: () => now });
    const events: ServerEvent[] = [];
    const unsubscribe = subscribeEvents(["integrations"], (event) => events.push(event));

    await poller.refresh();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "integration", serviceId, reading: { error: null } });
    await poller.refresh();
    expect(events).toHaveLength(1);
    now += 60_000;
    await poller.refresh();
    expect(events).toHaveLength(2);
    expect(Object.keys(poller.readings())).toEqual([serviceId]);

    await send("DELETE", `/services/${serviceId}`);
    await poller.refresh();
    expect(poller.readings()).toEqual({});
    poller.forget("x");
    poller.start();
    poller.start();
    poller.stop();
    unsubscribe();
  });

  it("starts and stops with the server", () => {
    const start = spyOn(integrationPoller, "start");
    const stop = spyOn(integrationPoller, "stop");
    shutdown();
    initializeServer({
      dataDir,
      logStartup: false,
      registerSignalHandlers: false,
      startMetrics: false,
    });
    expect(start).toHaveBeenCalled();
    shutdown();
    expect(stop).toHaveBeenCalled();
    start.mockRestore();
    stop.mockRestore();
    initializeServer({
      dataDir,
      logStartup: false,
      registerSignalHandlers: false,
      startJobs: false,
      startMetrics: false,
    });
  });
});
