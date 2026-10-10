import { afterEach, describe, expect, it } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import {
  createIconLibrary,
  DASHBOARD_ICONS_INDEX,
  parseDashboardIcons,
  parseSelfhst,
  searchLibrary,
  SELFHST_INDEX,
} from "./icon-library";

const dashboardIndex = {
  plex: { base: "svg", aliases: ["Plex Media Server"] },
  "home-assistant": { base: "svg", aliases: ["HASS"] },
  "home-assistant-alt": { base: "png", aliases: [] },
  "Bad Slug": { base: "svg" },
  broken: "nope",
  jellyfin: { base: "svg", aliases: "not-a-list" },
};

const selfhstIndex = [
  { Name: "Plex", Reference: "plex", SVG: "Yes", Tags: "media, streaming" },
  { Name: "Ampache", Reference: "ampache", SVG: "No", Tags: "" },
  { Name: "", Reference: "home-assistant", SVG: "Yes" },
  { Name: "No reference" },
  "nope",
];

function library() {
  const entries = [...parseDashboardIcons(dashboardIndex), ...parseSelfhst(selfhstIndex)];
  return { entries, updatedAt: 1 };
}

describe("parsing the indexes", () => {
  it("reads dashboard-icons metadata with formats and aliases, skipping bad entries", () => {
    const entries = parseDashboardIcons(dashboardIndex);
    expect(entries.map((entry) => entry.slug)).toEqual([
      "plex",
      "home-assistant",
      "home-assistant-alt",
      "jellyfin",
    ]);
    expect(entries[0]).toMatchObject({
      id: "dashboard-icons:plex",
      name: "Plex",
      url: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/plex.svg",
    });
    expect(entries[2].url).toBe(
      "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/home-assistant-alt.png"
    );
    expect(entries[1].name).toBe("Home Assistant");
    expect(parseDashboardIcons(null)).toEqual([]);
  });

  it("reads selfh.st's index with PNG fallback and names", () => {
    const entries = parseSelfhst(selfhstIndex);
    expect(entries.map((entry) => entry.id)).toEqual([
      "selfhst:plex",
      "selfhst:ampache",
      "selfhst:home-assistant",
    ]);
    expect(entries[1].url).toBe("https://cdn.jsdelivr.net/gh/selfhst/icons/png/ampache.png");
    expect(entries[2].name).toBe("Home Assistant");
    expect(parseSelfhst({})).toEqual([]);
  });
});

describe("searchLibrary", () => {
  it("ranks exact slugs first, then prefixes, aliases and substrings, across both libraries", () => {
    const ids = searchLibrary(library(), "plex").map((entry) => entry.id);
    expect(ids.slice(0, 2)).toEqual(["dashboard-icons:plex", "selfhst:plex"]);

    expect(searchLibrary(library(), "Home Assistant").map((entry) => entry.id)).toEqual([
      "dashboard-icons:home-assistant",
      "selfhst:home-assistant",
      "dashboard-icons:home-assistant-alt",
    ]);
    expect(searchLibrary(library(), "hass")[0].slug).toBe("home-assistant");
    expect(searchLibrary(library(), "streaming")[0].id).toBe("selfhst:plex");
  });

  it("returns nothing for an empty query and respects the limit", () => {
    expect(searchLibrary(library(), "  ")).toEqual([]);
    expect(searchLibrary(library(), "home", 1)).toHaveLength(1);
    expect(searchLibrary(library(), "plex")[0]).not.toHaveProperty("terms");
  });
});

describe("createIconLibrary", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  function setup(responses: Record<string, () => Response | Promise<Response>>, start = 1_000) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orbitdash-icons-"));
    dirs.push(dir);
    let now = start;
    const calls: string[] = [];
    const service = createIconLibrary({
      fetch: async (url) => {
        calls.push(url);
        const respond = responses[url];
        if (!respond) throw new Error("offline");
        return respond();
      },
      now: () => now,
      cacheFile: () => path.join(dir, "cache", "icon-library.json"),
    });
    return {
      service,
      calls,
      dir,
      advance: (ms: number) => {
        now += ms;
      },
    };
  }

  const online = {
    [DASHBOARD_ICONS_INDEX]: () => Response.json(dashboardIndex),
    [SELFHST_INDEX]: () => Response.json(selfhstIndex),
  };

  it("fetches both indexes once, caches them on disk, and refreshes after a day", async () => {
    const { service, calls, dir, advance } = setup(online);
    const first = await service.search("plex");
    expect(first.entries.length).toBeGreaterThan(1);
    expect(first.updatedAt).toBe(1_000);
    await service.search("jelly");
    expect(calls).toHaveLength(2);
    expect(fs.existsSync(path.join(dir, "cache", "icon-library.json"))).toBe(true);

    advance(25 * 60 * 60 * 1000);
    // Stale results are served while the refresh runs in the background.
    expect((await service.search("plex")).updatedAt).toBe(1_000);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toHaveLength(4);
    expect((await service.search("plex")).updatedAt).toBeGreaterThan(1_000);
  });

  it("starts from the disk copy after a restart, even while offline", async () => {
    const { service, dir } = setup(online);
    await service.search("plex");

    const offline = createIconLibrary({
      fetch: async () => {
        throw new Error("offline");
      },
      now: () => 2_000,
      cacheFile: () => path.join(dir, "cache", "icon-library.json"),
    });
    expect((await offline.search("plex")).entries[0].slug).toBe("plex");
  });

  it("works with one library down and fails only when both are", async () => {
    const partial = setup({
      [DASHBOARD_ICONS_INDEX]: () => new Response("nope", { status: 500 }),
      [SELFHST_INDEX]: () => Response.json(selfhstIndex),
    });
    expect((await partial.service.search("plex")).entries.map((entry) => entry.source)).toEqual([
      "selfhst",
    ]);

    const down = setup({});
    await expect(down.service.search("plex")).rejects.toThrow("could not be reached");
    down.service.resetForTesting();
    await expect(down.service.search("plex")).rejects.toThrow();
  });

  it("ignores a corrupt disk copy", async () => {
    const { service, dir } = setup(online);
    fs.mkdirSync(path.join(dir, "cache"), { recursive: true });
    fs.writeFileSync(path.join(dir, "cache", "icon-library.json"), "{bad json");
    expect((await service.search("plex")).entries.length).toBeGreaterThan(0);
  });
});
