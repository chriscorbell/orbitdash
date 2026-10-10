import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs";
import path from "path";
import { app } from "../app";
import type { Service } from "@shared/types";
import { listSnapshots } from "../services/backup-snapshots";
import type { BackupDocument } from "../services/backup-transfer";
import { cleanupTestDatabase, createTestDataDir } from "../test-utils";
import { initializeServer, shutdown } from "../runtime";

let testDataDir: string;

const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex"
);

async function createServiceWithIcon(name: string, category: string): Promise<Service> {
  const formData = new FormData();
  formData.set("name", name);
  formData.set("url", `https://example.com/${name.toLowerCase()}`);
  formData.set("category", category);
  formData.set("icon_file", new File([PNG_BYTES], "icon.png", { type: "image/png" }));

  const response = await app.request("/api/services", { method: "POST", body: formData });
  expect(response.status).toBe(201);
  return (await response.json()) as Service;
}

async function exportDocument(): Promise<BackupDocument> {
  const response = await app.request("/api/backup/export");
  expect(response.status).toBe(200);
  return (await response.json()) as BackupDocument;
}

async function importDocument(body: unknown): Promise<Response> {
  return await app.request("/api/backup/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  testDataDir = createTestDataDir("orbitdash-backup-");
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

describe("backup routes", () => {
  it("exports services, settings and referenced icons as a downloadable file", async () => {
    const service = await createServiceWithIcon("Jellyfin", "Media");
    await app.request("/api/settings/category-order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: ["Media"] }),
    });

    const response = await app.request("/api/backup/export");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="orbitdash-backup-\d{4}-\d{2}-\d{2}\.json"$/
    );

    const document = (await response.json()) as BackupDocument;
    expect(document.format).toBe("orbitdash-backup");
    expect(document.version).toBe(1);
    expect(document.services).toHaveLength(1);
    expect(document.services[0]).toMatchObject({
      id: service.id,
      name: "Jellyfin",
      category: "Media",
      open_in_new_tab: true,
    });
    expect(document.settings["services.categoryOrder"]).toBe('["Media"]');
    expect(document.icons).toEqual([
      { filename: service.icon!, data: PNG_BYTES.toString("base64") },
    ]);
  });

  it("round-trips an export into an empty install", async () => {
    await createServiceWithIcon("Jellyfin", "Media");
    await createServiceWithIcon("Proxmox", "Infra");
    const document = await exportDocument();

    shutdown();
    cleanupTestDatabase(testDataDir);
    testDataDir = createTestDataDir("orbitdash-backup-restore-");
    initializeServer({
      dataDir: testDataDir,
      logStartup: false,
      registerSignalHandlers: false,
      startJobs: false,
      startMetrics: false,
    });

    const importResponse = await importDocument(document);
    expect(importResponse.status).toBe(200);
    expect(await importResponse.json()).toMatchObject({ icons: 2, services: 2 });

    const restored = await exportDocument();
    expect(restored.services).toEqual(document.services);
    expect(restored.settings).toEqual(document.settings);
    expect(restored.icons).toEqual(document.icons);

    const iconResponse = await app.request(`/api/icons/${document.icons[0].filename}`);
    expect(iconResponse.status).toBe(200);
  });

  it("replaces existing data and keeps a pre-import snapshot", async () => {
    const original = await createServiceWithIcon("Old", "Legacy");
    const document = await exportDocument();
    document.services = [
      {
        ...document.services[0],
        id: "imported-id",
        name: "Imported",
        icon: null,
      },
    ];
    document.icons = [];

    const response = await importDocument(document);
    expect(response.status).toBe(200);

    const services = (await (await app.request("/api/services")).json()) as Service[];
    expect(services.map((service) => service.name)).toEqual(["Imported"]);
    expect(fs.existsSync(path.join(testDataDir, "icons", original.icon!))).toBe(false);

    const snapshots = listSnapshots(testDataDir);
    expect(snapshots.map((snapshot) => snapshot.reason)).toEqual(["pre-import"]);
    expect(fs.existsSync(path.join(testDataDir, "backups", snapshots[0].name, "icons"))).toBe(true);
  });

  it("drops icons that are not real images and clears references to them", async () => {
    const document = await exportDocument();
    document.services = [
      {
        id: "svc",
        name: "Broken icon",
        url: "https://example.com",
        description: null,
        icon: "svc.png",
        category: null,
        open_in_new_tab: false,
        created_at: 1,
        updated_at: 1,
      },
    ];
    document.icons = [
      { filename: "svc.png", data: Buffer.from("not an image").toString("base64") },
    ];

    const response = await importDocument(document);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ icons: 0, services: 1 });

    const [service] = (await (await app.request("/api/services")).json()) as Service[];
    expect(service.icon).toBeNull();
    expect(service.open_in_new_tab).toBe(false);
  });

  it("rejects files that are not orbitdash backups without touching data", async () => {
    await createServiceWithIcon("Keep", "Media");

    const wrongFormat = await importDocument({ format: "something-else", version: 1 });
    expect(wrongFormat.status).toBe(400);
    expect(await wrongFormat.json()).toEqual({ error: "not an orbitdash backup file" });

    const document = await exportDocument();
    const futureVersion = await importDocument({ ...document, version: 99 });
    expect(futureVersion.status).toBe(400);
    expect(await futureVersion.json()).toEqual({ error: "unsupported backup version" });

    const duplicate = await importDocument({
      ...document,
      services: [document.services[0], document.services[0]],
    });
    expect(duplicate.status).toBe(400);

    const unsafeIcon = await importDocument({
      ...document,
      icons: [{ filename: "../escape.png", data: PNG_BYTES.toString("base64") }],
    });
    expect(unsafeIcon.status).toBe(400);

    const services = (await (await app.request("/api/services")).json()) as Service[];
    expect(services.map((service) => service.name)).toEqual(["Keep"]);
    expect(listSnapshots(testDataDir)).toEqual([]);
  });

  it("rejects non-JSON import bodies", async () => {
    const response = await app.request("/api/backup/import", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "hello",
    });
    expect(response.status).toBe(415);
  });

  it("lists and creates manual snapshots", async () => {
    await createServiceWithIcon("Jellyfin", "Media");

    const empty = await app.request("/api/backup/snapshots");
    expect(await empty.json()).toEqual({ snapshots: [] });

    const created = await app.request("/api/backup/snapshots", { method: "POST" });
    expect(created.status).toBe(201);
    const snapshot = (await created.json()) as { name: string; reason: string; sizeBytes: number };
    expect(snapshot.reason).toBe("manual");
    expect(snapshot.sizeBytes).toBeGreaterThan(0);

    const listed = (await (await app.request("/api/backup/snapshots")).json()) as {
      snapshots: Array<{ name: string }>;
    };
    expect(listed.snapshots.map((entry) => entry.name)).toEqual([snapshot.name]);
  });
});
