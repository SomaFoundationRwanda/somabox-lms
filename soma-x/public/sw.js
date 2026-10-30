// SOMABOX service worker: keeps the app's own files (scripts, styles, fonts, images) on the
// device, so pages open fast and the app still starts when the box is slow or briefly away.
// Pages and the box's data are never cached here (the app keeps its data itself, per person).
const CACHE = "somabox-static-v1";
const MAX_ENTRIES = 300;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

// Keeps the cache to MAX_ENTRIES (oldest out first).
async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ENTRIES; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Build files have content hashes in their names: once kept, always right.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok) { await cache.put(request, response.clone()); trim(cache); }
      return response;
    })());
    return;
  }

  // Fonts, images and logos: shown from the device, refreshed in the background.
  if (/^\/(fonts|images|schoolLogo)\//.test(url.pathname) || /\.(png|jpe?g|svg|webp|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      const refresh = fetch(request).then(async (response) => {
        if (response.ok) { await cache.put(request, response.clone()); trim(cache); }
        return response;
      }).catch(() => hit);
      return hit || refresh;
    })());
  }
});
