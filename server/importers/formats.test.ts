import { describe, expect, it } from "bun:test";
import {
  iconHint,
  ImportFormatError,
  parseBookmarks,
  parseDashy,
  parseHomarr,
  parseHomepage,
  parseHomer,
  parseImportFile,
  parseSeed,
} from "./formats";

const HOMEPAGE = `
- Media:
    - Jellyfin:
        href: http://10.0.0.20:8096
        description: Movies and shows
        icon: jellyfin.png
    - Downloads:
        - qBittorrent:
            href: http://10.0.0.20:8080
            icon: sh-qbittorrent
- Infra:
    - Router:
        href: https://192.168.1.1
        icon: mdi-router
    - Placeholder:
        href: "{{HOMEPAGE_VAR_URL}}"
    - Proxmox:
        href: https://pve.lan:8006
        icon: https://cdn.example.com/proxmox.svg
`;

const DASHY = `
pageInfo:
  title: Home
sections:
  - name: Media
    items:
      - title: Plex
        url: http://plex.lan:32400/web
        description: Streaming
        icon: hl-plex
      - title: Docs
        url: https://docs.lan
        icon: favicon
  - items:
      - title: Grafana
        url: https://grafana.lan
        icon: fas fa-chart-line
`;

const HOMER = `
title: Homer
services:
  - name: Apps
    items:
      - name: Nextcloud
        url: https://cloud.lan
        subtitle: Files
        logo: assets/tools/nextcloud.png
      - name: Pi-hole
        url: http://pihole.lan/admin
        icon: fas fa-ban
`;

const HOMARR = JSON.stringify({
  schemaVersion: 2,
  categories: [{ id: "cat-1", name: "Media" }],
  wrappers: [{ id: "wrap-1", position: 0 }],
  apps: [
    {
      name: "Sonarr",
      url: "http://sonarr:8989",
      behaviour: { externalUrl: "https://sonarr.example.com" },
      appearance: { iconUrl: "https://cdn.example.com/sonarr.png" },
      area: { type: "category", properties: { id: "cat-1" } },
    },
    {
      name: "Radarr",
      url: "http://radarr.lan:7878",
      behaviour: { externalUrl: "" },
      appearance: {},
      area: { type: "wrapper", properties: { id: "wrap-1" } },
    },
    { name: "Broken", url: "not a url" },
  ],
});

const BOOKMARKS = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://github.com/" ADD_DATE="1">GitHub</A>
        <DT><H3>Homelab &amp; NAS</H3>
        <DL><p>
            <DT><A HREF="http://nas.lan:5000/?a=1&amp;b=2">Synology</A>
            <DT><H3>Media</H3>
            <DL><p>
                <DT><A HREF="http://10.0.0.20:8096">Jellyfin</A>
            </DL><p>
        </DL><p>
        <DT><A HREF="javascript:void(0)">Bookmarklet</A>
    </DL><p>
</DL><p>`;

describe("iconHint", () => {
  it("reads URLs, dashboard-icons names and paths, and warns about icon fonts", () => {
    const warnings: string[] = [];
    expect(iconHint("https://x.example/a.png", warnings, "A")).toEqual({
      kind: "url",
      url: "https://x.example/a.png",
    });
    expect(iconHint("Plex.PNG", warnings, "A")).toEqual({ kind: "name", name: "plex" });
    expect(iconHint("di:home-assistant.svg", warnings, "A")).toEqual({
      kind: "name",
      name: "home-assistant",
    });
    expect(iconHint("assets\\tools\\pi-hole.webp", warnings, "A")).toEqual({
      kind: "name",
      name: "pi-hole",
    });
    expect(iconHint("favicon", warnings, "A")).toBeNull();
    expect(iconHint("🎬", warnings, "A")).toBeNull();
    expect(iconHint(42, warnings, "A")).toBeNull();
    expect(warnings).toEqual([]);

    expect(iconHint("si-github", warnings, "GitHub")).toBeNull();
    expect(iconHint("fab fa-docker", warnings, "Docker")).toBeNull();
    expect(warnings).toEqual([
      'GitHub: icon font "si-github" can\'t be imported; pick an icon later.',
      'Docker: icon font "fab fa-docker" can\'t be imported; pick an icon later.',
    ]);
  });
});

describe("parseImportFile", () => {
  it("reads Homepage services.yaml, with nested groups as their own categories", () => {
    const parsed = parseImportFile(HOMEPAGE);
    expect(parsed.format).toBe("homepage");
    expect(parsed.groups).toEqual([
      {
        name: "Media",
        services: [
          {
            name: "Jellyfin",
            url: "http://10.0.0.20:8096",
            description: "Movies and shows",
            icon: { kind: "name", name: "jellyfin" },
          },
        ],
      },
      {
        name: "Media / Downloads",
        services: [
          {
            name: "qBittorrent",
            url: "http://10.0.0.20:8080",
            description: null,
            icon: { kind: "name", name: "qbittorrent" },
          },
        ],
      },
      {
        name: "Infra",
        services: [
          { name: "Router", url: "https://192.168.1.1", description: null, icon: null },
          {
            name: "Proxmox",
            url: "https://pve.lan:8006",
            description: null,
            icon: { kind: "url", url: "https://cdn.example.com/proxmox.svg" },
          },
        ],
      },
    ]);
    expect(parsed.warnings).toEqual([
      'Router: icon font "mdi-router" can\'t be imported; pick an icon later.',
      "Placeholder: skipped because it has no http or https link.",
    ]);
  });

  it("reads Dashy conf.yml", () => {
    const parsed = parseImportFile(DASHY);
    expect(parsed.format).toBe("dashy");
    expect(parsed.groups.map((group) => group.name)).toEqual(["Media", "Imported"]);
    expect(parsed.groups[0].services[0]).toEqual({
      name: "Plex",
      url: "http://plex.lan:32400/web",
      description: "Streaming",
      icon: { kind: "name", name: "plex" },
    });
    expect(parsed.groups[0].services[1].icon).toBeNull();
    expect(parsed.warnings).toHaveLength(1);
  });

  it("reads Homer config.yml", () => {
    const parsed = parseImportFile(HOMER);
    expect(parsed.format).toBe("homer");
    expect(parsed.groups).toEqual([
      {
        name: "Apps",
        services: [
          {
            name: "Nextcloud",
            url: "https://cloud.lan",
            description: "Files",
            icon: { kind: "name", name: "nextcloud" },
          },
          { name: "Pi-hole", url: "http://pihole.lan/admin", description: null, icon: null },
        ],
      },
    ]);
  });

  it("reads a Homarr JSON export, preferring the external URL", () => {
    const parsed = parseImportFile(HOMARR);
    expect(parsed.format).toBe("homarr");
    expect(parsed.groups).toEqual([
      {
        name: "Media",
        services: [
          {
            name: "Sonarr",
            url: "https://sonarr.example.com",
            description: null,
            icon: { kind: "url", url: "https://cdn.example.com/sonarr.png" },
          },
        ],
      },
      {
        name: "Imported",
        services: [
          { name: "Radarr", url: "http://radarr.lan:7878", description: null, icon: null },
        ],
      },
    ]);
    expect(parsed.warnings).toEqual(["Broken: skipped because it has no http or https link."]);
  });

  it("reads browser bookmarks, naming categories after their folders", () => {
    const parsed = parseImportFile(BOOKMARKS);
    expect(parsed.format).toBe("bookmarks");
    expect(parsed.groups.map((group) => [group.name, group.services.map((s) => s.url)])).toEqual([
      ["Bookmarks bar", ["https://github.com/"]],
      ["Homelab & NAS", ["http://nas.lan:5000/?a=1&b=2"]],
      ["Homelab & NAS / Media", ["http://10.0.0.20:8096"]],
    ]);
    expect(parsed.warnings).toEqual(["Bookmarklet: skipped because it has no http or https link."]);
  });

  it("reads orbitdash's own seed format", () => {
    const parsed = parseImportFile(`
