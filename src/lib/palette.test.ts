import { describe, expect, it, vi } from "vitest";
import { hostOf, rankPaletteItems, type PaletteAction } from "@/lib/palette";
import type { Service } from "@shared/types";

function service(name: string, extra: Partial<Service> = {}): Service {
  return {
    id: name.toLowerCase(),
    name,
    url: `https://${name.toLowerCase()}.example.com`,
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
    ...extra,
  };
}

const actions: PaletteAction[] = [
  { id: "add", label: "Add service", keywords: "new create link", run: vi.fn() },
  { id: "settings", label: "Open settings", run: vi.fn() },
];

const ids = (items: ReturnType<typeof rankPaletteItems>) => items.map((item) => item.id);

describe("rankPaletteItems", () => {
  it("lists every action as a menu when there is no query", () => {
    expect(ids(rankPaletteItems("  ", [service("Plex")], actions))).toEqual(["add", "settings"]);
  });

  it("puts the best service matches first, then actions, then a web search", () => {
    const services = [
      service("Jellyfin", { category: "Media" }),
      service("Plex", { category: "Media" }),
      service("Grafana", { description: "Media server dashboards" }),
    ];
    expect(ids(rankPaletteItems("plex", services, actions))).toEqual(["plex", "web-search"]);
    expect(ids(rankPaletteItems("media", services, actions))).toEqual([
      "jellyfin",
      "plex",
      "grafana",
      "web-search",
    ]);
    expect(ids(rankPaletteItems("new", services, actions))).toEqual(["add", "web-search"]);
  });

  it("doesn't match scattered letters inside categories, descriptions or keywords", () => {
    const services = [service("NAS"), service("Cloudflare", { category: "Infrastructure" })];
    expect(ids(rankPaletteItems("nas", services, actions))).toEqual(["nas", "web-search"]);
  });

  it("matches hosts and caps the number of services", () => {
    const many = Array.from({ length: 12 }, (_, index) => service(`Svc${index}`));
    expect(
      rankPaletteItems("svc", many, []).filter((item) => item.kind === "service")
    ).toHaveLength(8);
    const byHost = service("Router", { url: "http://10.0.0.1:8443/admin" });
    expect(ids(rankPaletteItems("10.0.0.1", [byHost], []))).toEqual(["router", "web-search"]);
  });

  it("keeps the query for the web search", () => {
    const items = rankPaletteItems(" how to ", [], []);
    expect(items).toEqual([{ kind: "web", id: "web-search", query: "how to" }]);
  });
});

describe("hostOf", () => {
  it("returns the host, or the input when it is not a URL", () => {
    expect(hostOf("https://plex.lan:32400/web")).toBe("plex.lan:32400");
    expect(hostOf("not a url")).toBe("not a url");
  });
});
