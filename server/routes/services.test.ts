import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import fs from "fs";
import path from "path";
import { app } from "../app";
import type { Service } from "@shared/types";
import { getDb } from "../db";
import { cleanupOrphanIcons } from "../services/icon-storage";
import { cleanupTestDatabase, createTestDataDir } from "../test-utils";
import { initializeServer, shutdown } from "../runtime";

let testDataDir: string;
const originalFetch = globalThis.fetch;

const SVG_ICON = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex"
);

function mockIconDownload() {
  globalThis.fetch = (async (..._args: Parameters<typeof fetch>) => {
    return new Response(SVG_ICON, {
      status: 200,
      headers: { "content-length": String(SVG_ICON.length), "content-type": "image/svg+xml" },
    });
  }) as unknown as typeof fetch;
}

function iconFiles(): string[] {
  const iconsDir = path.join(testDataDir, "icons");
  return fs.existsSync(iconsDir) ? fs.readdirSync(iconsDir).sort() : [];
}

function serviceFormData(fields: Record<string, string>, iconBytes?: Buffer): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  if (iconBytes) {
    formData.set("icon_file", new File([iconBytes], "icon.png", { type: "image/png" }));
  }
  return formData;
}

async function updateService(id: string, body: FormData | Record<string, unknown>) {
  return app.request(`/api/services/${id}`, {
    method: "PUT",
    ...(body instanceof FormData
      ? { body }
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
}

function failWritesToServices(operation: "INSERT" | "UPDATE") {
  getDb().exec(
    `CREATE TRIGGER fail_${operation.toLowerCase()} BEFORE ${operation} ON services
     BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END`
  );
}

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

  it("duplicates a service and copies its icon file", async () => {
    globalThis.fetch = (async (..._args: Parameters<typeof fetch>) => {
      return new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', {
        status: 200,
        headers: {
          "content-length": "46",
          "content-type": "image/svg+xml",
        },
      });
    }) as unknown as typeof fetch;

    const createResponse = await createService({ icon_url: "https://example.com/icon" });
    const created = (await createResponse.json()) as Service;

    const duplicateResponse = await app.request(`/api/services/${created.id}/duplicate`, {
      method: "POST",
    });

    expect(duplicateResponse.status).toBe(201);
    const duplicated = (await duplicateResponse.json()) as Service;

    expect(duplicated.id).not.toBe(created.id);
    expect(duplicated).toMatchObject({
      name: "Orbit (copy)",
      url: created.url,
      description: created.description,
      category: created.category,
      open_in_new_tab: created.open_in_new_tab,
    });
    expect(duplicated.icon).toBe(`${duplicated.id}.svg`);
    expect(fs.existsSync(path.join(testDataDir, "icons", created.icon as string))).toBe(true);
    expect(fs.existsSync(path.join(testDataDir, "icons", duplicated.icon as string))).toBe(true);

    const listResponse = await app.request("/api/services");
    const services = (await listResponse.json()) as Service[];
    expect(services).toHaveLength(2);
  });

  it("returns not found when duplicating a missing service", async () => {
    const response = await app.request("/api/services/missing/duplicate", {
      method: "POST",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not found" });
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

describe("service icon files", () => {
  it("remembers where a downloaded icon came from and forgets it on upload or removal", async () => {
    mockIconDownload();
    const created = (await (
      await createService({ icon_url: "https://example.com/icon.svg" })
    ).json()) as Service;
    expect(created.icon_source_url).toBe("https://example.com/icon.svg");

    const uploaded = (await (
      await updateService(created.id, serviceFormData({}, PNG_BYTES))
    ).json()) as Service;
    expect(uploaded.icon).toMatch(/\.png$/);
    expect(uploaded.icon_source_url).toBeNull();

    const redownloaded = (await (
      await updateService(created.id, { icon_url: "https://example.com/other.svg" })
    ).json()) as Service;
    expect(redownloaded.icon_source_url).toBe("https://example.com/other.svg");

    const renamed = (await (
      await updateService(created.id, { name: "Renamed" })
    ).json()) as Service;
    expect(renamed.icon).toBe(redownloaded.icon);
    expect(renamed.icon_source_url).toBe("https://example.com/other.svg");

    const removed = (await (
      await updateService(created.id, serviceFormData({ remove_icon: "true" }))
    ).json()) as Service;
    expect(removed.icon).toBeNull();
    expect(removed.icon_source_url).toBeNull();
    expect(iconFiles()).toEqual([]);
  });

  it("keeps the source URL on duplicates that copy a downloaded icon", async () => {
    mockIconDownload();
    const created = (await (
      await createService({ icon_url: "https://example.com/icon.svg" })
    ).json()) as Service;

    const duplicated = (await (
      await app.request(`/api/services/${created.id}/duplicate`, { method: "POST" })
    ).json()) as Service;
    expect(duplicated.icon_source_url).toBe("https://example.com/icon.svg");
  });

  it("replaces the previous icon file when a new icon is saved", async () => {
    const created = (await (
      await app.request("/api/services", {
        method: "POST",
        body: serviceFormData({ name: "Orbit", url: "https://example.com" }, PNG_BYTES),
      })
    ).json()) as Service;
    expect(iconFiles()).toEqual([created.icon]);

    const updated = (await (
      await updateService(created.id, serviceFormData({}, PNG_BYTES))
    ).json()) as Service;
    expect(updated.icon).not.toBe(created.icon);
    expect(iconFiles()).toEqual([updated.icon]);
  });

  it("removes a newly written icon when the service insert fails", async () => {
    const errorLog = spyOn(console, "error").mockImplementation(() => {});
    failWritesToServices("INSERT");

    const response = await app.request("/api/services", {
      method: "POST",
      body: serviceFormData({ name: "Orbit", url: "https://example.com" }, PNG_BYTES),
    });

    expect(response.status).toBe(500);
    expect(iconFiles()).toEqual([]);
    errorLog.mockRestore();
  });

  it("removes a newly written icon and keeps the old one when the service update fails", async () => {
    const created = (await (
      await app.request("/api/services", {
        method: "POST",
        body: serviceFormData({ name: "Orbit", url: "https://example.com" }, PNG_BYTES),
      })
    ).json()) as Service;

    const errorLog = spyOn(console, "error").mockImplementation(() => {});
    failWritesToServices("UPDATE");
    mockIconDownload();

    const uploadResponse = await updateService(created.id, serviceFormData({}, PNG_BYTES));
    const downloadResponse = await updateService(created.id, {
      icon_url: "https://example.com/icon.svg",
    });
    const removeResponse = await updateService(
      created.id,
      serviceFormData({ remove_icon: "true" })
    );

    expect(uploadResponse.status).toBe(500);
    expect(downloadResponse.status).toBe(500);
    expect(removeResponse.status).toBe(500);
    expect(iconFiles()).toEqual([created.icon]);
    expect((await app.request(`/api/icons/${created.icon}`)).status).toBe(200);
    errorLog.mockRestore();
  });

  it("removes the icon file only after the service row is deleted", async () => {
    const created = (await (
      await app.request("/api/services", {
        method: "POST",
        body: serviceFormData({ name: "Orbit", url: "https://example.com" }, PNG_BYTES),
      })
    ).json()) as Service;

    const errorLog = spyOn(console, "error").mockImplementation(() => {});
    getDb().exec(
      `CREATE TRIGGER fail_delete BEFORE DELETE ON services
       BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END`
    );

    const response = await app.request(`/api/services/${created.id}`, { method: "DELETE" });
    expect(response.status).toBe(500);
    expect(iconFiles()).toEqual([created.icon]);
    errorLog.mockRestore();
  });

  it("cleans up icon files that no service references", async () => {
    const created = (await (
      await app.request("/api/services", {
        method: "POST",
        body: serviceFormData({ name: "Orbit", url: "https://example.com" }, PNG_BYTES),
      })
    ).json()) as Service;

    const iconsDir = path.join(testDataDir, "icons");
    fs.writeFileSync(path.join(iconsDir, "orphan-a.png"), PNG_BYTES);
    fs.writeFileSync(path.join(iconsDir, "orphan-b.svg"), SVG_ICON);
    fs.mkdirSync(path.join(iconsDir, "nested"));

    expect(cleanupOrphanIcons()).toBe(2);
    expect(iconFiles()).toEqual([created.icon, "nested"].sort());
    expect(cleanupOrphanIcons()).toBe(0);
  });
});
