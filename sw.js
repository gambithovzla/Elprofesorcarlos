/* El Profesor Carlos — cache ligero para PWA (GitHub Pages, subruta OK con rutas relativas) */
var CACHE = 'epc-shell-v2';
var PRECACHE = ['./index.html', './manifest.webmanifest', './icons/icon.svg', './images/hero.jpg', './images/about.jpg', './sw.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PRECACHE).catch(function () {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          if (k !== CACHE) return caches.delete(k);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var u = e.request.url;
  if (u.includes('cdnjs.cloudflare.com') || u.includes('fonts.googleapis') || u.includes('fonts.gstatic')) {
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(e.request, copy);
          });
        }
        return res;
      })
      .catch(function () {
        return caches.match(e.request).then(function (hit) {
          return hit || caches.match(new URL('index.html', self.location).href);
        });
      })
  );
});
