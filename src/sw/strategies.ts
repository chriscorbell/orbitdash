/**
 * Caching strategies for the service worker. They take their caches, fetch and waitUntil as
 * arguments so tests can run them with fakes.
 */
export interface StrategyContext {
  caches: Pick<CacheStorage, "open">;
  fetch: (request: Request) => Promise<Response>;
  /** Keeps the worker alive for work that outlives the response, like a background cache write. */
  waitUntil: (promise: Promise<unknown>) => void;
}

export interface CacheTarget {
  cacheName: string;
  /** Defaults to the request itself. */
  key?: RequestInfo;
  /** Oldest entries are dropped once the cache holds more than this. */
  maxEntries?: number;
}

export interface NetworkFirstOptions extends CacheTarget {
  /** How long to wait for the network before answering from the cache, when there is a copy. */
  timeoutMs: number;
  /** Extra condition for storing a response, on top of `isCacheable`. */
  shouldCache?: (response: Response) => boolean;
  /** Called when the answer came from the cache because the network failed or was too slow. */
  onFallback?: () => void;
}

const noop = () => {};

/**
 * Full 200 responses only: no errors, no partial content, no opaque responses, and nothing the
 * server marked `no-store`.
 */
export function isCacheable(response: Response): boolean {
  return (
    response.status === 200 && !/\bno-store\b/i.test(response.headers.get("cache-control") ?? "")
  );
}

/** Drops the oldest entries. Cache keys come back in insertion order, and `put` re-inserts. */
export async function trimCache(cache: Cache, maxEntries: number): Promise<void> {
  const keys = await cache.keys();
  await Promise.all(
    keys.slice(0, Math.max(0, keys.length - maxEntries)).map((key) => cache.delete(key))
  );
}

function store(
  ctx: StrategyContext,
  cache: Promise<Cache>,
  key: RequestInfo,
  response: Response,
  maxEntries?: number
) {
  // Clone now, before the page starts reading the body.
  const copy = response.clone();
  ctx.waitUntil(
    cache.then(async (opened) => {
      await opened.put(key, copy);
      if (maxEntries !== undefined) await trimCache(opened, maxEntries);
    })
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("network timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Network first. Falls back to the cached copy when the network fails, answers with a server error
 * (a proxy's 502 while orbitdash is down), or takes longer than `timeoutMs`. A late network
 * response still refreshes the cache. Without a cached copy the network result is returned as is.
 */
export async function networkFirst(
  ctx: StrategyContext,
  request: Request,
  { cacheName, key = request, maxEntries, onFallback, shouldCache, timeoutMs }: NetworkFirstOptions
): Promise<Response> {
  const cache = ctx.caches.open(cacheName);
  const network = ctx.fetch(request).then((response) => {
    if (isCacheable(response) && (shouldCache?.(response) ?? true)) {
      store(ctx, cache, key, response, maxEntries);
    }
    return response;
  });
  ctx.waitUntil(network.then(noop, noop));

  const cached = await (await cache).match(key);
  if (!cached) return network;

  try {
    const response = await withTimeout(network, timeoutMs);
    if (response.status < 500) return response;
  } catch {
    // Offline, refused or too slow: use the copy.
  }
  onFallback?.();
  return cached;
}

/** Cache first, for responses whose URL changes whenever their content does. */
export async function cacheFirst(
  ctx: StrategyContext,
  request: Request,
  { cacheName, key = request, maxEntries }: CacheTarget
): Promise<Response> {
  const cache = ctx.caches.open(cacheName);
  const cached = await (await cache).match(key);
  if (cached) return cached;

  const response = await ctx.fetch(request);
  if (isCacheable(response)) store(ctx, cache, key, response, maxEntries);
  return response;
}

/** Answers from the cache right away when it can, and refreshes the copy from the network. */
export async function staleWhileRevalidate(
  ctx: StrategyContext,
  request: Request,
  { cacheName, key = request, maxEntries }: CacheTarget
): Promise<Response> {
  const cache = ctx.caches.open(cacheName);
  const network = ctx.fetch(request).then((response) => {
    if (isCacheable(response)) store(ctx, cache, key, response, maxEntries);
    return response;
  });
  ctx.waitUntil(network.then(noop, noop));

  const cached = await (await cache).match(key);
  return cached ?? network;
}
