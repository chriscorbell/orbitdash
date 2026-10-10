import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { ServerEvent } from "@shared/events";
import type { BulkDeleteServicesResponse, Category, Service } from "@shared/types";
import { app } from "../app";
import { subscribeEvents } from "../events";
import { TRASH_TTL_MS } from "../services/service-trash";
import { cleanupTestDatabase, createTestDataDir } from "../test-utils";
import { initializeServer, shutdown } from "../runtime";

let testDataDir: string;

function post(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createService(name: string, category: string | null): Promise<Service> {
  const response = await post("/api/services", {
    name,
    url: `https://${name.toLowerCase()}.test`,
    category,
  });
  expect(response.status).toBe(201);
  return (await response.json()) as Service;
}

async function listServices(): Promise<Service[]> {
  return (await (await app.request("/api/services")).json()) as Service[];
}

async function categoryId(name: string): Promise<string> {
  const { categories } = (await (await app.request("/api/categories")).json()) as {
    categories: Category[];
  };
  return categories.find((category) => category.name === name)!.id;
}

/** "Category/Name/position" for each service, in board order. */
async function layout(): Promise<string[]> {
  return (await listServices()).map(
    (service) => `${service.category ?? "-"}/${service.name}/${service.position}`
  );
}

beforeEach(() => {
  testDataDir = createTestDataDir("orbitdash-bulk-");
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

describe("bulk move", () => {
  it("appends the services to the target in board order and renumbers what they left", async () => {
    const a = await createService("A", "Media");
    await createService("B", "Media");
    const c = await createService("C", "Media");
    const d = await createService("D", "Tools");
    await createService("E", "Tools");

    const response = await post("/api/services/bulk/move", {
      ids: [c.id, a.id, d.id, a.id],
      category_id: await categoryId("Tools"),
    });
    expect(response.status).toBe(200);
    const services = (await response.json()) as Service[];
    expect(services.map((service) => `${service.category}/${service.name}`)).toEqual([
      "Media/B",
      "Tools/D",
      "Tools/E",
      "Tools/A",
      "Tools/C",
    ]);
    // D was already in Tools, so it stays where it was.
    expect(await layout()).toEqual([
      "Media/B/0",
      "Tools/D/0",
      "Tools/E/1",
      "Tools/A/2",
      "Tools/C/3",
    ]);
  });

  it("moves services out of their categories into uncategorized", async () => {
    const a = await createService("A", "Media");
    const b = await createService("B", "Tools");
    await createService("C", null);

    await post("/api/services/bulk/move", { ids: [b.id, a.id], category_id: null });
    expect(await layout()).toEqual(["-/C/0", "-/A/1", "-/B/2"]);
  });

  it("refuses an unknown category, unknown services and bad bodies", async () => {
    const a = await createService("A", "Media");

    const noCategory = await post("/api/services/bulk/move", { ids: [a.id], category_id: "x" });
    expect(noCategory.status).toBe(404);
    expect(await noCategory.json()).toMatchObject({ error: "category not found" });

    const noServices = await post("/api/services/bulk/move", {
      ids: ["missing"],
      category_id: null,
    });
    expect(noServices.status).toBe(404);

    for (const body of [{ ids: [], category_id: null }, { ids: "a" }, { ids: [a.id] }]) {
      const response = await post("/api/services/bulk/move", body);
      expect(response.status).toBe(400);
    }
    expect(await layout()).toEqual(["Media/A/0"]);
  });
});

describe("bulk delete and restore", () => {
  it("trashes services together and puts them back where they were", async () => {
    await createService("A", "Media");
    const b = await createService("B", "Media");
    const c = await createService("C", "Media");
    await createService("D", "Media");
    const e = await createService("E", "Tools");

    const before = Date.now();
    const response = await post("/api/services/bulk/delete", { ids: [e.id, c.id, b.id] });
    expect(response.status).toBe(200);
    const body = (await response.json()) as BulkDeleteServicesResponse;
    expect(body.success).toBe(true);
    expect(body.deleted).toBe(3);
    expect(body.restorableUntil).toBeGreaterThanOrEqual(before + TRASH_TTL_MS);
    expect(await layout()).toEqual(["Media/A/0", "Media/D/3"]);

    const restored = await post("/api/services/bulk/restore", { ids: [c.id, e.id, b.id] });
    expect(restored.status).toBe(200);
    expect(await layout()).toEqual([
      "Media/A/0",
      "Media/B/1",
      "Media/C/2",
      "Media/D/3",
      "Tools/E/0",
    ]);
  });

  it("skips ids that are gone and fails only when none match", async () => {
    const a = await createService("A", null);

    expect((await post("/api/services/bulk/delete", { ids: ["missing"] })).status).toBe(404);
    const partial = await post("/api/services/bulk/delete", { ids: [a.id, "missing"] });
    expect(((await partial.json()) as BulkDeleteServicesResponse).deleted).toBe(1);

    expect((await post("/api/services/bulk/restore", { ids: ["missing"] })).status).toBe(404);
    expect((await post("/api/services/bulk/restore", { ids: [a.id, "missing"] })).status).toBe(200);
    expect((await post("/api/services/bulk/restore", { ids: [a.id] })).status).toBe(404);
    expect(await layout()).toEqual(["-/A/0"]);
  });
});

describe("bulk status checks", () => {
  it("turns checks on and off and sets the interval, keeping each target", async () => {
    const a = await createService("A", null);
    const b = await createService("B", null);
    await app.request(`/api/services/${b.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ check_method: "tcp", check_target: "b.test:22" }),
    });

    const enabled = await post("/api/services/bulk/checks", {
      ids: [a.id, b.id],
      check_enabled: true,
    });
    expect(enabled.status).toBe(200);
    expect(
      ((await enabled.json()) as Service[]).map((service) => [
        service.check_enabled,
        service.check_method,
        service.check_target,
        service.check_interval,
      ])
    ).toEqual([
      [true, "http", null, 60],
      [true, "tcp", "b.test:22", 60],
    ]);

    await post("/api/services/bulk/checks", { ids: [a.id], check_interval: 300 });
    await post("/api/services/bulk/checks", { ids: [b.id], check_enabled: false });
    expect(
      (await listServices()).map((service) => [service.check_enabled, service.check_interval])
    ).toEqual([
      [true, 300],
      [false, 60],
    ]);
  });

  it("rejects bodies that change nothing or set an interval out of range", async () => {
    const a = await createService("A", null);

    const nothing = await post("/api/services/bulk/checks", { ids: [a.id] });
    expect(nothing.status).toBe(400);
    expect(await nothing.json()).toMatchObject({
      error: "nothing to change: give check_enabled or check_interval",
    });
    expect(
      (await post("/api/services/bulk/checks", { ids: [a.id], check_interval: 5 })).status
    ).toBe(400);
    expect(
      (await post("/api/services/bulk/checks", { ids: ["missing"], check_enabled: true })).status
    ).toBe(404);
  });
});

describe("bulk events", () => {
  it("publish one layout change per bulk request", async () => {
    const a = await createService("A", "Media");
    const b = await createService("B", "Media");
    const events: ServerEvent[] = [];
    const unsubscribe = subscribeEvents(["config"], (event) => events.push(event));

    await post("/api/services/bulk/move", { ids: [a.id, b.id], category_id: null });
    await post("/api/services/bulk/checks", { ids: [a.id, b.id], check_enabled: true });
    await post("/api/services/bulk/delete", { ids: [a.id, b.id] });
    await post("/api/services/bulk/restore", { ids: [a.id, b.id] });
    // A rejected request changes nothing, so it announces nothing.
    await post("/api/services/bulk/delete", { ids: [] });
    unsubscribe();

    expect(events).toEqual(
      Array.from({ length: 4 }, () => ({ type: "config.changed", scope: "layout", origin: null }))
    );
  });
});
