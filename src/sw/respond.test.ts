import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createResponder,
  NETWORK_TIMEOUT_MS,
  UNREACHABLE_GRACE_MS,
  type Responder,
} from "./respond";
import { cacheNamesFor } from "./routes";
import { createContext, failingFetch, hangingFetch, jsonResponse, request } from "./test-helpers";

const CACHES = cacheNamesFor("build1");
const html = (body: string, init: ResponseInit = {}) =>
  new Response(body, { ...init, headers: { "content-type": "text/html;charset=utf-8" } });

let respond: Responder;

beforeEach(() => {
  respond = createResponder();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("respond: page loads", () => {
  it("loads pages from the network and keeps the latest shell", async () => {
    const { caches, ctx, settle } = createContext(async () => html("<!doctype html>new"));

    const response = await respond("navigation", request("/?device=abc"), ctx, CACHES);

    expect(await response.text()).toBe("<!doctype html>new");
    await settle();
    expect(await caches.get(CACHES.static).text("/")).toBe("<!doctype html>new");
  });

  it("opens the cached shell for any page when the server is unreachable", async () => {
    const { caches, ctx } = createContext(failingFetch);
    await caches.get(CACHES.static).put("/", html("<!doctype html>shell"));

    const response = await respond("navigation", request("/some/page"), ctx, CACHES);

    expect(await response.text()).toBe("<!doctype html>shell");
  });

  it("opens the cached shell when the server doesn't answer in time", async () => {
    vi.useFakeTimers();
    const { caches, ctx } = createContext(hangingFetch);
    await caches.get(CACHES.static).put("/", html("<!doctype html>shell"));

    const pending = respond("navigation", request("/"), ctx, CACHES);
    await vi.advanceTimersByTimeAsync(NETWORK_TIMEOUT_MS);

    expect(await (await pending).text()).toBe("<!doctype html>shell");
  });

  it("doesn't keep something other than the app as the shell", async () => {
    const { caches, ctx, settle } = createContext(async () => jsonResponse({ not: "html" }));

    await respond("navigation", request("/"), ctx, CACHES);
    await settle();

    expect(caches.get(CACHES.static).paths()).toEqual([]);
  });

  it("drops the redirect flag from a cached shell, which navigations refuse", async () => {
    const { caches, ctx } = createContext(failingFetch);
    const redirected = html("<!doctype html>shell", { status: 200 });
    Object.defineProperty(redirected, "redirected", { value: true });
    const cache = caches.get(CACHES.static);
    vi.spyOn(cache, "match").mockResolvedValue(redirected);

    const response = await respond("navigation", request("/"), ctx, CACHES);

    expect(response.redirected).toBe(false);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toBe("<!doctype html>shell");
  });
});

describe("respond: build output and files", () => {
  it("serves hashed assets from the build's cache without the network", async () => {
    const { caches, ctx, fetch } = createContext(failingFetch);
    await caches.get(CACHES.static).put("/assets/index-abc.js", new Response("app"));

    const response = await respond("asset", request("/assets/index-abc.js"), ctx, CACHES);

    expect(await response.text()).toBe("app");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps public files fresh and available offline", async () => {
    const online = createContext(async () => new Response("{}"));
    await respond("file", request("/manifest.webmanifest"), online.ctx, CACHES);
    await online.settle();
    expect(online.caches.get(CACHES.static).paths()).toEqual(["/manifest.webmanifest"]);

    const offline = createContext(failingFetch);
    await offline.caches.get(CACHES.static).put("/manifest.webmanifest", new Response("cached"));
    const response = await respond("file", request("/manifest.webmanifest"), offline.ctx, CACHES);
    expect(await response.text()).toBe("cached");
  });
});

describe("respond: data", () => {
  it("shows the last known services while the server is down", async () => {
    const online = createContext(async () => jsonResponse([{ id: "1", name: "Plex" }]));
    await respond("data", request("/api/services"), online.ctx, CACHES);
    await online.settle();

    const offline = createContext(async () => new Response("bad gateway", { status: 502 }));
    offline.caches.caches.set(CACHES.data, online.caches.get(CACHES.data));
    const response = await respond("data", request("/api/services"), offline.ctx, CACHES);

    expect(await response.json()).toEqual([{ id: "1", name: "Plex" }]);
  });

  it("keeps settings per device", async () => {
    const { caches, ctx, settle } = createContext(async (req) => jsonResponse({ url: req.url }));

    await respond("data", request("/api/settings?device=a"), ctx, CACHES);
    await respond("data", request("/api/settings?device=b"), ctx, CACHES);
    await settle();

    expect(caches.get(CACHES.data).paths()).toEqual([
      "/api/settings?device=a",
      "/api/settings?device=b",
    ]);
  });
});

describe("respond: images", () => {
  it("keeps one copy per icon file, whatever its cache buster", async () => {
    const { caches, ctx, settle } = createContext(async () => new Response("png"));

    await respond("icon", request("/api/icons/a-1.png?v=1"), ctx, CACHES);
    await settle();
    await respond("icon", request("/api/icons/a-1.png?v=2"), ctx, CACHES);
    await settle();

    expect(caches.get(CACHES.icons).paths()).toEqual(["/api/icons/a-1.png"]);
  });

  it("keeps only the latest few wallpapers", async () => {
    const { caches, ctx, settle } = createContext(async () => new Response("jpg"));

    for (const name of ["a", "b", "c", "d"]) {
      await respond("wallpaper", request(`/api/wallpapers/${name}.jpg`), ctx, CACHES);
      await settle();
    }

    expect(caches.get(CACHES.wallpapers).paths()).toEqual([
      "/api/wallpapers/b.jpg",
      "/api/wallpapers/c.jpg",
      "/api/wallpapers/d.jpg",
    ]);
  });
});

describe("respond: an unreachable server", () => {
  async function seeded(fetchImpl: (request: Request) => Promise<Response>) {
    const context = createContext(fetchImpl);
    await context.caches.get(CACHES.static).put("/", html("<!doctype html>shell"));
    await context.caches.get(CACHES.data).put("/api/services", jsonResponse(["cached"]));
    return context;
  }

  /** Resolves to whether `promise` settled within `ms` of fake time. */
  async function settlesWithin(promise: Promise<unknown>, ms: number) {
    let settled = false;
    void promise.then(
      () => (settled = true),
      () => (settled = true)
    );
    await vi.advanceTimersByTimeAsync(ms);
    return settled;
  }

  it("uses the cache at once after a request had to wait out the timeout", async () => {
    vi.useFakeTimers();
    const { ctx } = await seeded(hangingFetch);

    const page = respond("navigation", request("/"), ctx, CACHES);
    expect(await settlesWithin(page, NETWORK_TIMEOUT_MS - 1)).toBe(false);
    expect(await settlesWithin(page, 1)).toBe(true);

    const data = respond("data", request("/api/services"), ctx, CACHES);
    expect(await settlesWithin(data, 0)).toBe(true);
    expect(await (await data).json()).toEqual(["cached"]);
  });

  it("waits for the network again once the server answers", async () => {
    vi.useFakeTimers();
    let server: "down" | "up" | "hanging" = "down";
    const { ctx } = await seeded(() =>
      server === "down"
        ? failingFetch()
        : server === "up"
          ? Promise.resolve(jsonResponse(["fresh"]))
          : hangingFetch()
    );

    await respond("navigation", request("/"), ctx, CACHES);
    server = "up";
    // A server that answers quickly still wins during the grace period, and ends it.
    const fresh = await respond("data", request("/api/services"), ctx, CACHES);
    expect(await fresh.json()).toEqual(["fresh"]);

    server = "hanging";
    const later = respond("data", request("/api/services"), ctx, CACHES);
    expect(await settlesWithin(later, NETWORK_TIMEOUT_MS - 1)).toBe(false);
    expect(await settlesWithin(later, 1)).toBe(true);
  });

  it("goes back to waiting for the network when the grace period ends", async () => {
    vi.useFakeTimers();
    let clock = 1_000_000;
    respond = createResponder(() => clock);
    const { ctx } = await seeded(hangingFetch);

    const page = respond("navigation", request("/"), ctx, CACHES);
    await vi.advanceTimersByTimeAsync(NETWORK_TIMEOUT_MS);
    await page;

    clock += UNREACHABLE_GRACE_MS - 1;
    expect(await settlesWithin(respond("data", request("/api/services"), ctx, CACHES), 0)).toBe(
      true
    );

    clock += UNREACHABLE_GRACE_MS + 1;
    const later = respond("data", request("/api/services"), ctx, CACHES);
    expect(await settlesWithin(later, NETWORK_TIMEOUT_MS - 1)).toBe(false);
    expect(await settlesWithin(later, 1)).toBe(true);
  });

  it("counts server errors as unreachable, and client errors as reachable", async () => {
    vi.useFakeTimers();
    let status = 502;
    let hang = false;
    const { ctx } = await seeded(() =>
      hang ? hangingFetch() : Promise.resolve(new Response("", { status }))
    );

    await respond("data", request("/api/services"), ctx, CACHES);
    hang = true;
    expect(await settlesWithin(respond("data", request("/api/services"), ctx, CACHES), 0)).toBe(
      true
    );

    hang = false;
    status = 401;
    await respond("data", request("/api/services"), ctx, CACHES);
    await vi.advanceTimersByTimeAsync(0);
    hang = true;
    expect(await settlesWithin(respond("data", request("/api/services"), ctx, CACHES), 0)).toBe(
      false
    );
  });
});
