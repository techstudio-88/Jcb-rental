const CACHE = "jcb-rental-shell-v4";
const SHELL = ["/", "/offline/", "/manifest.json"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("jcb-rental-shell-") && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: "no-store" });
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match("/offline/")) || Response.error();
      }
    })());
    return;
  }

  const isAppAsset = request.destination === "style" || request.destination === "script";
  const isMedia = request.destination === "image" || request.destination === "font";
  if (isAppAsset) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request, { cache: "no-store" });
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) || Response.error();
      }
    })());
    return;
  }

  if (isMedia) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      const network = fetch(request).then(response => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => cached);
      return cached || network;
    })());
  }
});
