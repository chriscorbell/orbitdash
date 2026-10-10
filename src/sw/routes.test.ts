import { describe, expect, it } from "vitest";
import {
  cacheKeyFor,
  cacheNamesFor,
  routeRequest,
  staleCacheNames,
  WARM_DATA_URLS,
  type RoutableRequest,
} from "./routes";
import { ORIGIN } from "./test-helpers";

function route(path: string, overrides: Partial<RoutableRequest> & { accept?: string } = {}) {
  const { accept, ...rest } = overrides;
  return routeRequest(
    {
      headers: new Headers(accept ? { accept } : {}),
      method: "GET",
      mode: "cors",
      url: new URL(path, ORIGIN).href,
      ...rest,
    },
    ORIGIN
  );
}

describe("routeRequest", () => {
  it("serves page loads as the app shell, except API URLs opened directly", () => {
    expect(route("/", { mode: "navigate" })).toBe("navigation");
    expect(route("/?device=abc", { mode: "navigate" })).toBe("navigation");
    expect(route("/some/page", { mode: "navigate" })).toBe("navigation");
    expect(route("/api/backup/export", { mode: "navigate" })).toBeNull();
  });

  it("leaves files opened directly in a tab to the network", () => {
    expect(route("/manifest.webmanifest", { mode: "navigate" })).toBeNull();
    expect(route("/icons/icon-512.png", { mode: "navigate" })).toBeNull();
    expect(route("/sw.js", { mode: "navigate" })).toBeNull();
  });

  it("routes build output, public files and images", () => {
    expect(route("/assets/index-AbC_12-z.js")).toBe("asset");
    expect(route("/assets/geist-latin-wght-normal-BgDaEnEv.woff2", { mode: "no-cors" })).toBe(
      "asset"
    );
    expect(route("/manifest.webmanifest")).toBe("file");
    expect(route("/icons/icon-192.png", { mode: "no-cors" })).toBe("file");
    expect(route("/orbitdash.svg", { mode: "no-cors" })).toBe("file");
    expect(route("/api/icons/abc-1234.png?v=17", { mode: "no-cors" })).toBe("icon");
    expect(route("/api/wallpapers/3f9a.webp", { mode: "no-cors" })).toBe("wallpaper");
  });

  it("caches the data the dashboard renders", () => {
    expect(route("/api/services")).toBe("data");
    expect(route("/api/categories")).toBe("data");
    expect(route("/api/settings?device=abc")).toBe("data");
    expect(route("/api/settings/devices")).toBe("data");
  });

  it("leaves live and other API requests to the network", () => {
    for (const path of [
      "/api/events?topics=metrics,config",
      "/api/metrics?window=30",
      "/api/metrics/host",
      "/api/metrics/stream",
      "/api/system",
      "/api/health",
      "/api/backup/export",
      "/api/servicesx",
    ]) {
      expect([path, route(path)]).toEqual([path, null]);
    }
  });

  it("never touches the event stream, even on a cached path", () => {
    expect(route("/api/services", { accept: "text/event-stream" })).toBeNull();
  });

  it("only handles same-origin GET requests", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD"]) {
      expect(route("/api/services", { method })).toBeNull();
    }
    expect(route("https://cdn.example/icon.png")).toBeNull();
    expect(route("https://cdn.example/", { mode: "navigate" })).toBeNull();
  });

  it("leaves unknown same-origin paths and DevTools' only-if-cached requests alone", () => {
    expect(route("/healthz")).toBeNull();
    expect(route("/sw.js")).toBeNull();
    expect(route("/assets/index-AbC_12-z.js", { cache: "only-if-cached", mode: "no-cors" })).toBe(
      null
    );
    expect(
      route("/assets/index-AbC_12-z.js", { cache: "only-if-cached", mode: "same-origin" })
    ).toBe("asset");
  });
});

describe("WARM_DATA_URLS", () => {
  it("only lists data the worker would cache anyway", () => {
    for (const url of WARM_DATA_URLS) expect(route(url)).toBe("data");
  });
});

describe("cacheKeyFor", () => {
  it("shares one shell entry across pages and ignores image cache busters", () => {
    expect(cacheKeyFor("navigation", `${ORIGIN}/some/page?x=1`)).toBe("/");
    expect(cacheKeyFor("icon", `${ORIGIN}/api/icons/a-1.png?v=17`)).toBe("/api/icons/a-1.png");
    expect(cacheKeyFor("wallpaper", `${ORIGIN}/api/wallpapers/f.webp?v=2`)).toBe(
      "/api/wallpapers/f.webp"
    );
    expect(cacheKeyFor("data", `${ORIGIN}/api/settings?device=abc`)).toBe(
      `${ORIGIN}/api/settings?device=abc`
    );
  });
});

describe("cache names", () => {
  it("versions the static cache by build and keeps data across builds", () => {
    const first = cacheNamesFor("aaa111");
    const second = cacheNamesFor("bbb222");

    expect(first.static).not.toBe(second.static);
    expect(first.data).toBe(second.data);
    expect(first.icons).toBe(second.icons);
    expect(first.wallpapers).toBe(second.wallpapers);
  });

  it("deletes earlier builds' caches and leaves other apps' caches alone", () => {
    const current = cacheNamesFor("bbb222");
    const existing = [
      "orbitdash-static-aaa111",
      current.static,
      current.data,
      current.icons,
      current.wallpapers,
      "orbitdash-data-v0",
      "someone-else",
    ];

    expect(staleCacheNames(existing, current)).toEqual([
      "orbitdash-static-aaa111",
      "orbitdash-data-v0",
    ]);
  });
});
