import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs";
import path from "path";
import { app } from "../app";
import type { Category, Service } from "@shared/types";
import { getDb } from "../db";
import { cleanupOrphanIcons } from "../services/icon-storage";
import { purgeTrash, TRASH_TTL_MS } from "../services/service-trash";
import { cleanupTestDatabase, createTestDataDir } from "../test-utils";
import { initializeServer, shutdown } from "../runtime";

let testDataDir: string;

const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex"
);

async function createService(name: string, category: string | null, withIcon = false) {
  const formData = new FormData();
  formData.set("name", name);
  formData.set("url", `https://${name.toLowerCase()}.test`);
  if (category) formData.set("category", category);
  if (withIcon) formData.set("icon_file", new File([PNG_BYTES], "icon.png", { type: "image/png" }));
  const response = await app.request("/api/services", { method: "POST", body: formData });
  expect(response.status).toBe(201);
  return (await response.json()) as Service;
}

async function listNames() {
  const services = (await (await app.request("/api/services")).json()) as Service[];
  return services.map((service) => `${service.category ?? "-"}/${service.name}/${service.position}`);
}

function deleteService(id: string) {
  return app.request(`/api/services/${id}`, { method: "DELETE" });
}

function restoreService(id: string) {
  return app.request(`/api/services/${id}/restore`, { method: "POST" });
}

beforeEach(() => {
  testDataDir = createTestDataDir("orbitdash-trash-");
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

describe("undoable delete", () => {
  it("restores a deleted service to its old position with its icon", async () => {
    await createService("A", "Media");
    const b = await createService("B", "Media", true);
    await createService("C", "Media");

    expect((await deleteService(b.id)).status).toBe(200);
    expect(await listNames()).toEqual(["Media/A/0", "Media/C/2"]);
    expect(fs.existsSync(path.join(testDataDir, "icons", b.icon!))).toBe(true);

    const restored = await restoreService(b.id);
    expect(restored.status).toBe(201);
    expect((await restored.json()) as Service).toMatchObject({
      id: b.id,
      icon: b.icon,
      category: "Media",
      position: 1,
    });
    expect(await listNames()).toEqual(["Media/A/0", "Media/B/1", "Media/C/2"]);
  });

  it("shifts services that took the old slot", async () => {
    const a = await createService("A", null);
    await createService("B", null);

    await deleteService(a.id);
    await createService("New", null);
    // Move "New" into slot 0, where A used to be.
    const services = (await (await app.request("/api/services")).json()) as Service[];
    const newer = services.find((service) => service.name === "New")!;
    await app.request(`/api/services/${newer.id}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_id: null, index: 0 }),
    });

    await restoreService(a.id);
    expect(await listNames()).toEqual(["-/A/0", "-/New/1", "-/B/2"]);
  });

  it("comes back uncategorized if its category was deleted meanwhile", async () => {
    const service = await createService("Jellyfin", "Media");
    const categories = (await (await app.request("/api/categories")).json()) as {
      categories: Category[];
    };

    await deleteService(service.id);
    await app.request(`/api/categories/${categories.categories[0].id}`, { method: "DELETE" });

    const restored = (await (await restoreService(service.id)).json()) as Service;
    expect(restored.category_id).toBeNull();
    expect(restored.category).toBeNull();
  });

  it("refuses to restore twice or restore something never deleted", async () => {
    const service = await createService("A", null);

    expect((await restoreService(service.id)).status).toBe(404);
    await deleteService(service.id);
    expect((await restoreService(service.id)).status).toBe(201);
    expect((await restoreService(service.id)).status).toBe(404);
    expect((await deleteService("missing")).status).toBe(404);
  });

  it("drops a stale trash entry when the service already exists again", async () => {
    const service = await createService("A", null);
    await deleteService(service.id);
    // Recreate the row directly (as a backup import might), then try to restore.
    const trashed = getDb().prepare("SELECT data FROM service_trash WHERE id = ?").get(service.id) as {
      data: string;
    };
    const original = JSON.parse(trashed.data) as Record<string, string | number | null>;
    const columns = Object.keys(original);
    getDb()
      .prepare(`INSERT INTO services (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
      .run(...columns.map((column) => original[column]));

    expect((await restoreService(service.id)).status).toBe(409);
    expect(getDb().prepare("SELECT 1 FROM service_trash WHERE id = ?").get(service.id)).toBeNull();
  });

  it("purges old trash and its unused icons, keeping recent entries", async () => {
    const old = await createService("Old", null, true);
    const recent = await createService("Recent", null, true);
    const now = Date.now();

    await deleteService(old.id);
    getDb()
      .prepare("UPDATE service_trash SET deleted_at = ? WHERE id = ?")
      .run(now - TRASH_TTL_MS - 1, old.id);
    await deleteService(recent.id);

    expect(purgeTrash(now)).toBe(1);
    expect(purgeTrash(now)).toBe(0);
    expect(fs.existsSync(path.join(testDataDir, "icons", old.icon!))).toBe(false);
    expect(fs.existsSync(path.join(testDataDir, "icons", recent.icon!))).toBe(true);
    expect((await restoreService(old.id)).status).toBe(404);
    expect((await restoreService(recent.id)).status).toBe(201);
  });

  it("keeps a purged entry's icon while a live service still uses it", async () => {
    const service = await createService("Shared", null, true);
    await deleteService(service.id);
    getDb()
      .prepare(
        `INSERT INTO services (id, name, url, icon, open_in_new_tab, created_at, updated_at, position)
         VALUES ('other', 'Other', 'https://o.test/', ?, 1, 1, 1, 0)`
      )
      .run(service.icon);
    getDb().prepare("UPDATE service_trash SET deleted_at = 0").run();

    purgeTrash();
    expect(fs.existsSync(path.join(testDataDir, "icons", service.icon!))).toBe(true);
  });

  it("treats trashed icons as referenced during orphan cleanup", async () => {
    const service = await createService("Iconic", null, true);
    await deleteService(service.id);

    expect(cleanupOrphanIcons()).toBe(0);
    expect(fs.existsSync(path.join(testDataDir, "icons", service.icon!))).toBe(true);
  });

  it("clears the trash on backup import", async () => {
    const service = await createService("Gone", null);
    await deleteService(service.id);
    const document = await (await app.request("/api/backup/export")).json();

    await app.request("/api/backup/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(document),
    });

    expect((await restoreService(service.id)).status).toBe(404);
  });
});
