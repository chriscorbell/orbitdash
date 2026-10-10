import { cacheKeyFor, type CacheNames, type RouteKind } from "./routes";
import { cacheFirst, networkFirst, staleWhileRevalidate, type StrategyContext } from "./strategies";

/**
 * How long a page load or data request waits for the server before using the cached copy. An
 * unreachable home server (off the home network, VPN down) often hangs instead of failing fast.
 */
export const NETWORK_TIMEOUT_MS = 4000;
/**
 * Once a request has had to fall back, the server is likely still unreachable, so for this long
 * cached copies are used at once instead of after another timeout each. The network still
 * refreshes them in the background, and any server response ends this early.
 */
export const UNREACHABLE_GRACE_MS = 10_000;
const MAX_ICONS = 300;
const MAX_WALLPAPERS = 3;

export type Responder = (
  kind: RouteKind,
  request: Request,
  ctx: StrategyContext,
  caches: CacheNames
) => Promise<Response>;

const isHtml = (response: Response) =>
  response.headers.get("content-type")?.includes("text/html") ?? false;

/**
 * Navigations must not be answered with a redirected response; one could only come from the
 * cache here (a shell stored behind a redirect), so drop the redirect flag by copying it.
 */
function withoutRedirect(response: Response): Response {
  return response.redirected ? new Response(response.body, response) : response;
}

/** Answers routed requests. Remembers whether the server answered lately, so make one per worker. */
export function createResponder(now: () => number = Date.now): Responder {
  let unreachableUntil = 0;
  const markUnreachable = () => {
    unreachableUntil = now() + UNREACHABLE_GRACE_MS;
  };

  return async (kind, request, ctx, caches) => {
    const key = cacheKeyFor(kind, request.url);
    const tracked: StrategyContext = {
      ...ctx,
      fetch: (req) =>
        ctx.fetch(req).then(
          (response) => {
            if (response.status >= 500) markUnreachable();
            else unreachableUntil = 0;
            return response;
          },
          (error: unknown) => {
            markUnreachable();
            throw error;
          }
        ),
    };
    const networkFirstIn = (cacheName: string) => ({
      cacheName,
      key,
      onFallback: markUnreachable,
      timeoutMs: now() < unreachableUntil ? 0 : NETWORK_TIMEOUT_MS,
    });

    switch (kind) {
      case "navigation":
        return withoutRedirect(
          await networkFirst(tracked, request, {
            ...networkFirstIn(caches.static),
            shouldCache: isHtml,
          })
        );
      case "asset":
        return cacheFirst(ctx, request, { cacheName: caches.static, key });
      case "file":
        return networkFirst(tracked, request, networkFirstIn(caches.static));
      case "data":
        return networkFirst(tracked, request, networkFirstIn(caches.data));
      case "icon":
        return staleWhileRevalidate(ctx, request, {
          cacheName: caches.icons,
          key,
          maxEntries: MAX_ICONS,
        });
      case "wallpaper":
        return cacheFirst(ctx, request, {
          cacheName: caches.wallpapers,
          key,
          maxEntries: MAX_WALLPAPERS,
        });
    }
  };
}
