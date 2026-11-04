// Service Worker for DhaanTrack PWA
const CACHE_NAME = 'dhaantrack-cache-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './assets/css/style.css',
  './assets/js/app.js',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event (Network First, falling back to cache)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;
  if (url.includes('firebase') || url.includes('googleapis') || url.includes('gstatic')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
