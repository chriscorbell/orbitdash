/**
 * Which requests the service worker answers, and how. Everything here is pure so it can be tested
 * without a worker.
 *
 * - `navigation`: page loads. Network first, then the cached app shell.
 * - `asset`: hashed build output under /assets. Cache first; a new build means new file names.
 * - `file`: other same-origin files from public/ (manifest, icons). Network first.
 * - `data`: the JSON the dashboard renders (services, categories, settings). Network first, then
 *   the last response, so the app opens with the last known data while the server is unreachable.
 * - `icon`: service icons. Served from the cache and refreshed in the background.
 * - `wallpaper`: wallpapers are named by content hash, so a cached copy never goes stale.
 *
 * Anything else, including every non-GET request, the event stream, live metrics and `/api/system`
 * (live uptime), goes straight to the network.
 */
export type RouteKind = "navigation" | "asset" | "file" | "data" | "icon" | "wallpaper";

/** The parts of a Request that routing looks at. */
export interface RoutableRequest {
  cache?: RequestCache;
  headers: Pick<Headers, "get">;
  method: string;
  mode: RequestMode;
  url: string;
}

const DATA_PATHS = ["/api/services", "/api/categories", "/api/settings"];

/**
 * Data the worker stores when it installs. The first visit fetched it before the worker was in
 * control, so without this the app would have no services to show offline until the next load.
 * Settings are device-specific and the app keeps its own copy of them in localStorage.
 */
export const WARM_DATA_URLS = ["/api/services", "/api/categories"];
const PUBLIC_FILE = /\.(?:ico|png|svg|webmanifest)$/;
const FILE_EXTENSION = /\.[^/]*$/;

function matchesPath(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function routeRequest(request: RoutableRequest, origin: string): RouteKind | null {
  if (request.method !== "GET") return null;

  const url = new URL(request.url);
  if (url.origin !== origin) return null;
  // Chrome DevTools can issue these; answering them from a worker throws.
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return null;
  if (request.headers.get("accept")?.includes("text/event-stream")) return null;

  const { pathname } = url;
  if (request.mode === "navigate") {
    // Like the server's fallback to index.html: only paths without a file extension are app pages.
    return pathname.startsWith("/api/") || FILE_EXTENSION.test(pathname) ? null : "navigation";
  }
  if (pathname.startsWith("/assets/")) return "asset";
  if (pathname.startsWith("/api/icons/")) return "icon";
  if (pathname.startsWith("/api/wallpapers/")) return "wallpaper";
  if (DATA_PATHS.some((base) => matchesPath(pathname, base))) return "data";
  if (pathname.startsWith("/api/")) return null;
  return PUBLIC_FILE.test(pathname) ? "file" : null;
}

const CACHE_PREFIX = "orbitdash-";

export interface CacheNames {
  /** App shell and build output for one build; replaced when a new build's worker activates. */
  static: string;
  /** Last known API responses; kept across builds so a fresh deploy still opens offline. */
  data: string;
  icons: string;
  wallpapers: string;
}

export function cacheNamesFor(version: string): CacheNames {
  return {
    static: `${CACHE_PREFIX}static-${version}`,
    data: `${CACHE_PREFIX}data-v1`,
    icons: `${CACHE_PREFIX}icons-v1`,
    wallpapers: `${CACHE_PREFIX}wallpapers-v1`,
  };
}

/** orbitdash caches the current worker doesn't use: earlier builds' shells and old formats. */
export function staleCacheNames(existing: readonly string[], current: CacheNames): string[] {
  const keep = new Set(Object.values(current));
  return existing.filter((name) => name.startsWith(CACHE_PREFIX) && !keep.has(name));
}

/**
 * The cache key for a request. Every page is the same single-page app, so navigations share one
 * entry, and icon and wallpaper file names identify their content, so their query strings
 * (cache busters like `?v=`) don't need entries of their own.
 */
export function cacheKeyFor(kind: RouteKind, url: string): string {
  if (kind === "navigation") return "/";
  if (kind === "icon" || kind === "wallpaper") return new URL(url).pathname;
  return url;
}
