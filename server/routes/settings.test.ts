import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { app } from "../app";
import type { DashboardSettingsResponse as View } from "@shared/dashboard-settings";
import { initializeServer, shutdown } from "../runtime";
import { cleanupTestDatabase, setupTestDatabase } from "../test-utils";

let testDataDir: string;

beforeEach(() => {
  testDataDir = setupTestDatabase("orbitdash-settings-");
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

describe("settings routes", () => {
  it("returns an empty category order when no setting is stored", async () => {
    const response = await app.request("/api/settings/category-order");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ order: [] });
  });

  it("persists a sanitized category order", async () => {
    const response = await app.request("/api/settings/category-order", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order: [" Media ", "Infrastructure", "Media", ""] }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      order: ["Media", "Infrastructure"],
    });

    const getResponse = await app.request("/api/settings/category-order");
    await expect(getResponse.json()).resolves.toEqual({
      order: ["Media", "Infrastructure"],
    });
  });

  it("rejects payloads whose order field is not an array of strings", async () => {
    const response = await app.request("/api/settings/category-order", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order: ["Media", 123] }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "order must be an array of category names",
    });
  });

  it("rejects attempts to manually order the uncategorized section", async () => {
    const response = await app.request("/api/settings/category-order", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order: ["Media", "Uncategorized"] }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: '"Uncategorized" cannot be manually ordered',
    });
  });

  it("returns a structured error for malformed JSON payloads", async () => {
    const response = await app.request("/api/settings/category-order", {
      method: "PUT",
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
    const response = await app.request("/api/settings/category-order", {
      method: "PUT",
      headers: {
        "Content-Type": "text/plain",
      },
      body: "order=Infra",
    });

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: "content-type must be application/json",
    });
  });
});

describe("dashboard settings routes", () => {
  const device = "device-1234";

  function put(path: string, body: unknown) {
    return app.request(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns defaults before anything is saved", async () => {
    const response = await app.request(`/api/settings?device=${device}`);
    const body = (await response.json()) as View;

    const defaults: View["settings"] = {
      appearance: {
        accent: "ice",
        theme: "dark",
        title: "",
        wallpaper: null,
        wallpaperBlur: 0,
        wallpaperDim: 40,
        customCss: "",
      },
      layout: {
        mode: "columns",
        density: "comfortable",
        statsPosition: "top",
        showServices: true,
        showStats: true,
        showStatsPage: true,
        linkPreference: "auto",
      },
      search: { engine: "duckduckgo", customUrl: "" },
    };
    expect(body).toEqual({ device: null, effective: defaults, settings: defaults, stored: false });
  });

  it("patches appearance and rejects unknown accents", async () => {
    const response = await put("/api/settings", {
      appearance: { accent: "violet", theme: "light" },
    });
    expect(((await response.json()) as View).settings.appearance).toMatchObject({
      accent: "violet",
      theme: "light",
    });
    expect((await put("/api/settings", { appearance: { accent: "teal" } })).status).toBe(400);
  });

  it("saves a web search engine and checks custom search URLs", async () => {
    const search = {
      engine: "custom",
      customUrl: "https://searx.example.com/search?q=%s",
    } as const;
    const response = await put("/api/settings", { search });
    expect(((await response.json()) as View).settings.search).toEqual(search);
    expect(
      (await put("/api/settings", { search: { customUrl: "https://example.com" } })).status
    ).toBe(400);
    expect((await put("/api/settings", { search: { engine: "altavista" } })).status).toBe(400);
  });

  it("saves a title, a wallpaper with blur and dim, and custom CSS within their limits", async () => {
    const appearance = {
      title: "Homelab",
      wallpaper: "wallpaper-0123456789abcdef.jpg",
      wallpaperBlur: 12,
      wallpaperDim: 60,
      customCss: ".card { border-radius: 4px; }",
    };
    const response = await put("/api/settings", { appearance });
    expect(((await response.json()) as View).settings.appearance).toMatchObject(appearance);

    for (const invalid of [
      { title: "x".repeat(61) },
      { wallpaper: "../../etc/passwd" },
      { wallpaperBlur: 33 },
      { wallpaperDim: 1.5 },
      { customCss: "x".repeat(20_001) },
    ]) {
      expect((await put("/api/settings", { appearance: invalid })).status).toBe(400);
    }
  });

  it("patches the shared settings", async () => {
    const response = await put("/api/settings", { layout: { density: "tiles" } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as View;
    expect(body.stored).toBe(true);
    expect(body.settings.layout.density).toBe("tiles");

    const again = (await (await app.request("/api/settings")).json()) as View;
    expect(again.settings.layout).toMatchObject({ density: "tiles", statsPosition: "top" });
  });

  it("rejects unknown fields and bad values", async () => {
    expect((await put("/api/settings", { layout: { density: "huge" } })).status).toBe(400);
    expect((await put("/api/settings", { theme: "dark" })).status).toBe(400);
  });

  it("layers device overrides over the shared settings", async () => {
    await put("/api/settings", { layout: { density: "tiles" } });

    const response = await put(`/api/settings/devices/${device}`, {
      name: "Kitchen tablet",
      overrides: { layout: { showServices: false } },
    });
    const body = (await response.json()) as View;

    expect(body.device).toEqual({
      id: device,
      name: "Kitchen tablet",
      overrides: { layout: { showServices: false } },
    });
    expect(body.effective.layout).toMatchObject({ density: "tiles", showServices: false });
    expect(body.settings.layout.showServices).toBe(true);

    const merged = await put(`/api/settings/devices/${device}`, {
      overrides: { layout: { mode: "rows" } },
    });
    expect(((await merged.json()) as View).device?.overrides).toEqual({
      layout: { showServices: false, mode: "rows" },
    });

    const listed = (await (await app.request("/api/settings/devices")).json()) as {
      devices: Array<{ id: string }>;
    };
    expect(listed.devices.map((entry) => entry.id)).toEqual([device]);
  });

  it("clears overrides with null and deletes devices", async () => {
    await put(`/api/settings/devices/${device}`, { overrides: { layout: { showStats: false } } });

    const cleared = (await (
      await put(`/api/settings/devices/${device}`, { overrides: null })
    ).json()) as View;
    expect(cleared.device?.overrides).toEqual({});
    expect(cleared.effective.layout.showStats).toBe(true);

    const deleted = await app.request(`/api/settings/devices/${device}`, { method: "DELETE" });
    expect(deleted.status).toBe(200);
    const missing = await app.request(`/api/settings/devices/${device}`, { method: "DELETE" });
    expect(missing.status).toBe(404);
  });

  it("validates device ids and ignores invalid ones in queries", async () => {
    expect((await put("/api/settings/devices/bad", { name: "x" })).status).toBe(400);

    const response = await app.request("/api/settings?device=../etc");
    expect(((await response.json()) as View).device).toBeNull();
  });

  it("survives a corrupt stored document", async () => {
    const { getDb } = await import("../db");
    getDb()
      .prepare("INSERT INTO settings (key, value) VALUES ('dashboard.settings', '{oops')")
      .run();
    getDb()
      .prepare(`INSERT INTO settings (key, value) VALUES ('dashboard.device.${device}', '"weird"')`)
      .run();

    const body = (await (await app.request(`/api/settings?device=${device}`)).json()) as View;
    expect(body.stored).toBe(true);
    expect(body.settings.layout.mode).toBe("columns");
    expect(body.device).toBeNull();
  });
});
