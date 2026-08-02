import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { app } from "../app";
import type { RenameCategoryResponse, Service } from "@shared/types";
import { cleanupTestDatabase, createTestDataDir } from "../test-utils";
import { initializeServer, shutdown } from "../runtime";

let testDataDir: string;

async function createService(overrides: Record<string, unknown> = {}): Promise<Service> {
  const response = await app.request("/api/services", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Orbit",
      url: "https://example.com/orbit",
      category: "Infra",
      ...overrides,
    }),
  });

  expect(response.status).toBe(201);
  return (await response.json()) as Service;
}

async function renameCategory(body: unknown): Promise<Response> {
  return app.request("/api/categories/rename", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function saveCategoryOrder(order: string[]): Promise<void> {
  const response = await app.request("/api/settings/category-order", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ order }),
  });

  expect(response.status).toBe(200);
}

beforeEach(() => {
  testDataDir = createTestDataDir("orbitdash-categories-");
  initializeServer({
    dataDir: testDataDir,
    logStartup: false,
    registerSignalHandlers: false,
    startMetrics: false,
  });
});

afterEach(() => {
  shutdown();
  cleanupTestDatabase(testDataDir);
});

describe("category rename route", () => {
  it("renames a category across its services and the saved order", async () => {
    await createService({ name: "Jellyfin", category: "Media" });
    await createService({ name: "Sonarr", category: "Media" });
    await createService({ name: "Grafana", category: "Infra" });
    await saveCategoryOrder(["Media", "Infra"]);

    const response = await renameCategory({ from: "Media", to: "Streaming" });

    expect(response.status).toBe(200);
    const body = (await response.json()) as RenameCategoryResponse;
    expect(body.order).toEqual(["Streaming", "Infra"]);

    const categories = body.services.map((service) => [service.name, service.category]);
    expect(categories).toContainEqual(["Jellyfin", "Streaming"]);
    expect(categories).toContainEqual(["Sonarr", "Streaming"]);
    expect(categories).toContainEqual(["Grafana", "Infra"]);

    const orderResponse = await app.request("/api/settings/category-order");
    await expect(orderResponse.json()).resolves.toEqual({ order: ["Streaming", "Infra"] });
  });

  it("merges into an existing category without duplicating the order entry", async () => {
    await createService({ name: "Jellyfin", category: "Media" });
    await createService({ name: "Grafana", category: "Infra" });
    await saveCategoryOrder(["Media", "Infra"]);

    const response = await renameCategory({ from: "Media", to: "Infra" });

    expect(response.status).toBe(200);
    const body = (await response.json()) as RenameCategoryResponse;
    expect(body.order).toEqual(["Infra"]);
    expect(body.services.every((service) => service.category === "Infra")).toBe(true);
  });

  it("returns 404 when no service uses the category", async () => {
    await createService({ category: "Infra" });

    const response = await renameCategory({ from: "Media", to: "Streaming" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "category not found" });
  });

  it("rejects invalid payloads", async () => {
    await createService({ category: "Infra" });

    const emptyName = await renameCategory({ from: "Infra", to: "   " });
    expect(emptyName.status).toBe(400);
    await expect(emptyName.json()).resolves.toEqual({ error: "to is required" });

    const sameName = await renameCategory({ from: "Infra", to: " Infra " });
    expect(sameName.status).toBe(400);

    const reservedName = await renameCategory({ from: "Infra", to: "Uncategorized" });
    expect(reservedName.status).toBe(400);

    const renameUncategorized = await renameCategory({ from: "Uncategorized", to: "Misc" });
    expect(renameUncategorized.status).toBe(400);
  });
});
