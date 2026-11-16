const CACHE = "jcb-rental-shell-v2";
const SHELL = ["/", "/offline/", "/manifest.json"];
self.addEventListener("install", event => {
  event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(SHELL);await self.skipWaiting();})());
});
self.addEventListener("activate", event => {
  event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith("jcb-rental-")&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})());
});
self.addEventListener("fetch", event => {
  const req=event.request;
  if(req.method!=="GET") return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;
  if(req.mode==="navigate"){
    event.respondWith((async()=>{try{const response=await fetch(req);if(response.ok){const cache=await caches.open(CACHE);cache.put(req,response.clone());}return response;}catch{ return (await caches.match(req)) || (await caches.match("/offline/")) || Response.error();}})());
    return;
  }
  if(req.destination==="image"||req.destination==="font"||req.destination==="style"||req.destination==="script"){
    event.respondWith((async()=>{const cache=await caches.open(CACHE);const cached=await cache.match(req);const network=fetch(req).then(response=>{if(response.ok)cache.put(req,response.clone());return response;}).catch(()=>cached);return cached||network;})());
  }
});
