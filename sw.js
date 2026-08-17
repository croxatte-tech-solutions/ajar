// Minimal offline app-shell cache. Deliberately leaves Firebase/gstatic
// requests alone (network-only) — caching those could serve stale data or
// break CDN version pinning, and they already fail gracefully offline.
// ponytail: app-shell-only cache, no runtime asset versioning strategy —
// bump CACHE_NAME by hand when index.html changes meaningfully.
const CACHE_NAME = 'ajar-shell-v2';
// Audio lives in its own cache that is NOT wiped when the shell version
// changes. Clips are content-addressed, so a shipped app update never
// invalidates them -- a student should not lose audio they already have
// just because index.html was fixed.
const AUDIO_CACHE = 'ajar-audio-v1';
const SHELL_FILES = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    // no-store, so this cache is filled from the network and never from
    // whatever the HTTP cache is holding — otherwise the offline fallback can
    // be seeded with a copy that is already stale.
    //
    // The original reason was GitHub Pages forcing max-age=600 on every file.
    // The app is on Cloudflare Pages now and _headers sets no-cache on the
    // shell, so that specific pressure is gone; this stays because "the
    // offline copy is the real latest deploy" should not depend on a host's
    // cache policy staying the way it is today.
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(SHELL_FILES.map(url => new Request(url, { cache: 'no-store' })))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    // Drop superseded SHELL caches only. The audio cache must survive an
    // app update, or every student would silently re-download all their
    // clips the first time they opened the app after any code change.
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME && n !== AUDIO_CACHE).map(n => caches.delete(n)))
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

  // Pre-rendered audio clips are CACHE-FIRST. Their filenames are a hash
  // of the sentence they contain, so a given file's contents can never
  // change -- once a student has a clip there is no reason to ever fetch
  // it again. Serving these network-first (as everything else is) would
  // re-download the audio on every single play and burn the student's
  // mobile data for nothing.
  if (url.pathname.includes('/audio/')) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(AUDIO_CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      }))
    );
    return;
  }

  event.respondWith(
    // The app shell stays network-first with no-store: never let an HTTP
    // cache decide what "latest" means, so a fix reaches students
    // immediately. (Written against GitHub Pages' forced 10-minute cache;
    // the app is on Cloudflare Pages now, where _headers sets no-cache, and
    // the rule is worth keeping either way.) Offline support is untouched --
    // the
    // .catch() below still falls back to this service worker's OWN cache
    // (a separate mechanism from the HTTP cache), so a real network
    // outage still serves the last-cached shell.
    fetch(event.request, { cache: 'no-store' })
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
  );
});
