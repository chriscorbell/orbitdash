import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cacheFirst,
  isCacheable,
  networkFirst,
  staleWhileRevalidate,
  trimCache,
} from "./strategies";
import {
  createContext,
  failingFetch,
  FakeCache,
  hangingFetch,
  jsonResponse,
  request,
} from "./test-helpers";

const CACHE = "test-cache";
const TIMEOUT = { cacheName: CACHE, timeoutMs: 4000 };

afterEach(() => {
  vi.useRealTimers();
});

describe("isCacheable", () => {
  it("stores only complete 200 responses the server allows to be stored", () => {
    expect(isCacheable(new Response("ok"))).toBe(true);
    expect(isCacheable(new Response("ok", { headers: { "cache-control": "no-cache" } }))).toBe(
      true
    );

    expect(isCacheable(new Response("partial", { status: 206 }))).toBe(false);
    expect(isCacheable(new Response("missing", { status: 404 }))).toBe(false);
    expect(isCacheable(new Response("down", { status: 502 }))).toBe(false);
    expect(isCacheable(new Response("live", { headers: { "cache-control": "no-store" } }))).toBe(
      false
    );
    expect(
      isCacheable(new Response("live", { headers: { "Cache-Control": "private, No-Store" } }))
    ).toBe(false);
  });
});

describe("trimCache", () => {
  it("drops the oldest entries beyond the limit", async () => {
    const cache = new FakeCache();
    for (const name of ["a", "b", "c", "d"]) await cache.put(`/${name}`, new Response(name));

    await trimCache(cache as unknown as Cache, 2);

    expect(cache.paths()).toEqual(["/c", "/d"]);
  });

  it("leaves a cache under the limit alone", async () => {
    const cache = new FakeCache();
    await cache.put("/a", new Response("a"));

    await trimCache(cache as unknown as Cache, 5);

    expect(cache.paths()).toEqual(["/a"]);
  });
});

describe("networkFirst", () => {
  it("answers from the network and keeps a copy", async () => {
    const { caches, ctx, settle } = createContext(async () => jsonResponse({ fresh: true }));

    const response = await networkFirst(ctx, request("/api/services"), TIMEOUT);

    expect(await response.json()).toEqual({ fresh: true });
    await settle();
    expect(await caches.get(CACHE).text("/api/services")).toBe('{"fresh":true}');
  });

  it("falls back to the cached copy when the network fails", async () => {
    const { caches, ctx } = createContext(failingFetch);
    await caches.get(CACHE).put("/api/services", jsonResponse({ cached: true }));

    const response = await networkFirst(ctx, request("/api/services"), TIMEOUT);

    expect(await response.json()).toEqual({ cached: true });
  });

  it("falls back to the cached copy on a server error, but passes client errors through", async () => {
    const serverError = createContext(async () => new Response("bad gateway", { status: 502 }));
    await serverError.caches.get(CACHE).put("/api/services", jsonResponse({ cached: true }));
    const fromCache = await networkFirst(serverError.ctx, request("/api/services"), TIMEOUT);
    expect(await fromCache.json()).toEqual({ cached: true });

    const clientError = createContext(async () => new Response("unauthorized", { status: 401 }));
    await clientError.caches.get(CACHE).put("/api/services", jsonResponse({ cached: true }));
    const passed = await networkFirst(clientError.ctx, request("/api/services"), TIMEOUT);
    expect(passed.status).toBe(401);
  });

  it("returns the network result as is when nothing is cached", async () => {
    const serverError = createContext(async () => new Response("down", { status: 503 }));
    const response = await networkFirst(serverError.ctx, request("/api/services"), TIMEOUT);
    expect(response.status).toBe(503);

    const offline = createContext(failingFetch);
    await expect(networkFirst(offline.ctx, request("/api/services"), TIMEOUT)).rejects.toThrow(
      "Failed to fetch"
    );
  });

  it("answers from the cache when the network takes too long, and still refreshes it", async () => {
    vi.useFakeTimers();
    let answer: (response: Response) => void = () => {};
    const { caches, ctx, settle } = createContext(
      () => new Promise<Response>((resolve) => (answer = resolve))
    );
    await caches.get(CACHE).put("/api/services", jsonResponse({ cached: true }));

    const pending = networkFirst(ctx, request("/api/services"), TIMEOUT);
    await vi.advanceTimersByTimeAsync(3999);
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await (await pending).json()).toEqual({ cached: true });

    answer(jsonResponse({ late: true }));
    await settle();
    expect(await caches.get(CACHE).text("/api/services")).toBe('{"late":true}');
  });

  it("waits for the network without a timeout when there is nothing to fall back to", async () => {
    vi.useFakeTimers();
    let answer: (response: Response) => void = () => {};
    const { ctx } = createContext(() => new Promise<Response>((resolve) => (answer = resolve)));

    const pending = networkFirst(ctx, request("/api/services"), TIMEOUT);
    await vi.advanceTimersByTimeAsync(10_000);
    answer(jsonResponse({ slow: true }));

    expect(await (await pending).json()).toEqual({ slow: true });
  });

  it("stores under the given key and skips responses the caller rejects", async () => {
    const { caches, ctx, settle } = createContext(async () => new Response("<!doctype html>"));
    await networkFirst(ctx, request("/some/page"), { ...TIMEOUT, key: "/" });
    await settle();
    expect(caches.get(CACHE).paths()).toEqual(["/"]);

    const rejected = createContext(async () => new Response("not wanted"));
    await networkFirst(rejected.ctx, request("/page"), { ...TIMEOUT, shouldCache: () => false });
    await rejected.settle();
    expect(rejected.caches.get(CACHE).paths()).toEqual([]);
  });

  it("reports when it had to answer from the cache", async () => {
    for (const [fetchImpl, expected] of [
      [failingFetch, 1],
      [async () => new Response("down", { status: 503 }), 1],
      [async () => new Response("missing", { status: 404 }), 0],
      [async () => jsonResponse({ fresh: true }), 0],
    ] as const) {
      const { caches, ctx } = createContext(fetchImpl);
      await caches.get(CACHE).put("/api/services", jsonResponse({ cached: true }));
      const onFallback = vi.fn();

      await networkFirst(ctx, request("/api/services"), { ...TIMEOUT, onFallback });

      expect(onFallback).toHaveBeenCalledTimes(expected);
    }
  });

  it("never stores no-store responses", async () => {
    const { caches, ctx, settle } = createContext(async () =>
      jsonResponse({ uptime: 1 }, { headers: { "cache-control": "no-store" } })
    );

    await networkFirst(ctx, request("/api/services"), TIMEOUT);
    await settle();

    expect(caches.get(CACHE).paths()).toEqual([]);
  });
});

