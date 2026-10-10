import { cacheNamesFor } from "@/sw/routes";

const SCRIPT_URL = "/sw.js";
const RELOAD_KEY = "orbitdash.staleChunkReload";
const RELOAD_COOLDOWN_MS = 10_000;

/** Undefined where the browser has no service workers, including pages served over plain http. */
type Container = ServiceWorkerContainer | undefined;

const defaultContainer = (): Container =>
  typeof navigator === "undefined" ? undefined : navigator.serviceWorker;

/**
 * Registers the service worker (src/sw/) that keeps the app and its last known data available
 * offline. Production only. Without service workers (plain http, some private modes) the app
 * works as before, just not offline.
 */
export function registerServiceWorker(container: Container = defaultContainer()): void {
  if (!container) return;

  const register = () => {
    container.register(SCRIPT_URL, { updateViaCache: "none" }).then(
      (registration) => {
        // Browsers look for a new worker on page loads. An installed app or a dashboard tab can
        // stay open for days without one, so also look when it comes back into view.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") registration.update().catch(() => {});
        });
      },
      () => {
        // Registration can fail when storage is blocked; the app keeps working online.
      }
    );
  };

  // Registering after load keeps the worker's precaching from competing with the first paint.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

/**
 * Development counterpart: removes a worker that a production build left on the same origin
 * (`vite preview` uses the e2e dev server's port), so it can't answer requests with stale files.
 */
export function unregisterServiceWorker(container: Container = defaultContainer()): void {
  void container?.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      const worker = registration.active ?? registration.waiting ?? registration.installing;
      if (worker?.scriptURL.endsWith(SCRIPT_URL)) void registration.unregister();
    }
  });
}

/**
 * A page opened before a deploy still asks for the old build's lazy chunks (a dialog, edit mode),
 * which the server no longer has. Reload into the new build instead of failing. The cooldown keeps
 * a genuinely broken build from reloading over and over.
 */
export function reloadOnStaleChunks(target: Window = window): void {
  target.addEventListener("vite:preloadError", () => {
    try {
      const last = Number(target.sessionStorage.getItem(RELOAD_KEY));
      if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
      target.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      // Without session storage there is no cooldown; a reload only follows a user action anyway.
    }
    target.location.reload();
  });
}

/**
 * Signing out removes what the service worker kept for offline use (API responses, icons and
 * wallpapers), so the next person at this browser can't read the dashboard from its cache. The
 * app shell stays.
 */
export async function clearCachedData(
  storage: Pick<CacheStorage, "delete"> | undefined = typeof caches === "undefined"
    ? undefined
    : caches
): Promise<void> {
  if (!storage) return;
  // These names don't depend on the build version.
  const { data, icons, wallpapers } = cacheNamesFor("");
  await Promise.all([data, icons, wallpapers].map((name) => storage.delete(name))).catch(() => {});
}
