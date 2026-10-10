// The service worker. The build (vite.config.ts) bundles it on its own into /sw.js and fills in
// the two constants below; the app registers it in production only.
import { createResponder } from "./respond";
import { cacheNamesFor, routeRequest, staleCacheNames, WARM_DATA_URLS } from "./routes";

declare const self: ServiceWorkerGlobalScope;
/** Hash of the precached files, so every build gets its own static cache. */
declare const __SW_VERSION__: string;
declare const __PRECACHE_URLS__: string[];

const CACHES = cacheNamesFor(__SW_VERSION__);
const respond = createResponder();

self.addEventListener("install", (event) => {
  // A new build takes over as soon as it has cached its files. Pages load network first, so an
  // open page keeps working and the next load is the new build.
  void self.skipWaiting();
  event.waitUntil(
    Promise.all([
      caches.open(CACHES.static).then((cache) => cache.addAll(__PRECACHE_URLS__)),
      // Best effort: a failed data request must not stop the worker from installing.
      caches
        .open(CACHES.data)
        .then((cache) => Promise.allSettled(WARM_DATA_URLS.map((url) => cache.add(url)))),
    ])
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const stale = staleCacheNames(await caches.keys(), CACHES);
      await Promise.all(stale.map((name) => caches.delete(name)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const kind = routeRequest(event.request, self.location.origin);
  if (!kind) return;

  event.respondWith(
    respond(
      kind,
      event.request,
      {
        caches,
        fetch: (request) => fetch(request),
        waitUntil: (promise) => event.waitUntil(promise),
      },
      CACHES
    )
  );
});
