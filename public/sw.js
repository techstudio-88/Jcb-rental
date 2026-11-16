const CACHE = "jcb-rental-v1";
self.addEventListener("install", (event) => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(fetch(req).then((res) => {
    if (res.ok && req.destination !== "document") {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req)));
});
