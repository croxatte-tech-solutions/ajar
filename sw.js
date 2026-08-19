// Minimal offline app-shell cache. Deliberately leaves Firebase/gstatic
// requests alone (network-only) — caching those could serve stale data or
// break CDN version pinning, and they already fail gracefully offline.
// KNOWN CEILING: app-shell-only cache, no runtime asset versioning strategy —
// bump CACHE_NAME by hand when index.html changes meaningfully.
//
// That bump used to be a step a human had to remember, with nothing watching
// for the day it was forgotten. It is now watched: the stamp below records
// which index.html this CACHE_NAME was cut for, and
// scripts/check_cache_freshness.js fails when the page has drifted past a
// measured budget without this name moving. The stamp lives HERE, three lines
// from the name it belongs to, so the two things that must change together
// are one hunk and a merge conflict lands where somebody has to read it.
//
// Bumping the version means replacing both lines. The check prints the exact
// replacement when it fails — do not work the hash out by hand.
const CACHE_NAME = 'ajar-shell-v8';
// @shell-stamp cache=ajar-shell-v8 bytes=1155196 sha256=1d6789381629757ef498b0cb6c9da0305b53d2a7637a33fc81edc1c6bf67cecb
// Audio lives in its own cache that is NOT wiped when the shell version
// changes. Clips are content-addressed, so a shipped app update never
// invalidates them -- a student should not lose audio they already have
// just because index.html was fixed.
const AUDIO_CACHE = 'ajar-audio-v1';
// The sentence and the words of the day: one small file per month of the
// year, fetched the first time that month is shown. Its own cache, spared by
// activate for the same reason the audio is -- a month already downloaded
// should not be lost because index.html was fixed, and the first visit of a
// new month is exactly the visit most likely to happen on a bad connection.
const DAILY_CACHE = 'ajar-daily-v1';
const SHELL_FILES = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png',
  // A marca. Estava faltando: o logo aparece na tela de boas-vindas e no
  // cabeçalho, e offline vinha como imagem quebrada — a mesma perda de
  // identidade que o comentário das fontes abaixo descreve, pelo mesmo
  // motivo, no mesmo dia. Encontrado por check_cache_freshness.js, que
  // compara esta lista com tudo que o index.html pede da própria origem.
  './logo.svg',
  // As duas webfonts self-hosted. Precisam estar AQUI: sem elas no shell,
  // o app abre offline com a fonte de fallback e a identidade some
  // exatamente na aula em que o wi-fi da escola caiu.
  './fonts/baloo2-latin.woff2', './fonts/nunitosans-latin.woff2'];

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
      Promise.all(names
        .filter(n => n !== CACHE_NAME && n !== AUDIO_CACHE && n !== DAILY_CACHE)
        .map(n => caches.delete(n)))
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

  // The month's sentences and words are CACHE-FIRST, then revalidated behind
  // the student's back. Cache-first because the second visit must not wait on
  // a school network to draw the top of the page, and because the file has to
  // be there when there is no network at all.
  //
  // The revalidation is the difference from the audio, and it matters: clips
  // are named after a hash of their own contents, so a clip can never change
  // and is never re-fetched. 09.json keeps its name when a quote inside it is
  // corrected. Cache-first alone would mean a corrected quote never reaching
  // a student who already had the file -- stale forever, silently, which is
  // the failure the whole shell policy exists to prevent. So the cached copy
  // is served now and a fresh copy is fetched to replace it for tomorrow.
  if (url.pathname.includes('/daily/')) {
    event.respondWith(
      caches.open(DAILY_CACHE).then(cache => cache.match(event.request).then(cached => {
        const fresh = fetch(event.request, { cache: 'no-store' }).then(response => {
          if (response.ok) {
            // A phone with no room left loses the offline copy and nothing
            // else: the response was already handed back above.
            cache.put(event.request, response.clone()).catch(() => {});
          }
          return response;
        });
        // Offline with a copy already here: serve it, and swallow the failed
        // revalidation rather than leaving a rejected promise nobody handles.
        if (cached) { fresh.catch(() => {}); return cached; }
        // Nothing cached and nothing reachable: let the failure through. The
        // page hides the band and the rest of the screen is untouched.
        return fresh;
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
    (async () => {
      const network = fetch(event.request, { cache: 'no-store' }).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy).catch(() => {}));
        return response;
      });

      // WHY THERE IS A CLOCK HERE AT ALL.
      // .catch() only runs when the fetch REJECTS. A network that accepts the
      // connection and then never answers -- a captive portal, or thirty
      // phones on one classroom access point -- does not reject. It hangs,
      // and the browser's own timeout is tens of seconds to minutes. All that
      // time the offline copy is sitting in the cache, untouched. That is the
      // worst shape this failure can take: we have the answer and do not hand
      // it over.
      const cached = await caches.match(event.request);

      // First visit, nothing cached: there is nothing to fall back TO, so
      // waiting beats answering with nothing. No clock on this path.
      if (!cached) {
        return network.catch(() => caches.match('./index.html'));
      }

      // Three seconds, measured rather than picked: index.html is ~275 KiB
      // compressed, which at 100 KB/s is about 2.8s. Three seconds says "this
      // network is answering badly", not "this network is slow".
      const late = new Promise(resolve => setTimeout(() => resolve(null), 3000));
      const first = await Promise.race([network.catch(() => null), late]);

      // Either way the fetch keeps running and updates the cache behind us,
      // so serving the cached copy costs at most one visit of staleness --
      // and the shell stamp means the cached copy is not three weeks old.
      network.catch(() => {});
      return first || cached;
    })()
  );
});
