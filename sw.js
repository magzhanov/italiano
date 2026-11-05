const CACHE='italiano-private-sync-v3';
const FILES=['./','./index.html','./cloud-sync.js?v=2','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&(key.startsWith('italiano-classic-')||key.startsWith('italiano-private-sync-'))).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 // Authenticated GitHub API requests must never enter the offline cache.
 if(event.request.method!=='GET'||url.origin!==self.location.origin||event.request.headers.has('authorization'))return;
 event.respondWith(fetch(event.request,{cache:'no-cache'}).then(response=>{
  if(response.ok&&response.type==='basic')event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,response.clone())));
  return response;
 }).catch(()=>caches.match(event.request).then(cached=>cached||Response.error())));
});
