import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { app } from "../app";
import type { Category, Service } from "@shared/types";
import { cleanupTestDatabase, createTestDataDir } from "../test-utils";
import { initializeServer, shutdown } from "../runtime";

let testDataDir: string;

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

async function createService(name: string, category: string | null): Promise<Service> {
  const response = await app.request(
    "/api/services",
    json("POST", { name, url: `https://${name.toLowerCase()}.test`, category })
  );
  expect(response.status).toBe(201);
  return (await response.json()) as Service;
}

async function listServices(): Promise<Service[]> {
  return (await (await app.request("/api/services")).json()) as Service[];
}

async function listCategories(): Promise<Category[]> {
  const body = (await (await app.request("/api/categories")).json()) as { categories: Category[] };
  return body.categories;
}

function layout(services: Service[]) {
  return services.map((service) => `${service.category ?? "-"}/${service.name}`);
}

beforeEach(() => {
  testDataDir = createTestDataDir("orbitdash-layout-");
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

describe("categories", () => {
  it("creates categories from service names and lists them in order", async () => {
    const service = await createService("Jellyfin", " Media ");
    await createService("Proxmox", "Infra");
    await createService("Sonarr", "Media");

    const categories = await listCategories();
    expect(categories.map((category) => category.name)).toEqual(["Media", "Infra"]);
    expect(service.category).toBe("Media");
    expect(service.category_id).toBe(categories[0].id);
    expect(layout(await listServices())).toEqual([
      "Media/Jellyfin",
      "Media/Sonarr",
      "Infra/Proxmox",
    ]);
  });

  it("treats the reserved Uncategorized name as no category", async () => {
    const service = await createService("Loose", "Uncategorized");
    expect(service.category_id).toBeNull();
    expect(await listCategories()).toEqual([]);
  });

  it("creates empty categories and rejects duplicates and reserved names", async () => {
    const created = await app.request("/api/categories", json("POST", { name: "  Media " }));
    expect(created.status).toBe(201);
    expect(((await created.json()) as Category).name).toBe("Media");

    const duplicate = await app.request("/api/categories", json("POST", { name: "Media" }));
    expect(duplicate.status).toBe(409);

    const reserved = await app.request("/api/categories", json("POST", { name: "Uncategorized" }));
    expect(reserved.status).toBe(400);

    const wrongType = await app.request("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "Media",
    });
    expect(wrongType.status).toBe(415);
  });

  it("renames by id and refuses to collide with another category", async () => {
    await createService("Jellyfin", "Media");
    await createService("Proxmox", "Infra");
    const [media, infra] = await listCategories();

    const renamed = await app.request(`/api/categories/${media.id}`, json("PATCH", { name: "TV" }));
    expect(renamed.status).toBe(200);
    expect(((await renamed.json()) as Category).name).toBe("TV");
    expect(layout(await listServices())).toContain("TV/Jellyfin");

    const collision = await app.request(
      `/api/categories/${media.id}`,
      json("PATCH", { name: infra.name })
    );
    expect(collision.status).toBe(409);

    const missing = await app.request("/api/categories/nope", json("PATCH", { name: "X" }));
    expect(missing.status).toBe(404);
  });

  it("reorders categories, putting unlisted ones after the listed ones", async () => {
    await createService("A", "One");
    await createService("B", "Two");
    await createService("C", "Three");
    const [one, two, three] = await listCategories();

    const response = await app.request(
      "/api/categories/order",
      json("PUT", { ids: [three.id, "unknown", one.id, three.id] })
    );
    const body = (await response.json()) as { categories: Category[] };

    expect(body.categories.map((category) => category.id)).toEqual([three.id, one.id, two.id]);
    expect(layout(await listServices())).toEqual(["Three/C", "One/A", "Two/B"]);
  });

  it("deletes a category and moves its services to the end of uncategorized", async () => {
    await createService("Loose", null);
    await createService("Jellyfin", "Media");
    await createService("Sonarr", "Media");
    const [media] = await listCategories();

    const response = await app.request(`/api/categories/${media.id}`, { method: "DELETE" });
    expect(response.status).toBe(200);

    expect(await listCategories()).toEqual([]);
    const services = await listServices();
    expect(services.map((service) => [service.name, service.position])).toEqual([
      ["Loose", 0],
      ["Jellyfin", 1],
      ["Sonarr", 2],
    ]);

    const missing = await app.request(`/api/categories/${media.id}`, { method: "DELETE" });
    expect(missing.status).toBe(404);
  });

  it("keeps the legacy category-order endpoint working on top of the table", async () => {
    await createService("A", "One");
    await createService("B", "Two");

    const saved = await app.request(
      "/api/settings/category-order",
      json("PUT", { order: ["Two", "Brand new", "One"] })
    );
    expect(await saved.json()).toEqual({ order: ["Two", "Brand new", "One"] });
    expect((await listCategories()).map((category) => category.name)).toEqual([
      "Two",
      "Brand new",
      "One",
    ]);
  });
});

describe("service layout", () => {
  it("appends new services, keeps them in place on edit, and moves them on category change", async () => {
    const first = await createService("Zeta", "Media");
    await createService("Alpha", "Media");
    expect(layout(await listServices())).toEqual(["Media/Zeta", "Media/Alpha"]);

    await app.request(`/api/services/${first.id}`, json("PUT", { name: "Zeta 2" }));
    expect(layout(await listServices())).toEqual(["Media/Zeta 2", "Media/Alpha"]);

    await createService("Proxmox", "Infra");
    const moved = await app.request(
      `/api/services/${first.id}`,
      json("PUT", { category: "Infra" })
    );
    expect(((await moved.json()) as Service).position).toBe(1);
    expect(layout(await listServices())).toEqual(["Media/Alpha", "Infra/Proxmox", "Infra/Zeta 2"]);

    await app.request(`/api/services/${first.id}`, json("PUT", { category: null }));
    expect(layout(await listServices())).toContain("-/Zeta 2");
  });

  it("places a duplicate right after the original", async () => {
    const a = await createService("A", "Media");
    await createService("B", "Media");

    const response = await app.request(`/api/services/${a.id}/duplicate`, { method: "POST" });
    expect(response.status).toBe(201);
    expect(layout(await listServices())).toEqual(["Media/A", "Media/A (copy)", "Media/B"]);
  });

  it("moves a service between categories at an index and renumbers both", async () => {
    const a = await createService("A", "Media");
    await createService("B", "Media");
    await createService("X", "Infra");
    await createService("Y", "Infra");
    const [, infra] = await listCategories();

    const response = await app.request(
      `/api/services/${a.id}/move`,
      json("POST", { category_id: infra.id, index: 1 })
    );
    expect(response.status).toBe(200);
    expect((await response.json()) as Service).toMatchObject({ category: "Infra", position: 1 });

    const services = await listServices();
    expect(
      services.map((service) => `${service.category}/${service.name}/${service.position}`)
    ).toEqual(["Media/B/0", "Infra/X/0", "Infra/A/1", "Infra/Y/2"]);
  });

  it("moves within a category and clamps indexes past the end", async () => {
    const a = await createService("A", null);
    await createService("B", null);
    await createService("C", null);

    await app.request(`/api/services/${a.id}/move`, json("POST", { category_id: null, index: 99 }));
    expect(layout(await listServices())).toEqual(["-/B", "-/C", "-/A"]);
  });

  it("rejects moves to unknown categories or of unknown services", async () => {
    const a = await createService("A", null);

    const badCategory = await app.request(
      `/api/services/${a.id}/move`,
      json("POST", { category_id: "nope", index: 0 })
    );
    expect(badCategory.status).toBe(404);

    const badService = await app.request(
      "/api/services/nope/move",
      json("POST", { category_id: null, index: 0 })
    );
    expect(badService.status).toBe(404);

    const badIndex = await app.request(
      `/api/services/${a.id}/move`,
      json("POST", { category_id: null, index: -1 })
    );
    expect(badIndex.status).toBe(400);
  });

  it("reorders services within a category and ignores foreign ids", async () => {
    const a = await createService("A", "Media");
    const b = await createService("B", "Media");
    const c = await createService("C", "Media");
    const other = await createService("Other", "Infra");
    const [media] = await listCategories();

    const response = await app.request(
      "/api/services/order",
      json("PUT", { category_id: media.id, ids: [c.id, other.id, a.id] })
    );
    expect(response.status).toBe(200);
    expect(layout((await response.json()) as Service[])).toEqual([
      "Media/C",
      "Media/A",
      "Media/B",
      "Infra/Other",
    ]);
    expect(b.position).toBe(1);

    const missing = await app.request(
      "/api/services/order",
      json("PUT", { category_id: "nope", ids: [] })
    );
    expect(missing.status).toBe(404);

    const invalid = await app.request("/api/services/order", json("PUT", { category_id: null }));
    expect(invalid.status).toBe(400);
  });
});
