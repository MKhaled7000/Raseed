const CACHE='xwallet-v131-20261113';
const CORE=[
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './version.json'
];
const CDN_LIBS=[
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js',
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.wasm'
];
self.addEventListener('install',e=>e.waitUntil(
  caches.open(CACHE).then(async c=>{
    await c.addAll(CORE);
    for(const url of CDN_LIBS){
      try{ await c.add(url); }catch(_){}
    }
  }).then(()=>self.skipWaiting())
));
self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(
    keys.filter(k=>(k.startsWith('raseed-')||k.startsWith('wallet-')||k.startsWith('xwallet-'))&&k!==CACHE).map(k=>caches.delete(k))
  )).then(()=>self.clients.claim())
));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(
    caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{
      const reqUrl = new URL(e.request.url);
      if(r.ok&&(reqUrl.origin===location.origin||reqUrl.hostname.includes('cdnjs.cloudflare.com'))){
        let copy=r.clone();
        caches.open(CACHE).then(c=>c.put(e.request,copy));
      }
      return r;
    }).catch(()=>caches.match('./index.html')))
  );
});
