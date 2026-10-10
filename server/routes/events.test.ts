import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { app } from "../app";
import { getEventSubscriberCount, publish } from "../events";
import { stopCollection, tickCollection } from "../metrics";
import { cleanupTestDatabase, createTestDataDir } from "../test-utils";
import { initializeServer, shutdown } from "../runtime";

let testDataDir: string;
const decoder = new TextDecoder();

interface OpenStream {
  close: () => void;
  next: (eventName: string) => Promise<unknown>;
}

/** Opens /api/events and reads server-sent events off the response body. */
async function openStream(query: string): Promise<OpenStream> {
  const controller = new AbortController();
  const response = await app.request(`/api/events${query}`, { signal: controller.signal });
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  const reader = response.body!.getReader();
  let buffer = "";

  async function next(eventName: string): Promise<unknown> {
    for (;;) {
      const boundary = buffer.indexOf("\n\n");
      if (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = /^event: (.*)$/m.exec(block)?.[1];
        const data = /^data: (.*)$/m.exec(block)?.[1];
        if (event === eventName) return data ? JSON.parse(data) : null;
        continue;
      }
      const { done, value } = await reader.read();
      if (done) throw new Error(`stream ended before "${eventName}"`);
      buffer += decoder.decode(value, { stream: true });
    }
  }

  return {
    close: () => {
      controller.abort();
      void reader.cancel().catch(() => {});
    },
    next,
  };
}

function createService(headers: Record<string, string> = {}) {
  return app.request("/api/services", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ name: "Orbit", url: "https://orbit.test", category: "Infra" }),
  });
}

beforeEach(() => {
  testDataDir = createTestDataDir("orbitdash-events-");
  initializeServer({
    dataDir: testDataDir,
    logStartup: false,
    registerSignalHandlers: false,
    startJobs: false,
    startMetrics: false,
  });
});

afterEach(() => {
  stopCollection();
  shutdown();
  cleanupTestDatabase(testDataDir);
});

describe("events stream", () => {
  it("announces the topics it subscribed to", async () => {
    const stream = await openStream("?topics=config,bogus");
    expect(await stream.next("ready")).toEqual({ topics: ["config"] });
    stream.close();
  });

  it("broadcasts config changes from mutations with their origin", async () => {
    const stream = await openStream("?topics=config");
    await stream.next("ready");

    const created = await createService({ "X-Orbitdash-Origin": "tab-1" });
    expect(created.status).toBe(201);

    expect(await stream.next("config.changed")).toEqual({
      type: "config.changed",
      scope: "layout",
      origin: "tab-1",
    });
    stream.close();
  });

  it("does not broadcast reads, failures or snapshot-only actions", async () => {
    const stream = await openStream("?topics=config");
    await stream.next("ready");

    await app.request("/api/services");
    await app.request("/api/services/missing", { method: "DELETE" });
    await app.request("/api/backup/snapshots", { method: "POST" });
    const settings = await app.request("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout: { density: "tiles" } }),
    });
    expect(settings.status).toBe(200);

    // The first config event to arrive is the settings change, not anything before it.
    expect(await stream.next("config.changed")).toEqual({
      type: "config.changed",
      scope: "settings",
      origin: null,
    });
    stream.close();
  });

  it("streams metrics samples only to clients that asked for them", async () => {
    const stream = await openStream("?topics=metrics");
    await stream.next("ready");

    const sample = tickCollection(Date.now() + 5_000_000);
    const event = (await stream.next("metrics")) as { type: string; sample: { ts: number } };

    expect(event.type).toBe("metrics");
    expect(event.sample.ts).toBe(sample!.ts);
    stream.close();
  });

  it("delivers published events by topic and drops listeners that fail", async () => {
    const before = getEventSubscriberCount();
    const stream = await openStream("?topics=config");
    await stream.next("ready");
    expect(getEventSubscriberCount()).toBe(before + 1);

    publish({ type: "config.changed", scope: "all", origin: null });
    expect(await stream.next("config.changed")).toMatchObject({ scope: "all" });
    stream.close();
  });
});

describe("event bus", () => {
  it("drops a subscriber whose listener throws", async () => {
    const { subscribeEvents } = await import("../events");
    let calls = 0;
    const unsubscribe = subscribeEvents(["config"], () => {
      calls += 1;
      throw new Error("broken");
    });

    publish({ type: "config.changed", scope: "all", origin: null });
    publish({ type: "config.changed", scope: "all", origin: null });

    expect(calls).toBe(1);
    unsubscribe();
  });
});
