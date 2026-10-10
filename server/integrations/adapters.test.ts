import { describe, expect, it } from "bun:test";
import { getAdapter, ADAPTERS } from "./adapters";
import { readIntegration } from "./poller";
import type { IntegrationFetch } from "./http";

type Route = (url: URL, init: RequestInit) => Response | Promise<Response>;

/** A fake app: routes by path (and method), records what was asked. */
function fakeApp(routes: Record<string, Route>) {
  const calls: Array<{ url: string; method: string; headers: Headers; body: string | null }> = [];
  const fetchImpl: IntegrationFetch = async (url, init) => {
    const parsed = new URL(url);
    const method = init.method ?? "GET";
    calls.push({
      url,
      method,
      headers: new Headers(init.headers),
      body: typeof init.body === "string" ? init.body : null,
    });
    const route = routes[`${method} ${parsed.pathname}`] ?? routes[parsed.pathname];
    return route ? route(parsed, init) : new Response("not found", { status: 404 });
  };
  return { fetchImpl, calls };
}

const json = (body: unknown, init: ResponseInit = {}) => Response.json(body, init);

async function read(
  type: string,
  values: Record<string, string | boolean>,
  routes: Record<string, Route>,
  url = "http://app.lan:8000"
) {
  const app = fakeApp(routes);
  const reading = await readIntegration(getAdapter(type)!, { url, values }, app.fetchImpl);
  return { reading, calls: app.calls };
}

