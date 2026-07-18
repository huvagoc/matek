/* Magyar Iskolai Kvízek — offline service worker
 *
 * Precaches the wrapper, all grade pages and icons so that every navigation
 * (including index → gradeX) works with zero network after the first visit.
 *
 * IMPORTANT: bump CACHE (v1 → v2 → …) whenever you change ANY cached file,
 * then redeploy. Otherwise returning visitors keep serving the old cached
 * version. Changing this file is what triggers the update.
 */
const CACHE = 'matek-v18';

const FILES = [
  './',
  'index.html',
  'grade3.html',
  'grade4.html',
  'grade5.html',
  'grade6.html',
  'grade7.html',
  'grade8.html',
  'grade9.html',
  'grade10.html',
  'grade11.html',
  'grade12.html',
  'kozepszint.html',
  'emelt.html',
  'manifest.json',
  'favicon.svg',
  'favicon.ico',
  'favicon-512.png',
  'apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle same-origin GET requests. Cross-origin calls (GoatCounter
  // analytics, support links, etc.) pass straight through to the network and
  // simply fail silently when offline — they never block the app.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Runtime-cache anything same-origin we didn't precache.
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => cached); // offline and not cached → let it fail
    })
  );
});
