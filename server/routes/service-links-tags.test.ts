import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { app } from "../app";
import type { Service } from "@shared/types";
import { getDb } from "../db";
import { cleanupTestDatabase, createTestDataDir } from "../test-utils";
import { initializeServer, shutdown } from "../runtime";

let testDataDir: string;

function postJson(path: string, body: unknown, method = "POST") {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createService(overrides: Record<string, unknown> = {}) {
  return postJson("/api/services", {
    name: "Jellyfin",
    url: "http://10.0.0.20:8096",
    category: "Media",
    ...overrides,
  });
}

async function created(overrides: Record<string, unknown> = {}): Promise<Service> {
  const response = await createService(overrides);
  expect(response.status).toBe(201);
  return (await response.json()) as Service;
}

async function errorOf(response: Response): Promise<string> {
  expect(response.status).toBe(400);
  return ((await response.json()) as { error: string }).error;
}

beforeEach(() => {
  testDataDir = createTestDataDir("orbitdash-links-tags-");
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

describe("external URLs, links and tags", () => {
  it("start empty for a service created without them", async () => {
    const service = await created();
    expect(service).toMatchObject({ external_url: null, links: [], tags: [] });
  });

  it("are normalized when a service is created", async () => {
    const service = await created({
      external_url: " jellyfin.example.com ",
      links: [
        { label: " Admin ", url: "10.0.0.20:8096/web/#/dashboard" },
        { label: "", url: "  " },
      ],
      tags: ["Media", " media ", "Home  Lab", "video,4k"],
    });

    expect(service.external_url).toBe("https://jellyfin.example.com/");
    expect(service.links).toEqual([
      { label: "Admin", url: "http://10.0.0.20:8096/web/#/dashboard" },
    ]);
    expect(service.tags).toEqual(["media", "home lab", "video", "4k"]);
  });

  it("read back the same way from the list", async () => {
    const service = await created({
      external_url: "https://jellyfin.example.com",
      links: [{ label: "Logs", url: "https://logs.example.com" }],
      tags: ["media"],
    });

    const services = (await (await app.request("/api/services")).json()) as Service[];
    expect(services.find((entry) => entry.id === service.id)).toMatchObject({
      external_url: "https://jellyfin.example.com/",
      links: [{ label: "Logs", url: "https://logs.example.com/" }],
      tags: ["media"],
    });
  });

  it("reject values the form couldn't save", async () => {
    expect(await errorOf(await createService({ external_url: "ftp://files" }))).toBe(
      "external url must be a valid URL"
    );
    expect(await errorOf(await createService({ external_url: 42 }))).toBe(
      "external url must be a valid URL"
    );
    expect(await errorOf(await createService({ links: "Admin" }))).toBe(
      "links must be a list of { label, url }"
    );
    expect(await errorOf(await createService({ links: [{ label: "Admin" }] }))).toBe(
      "links must be a list of { label, url }"
    );
    expect(
      await errorOf(await createService({ links: [{ label: "", url: "https://x.test" }] }))
    ).toBe("each link needs a label");
    expect(
      await errorOf(await createService({ links: [{ label: "Admin", url: "javascript:x" }] }))
    ).toBe("Admin: link url must be a valid URL");
    const sixLinks = Array.from({ length: 6 }, (_, index) => ({
      label: `Link ${index}`,
      url: `https://${index}.test`,
    }));
    expect(await errorOf(await createService({ links: sixLinks }))).toBe(
      "a service can have up to 5 links"
    );
    expect(await errorOf(await createService({ tags: "media" }))).toBe(
      "tags must be a list of strings"
    );
    expect(await errorOf(await createService({ tags: ["x".repeat(33)] }))).toBe(
      "tags must be 32 characters or fewer"
    );
  });

  it("change only when an update sends them", async () => {
    const service = await created({
      external_url: "https://jellyfin.example.com",
      links: [{ label: "Logs", url: "https://logs.example.com" }],
      tags: ["media"],
    });

    const renamed = (await (
      await postJson(`/api/services/${service.id}`, { name: "Jelly" }, "PUT")
    ).json()) as Service;
    expect(renamed).toMatchObject({
      name: "Jelly",
      external_url: "https://jellyfin.example.com/",
      links: [{ label: "Logs", url: "https://logs.example.com/" }],
      tags: ["media"],
    });

    const cleared = (await (
      await postJson(
        `/api/services/${service.id}`,
        { external_url: null, links: [], tags: [] },
        "PUT"
      )
    ).json()) as Service;
    expect(cleared).toMatchObject({ external_url: null, links: [], tags: [] });
  });

  it("travel through the multipart form the dialog sends", async () => {
    const form = new FormData();
    form.set("name", "Grafana");
    form.set("url", "http://grafana.lan:3000");
    form.set("external_url", "https://grafana.example.com");
    form.set("links", JSON.stringify([{ label: "Explore", url: "grafana.lan:3000/explore" }]));
    form.set("tags", JSON.stringify(["Monitoring"]));
    const response = await app.request("/api/services", { method: "POST", body: form });
    expect(response.status).toBe(201);
    const service = (await response.json()) as Service;
    expect(service).toMatchObject({
      external_url: "https://grafana.example.com/",
      links: [{ label: "Explore", url: "http://grafana.lan:3000/explore" }],
      tags: ["monitoring"],
    });

    const update = new FormData();
    update.set("external_url", "");
    update.set("tags", "not json");
    const rejected = await app.request(`/api/services/${service.id}`, {
      method: "PUT",
      body: update,
    });
    expect(await errorOf(rejected)).toBe("tags must be a list of strings");

    update.set("tags", "[]");
    const cleared = (await (
      await app.request(`/api/services/${service.id}`, { method: "PUT", body: update })
    ).json()) as Service;
    expect(cleared).toMatchObject({
      external_url: null,
      links: [{ label: "Explore", url: "http://grafana.lan:3000/explore" }],
      tags: [],
    });
  });

  it("are copied by duplicates and kept through delete and restore", async () => {
    const fields = {
      external_url: "https://jellyfin.example.com/",
      links: [{ label: "Admin", url: "https://jellyfin.example.com/admin" }],
      tags: ["media", "video"],
    };
    const service = await created(fields);

    const copy = (await (
      await app.request(`/api/services/${service.id}/duplicate`, { method: "POST" })
    ).json()) as Service;
    expect(copy).toMatchObject(fields);

    await app.request(`/api/services/${service.id}`, { method: "DELETE" });
    const restored = (await (
      await app.request(`/api/services/${service.id}/restore`, { method: "POST" })
    ).json()) as Service;
    expect(restored).toMatchObject(fields);
  });

  it("restore a service trashed before the upgrade with none of them", async () => {
    const service = await created();
    await app.request(`/api/services/${service.id}`, { method: "DELETE" });
    // The trash keeps the whole row as JSON; one written by an older version lacks the columns.
    getDb().exec(
      `UPDATE service_trash SET data = json_remove(data, '$.external_url', '$.links', '$.tags')`
    );

    const response = await app.request(`/api/services/${service.id}/restore`, { method: "POST" });
    expect(response.status).toBe(201);
    expect((await response.json()) as Service).toMatchObject({
      external_url: null,
      links: [],
      tags: [],
    });
  });
});