describe("adapters", () => {
  it("lists eight apps with an API address field first", () => {
    expect(ADAPTERS.map((adapter) => adapter.id)).toEqual([
      "adguard",
      "jellyfin",
      "pihole",
      "plex",
      "proxmox",
      "qbittorrent",
      "radarr",
      "sonarr",
    ]);
    for (const adapter of ADAPTERS) expect(adapter.fields[0].key).toBe("url");
    expect(getAdapter("nope")).toBeNull();
  });

  it("Jellyfin counts playing sessions and libraries", async () => {
    const { reading, calls } = await read(
      "jellyfin",
      { apiKey: "k" },
      {
        "/Sessions": () => json([{ NowPlayingItem: {} }, { NowPlayingItem: null }, {}]),
        "/Items/Counts": () => json({ MovieCount: 812, SeriesCount: 92, SongCount: 0 }),
      }
    );
    expect(reading).toMatchObject({
      type: "jellyfin",
      error: null,
      stats: [
        { label: "Playing", value: "1", tone: "good" },
        { label: "Movies", value: "812" },
        { label: "Series", value: "92" },
      ],
    });
    expect(calls[0].headers.get("authorization")).toBe('MediaBrowser Token="k"');
  });

  it("Plex counts sessions and items per library type", async () => {
    const { reading } = await read(
      "plex",
      { token: "t" },
      {
        "/status/sessions": () => json({ MediaContainer: { size: 0 } }),
        "/library/sections": () =>
          json({
            MediaContainer: {
              Directory: [
                { key: "1", type: "movie" },
                { key: "2", type: "show" },
                { key: "3", type: "artist" },
              ],
            },
          }),
        "/library/sections/1/all": () => json({ MediaContainer: { totalSize: 1500 } }),
        "/library/sections/2/all": () => json({ MediaContainer: { size: 40 } }),
      }
    );
    expect(reading.stats).toEqual([
      { label: "Playing", value: "0" },
      { label: "Movies", value: "1,500" },
      { label: "Shows", value: "40" },
      { label: "Libraries", value: "3" },
    ]);
  });

  it("Sonarr and Radarr read the queue, missing and this week", async () => {
    const routes = {
      "/api/v3/queue": () => json({ totalRecords: 3, records: [] }),
      "/api/v3/wanted/missing": () => json({ totalRecords: 120000 }),
      "/api/v3/calendar": () => json([{}, {}]),
    };
    const { reading, calls } = await read("sonarr", { apiKey: "abc" }, routes);
    expect(reading.stats).toEqual([
      { label: "Queue", value: "3", tone: "good" },
      { label: "Missing", value: "120k", tone: "warning" },
      { label: "This week", value: "2" },
    ]);
    expect(calls[0].headers.get("x-api-key")).toBe("abc");
    expect(
      (await read("radarr", { apiKey: "abc" }, { ...routes, "/api/v3/queue": () => json([]) }))
        .reading.stats[0]
    ).toEqual({
      label: "Queue",
      value: "0",
    });
  });

  it("Pi-hole 6 signs in, reads the summary and signs out", async () => {
    const { reading, calls } = await read(
      "pihole",
      { password: "pw" },
      {
        "POST /api/auth": () => json({ session: { valid: true, sid: "S1" } }),
        "DELETE /api/auth": () => new Response(null, { status: 204 }),
        "/api/stats/summary": () =>
          json({
            queries: { total: 25000, blocked: 4000, percent_blocked: 16 },
            clients: { active: 12 },
          }),
      }
    );
    expect(reading.stats).toEqual([
      { label: "Queries", value: "25,000" },
      { label: "Blocked", value: "4,000" },
      { label: "Blocked share", value: "16%" },
      { label: "Clients", value: "12" },
    ]);
    expect(calls[0].body).toBe('{"password":"pw"}');
    expect(calls[1].headers.get("x-ftl-sid")).toBe("S1");
    expect(calls[2].method).toBe("DELETE");
  });

  it("Pi-hole falls back to the v5 API and reports refused credentials", async () => {
    const v5 = await read(
      "pihole",
      { password: "tok" },
      {
        "/admin/api.php": () =>
          json({
            dns_queries_today: 100,
            ads_blocked_today: 7,
            ads_percentage_today: 7.4,
            unique_clients: 3,
          }),
      }
    );
    expect(v5.reading.stats.map((stat) => stat.value)).toEqual(["100", "7", "7.4%", "3"]);
    expect(v5.calls.at(-1)?.url).toContain("auth=tok");

    const wrongV5 = await read("pihole", { password: "bad" }, { "/admin/api.php": () => json([]) });
    expect(wrongV5.reading.error).toBe("It refused the credentials");
    const wrongV6 = await read(
      "pihole",
      { password: "bad" },
      {
        "POST /api/auth": () => json({ session: { valid: false } }),
      }
    );
    expect(wrongV6.reading.error).toBe("It refused the credentials");
  });

  it("AdGuard Home uses basic auth and adds up all kinds of blocks", async () => {
    const { reading, calls } = await read(
      "adguard",
      { username: "me", password: "pw" },
      {
        "/control/stats": () =>
          json({
            num_dns_queries: 1000,
            num_blocked_filtering: 100,
            num_replaced_safebrowsing: 5,
            num_replaced_parental: 5,
            avg_processing_time: 0.0123,
          }),
      }
    );
    expect(reading.stats).toEqual([
      { label: "Queries", value: "1,000" },
      { label: "Blocked", value: "110" },
      { label: "Blocked share", value: "11%" },
      { label: "Lookup", value: "12 ms" },
    ]);
    expect(calls[0].headers.get("authorization")).toBe(
      `Basic ${Buffer.from("me:pw").toString("base64")}`
    );
  });

  it("qBittorrent logs in with its own origin and reads speeds", async () => {
    const { reading, calls } = await read(
      "qbittorrent",
      { username: "admin", password: "pw" },
      {
        "POST /api/v2/auth/login": () =>
          new Response("Ok.", { headers: { "set-cookie": "SID=abc123; HttpOnly; path=/" } }),
        "/api/v2/transfer/info": () => json({ dl_info_speed: 12_400_000, up_info_speed: 950 }),
        "/api/v2/torrents/info": () =>
          json([{ state: "downloading" }, { state: "uploading" }, { state: "metaDL" }]),
      },
      "http://qb.lan:8080/"
    );
    expect(reading.stats).toEqual([
      { label: "Down", value: "12.4 MB/s", tone: "good" },
      { label: "Up", value: "950 B/s" },
      { label: "Downloading", value: "2" },
      { label: "Active", value: "3" },
    ]);
    expect(calls[0].headers.get("referer")).toBe("http://qb.lan:8080");
    expect(calls[0].body).toBe("username=admin&password=pw");
    expect(calls[1].headers.get("cookie")).toBe("SID=abc123");

    const refused = await read(
      "qbittorrent",
      { username: "a", password: "b" },
      {
        "POST /api/v2/auth/login": () => new Response("Fails."),
      }
    );
    expect(refused.reading.error).toBe("It refused the credentials");
  });

  it("Proxmox totals guests, nodes, CPU and memory across the cluster", async () => {
    const { reading, calls } = await read(
      "proxmox",
      { tokenId: "mon@pve!od", tokenSecret: "s" },
      {
        "/api2/json/cluster/resources": () =>
          json({
            data: [
              { type: "node", status: "online", cpu: 0.5, maxcpu: 4, mem: 8, maxmem: 16 },
              { type: "node", status: "offline", maxcpu: 4 },
              { type: "qemu", status: "running" },
              { type: "lxc", status: "stopped" },
              { type: "storage" },
            ],
          }),
      }
    );
    expect(reading.stats).toEqual([
      { label: "Guests running", value: "1/2" },
      { label: "Nodes online", value: "1/2", tone: "bad" },
      { label: "CPU", value: "50%" },
      { label: "Memory", value: "50%" },
    ]);
    expect(calls[0].headers.get("authorization")).toBe("PVEAPIToken=mon@pve!od=s");
  });

  it("turns HTTP problems into short messages", async () => {
    const cases: Array<[Route, string]> = [
      [() => new Response("no", { status: 401 }), "It refused the credentials"],
      [() => new Response("boom", { status: 500 }), "It answered HTTP 500"],
      [() => new Response("<html>"), "Its answer wasn't JSON; check the address"],
      [
        () => Promise.reject(Object.assign(new Error("x"), { code: "ECONNREFUSED" })),
        "Connection refused",
      ],
      [() => new Response("x".repeat(4 * 1024 * 1024 + 1)), "Its answer was too large"],
    ];
    for (const [route, message] of cases) {
      const { reading } = await read(
        "adguard",
        { username: "a", password: "b" },
        { "/control/stats": route }
      );
      expect(reading).toMatchObject({ error: message, stats: [] });
    }
    const crash = await readIntegration(
      {
        ...getAdapter("adguard")!,
        read: async () => {
          throw new Error("bug");
        },
      },
      { url: "http://x", values: {} }
    );
    expect(crash.error).toBe("Couldn't read it");
  });

  it("passes self-signed TLS through when asked", async () => {
    let tls: unknown;
    await readIntegration(
      getAdapter("adguard")!,
      { url: "https://x", values: { ignoreTls: true } },
      async (_url, init) => {
        tls = init.tls;
        return json({});
      }
    );
    expect(tls).toEqual({ rejectUnauthorized: false });
  });
});
