import type { ZodType } from "zod";

const API_BASE = "";
const DEFAULT_REQUEST_CACHE_TTL_MS = 1_000;

interface CachedJsonEntry {
  data?: unknown;
  expiresAt: number;
  promise?: Promise<unknown>;
}

const requestCache = new Map<string, CachedJsonEntry>();

function getRequestCacheKey(path: string, init: RequestInit): string {
  return `${init.method ?? "GET"}:${path}`;
}

function getErrorMessage(data: unknown): string | null {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }

  return null;
}

async function throwIfNotOk(res: Response, fallbackMessage: string): Promise<void> {
  if (res.ok) {
    return;
  }

  let message = fallbackMessage;
  try {
    const data = await res.json();
    const errorMessage = getErrorMessage(data);
    if (errorMessage) {
      message = errorMessage;
    }
  } catch {
    // Fall back to the default message when the response body is not JSON.
  }

  throw new Error(message);
}

export async function request(
  path: string,
  init: RequestInit,
  fallbackMessage: string
): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, init);
  await throwIfNotOk(res, fallbackMessage);
  return res;
}

export async function requestJson<T>(
  path: string,
  init: RequestInit,
  fallbackMessage: string,
  schema: ZodType<T>
): Promise<T> {
  const res = await request(path, init, fallbackMessage);
  const data = await res.json();
  return schema.parse(data);
}

export async function requestJsonCached<T>(
  path: string,
  init: RequestInit,
  fallbackMessage: string,
  schema: ZodType<T>,
  ttlMs: number = DEFAULT_REQUEST_CACHE_TTL_MS
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET") {
    return requestJson(path, init, fallbackMessage, schema);
  }

  const cacheKey = getRequestCacheKey(path, init);
  const cached = requestCache.get(cacheKey);
  const now = Date.now();

  if (cached?.data !== undefined && cached.expiresAt > now) {
    return schema.parse(cached.data);
  }

  if (cached?.promise) {
    return cached.promise.then((data) => schema.parse(data));
  }

  const promise = request(path, init, fallbackMessage)
    .then(async (res) => {
      const data = await res.json();
      const parsed = schema.parse(data);
      requestCache.set(cacheKey, {
        data: parsed,
        expiresAt: Date.now() + ttlMs,
      });
      return parsed;
    })
    .then((data) => {
      return data;
    })
    .catch((error) => {
      requestCache.delete(cacheKey);
      throw error;
    });

  requestCache.set(cacheKey, {
    expiresAt: now + ttlMs,
    promise,
  });

  return promise;
}

export function invalidateRequestCache(path: string): void {
  for (const cacheKey of requestCache.keys()) {
    if (cacheKey.endsWith(`:${path}`)) {
      requestCache.delete(cacheKey);
    }
  }
}

export function buildApiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
