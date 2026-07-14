import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs";
import path from "path";
import { app } from "../app";
import type { Service } from "@shared/types";
import { cleanupTestDatabase, createTestDataDir } from "../test-utils";
import { initializeServer, shutdown } from "../runtime";

let testDataDir: string;
const originalFetch = globalThis.fetch;

async function createService(overrides: Record<string, unknown> = {}): Promise<Response> {
  return app.request("/api/services", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Orbit",
      url: "https://example.com/orbit",
      description: "Dashboard",
      category: "Infra",
      open_in_new_tab: true,
      ...overrides,
    }),
  });
}

beforeEach(() => {
  testDataDir = createTestDataDir("orbitdash-services-");
  initializeServer({
    dataDir: testDataDir,
    logStartup: false,
    registerSignalHandlers: false,
    startMetrics: false,
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  shutdown();
  cleanupTestDatabase(testDataDir);
});

describe("services routes", () => {
  it("returns an empty list when no services have been created", async () => {
    const response = await app.request("/api/services");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it("creates and lists a service", async () => {
    const createResponse = await createService({ url: "example.com/orbit" });

    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as Service;

    expect(created.name).toBe("Orbit");
    expect(created.url).toBe("https://example.com/orbit");
    expect(created.open_in_new_tab).toBe(true);
    expect(created.icon).toBeNull();

    const listResponse = await app.request("/api/services");
    await expect(listResponse.json()).resolves.toEqual([created]);
  });

  it("rejects missing names and invalid service URLs", async () => {
    const missingNameResponse = await createService({ name: "   " });
    expect(missingNameResponse.status).toBe(400);
    await expect(missingNameResponse.json()).resolves.toEqual({
      error: "name is required",
    });

    const invalidUrlResponse = await createService({ url: "not a url" });
    expect(invalidUrlResponse.status).toBe(400);
    await expect(invalidUrlResponse.json()).resolves.toEqual({
      error: "service url must be a valid URL",
    });
  });

  it("updates an existing service", async () => {
    const createResponse = await createService();
    const created = (await createResponse.json()) as Service;

    const updateResponse = await app.request(`/api/services/${created.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Orbit Updated",
        url: "https://example.com/updated",
        description: "Updated description",
        category: "Monitoring",
        open_in_new_tab: false,
      }),
    });

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      id: created.id,
      name: "Orbit Updated",
      url: "https://example.com/updated",
      description: "Updated description",
      category: "Monitoring",
      open_in_new_tab: false,
    });
  });

  it("returns not found for updates and deletes against missing services", async () => {
    const updateResponse = await app.request("/api/services/missing", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Missing" }),
    });
    expect(updateResponse.status).toBe(404);
    await expect(updateResponse.json()).resolves.toEqual({ error: "not found" });

    const deleteResponse = await app.request("/api/services/missing", {
      method: "DELETE",
    });
    expect(deleteResponse.status).toBe(404);
    await expect(deleteResponse.json()).resolves.toEqual({ error: "not found" });
  });

  it("deletes an existing service", async () => {
    const createResponse = await createService();
    const created = (await createResponse.json()) as Service;

    const deleteResponse = await app.request(`/api/services/${created.id}`, {
      method: "DELETE",
    });

    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toEqual({ success: true });

    const listResponse = await app.request("/api/services");
    await expect(listResponse.json()).resolves.toEqual([]);
  });

  it("downloads and persists an icon from icon_url", async () => {
    globalThis.fetch = (async (..._args: Parameters<typeof fetch>) => {
      return new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', {
        status: 200,
        headers: {
          "content-length": "46",
          "content-type": "image/svg+xml",
        },
      });
    }) as unknown as typeof fetch;

    const response = await createService({
      icon_url: "https://example.com/icon",
    });

    expect(response.status).toBe(201);
    const created = (await response.json()) as Service;
    expect(created.icon).toMatch(/\.svg$/);

    const iconPath = path.join(testDataDir, "icons", created.icon as string);
    expect(fs.existsSync(iconPath)).toBe(true);
  });

  it("rejects unsupported icon downloads", async () => {
    globalThis.fetch = (async (..._args: Parameters<typeof fetch>) => {
      return new Response("plain text", {
        status: 200,
        headers: {
          "content-length": "10",
          "content-type": "text/plain",
        },
      });
    }) as unknown as typeof fetch;

    const response = await createService({
      icon_url: "https://example.com/icon.txt",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Unsupported icon type",
    });
  });

  it("rejects downloaded icons whose contents do not match the declared image type", async () => {
    globalThis.fetch = (async (..._args: Parameters<typeof fetch>) => {
      return new Response("plain text", {
        status: 200,
        headers: {
          "content-length": "10",
          "content-type": "image/png",
        },
      });
    }) as unknown as typeof fetch;

    const response = await createService({
      icon_url: "https://example.com/icon.png",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Unsupported icon type",
    });
  });

  it("rejects uploaded icons whose contents do not match a supported image format", async () => {
    const formData = new FormData();
    formData.set("name", "Orbit");
    formData.set("url", "https://example.com/orbit");
    formData.set("icon_file", new File(["plain text"], "icon.png", { type: "image/png" }));

    const response = await app.request("/api/services", {
      method: "POST",
      body: formData,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "unsupported icon type",
    });
  });

  it("downloads icons from local hosts", async () => {
    globalThis.fetch = (async (..._args: Parameters<typeof fetch>) => {
      return new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', {
        status: 200,
        headers: {
          "content-length": "46",
          "content-type": "image/svg+xml",
        },
      });
    }) as unknown as typeof fetch;

    const response = await createService({
      icon_url: "http://192.168.1.10/icon.svg",
    });

    expect(response.status).toBe(201);
    const created = (await response.json()) as Service;
    expect(created.icon).toMatch(/\.svg$/);
  });

  it("returns a structured error for malformed JSON payloads", async () => {
    const response = await app.request("/api/services", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "request body must be valid JSON",
    });
  });

  it("returns a structured error for unsupported content types", async () => {
    const response = await app.request("/api/services", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: "name=Orbit",
    });

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: "content-type must be application/json or multipart/form-data",
    });
  });
});
