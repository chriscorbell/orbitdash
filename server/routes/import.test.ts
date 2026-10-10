import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import fs from "fs";
import path from "path";
import { app } from "../app";
import { getDb } from "../db";
import { applySeedIfFresh } from "../importers/service";
import { initializeServer, shutdown } from "../runtime";
import { iconLibrary } from "../services/icon-library";
import { listServices } from "../services/service-operations";
import { cleanupTestDatabase, setupTestDatabase } from "../test-utils";
import type { ImportPreview, ImportResult } from "@shared/types";

let testDataDir: string;
const originalFetch = globalThis.fetch;
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

function libraryEntry(slug: string) {
  return {
    id: `dashboard-icons:${slug}`,
    source: "dashboard-icons" as const,
    slug,
    name: slug,
    url: `https://cdn.example.com/${slug}.svg`,
  };
}

/** A library that knows a few icons, matched by query prefix like the real one. */
function mockLibrary(slugs = ["jellyfin", "jellyseerr", "plex"]) {
  return spyOn(iconLibrary, "search").mockImplementation(async (query: string) => ({
    entries: slugs.filter((slug) => slug.startsWith(query)).map(libraryEntry),
    updatedAt: 1,
  }));
}

/** Icon downloads succeed unless the URL contains "broken". */
function mockIconDownloads() {
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    if (String(input).includes("broken")) return new Response("nope", { status: 404 });
    return new Response(SVG, {
      status: 200,
      headers: { "content-length": String(SVG.length), "content-type": "image/svg+xml" },
    });
  }) as unknown as typeof fetch;
}

function post(route: string, body: unknown) {
  return app.request(`/api/import/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  testDataDir = setupTestDatabase("orbitdash-import-");
  initializeServer({
    dataDir: testDataDir,
    logStartup: false,
    registerSignalHandlers: false,
    startJobs: false,
    startMetrics: false,
  });
  mockIconDownloads();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  iconLibrary.resetForTesting();
  shutdown();
  cleanupTestDatabase(testDataDir);
});

const HOMEPAGE = `
- Media:
    - Jellyfin:
        href: http://10.0.0.20:8096
        icon: jellyfin.png
    - Plex:
        href: http://10.0.0.20:32400/web
    - Overseerr:
        href: https://requests.example.com
        icon: https://cdn.example.com/overseerr.svg
`;

describe("POST /api/import/preview", () => {
  it("resolves icons through the library and flags links that already exist", async () => {
    const search = mockLibrary();
    await post("apply", {
      services: [
        {
          name: "Old Plex",
          url: "10.0.0.20:32400/web",
          description: null,
          iconUrl: null,
          category: null,
        },
      ],
    });

    const response = await post("preview", { content: HOMEPAGE });
    expect(response.status).toBe(200);
    const preview = (await response.json()) as ImportPreview;
    expect(preview).toEqual({
      format: "homepage",
      groups: [
        {
          name: "Media",
          services: [
            {
              name: "Jellyfin",
              url: "http://10.0.0.20:8096",
              description: null,
              iconUrl: "https://cdn.example.com/jellyfin.svg",
              duplicate: false,
            },
            {
              // No icon in the file, so the service's own name is looked up.
              name: "Plex",
              url: "http://10.0.0.20:32400/web",
              description: null,
              iconUrl: "https://cdn.example.com/plex.svg",
              duplicate: true,
            },
            {
              name: "Overseerr",
              url: "https://requests.example.com",
              description: null,
              iconUrl: "https://cdn.example.com/overseerr.svg",
              duplicate: false,
            },
          ],
        },
      ],
      warnings: [],
    });
    search.mockRestore();
  });

  it("still previews when the icon library is unavailable", async () => {
    const search = spyOn(iconLibrary, "search").mockRejectedValue(new Error("offline"));
    const preview = (await (await post("preview", { content: HOMEPAGE })).json()) as ImportPreview;
    expect(preview.groups[0].services.map((service) => service.iconUrl)).toEqual([
      null,
      null,
      "https://cdn.example.com/overseerr.svg",
    ]);
    expect(preview.warnings).toEqual([
      "The icon library is unavailable, so icons named in the file weren't looked up.",
    ]);
    search.mockRestore();
  });

  it("explains files it can't read", async () => {
    const response = await post("preview", { content: "title: nothing to import" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "This doesn't look like a Homepage, Dashy, Homer, Homarr or bookmarks file.",
    });
    expect((await post("preview", { content: "" })).status).toBe(400);
    expect((await post("preview", { file: "x" })).status).toBe(400);
  });
});

describe("POST /api/import/apply", () => {
  it("creates services in order after a snapshot, keeping ones whose icon fails", async () => {
    const services = [
      ["Jellyfin", "Media", "https://cdn.example.com/jellyfin.svg"],
      ["Router", "Infra", null],
      ["Plex", "Media", "https://cdn.example.com/broken.svg"],
      ["Sonarr", "Media", "https://cdn.example.com/sonarr.svg"],
      ["Bad", "Media", null],
    ].map(([name, category, iconUrl]) => ({
      name,
      url: name === "Bad" ? "not a url" : `https://${name!.toLowerCase()}.lan`,
      description: null,
      iconUrl,
      category,
    }));

    const response = await post("apply", { services });
    expect(response.status).toBe(200);
    const result = (await response.json()) as ImportResult;
    expect(result).toMatchObject({
      created: 4,
      failed: [{ name: "Bad", error: "service url must be a valid URL" }],
      iconFailures: 1,
    });
    expect(result.snapshot).toEndWith("-pre-import");
    expect(fs.existsSync(path.join(testDataDir, "backups", result.snapshot!))).toBe(true);

    const created = listServices();
    expect(created.map((service) => [service.category, service.name])).toEqual([
      ["Media", "Jellyfin"],
      ["Media", "Plex"],
      ["Media", "Sonarr"],
      ["Infra", "Router"],
    ]);
    expect(created.map((service) => service.icon !== null)).toEqual([true, false, true, false]);
  });

  it("validates the request", async () => {
    expect((await post("apply", { services: [] })).status).toBe(400);
    const service = { name: "A", url: "https://a.lan", description: null, iconUrl: null };
    expect((await post("apply", { services: [service] })).status).toBe(400);
    expect(
      (await post("apply", { services: Array(501).fill({ ...service, category: null }) })).status
    ).toBe(400);
  });
});

