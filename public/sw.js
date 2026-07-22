/* TOTP Generator service worker — offline shell cache */
const CACHE = 'totp-generator-v4.1.0';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/assets/vue-3.4.20.global.prod.js',
  './js/assets/otpauth-9.1.3.min.js',
  './js/assets/clipboard-2.0.6.min.js',
  './js/assets/qrcodejs.min.js',
  './manifest.webmanifest',
  './favicon.ico',
  './favicon.svg',
  './humans.txt',
  './img/favicon-16.png',
  './img/favicon-32.png',
  './img/favicon-48.png',
  './img/apple-touch-icon.png',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/icon-192.svg',
  './img/icon-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) =>
        Promise.all(
          ASSETS.map((url) =>
            cache.add(url).catch(() => {
              /* skip missing optional assets */
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && new URL(req.url).origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    })
  );
});
