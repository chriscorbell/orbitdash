const API_BASE = "";
const DEFAULT_REQUEST_CACHE_TTL_MS = 1_000;

interface CachedJsonEntry<T> {
  data?: T;
  expiresAt: number;
  promise?: Promise<T>;
}

const requestCache = new Map<string, CachedJsonEntry<unknown>>();

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
  fallbackMessage: string
): Promise<T> {
  const res = await request(path, init, fallbackMessage);
  return res.json() as Promise<T>;
}

export async function requestJsonCached<T>(
  path: string,
  init: RequestInit,
  fallbackMessage: string,
  ttlMs: number = DEFAULT_REQUEST_CACHE_TTL_MS
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET") {
    return requestJson<T>(path, init, fallbackMessage);
  }

  const cacheKey = getRequestCacheKey(path, init);
  const cached = requestCache.get(cacheKey) as CachedJsonEntry<T> | undefined;
  const now = Date.now();

  if (cached?.data !== undefined && cached.expiresAt > now) {
    return cached.data;
  }

  if (cached?.promise) {
    return cached.promise;
  }

  const promise = requestJson<T>(path, init, fallbackMessage)
    .then((data) => {
      requestCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + ttlMs,
      });
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
