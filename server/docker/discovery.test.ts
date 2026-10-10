import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { app } from "../app";
import { initializeServer, shutdown } from "../runtime";
import { iconLibrary } from "../services/icon-library";
import { cleanupTestDatabase, setupTestDatabase } from "../test-utils";
import { discoveryLabels } from "./containers";
import {
  buildSuggestions,
  dismissedCount,
  dismissSuggestion,
  restoreDismissed,
  webPort,
  type LabeledContainer,
} from "./discovery";
import { dockerMonitor } from "./monitor";
import type { ContainerInfo, Service } from "@shared/types";

let dataDir: string;
let search: ReturnType<typeof spyOn>;

beforeEach(() => {
  dataDir = setupTestDatabase("orbitdash-discovery-");
  initializeServer({
    dataDir,
    logStartup: false,
    registerSignalHandlers: false,
    startJobs: false,
    startMetrics: false,
  });
  search = spyOn(iconLibrary, "search").mockImplementation(async (query: string) => ({
    entries: ["qbittorrent", "jellyfin", "nginx"]
      .filter((slug) => slug.startsWith(query))
      .map((slug) => ({
        id: `dashboard-icons:${slug}`,
        source: "dashboard-icons" as const,
        slug,
        name: slug === "qbittorrent" ? "qBittorrent" : slug[0].toUpperCase() + slug.slice(1),
        url: `https://cdn.example/${slug}.svg`,
      })),
    updatedAt: 1,
  }));
});

afterEach(() => {
  search.mockRestore();
  shutdown();
  cleanupTestDatabase(dataDir);
});

const container = (name: string, extra: Partial<ContainerInfo> = {}): ContainerInfo => ({
  id: name,
  name,
  image: `${name}:latest`,
  state: "running",
  status: "Up",
  health: null,
  createdAt: 0,
  ports: [],
  composeProject: null,
  cpuPercent: null,
  memoryBytes: null,
  memoryLimitBytes: null,
  ...extra,
});

const port = (privatePort: number, publicPort: number, protocol: "tcp" | "udp" = "tcp") => ({
  privatePort,
  publicPort,
  protocol,
});

const service = (url: string): Service => ({
  id: url,
  name: url,
  url,
  description: null,
  icon: null,
  icon_source_url: null,
  category: null,
  category_id: null,
  position: 0,
  open_in_new_tab: true,
  created_at: 1,
  updated_at: 1,
  check_enabled: false,
  check_method: "http",
  check_target: null,
  check_interval: 60,
  check_ignore_tls: false,
  external_url: null,
  links: [],
  tags: [],
});

describe("webPort", () => {
  it("prefers ports that usually serve a web UI", () => {
    expect(webPort([port(5432, 15432), port(8080, 18080), port(80, 18000)])).toBe(18000);
    expect(webPort([port(7000, 17001), port(6881, 16881)])).toBe(16881);
    expect(webPort([port(53, 53, "udp"), port(5432, 5432)])).toBeNull();
    expect(webPort([])).toBeNull();
  });
});

describe("discoveryLabels", () => {
  it("keeps orbitdash, homepage and compose service labels, never widget keys", () => {
    expect(
      discoveryLabels({
        Labels: {
          "orbitdash.name": "Media",
          "homepage.href": "https://x",
          "homepage.widget.key": "secret",
          "com.docker.compose.service": "web",
          "com.docker.compose.project": "media",
          other: "x",
          "orbitdash.weird": 3,
        },
      })
    ).toEqual({
      "orbitdash.name": "Media",
      "homepage.href": "https://x",
      "com.docker.compose.service": "web",
    });
    expect(discoveryLabels(null)).toEqual({});
    expect(discoveryLabels({ Labels: null })).toEqual({});
  });
});

