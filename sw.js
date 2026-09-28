/**
 * Meryem App — Service Worker
 * Network-first strategy: always fetches latest, falls back to cache offline.
 */

var CACHE_NAME = 'meryem-v8';
var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/anilar.css',
  './css/bears.css',
  './css/birthday.css',
  './css/bugun.css',
  './css/dates.css',
  './css/gate.css',
  './css/style.css',
  './css/words.css',
  './js/app.js',
  './js/bears.js',
  './js/birthday.js',
  './js/content.js',
  './js/daily.js',
  './js/data.js',
  './js/dates.js',
  './js/drive.js',
  './js/exif.js',
  './js/firebase.js',
  './js/fx.js',
  './js/gate.js',
  './js/map.js',
  './js/time.js',
  './js/words.js',
  './img/heart.svg',
  './img/icon-180.png',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/icon-maskable-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  var url = event.request.url;

  /* Let Firebase handle its own network requests */
  if (url.includes('firestore.googleapis.com') ||
      url.includes('firebasestorage.googleapis.com') ||
      url.includes('identitytoolkit.googleapis.com') ||
      url.includes('securetoken.googleapis.com') ||
      url.includes('gstatic.com/firebasejs')) {
    return;
  }

  /* Network-first for everything: try network, fall back to cache */
  event.respondWith(
    fetch(event.request).then(function (response) {
      /* Cache the fresh response for offline use */
      var clone = response.clone();
      caches.open(CACHE_NAME).then(function (cache) {
        cache.put(event.request, clone);
      });
      return response;
    }).catch(function () {
      return caches.match(event.request);
    })
  );
});
