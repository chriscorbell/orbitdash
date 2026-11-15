// orbitdash 1.x installed an offline service worker. 2.x has none, so this replacement clears its
// caches, unregisters itself and reloads open tabs, which then load straight from the server.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: "window" })) {
        client.navigate(client.url);
      }
    })()
  );
});