categories:
  - name: Media
    services:
      - name: Jellyfin
        url: http://10.0.0.20:8096
        icon: jellyfin
      - url: https://nameless.lan
  - services: "not a list"
`);
    expect(parsed.format).toBe("orbitdash-seed");
    expect(parsed.groups).toEqual([
      {
        name: "Media",
        services: [
          {
            name: "Jellyfin",
            url: "http://10.0.0.20:8096",
            description: null,
            icon: { kind: "name", name: "jellyfin" },
          },
        ],
      },
    ]);
  });

  it("rejects files it can't read or doesn't recognize", () => {
    expect(() => parseImportFile("a: [unclosed")).toThrow(ImportFormatError);
    expect(() => parseImportFile("title: Just a title")).toThrow(
      "This doesn't look like a Homepage, Dashy, Homer, Homarr or bookmarks file."
    );
    expect(() => parseImportFile("42")).toThrow(ImportFormatError);
  });

  it("refuses YAML alias bombs", () => {
    const bomb = [
      "a: &a [x, x, x, x, x, x, x, x, x, x]",
      ...Array.from({ length: 8 }, (_, i) => {
        const prev = i === 0 ? "a" : `l${i - 1}`;
        return `l${i}: &l${i} [*${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}]`;
      }),
      "categories: [*l7]",
    ].join("\n");
    expect(() => parseImportFile(bomb)).toThrow(ImportFormatError);
  });
});

describe("format parsers", () => {
  it("return no groups for shapes they don't recognize", () => {
    expect(parseHomepage({}).groups).toEqual([]);
    expect(parseHomepage([42, { Media: "nope" }, { Infra: [42, { Svc: "x" }] }]).groups).toEqual(
      []
    );
    expect(parseDashy(null).groups).toEqual([]);
    expect(parseDashy({ sections: [{ name: "A", items: "x" }] }).groups).toEqual([]);
    expect(parseHomer({ services: [{ name: "A" }, 3] }).groups).toEqual([]);
    expect(parseHomarr({ apps: "x" }).groups).toEqual([]);
    expect(parseHomarr({ apps: [{ name: "A", url: "https://a.lan", area: 3 }] }).groups).toEqual([
      {
        name: "Imported",
        services: [{ name: "A", url: "https://a.lan", description: null, icon: null }],
      },
    ]);
    expect(parseSeed("x").groups).toEqual([]);
    expect(parseBookmarks("<p>nothing here</p>").groups).toEqual([]);
  });

  it("drop services without a name", () => {
    expect(parseDashy({ sections: [{ items: [{ url: "https://a.lan" }] }] }).groups).toEqual([]);
  });

  it("put loose bookmarks in a Bookmarks category", () => {
    const parsed = parseBookmarks('<DL><DT><A HREF="https://a.lan">A</A></DL>');
    expect(parsed.groups).toEqual([
      {
        name: "Bookmarks",
        services: [{ name: "A", url: "https://a.lan", description: null, icon: null }],
      },
    ]);
  });
});
