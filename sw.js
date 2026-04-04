/**
 * Meryem App — Service Worker
 * Offline caching for PWA support. Firebase handles its own caching.
 */

var CACHE_NAME = 'meryem-v3';
var ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/data.js',
  './js/firebase.js',
  './js/map.js',
  './js/daily.js',
  './img/heart.svg',
  './manifest.json'
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

  /* Network-first for map tiles */
  if (url.includes('tile.openstreetmap.org')) {
    event.respondWith(
      fetch(event.request).catch(function () {
        return caches.match(event.request);
      })
    );
    return;
  }

  /* Cache-first for app assets */
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return cached || fetch(event.request);
    })
  );
});