describe("applySeedIfFresh", () => {
  const SEED = `
categories:
  - name: Media
    services:
      - name: Jellyfin
        url: http://10.0.0.20:8096
        icon: jellyfin
`;

  it("populates a fresh install once from the seed file", async () => {
    const search = mockLibrary();
    fs.writeFileSync(path.join(testDataDir, "seed.yaml"), SEED);

    expect(await applySeedIfFresh({})).toBe(1);
    expect(listServices().map((service) => [service.category, service.name])).toEqual([
      ["Media", "Jellyfin"],
    ]);
    expect(listServices()[0].icon).not.toBeNull();

    // Removing everything doesn't bring the seed back: it only runs once.
    getDb().prepare("DELETE FROM services").run();
    getDb().prepare("DELETE FROM categories").run();
    expect(await applySeedIfFresh({})).toBe(0);
    expect(listServices()).toEqual([]);
    search.mockRestore();
  });

  it("reads ORBITDASH_SEED_FILE and leaves dashboards that already have services alone", async () => {
    const search = mockLibrary();
    const file = path.join(testDataDir, "custom-seed.yaml");
    fs.writeFileSync(file, SEED);
    await post("apply", {
      services: [
        { name: "A", url: "https://a.lan", description: null, iconUrl: null, category: null },
      ],
    });

    expect(await applySeedIfFresh({ ORBITDASH_SEED_FILE: file })).toBe(0);
    expect(listServices().map((service) => service.name)).toEqual(["A"]);
    search.mockRestore();
  });

  it("does nothing without a seed file and survives a broken one", async () => {
    expect(await applySeedIfFresh({})).toBe(0);
    fs.writeFileSync(path.join(testDataDir, "seed.yaml"), "title: nope");
    expect(await applySeedIfFresh({})).toBe(0);
    expect(listServices()).toEqual([]);
  });
});