describe("buildSuggestions", () => {
  it("builds suggestions from labels and web ports, labels first", async () => {
    const containers: LabeledContainer[] = [
      {
        container: container("media-qbittorrent-1", {
          composeProject: "media",
          ports: [port(8080, 8081)],
        }),
        labels: {},
      },
      {
        container: container("photos", { ports: [port(2283, 2283)] }),
        labels: {
          "homepage.name": "Immich",
          "homepage.href": "https://photos.example.com",
          "homepage.group": "Media",
          "homepage.description": "Photos",
        },
      },
      {
        container: container("web"),
        labels: {
          "orbitdash.name": "Front door",
          "orbitdash.url": "door.lan",
          "orbitdash.icon": "nginx.png",
          "orbitdash.category": "Infra",
        },
      },
      {
        container: container("jf", { ports: [port(8096, 8096)] }),
        labels: { "com.docker.compose.service": "jellyfin" },
      },
    ];
    expect(await buildSuggestions(containers, [], [])).toEqual([
      {
        key: "web",
        name: "Front door",
        url: "http://door.lan/",
        port: null,
        iconUrl: "https://cdn.example/nginx.svg",
        category: "Infra",
        description: null,
        source: "labels",
      },
      {
        key: "photos",
        name: "Immich",
        url: "https://photos.example.com/",
        port: null,
        iconUrl: null,
        category: "Media",
        description: "Photos",
        source: "labels",
      },
      {
        key: "jf",
        name: "Jellyfin",
        url: null,
        port: 8096,
        iconUrl: "https://cdn.example/jellyfin.svg",
        category: null,
        description: null,
        source: "port",
      },
      {
        key: "media-qbittorrent-1",
        name: "qBittorrent",
        url: null,
        port: 8081,
        iconUrl: "https://cdn.example/qbittorrent.svg",
        category: null,
        description: null,
        source: "port",
      },
    ]);
  });

  it("leaves out what's already there, dismissed, stopped, opted out or orbitdash itself", async () => {
    const containers: LabeledContainer[] = [
      { container: container("plex", { ports: [port(32400, 32400)] }), labels: {} },
      { container: container("door"), labels: { "orbitdash.url": "http://door.lan" } },
      { container: container("old", { state: "exited", ports: [port(80, 8000)] }), labels: {} },
      {
        container: container("hidden", { ports: [port(80, 8001)] }),
        labels: { "orbitdash.enable": "false" },
      },
      {
        container: container("orbitdash", {
          image: "ghcr.io/chriscorbell/orbitdash",
          ports: [port(3000, 7770)],
        }),
        labels: {},
      },
      { container: container("gone", { ports: [port(80, 8002)] }), labels: {} },
      { container: container("db", { ports: [port(5432, 5432)] }), labels: {} },
      { container: container("custom-tool_2", { ports: [port(9999, 9999)] }), labels: {} },
    ];
    const suggestions = await buildSuggestions(
      containers,
      [service("http://192.168.1.5:32400/web"), service("http://door.lan/"), service("not a url")],
      ["gone"]
    );
    expect(suggestions.map((suggestion) => [suggestion.key, suggestion.name])).toEqual([
      ["custom-tool_2", "Custom Tool"],
    ]);
  });

  it("still suggests when the icon library is down", async () => {
    search.mockRejectedValue(new Error("offline"));
    const [suggestion] = await buildSuggestions(
      [{ container: container("jellyfin", { ports: [port(8096, 8096)] }), labels: {} }],
      [],
      []
    );
    expect(suggestion).toMatchObject({ name: "Jellyfin", iconUrl: null });
  });
});

describe("dismissals and routes", () => {
  it("remembers dismissals and brings them back", () => {
    dismissSuggestion("plex");
    dismissSuggestion("plex");
    dismissSuggestion("sonarr");
    expect(dismissedCount()).toBe(2);
    expect(restoreDismissed()).toBe(2);
    expect(dismissedCount()).toBe(0);
  });

  it("serves suggestions and handles dismissals over the API", async () => {
    const snapshot = spyOn(dockerMonitor, "snapshot").mockReturnValue({
      configured: true,
      available: true,
      error: null,
      containers: [],
      updatedAt: 1,
    });
    const labeled = spyOn(dockerMonitor, "labeled").mockReturnValue([
      { container: container("jellyfin", { ports: [port(8096, 8096)] }), labels: {} },
    ]);

    let body = (await (await app.request("/api/discovery")).json()) as {
      suggestions: unknown[];
      dismissed: number;
    };
    expect(body.suggestions).toHaveLength(1);

    const dismiss = await app.request("/api/discovery/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "jellyfin" }),
    });
    expect(dismiss.status).toBe(200);
    body = (await (await app.request("/api/discovery")).json()) as typeof body;
    expect(body).toEqual({ suggestions: [], dismissed: 1 });

    expect(
      await (await app.request("/api/discovery/dismissed", { method: "DELETE" })).json()
    ).toEqual({ restored: 1 });
    expect(
      (
        await app.request("/api/discovery/dismiss", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "" }),
        })
      ).status
    ).toBe(400);

    snapshot.mockReturnValue({
      configured: true,
      available: false,
      error: "x",
      containers: [],
      updatedAt: 1,
    });
    expect(
      ((await (await app.request("/api/discovery")).json()) as typeof body).suggestions
    ).toEqual([]);
    snapshot.mockRestore();
    labeled.mockRestore();
  });

  it("reads past a corrupt dismissal list", async () => {
    const { getDb } = await import("../db");
    getDb()
      .prepare("INSERT INTO settings (key, value) VALUES ('discovery.dismissed', '{oops')")
      .run();
    expect(dismissedCount()).toBe(0);
    getDb()
      .prepare("UPDATE settings SET value = ? WHERE key = 'discovery.dismissed'")
      .run(JSON.stringify(["a", 2]));
    expect(dismissedCount()).toBe(1);
    getDb().prepare("UPDATE settings SET value = '{}' WHERE key = 'discovery.dismissed'").run();
    expect(dismissedCount()).toBe(0);
  });
});
