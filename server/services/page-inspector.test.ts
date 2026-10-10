import { describe, expect, it } from "bun:test";
import { createPageInspector, nameFromTitle, readPageMetadata } from "./page-inspector";

const PAGE = `<!doctype html><html><head>
  <meta charset="utf-8">
  <title>Dashboard - Grafana</title>
  <link rel="icon" type="image/png" sizes="32x32" href="/public/img/fav32.png">
  <link rel="icon" sizes="192x192" href="img/fav192.png">
  <link rel="mask-icon" href="/mask.svg">
  <link rel="apple-touch-icon" href="/apple-touch.png">
</head><body>…</body></html>`;

describe("readPageMetadata", () => {
  it("prefers the app name and the apple touch icon", () => {
    expect(
      readPageMetadata(
        `${PAGE.replace("<head>", '<head><meta name="application-name" content="Grafana &amp; Co">')}`,
        "http://grafana.lan:3000/d/home"
      )
    ).toEqual({ name: "Grafana & Co", iconUrl: "http://grafana.lan:3000/apple-touch.png" });
  });

  it("falls back through site names, titles, larger icons and /favicon.ico", () => {
    expect(
      readPageMetadata(PAGE.replace(/<link rel="apple[^>]*>/, ""), "http://g.lan/d/x")
    ).toEqual({
      name: "Grafana",
      iconUrl: "http://g.lan/d/img/fav192.png",
    });
    expect(
      readPageMetadata(
        `<meta property="og:site_name" content="Nextcloud"><link rel="shortcut icon" href="/f.ico"><link rel="icon" href="/logo.svg">`,
        "https://cloud.lan/"
      )
    ).toEqual({ name: "Nextcloud", iconUrl: "https://cloud.lan/logo.svg" });
    expect(
      readPageMetadata(
        `<meta name="apple-mobile-web-app-title" content="Jellyfin"><base href="/web/"><link rel="icon" href="touch.png" sizes="any">`,
        "http://10.0.0.20:8096/"
      )
    ).toEqual({ name: "Jellyfin", iconUrl: "http://10.0.0.20:8096/web/touch.png" });
    expect(readPageMetadata("<p>nothing</p>", "http://nas.lan:5000/login")).toEqual({
      name: null,
      iconUrl: "http://nas.lan:5000/favicon.ico",
    });
  });

  it("decodes entities and ignores icons it can't use", () => {
    expect(
      readPageMetadata(
        `<title> Pi&#45;hole &#x2022; Admin &nbsp;</title><link rel="icon" href="data:image/png;base64,AA">`,
        "http://pi.lan/admin/"
      )
    ).toEqual({ name: "Pi-hole", iconUrl: null });
    expect(
      readPageMetadata(`<base href="http://[bad"><title>A</title>`, "http://a.lan/").name
    ).toBe("A");
    expect(readPageMetadata(`<title>&#0;&bogus;</title>`, "http://a.lan/").name).toBe(
      "&#0;&bogus;"
    );
  });
});

describe("nameFromTitle", () => {
  it("skips generic page names to find the app's", () => {
    expect(nameFromTitle("Dashboard - Grafana")).toBe("Grafana");
    expect(nameFromTitle("Home | Home Assistant")).toBe("Home Assistant");
    expect(nameFromTitle("Pi-hole - raspberrypi")).toBe("Pi-hole");
    expect(nameFromTitle("Sonarr")).toBe("Sonarr");
    expect(nameFromTitle("Login - Dashboard")).toBe("Login - Dashboard");
    expect(nameFromTitle("x".repeat(80))).toHaveLength(60);
  });
});

describe("inspect", () => {
  function inspector(
    respond: (url: string, init: { tls?: unknown }) => Response | Promise<Response>
  ) {
    const calls: Array<{ url: string; tls: unknown }> = [];
    const inspect = createPageInspector({
      fetch: async (url, init) => {
        calls.push({ url, tls: init.tls });
        return respond(url, init);
      },
    });
    return { inspect, calls };
  }
  const html = (body: string, init: ResponseInit = {}) =>
    new Response(body, { ...init, headers: { "content-type": "text/html; charset=utf-8" } });

  it("reads a reachable page", async () => {
    const { inspect } = inspector(() => html(PAGE));
    expect(await inspect("http://grafana.lan/")).toEqual({
      url: "http://grafana.lan/",
      reachable: true,
      error: null,
      name: "Grafana",
      iconUrl: "http://grafana.lan/apple-touch.png",
      selfSigned: false,
    });
  });

  it("reads login pages and reports other failures", async () => {
    let status = 401;
    const { inspect } = inspector(() => html("<title>Sign in - Portainer</title>", { status }));
    expect(await inspect("http://p.lan/")).toMatchObject({
      reachable: true,
      error: "HTTP 401",
      name: "Portainer",
    });
    status = 502;
    expect(await inspect("http://p.lan/")).toMatchObject({ reachable: false, error: "HTTP 502" });
  });

  it("retries a self-signed certificate once and says so", async () => {
    const { inspect, calls } = inspector((_url, init) => {
      if (!init.tls)
        throw Object.assign(new Error("self signed"), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" });
      return html("<title>Proxmox Virtual Environment</title>");
    });
    expect(await inspect("https://pve.lan:8006/")).toMatchObject({
      reachable: true,
      selfSigned: true,
      name: "Proxmox Virtual Environment",
    });
    expect(calls.map((call) => call.tls)).toEqual([undefined, { rejectUnauthorized: false }]);
  });

  it("explains unreachable links without leaking details", async () => {
    const { inspect, calls } = inspector(() => {
      throw Object.assign(new Error("connect ECONNREFUSED 10.0.0.9:80"), { code: "ECONNREFUSED" });
    });
    expect(await inspect("http://10.0.0.9/")).toEqual({
      url: "http://10.0.0.9/",
      reachable: false,
      error: "Connection refused",
      name: null,
      iconUrl: null,
      selfSigned: false,
    });
    expect(calls).toHaveLength(1);
  });

  it("handles pages that aren't HTML and caps what it reads", async () => {
    let answer = () => new Response("{}", { headers: { "content-type": "application/json" } });
    const { inspect } = inspector(() => answer());
    expect(await inspect("http://api.lan/v1")).toMatchObject({
      reachable: true,
      name: null,
      iconUrl: "http://api.lan/favicon.ico",
    });
    answer = () => new Response("", { status: 404, headers: { "content-type": "text/plain" } });
    expect(await inspect("http://api.lan/")).toMatchObject({ reachable: false, error: "HTTP 404" });

    const big = `<title>Big</title>${"x".repeat(400 * 1024)}`;
    answer = () => html(big);
    expect((await inspect("http://big.lan/")).name).toBe("Big");
    answer = () => new Response(null, { headers: { "content-type": "text/html" } });
    expect((await inspect("http://empty.lan/")).name).toBeNull();
  });
});
