// Minimal offline app-shell cache. Deliberately leaves Firebase/gstatic
// requests alone (network-only) — caching those could serve stale data or
// break CDN version pinning, and they already fail gracefully offline.
// ponytail: app-shell-only cache, no runtime asset versioning strategy —
// bump CACHE_NAME by hand when index.html changes meaningfully.
const CACHE_NAME = 'rle-shell-v2';
const SHELL_FILES = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    // GitHub Pages sends "Cache-Control: max-age=600" on every file, which
    // the browser's normal fetch() would happily honor -- populating this
    // offline-fallback cache with a copy that could already be stale.
    // no-store bypasses that so the shell we cache here is always the real
    // latest deploy, not whatever the last 10-minute window had.
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(SHELL_FILES.map(url => new Request(url, { cache: 'no-store' })))
    )
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
    // Same reasoning as the install-time fetch above: never let GitHub
    // Pages' 10-minute HTTP cache decide what "latest" means. Offline
    // support is untouched -- the .catch() below still falls back to this
    // service worker's OWN cache (a separate mechanism from HTTP cache),
    // so a real network outage still serves the last-cached shell.
    fetch(event.request, { cache: 'no-store' })
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
  );
});
