import { vi } from "vitest";
import type { StrategyContext } from "./strategies";

export const ORIGIN = "https://dash.example";

function urlOf(key: RequestInfo | URL): string {
  const raw = typeof key === "string" ? key : key instanceof URL ? key.href : key.url;
  return new URL(raw, ORIGIN).href;
}

/** Just enough of the Cache API, keyed by URL and kept in insertion order like the real one. */
export class FakeCache {
  readonly entries = new Map<string, Response>();

  async match(key: RequestInfo | URL): Promise<Response | undefined> {
    return this.entries.get(urlOf(key))?.clone();
  }

  async put(key: RequestInfo | URL, response: Response): Promise<void> {
    const url = urlOf(key);
    this.entries.delete(url);
    this.entries.set(url, response);
  }

  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((url) => new Request(url));
  }

  async delete(key: RequestInfo | URL): Promise<boolean> {
    return this.entries.delete(urlOf(key));
  }

  /** Cached URLs relative to the origin, oldest first. */
  paths(): string[] {
    return [...this.entries.keys()].map((url) => url.slice(ORIGIN.length));
  }

  async text(key: string): Promise<string | undefined> {
    return (await this.match(key))?.text();
  }
}

export class FakeCacheStorage {
  readonly caches = new Map<string, FakeCache>();

  async open(name: string): Promise<Cache> {
    return this.get(name) as unknown as Cache;
  }

  get(name: string): FakeCache {
    let cache = this.caches.get(name);
    if (!cache) {
      cache = new FakeCache();
      this.caches.set(name, cache);
    }
    return cache;
  }
}

/**
 * A strategy context over fake caches. `settle()` waits for everything handed to waitUntil, the
 * way a worker stays alive for it, including work queued while settling.
 */
export function createContext(fetchImpl: (request: Request) => Promise<Response>) {
  const caches = new FakeCacheStorage();
  const pending: Promise<unknown>[] = [];
  const fetch = vi.fn(fetchImpl);
  const ctx: StrategyContext = {
    caches,
    fetch,
    waitUntil: (promise) => {
      pending.push(promise);
    },
  };

  const settle = async () => {
    while (pending.length > 0) {
      await Promise.allSettled(pending.splice(0));
    }
  };

  return { caches, ctx, fetch, settle };
}

export function request(path: string, init?: RequestInit): Request {
  return new Request(new URL(path, ORIGIN), init);
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

/** A fetch that never answers, like a server that is off the network. */
export const hangingFetch = () => new Promise<Response>(() => {});

export const failingFetch = () => Promise.reject(new TypeError("Failed to fetch"));
