import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Board } from "../shared/types.ts";
import { createApp } from "./app.ts";
import { referencedIcons } from "./board.ts";
import { openDatabase } from "./db.ts";
import { createIconLibrary } from "./icon-library.ts";
import { createIconStore } from "./icons.ts";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const SVG = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');

let dir: string;
let ctx: ReturnType<typeof setup>;

function setup() {
  const db = openDatabase(path.join(dir, "orbitdash.db"), () => {});
  const icons = createIconStore(path.join(dir, "icons"));
  const downloads: string[] = [];
  const app = createApp({
    db,
    icons,
    iconLibrary: createIconLibrary({
      cacheFile: path.join(dir, "cache.json"),
      fetch: async (url) =>
        url.includes("dashboard-icons")
          ? Response.json({ jellyfin: { base: "svg", aliases: [] } })
          : new Response("down", { status: 500 }),
    }),
    fetchIcon: async (input) => {
      const url = String(input);
      downloads.push(url);
      if (url.endsWith("/missing.svg")) return new Response("nope", { status: 404 });
      if (url.endsWith("/page.html")) return new Response("<html></html>");
      return new Response(SVG);
    },
  });
  return { app, db, icons, downloads };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "orbitdash-app-"));
  ctx = setup();
});

afterEach(() => {
  ctx.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function form(fields: Record<string, string | Blob>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function call(method: string, url: string, payload?: FormData | object, headers = {}) {
  const init: RequestInit = { method, headers };
  if (payload instanceof FormData) init.body = payload;
  else if (payload) {
    init.body = JSON.stringify(payload);
    init.headers = { "Content-Type": "application/json", ...headers };
  }
  const response = await ctx.app.request(url, init);
  const body = (await response.json()) as Board & { error: string };
  return { status: response.status, body, response };
}

async function addLink(fields: Record<string, string | Blob>): Promise<Board> {
  const { status, body } = await call("POST", "/api/links", form(fields));
  expect(status).toBe(201);
  return body;
}

function iconFiles(): string[] {
  return fs.readdirSync(ctx.icons.dir).sort();
}

describe("links", () => {
  it("adds links, creating categories by name and filling in a missing scheme", async () => {
    await addLink({ name: "Plex", url: "plex:32400", category: "Media" });
    const board = await addLink({
      name: "Jellyfin",
      url: "jellyfin.example.com",
      category: "media",
    });

    expect(board.categories).toHaveLength(1);
    expect(board.categories[0].name).toBe("Media");
    expect(board.links.map((link) => [link.name, link.url, link.newTab])).toEqual([
      ["Plex", "http://plex:32400/", true],
      ["Jellyfin", "https://jellyfin.example.com/", true],
    ]);
  });

  it("keeps links without a category ahead of every category", async () => {
    await addLink({ name: "In", url: "https://in.example", category: "Tools" });
    const board = await addLink({ name: "Out", url: "https://out.example", newTab: "false" });
    expect(board.links.map((link) => [link.name, link.categoryId === null, link.newTab])).toEqual([
      ["Out", true, false],
      ["In", false, true],
    ]);
  });

  it("rejects missing names, bad URLs and overlong fields", async () => {
    for (const fields of [
      { name: " ", url: "https://a.example" },
      { name: "A", url: "javascript:alert(1)" },
      { name: "A", url: "" },
      { name: "x".repeat(101), url: "https://a.example" },
    ]) {
      const { status, body } = await call("POST", "/api/links", form(fields));
      expect(status).toBe(400);
      expect(body.error).toMatch(/\w/);
    }
  });

  it("edits a link, moving it to the end of another category", async () => {
    await addLink({ name: "A", url: "https://a.example", category: "One" });
    await addLink({ name: "B", url: "https://b.example", category: "Two" });
    let board = await addLink({ name: "C", url: "https://c.example", category: "One" });
    const a = board.links.find((link) => link.name === "A")!;

    ({ body: board } = await call(
      "PATCH",
      `/api/links/${a.id}`,
      form({ name: "A2", url: "https://a2.example", category: "Two", newTab: "false" })
    ));
    expect(board.links.map((link) => link.name)).toEqual(["C", "B", "A2"]);
    expect(board.links[2]).toMatchObject({ url: "https://a2.example/", newTab: false });
  });

  it("answers 404 for links that don't exist", async () => {
    const update = await call(
      "PATCH",
      "/api/links/nope",
      form({ name: "A", url: "https://a.example", iconUrl: "https://icons.example/a.svg" })
    );
    expect(update.status).toBe(404);
    expect(iconFiles()).toEqual([]);
    expect((await call("DELETE", "/api/links/nope")).status).toBe(404);
  });
});

describe("icons", () => {
  it("stores uploads, serves them for good, and replaces them without leaving files", async () => {
    let board = await addLink({
      name: "A",
      url: "https://a.example",
      iconFile: new File([PNG], "a.png"),
    });
    const link = board.links[0];
    expect(link.icon).toMatch(new RegExp(`^${link.id}-[0-9a-f]{8}\\.png$`));

    const served = await ctx.app.request(`/api/icons/${link.icon}`);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("cache-control")).toContain("immutable");
    expect(served.headers.get("content-security-policy")).toContain("default-src 'none'");

    ({ body: board } = await call(
      "PATCH",
      `/api/links/${link.id}`,
      form({ name: "A", url: "https://a.example", iconUrl: "https://icons.example/a.svg" })
    ));
    expect(board.links[0].icon).toMatch(/\.svg$/);
    expect(iconFiles()).toEqual([board.links[0].icon]);
    expect(ctx.downloads).toEqual(["https://icons.example/a.svg"]);

    ({ body: board } = await call(
      "PATCH",
      `/api/links/${link.id}`,
      form({ name: "A", url: "https://a.example", removeIcon: "true" })
    ));
    expect(board.links[0].icon).toBeNull();
    expect(iconFiles()).toEqual([]);
  });

  it("keeps the current icon when a save doesn't mention one", async () => {
    const board = await addLink({
      name: "A",
      url: "https://a.example",
      iconUrl: "https://i.example/a.svg",
    });
    const { body } = await call(
      "PATCH",
      `/api/links/${board.links[0].id}`,
      form({ name: "Renamed", url: "https://a.example" })
    );
    expect(body.links[0].icon).toBe(board.links[0].icon);
  });

  it("refuses files that aren't images and downloads that fail", async () => {
    const text = await call(
      "POST",
      "/api/links",
      form({ name: "A", url: "https://a.example", iconFile: new File(["hello"], "a.png") })
    );
    expect(text.status).toBe(400);
    for (const iconUrl of [
      "https://i.example/missing.svg",
      "https://i.example/page.html",
      "file:///etc/passwd",
    ]) {
      const { status } = await call(
        "POST",
        "/api/links",
        form({ name: "A", url: "https://a.example", iconUrl })
      );
      expect(status).toBe(400);
    }
    expect(iconFiles()).toEqual([]);
    expect((await call("GET", "/api/board")).body.links).toEqual([]);
  });

  it("deletes a link's icon with the link", async () => {
    const board = await addLink({
      name: "A",
      url: "https://a.example",
      iconFile: new File([SVG], "a.svg"),
    });
    const { body } = await call("DELETE", `/api/links/${board.links[0].id}`);
    expect(body.links).toEqual([]);
    expect(iconFiles()).toEqual([]);
  });

  it("cleans up files no link points at", async () => {
    await addLink({ name: "A", url: "https://a.example", iconFile: new File([SVG], "a.svg") });
    fs.writeFileSync(path.join(ctx.icons.dir, "stray.png"), PNG);
    expect(ctx.icons.removeUnused(referencedIcons(ctx.db))).toBe(1);
    expect(iconFiles()).toHaveLength(1);
  });

  it("does not serve files outside the icon folder", async () => {
    fs.writeFileSync(path.join(dir, "secret.txt"), "secret");
    expect((await ctx.app.request("/api/icons/..%2Fsecret.txt")).status).toBe(404);
  });

  it("searches the icon libraries, even with one of them down", async () => {
    const { status, body } = await call("GET", "/api/icon-library?q=jelly");
    expect(status).toBe(200);
    expect(body).toEqual([
      expect.objectContaining({ id: "dashboard-icons:jellyfin", source: "dashboard-icons" }),
    ]);
  });
});

describe("categories", () => {
  it("adds, renames and refuses duplicate names in any case", async () => {
    let { status, body } = await call("POST", "/api/categories", { name: "Media" });
    expect(status).toBe(201);
    const id = (body as Board).categories[0].id;

    ({ status } = await call("POST", "/api/categories", { name: "media" }));
    expect(status).toBe(400);

    await call("POST", "/api/categories", { name: "Tools" });
    ({ status, body } = await call("PATCH", `/api/categories/${id}`, { name: "tools" }));
    expect(status).toBe(400);
    expect(body.error).toContain("Tools");

    ({ body } = await call("PATCH", `/api/categories/${id}`, { name: "Films" }));
    expect((body as Board).categories.map((category) => category.name)).toEqual(["Films", "Tools"]);
    expect((await call("PATCH", "/api/categories/nope", { name: "X" })).status).toBe(404);
  });

  it("moves a deleted category's links to the end of the ungrouped ones", async () => {
    await addLink({ name: "Loose", url: "https://l.example" });
    await addLink({ name: "A", url: "https://a.example", category: "Gone" });
    const board = await addLink({ name: "B", url: "https://b.example", category: "Gone" });

    const { body } = await call("DELETE", `/api/categories/${board.categories[0].id}`);
    expect((body as Board).categories).toEqual([]);
    expect((body as Board).links.map((link) => [link.name, link.categoryId])).toEqual([
      ["Loose", null],
      ["A", null],
      ["B", null],
    ]);
    expect((await call("DELETE", "/api/categories/nope")).status).toBe(404);
  });
});

describe("layout", () => {
  it("saves a complete arrangement and refuses one that misses or repeats anything", async () => {
    await addLink({ name: "A", url: "https://a.example", category: "One" });
    await addLink({ name: "B", url: "https://b.example", category: "Two" });
    const board = await addLink({ name: "C", url: "https://c.example" });
    const [one, two] = board.categories.map((category) => category.id);
    const [c, a, b] = board.links.map((link) => link.id);

    const { status, body } = await call("PUT", "/api/layout", {
      ungrouped: [],
      categories: [
        { id: two, links: [b, c, a] },
        { id: one, links: [] },
      ],
    });
    expect(status).toBe(200);
    expect((body as Board).categories.map((category) => category.id)).toEqual([two, one]);
    expect((body as Board).links.map((link) => link.name)).toEqual(["B", "C", "A"]);

    for (const layout of [
      {
        ungrouped: [],
        categories: [
          { id: two, links: [b, c] },
          { id: one, links: [] },
        ],
      },
      {
        ungrouped: [a],
        categories: [
          { id: two, links: [b, c, a] },
          { id: one, links: [] },
        ],
      },
      { ungrouped: [], categories: [{ id: two, links: [b, c, a] }] },
    ]) {
      expect((await call("PUT", "/api/layout", layout)).status).toBe(409);
    }
    expect((await call("PUT", "/api/layout", { ungrouped: "nope" })).status).toBe(400);
    expect((await call("PUT", "/api/layout", [])).status).toBe(400);
  });
});

describe("requests", () => {
  it("refuses writes another site's page sends, and allows same-origin and scripted ones", async () => {
    const cross = await call(
      "POST",
      "/api/categories",
      { name: "X" },
      { "Sec-Fetch-Site": "cross-site" }
    );
    expect(cross.status).toBe(403);
    const foreign = await call(
      "POST",
      "/api/categories",
      { name: "X" },
      { Origin: "https://evil.example", Host: "dash.lan" }
    );
    expect(foreign.status).toBe(403);
    const same = await call(
      "POST",
      "/api/categories",
      { name: "X" },
      { Origin: "http://dash.lan", Host: "dash.lan", "Sec-Fetch-Site": "same-origin" }
    );
    expect(same.status).toBe(201);
  });

  it("answers health checks and unknown API paths", async () => {
    expect((await call("GET", "/healthz")).body).toEqual({ status: "ok" });
    expect((await call("GET", "/readyz")).status).toBe(200);
    expect((await call("GET", "/api/nope")).status).toBe(404);
  });
});
