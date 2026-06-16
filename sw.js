// Stjernekikkert service worker (PERF-3) — offline-støtte.
// Cache-first for app-skall; nett-fallback for alt annet (f.eks. vær-API senere).
var CACHE = 'stjernekikkert-v24';
var ASSETS = [
  'index.html',
  'objekter.html',
  'anbefalt.html',
  'setup.html',
  'kollimering.html',
  'sikt.html',
  'shared.js',
  'shared.css',
  'manifest.json',
  'icon.svg'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll(ASSETS); }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){ if (k !== CACHE) return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;
  // Open-Meteo (vær): alltid live, aldri cache — la nettleseren håndtere det rett.
  if (new URL(req.url).hostname.indexOf('open-meteo.com') >= 0) return;
  // Google Fonts og andre cross-origin: nett, men cache for offline gjenbruk
  if (new URL(req.url).origin !== self.location.origin){
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); });
        return res;
      }).catch(function(){ return caches.match(req); })
    );
    return;
  }
  // Egne filer: cache først, så nett
  e.respondWith(
    caches.match(req).then(function(hit){
      return hit || fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); });
        return res;
      });
    }).catch(function(){ return caches.match('index.html'); })
  );
});