describe("cacheFirst", () => {
  it("answers from the cache without touching the network", async () => {
    const { caches, ctx, fetch } = createContext(failingFetch);
    await caches.get(CACHE).put("/assets/index-abc.js", new Response("cached"));

    const response = await cacheFirst(ctx, request("/assets/index-abc.js"), { cacheName: CACHE });

    expect(await response.text()).toBe("cached");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches and stores what is missing, keeping at most maxEntries", async () => {
    const { caches, ctx, settle } = createContext(async (req) => new Response(req.url));
    for (const name of ["a", "b", "c"]) {
      await cacheFirst(ctx, request(`/w/${name}.jpg`), { cacheName: CACHE, maxEntries: 2 });
      await settle();
    }

    expect(caches.get(CACHE).paths()).toEqual(["/w/b.jpg", "/w/c.jpg"]);
  });

  it("passes errors through without storing them", async () => {
    const { caches, ctx, settle } = createContext(
      async () => new Response("gone", { status: 404 })
    );

    const response = await cacheFirst(ctx, request("/assets/old-abc.js"), { cacheName: CACHE });
    await settle();

    expect(response.status).toBe(404);
    expect(caches.get(CACHE).paths()).toEqual([]);
  });
});

describe("staleWhileRevalidate", () => {
  it("answers from the cache right away and refreshes the copy", async () => {
    const { caches, ctx, settle } = createContext(async () => new Response("new icon"));
    await caches.get(CACHE).put("/api/icons/a.png", new Response("old icon"));

    const response = await staleWhileRevalidate(ctx, request("/api/icons/a.png"), {
      cacheName: CACHE,
    });

    expect(await response.text()).toBe("old icon");
    await settle();
    expect(await caches.get(CACHE).text("/api/icons/a.png")).toBe("new icon");
  });

  it("waits for the network when nothing is cached", async () => {
    const { ctx } = createContext(async () => new Response("icon"));

    const response = await staleWhileRevalidate(ctx, request("/api/icons/a.png"), {
      cacheName: CACHE,
    });

    expect(await response.text()).toBe("icon");
  });

  it("keeps the cached copy when the refresh fails or never answers", async () => {
    for (const fetchImpl of [failingFetch, hangingFetch]) {
      const { caches, ctx } = createContext(fetchImpl);
      await caches.get(CACHE).put("/api/icons/a.png", new Response("old icon"));

      const response = await staleWhileRevalidate(ctx, request("/api/icons/a.png"), {
        cacheName: CACHE,
      });

      expect(await response.text()).toBe("old icon");
      expect(await caches.get(CACHE).text("/api/icons/a.png")).toBe("old icon");
    }
  });
});
