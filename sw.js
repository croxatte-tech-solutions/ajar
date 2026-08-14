// Minimal offline app-shell cache. Deliberately leaves Firebase/gstatic
// requests alone (network-only) — caching those could serve stale data or
// break CDN version pinning, and they already fail gracefully offline.
// ponytail: app-shell-only cache, no runtime asset versioning strategy —
// bump CACHE_NAME by hand when index.html changes meaningfully.
const CACHE_NAME = 'rle-shell-v1';
const SHELL_FILES = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Only handle same-origin app-shell requests — everything else
  // (Firestore, the Firebase CDN, anything cross-origin) goes straight
  // to the network, untouched.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
  );
});
