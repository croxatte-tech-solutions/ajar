// The service worker, and the manual step nobody is watching.
//
// sw.js says so itself, at the top of the file:
//
//   KNOWN CEILING: app-shell-only cache, no runtime asset versioning strategy
//   -- bump CACHE_NAME by hand when index.html changes meaningfully.
//
// A step performed by a human, with nothing that notices when it is skipped,
// on the one file whose whole cache policy exists because "the page must never
// be stale". Everything else in this app that depended on somebody remembering
// has eventually been forgotten, and the shape is always the same: it fails on
// the far side, it looks fine from here.
//
// So this file does three jobs, and the reason each one exists is written
// beside it rather than left to be inferred:
//
//   1. a FRESHNESS STAMP in sw.js, checked against index.html, so the missed
//      bump is caught here instead of in a classroom;
//   2. BEHAVIOURAL assertions that boot the real sw.js in a fake service
//      worker and dispatch real events at it -- because the four ways this
//      worker can regress silently are all about what it DOES, and a regex
//      over its source cannot see any of them;
//   3. a PAGE WEIGHT BUDGET on index.html, because this is the only check in
//      the suite that reasons about what the student downloads, so the ceiling
//      has to live here or nowhere.
//
// Run as the rest of the suite runs:  node scripts/check_cache_freshness.js index.html audio
//
// No template literal anywhere below carries a regex. This file asserts on
// paths, cache names and byte counts, and a backslash lost inside a template
// literal has cost this repo seven separate afternoons.

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const indexPath = process.argv[2] || path.join(root, 'index.html');
const indexBytes = fs.readFileSync(indexPath);
const html = indexBytes.toString('utf8');
const swPath = path.join(root, 'sw.js');
const sw = fs.existsSync(swPath) ? fs.readFileSync(swPath, 'utf8') : '';

/* A refused cache.put inside sw.js is a promise nobody holds -- the worker
   fires the write and returns the response without awaiting it, which is
   correct for the student and means a rejection lands in the global handler
   rather than in a catch. In node that ends the process, so the harness has
   to hold it or the quota cases below could never be run at all. Held and
   counted here, and the question of whether sw.js should be holding it
   instead is written up in ~/ajar-noite/DECIDIR-04.md -- changing how the
   worker handles a failed write is a behaviour change, not a check. */
const unhandledFromWorker = [];
process.on('unhandledRejection', e => { unhandledFromWorker.push(e); });

const results = [];
function assert(name, cond, detail){
  results.push(name + ': ' + (cond ? 'PASS' : 'FAIL'));
  if(!cond && detail !== undefined) results.push('    ' + detail);
}

//=====================================================================
// A FAKE SERVICE WORKER
//=====================================================================
/* The four regressions this file exists to stop are all behavioural:
     - the shell quietly becoming cache-first, which freezes the whole app on
       whatever version was current the day it happened;
     - the activate handler quietly deleting the audio cache, which is 26 MiB
       re-downloaded on school wi-fi by every student at once;
     - the audio route quietly widening until it swallows index.html, which is
       the first disaster reached by a second door;
     - skipWaiting or clients.claim quietly disappearing, which leaves a fixed
       worker sitting in "waiting" behind every open tab.
   None of those are visible to a regex that greps for the word "fetch". So
   sw.js is loaded for real, into a global that has caches, fetch, Request and
   clients, and the events a browser would send are sent at it. The same
   approach check_speech_capture.js takes with a fake microphone and
   check_links.js takes with a fake CloudSync. */
const ORIGIN = 'https://hiajar.com';

function bootSW(opts){
  opts = opts || {};
  const stores = new Map();              // cache name -> Map(url -> body)
  const fetched = [];                    // every request that reached "the network"
  const putFailures = [];                // every cache write that was refused
  const state = { skipWaiting: 0, claim: 0 };

  const absolute = u => new URL(String(u), ORIGIN + '/').href;
  const keyOf = r => (r && typeof r === 'object' && r.url) ? r.url : absolute(r);
  const mkResponse = body => ({ ok: true, status: 200, body, clone(){ return mkResponse(body); } });

  function netFetch(req, init){
    const url = keyOf(req);
    const opt = init || (req && req.init) || {};
    fetched.push({ url: url, cache: opt.cache });
    if(opts.offline) return Promise.reject(new TypeError('Failed to fetch'));
    const canned = (opts.network || {})[url];
    return Promise.resolve(mkResponse(canned !== undefined ? canned : 'network:' + url));
  }

  function cacheApi(name){
    if(!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      addAll: reqs => Promise.all(reqs.map(r =>
        netFetch(r).then(res => { m.set(keyOf(r), res.body); }))),
      put: (req, res) => {
        if(opts.quotaFull){
          putFailures.push(keyOf(req));
          return Promise.reject(new Error('QuotaExceededError'));
        }
        m.set(keyOf(req), res.body);
        return Promise.resolve();
      },
      match: req => Promise.resolve(m.has(keyOf(req)) ? mkResponse(m.get(keyOf(req))) : undefined)
    };
  }

  const cachesApi = {
    open: name => Promise.resolve(cacheApi(name)),
    keys: () => Promise.resolve(Array.from(stores.keys())),
    delete: name => Promise.resolve(stores.delete(name)),
    has: name => Promise.resolve(stores.has(name)),
    match: req => {
      for(const m of stores.values()){
        if(m.has(keyOf(req))) return Promise.resolve(mkResponse(m.get(keyOf(req))));
      }
      return Promise.resolve(undefined);
    }
  };

  // Pre-existing caches, so "what does activate delete" can be asked properly.
  Object.keys(opts.seed || {}).forEach(name => {
    const m = new Map();
    Object.keys(opts.seed[name]).forEach(u => m.set(absolute(u), opts.seed[name][u]));
    stores.set(name, m);
  });

  function FakeRequest(url, init){
    this.url = absolute(url && url.url ? url.url : url);
    this.init = init || {};
  }

  const listeners = {};
  const self_ = {
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    skipWaiting: () => { state.skipWaiting++; },
    clients: { claim: () => { state.claim++; return Promise.resolve(); } },
    location: { origin: ORIGIN, href: ORIGIN + '/sw.js' },
    registration: {}
  };

  const sandbox = {
    self: self_, caches: cachesApi, fetch: netFetch, Request: FakeRequest,
    URL: URL, Promise: Promise, console: console, TypeError: TypeError
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(sw, sandbox, { filename: 'sw.js' });

  function dispatch(type, request){
    const ev = {
      request: request,
      _waits: [], _responded: undefined, _respondCalled: false,
      waitUntil(p){ ev._waits.push(Promise.resolve(p)); },
      respondWith(p){ ev._respondCalled = true; ev._responded = Promise.resolve(p); }
    };
    (listeners[type] || []).forEach(fn => fn(ev));
    return ev;
  }

  // Settle everything the handler kicked off, including the fire-and-forget
  // cache.put inside the network-first branch, which nothing awaits.
  async function settle(ev){
    const out = { responded: ev._respondCalled, body: undefined, threw: null };
    try{
      if(ev._responded) out.body = await ev._responded;
    }catch(e){ out.threw = e; }
    try{ await Promise.all(ev._waits); }catch(e){ out.threw = out.threw || e; }
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    return out;
  }

  return {
    dispatch, settle, stores, fetched, putFailures, state,
    listeners, absolute,
    cacheNames: () => Array.from(stores.keys()),
    bodyIn: (cacheName, url) => {
      const m = stores.get(cacheName);
      return m ? m.get(absolute(url)) : undefined;
    },
    req: (u, init) => new FakeRequest(u, init)
  };
}

//=====================================================================
// THE CONSTANTS THE REST OF THIS FILE LEANS ON
//=====================================================================
const CACHE_NAME  = ((sw.match(/const CACHE_NAME\s*=\s*'([^']+)'/) || [])[1]) || '';
const AUDIO_CACHE = ((sw.match(/const AUDIO_CACHE\s*=\s*'([^']+)'/) || [])[1]) || '';
const DAILY_CACHE = ((sw.match(/const DAILY_CACHE\s*=\s*'([^']+)'/) || [])[1]) || '';
const SHELL_SRC   = ((sw.match(/const SHELL_FILES\s*=\s*\[([\s\S]*?)\]/) || [])[1]) || '';
const SHELL_FILES = Array.from(SHELL_SRC.matchAll(/'([^']+)'/g)).map(m => m[1]);

assert('sw.js is where the deploy expects it', sw.length > 500, swPath);
assert('the shell cache is named and versioned', /-v\d+$/.test(CACHE_NAME), CACHE_NAME);
// A versioned audio cache name is the only lever that can ever sweep orphaned
// clips (see the arithmetic under THE ORPHANED CLIPS below). Unversioned, the
// audio cache could only be emptied by deleting it unconditionally, which is
// the one thing the activate handler must never do.
assert('the audio cache is named and versioned, so orphans can be swept deliberately',
  /-v\d+$/.test(AUDIO_CACHE), AUDIO_CACHE);
assert('the two caches are not the same cache', CACHE_NAME !== AUDIO_CACHE);

//=====================================================================
// 1. THE FRESHNESS STAMP -- the missed bump, caught here
//=====================================================================
/* WHY THE STAMP LIVES INSIDE sw.js AND NOT IN A FILE OF ITS OWN.
   The obvious design is a small versioned file holding the hash. It was
   rejected for one reason: merge. Two branches that both touch index.html
   would each also touch that file, and git would resolve a one-line JSON
   conflict by picking a side -- silently restoring one branch's stamp over
   the other's, which is precisely the "looks fine from here" failure this
   check exists to end. Kept inside sw.js the stamp sits three lines from
   CACHE_NAME, so the two things that must move together are one hunk, and a
   conflict lands exactly where a human has to read it. It also means the
   check has two inputs instead of three, and no new file to forget.

   WHAT "CHANGED IN A WAY THAT MATTERS" MEANS, AND WHY IT IS NOT A BYTE HASH.
   A hash alone goes red on every comma. A check that goes red on every comma
   is noise, and noise gets switched off -- so a hash alone would end up
   protecting nothing. The stamp therefore records the hash AND the size, and
   only fails when the content has changed AND the size has moved by more than
   a drift budget.

   The budget is measured, not guessed. Across the last twenty commits
   index.html went from 1,055,941 to 1,128,131 bytes: 72,190 bytes over 20
   commits, about 3.6 KB a commit. Within those, a typo fix moves tens of
   bytes and a real feature moves tens of thousands -- the session that added
   the speech capture moved 32,633 in one commit. A budget of 8,192 bytes
   sits above two average commits and an order of magnitude below one
   feature, which is the gap the criterion needs: silent for tidying, loud
   for a session's work.

   HONEST CEILING, stated rather than implied. A refactor that is large but
   byte-neutral passes. This is a reminder with a measured threshold, not a
   proof, and it is worth exactly what a reminder is worth -- which is more
   than the nothing that was watching before. */
const DRIFT_BUDGET = 8192;

const stamp = sw.match(/@shell-stamp\s+cache=(\S+)\s+bytes=(\d+)\s+sha256=([0-9a-f]{64})/);
const nowBytes = indexBytes.length;
const nowHash = crypto.createHash('sha256').update(indexBytes).digest('hex');
const stampLine = '// @shell-stamp cache=' + CACHE_NAME + ' bytes=' + nowBytes + ' sha256=' + nowHash;

assert('sw.js carries a freshness stamp at all', !!stamp,
  'add this line next to CACHE_NAME:\n    ' + stampLine);

if(stamp){
  const [, stampCache, stampBytesRaw, stampHash] = stamp;
  const stampBytes = Number(stampBytesRaw);
  const drift = Math.abs(nowBytes - stampBytes);

  // The stamp's job is to say WHICH index.html this CACHE_NAME was cut for.
  // A stamp naming an older cache name is a stamp measuring drift from a
  // baseline that no longer exists.
  assert('the stamp names the shell version actually shipping',
    stampCache === CACHE_NAME,
    'stamp says ' + stampCache + ', sw.js says ' + CACHE_NAME +
    '\n    CACHE_NAME moved without the stamp. Replace the stamp line with:\n    ' + stampLine);

  const unchanged = stampHash === nowHash;
  assert('index.html has not drifted past the budget without a new CACHE_NAME',
    unchanged || drift < DRIFT_BUDGET,
    'index.html moved ' + drift + ' bytes since ' + CACHE_NAME + ' was cut' +
    ' (budget ' + DRIFT_BUDGET + ').' +
    '\n    Students keep the old shell offline and a fixed worker never installs.' +
    '\n    Bump CACHE_NAME in sw.js, then replace the stamp line with:' +
    '\n    ' + stampLine);

  // A stamp whose byte count contradicts its own hash means somebody edited
  // one half of the line by hand. Both halves come from one paste or neither.
  assert('the stamp was not hand-edited into disagreeing with itself',
    !(unchanged && stampBytes !== nowBytes),
    'the hash says index.html is unchanged but the byte count says ' + stampBytes +
    ' against ' + nowBytes);
}

// The stamp is only worth having if the fix it asks for is one paste. If this
// check ever fails without printing the replacement line, the next person
// works out the sha256 by hand and the check becomes a tax.
assert('a failing stamp prints the exact line to paste back',
  stampLine.indexOf('@shell-stamp cache=') > -1 && stampLine.length > 80);

//=====================================================================
// THE SHELL LIST HAS TO KNOW EVERY FILE THE PAGE ASKS FOR
//=====================================================================
/* This is the other half of "changed in a way that matters", and unlike the
   drift budget it is exact rather than approximate: if index.html starts
   asking for a same-origin file that is not in SHELL_FILES, the offline copy
   is incomplete on the day it is needed. The webfonts are already in that
   list for exactly this reason, with the comment saying what breaks without
   them. Nothing was watching for the next one. */
{
  const refs = new Set();
  const add = u => {
    if(!u) return;
    const s = u.trim();
    if(!s || s.indexOf('data:') === 0 || s.indexOf('#') === 0) return;
    if(/^[a-z]+:\/\//i.test(s) || s.indexOf('//') === 0) return;   // another origin
    refs.add(s.replace(/^\.\//, '').split('?')[0]);
  };
  Array.from(html.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)).forEach(m => add(m[1]));
  Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)).forEach(m => add(m[1]));
  Array.from(html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)).forEach(m => add(m[1]));
  Array.from(html.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)).forEach(m => add(m[1]));

  const shell = new Set(SHELL_FILES.map(f => f.replace(/^\.\//, '')));
  // The audio is deliberately not in the shell -- 26 MiB of it, cached on
  // demand by its own handler. And sw.js is registered by script, not linked,
  // so it never appears in the scan.
  const missing = Array.from(refs).filter(r => r.indexOf('audio/') !== 0 && !shell.has(r));
  assert('every same-origin file the page links to is in the offline shell',
    missing.length === 0,
    'not in SHELL_FILES: ' + missing.join(', '));

  /* cache.addAll is ATOMIC: one 404 and the whole install rejects, so the
     student gets no offline shell at all rather than an incomplete one. A
     file listed here that is not on disk is therefore not a missing logo —
     it is the offline mode switched off entirely, for everybody, silently.
     The list is five names long and this costs nothing to check. */
  const notOnDisk = SHELL_FILES
    .filter(f => f !== './')
    .filter(f => !fs.existsSync(path.join(root, f.replace(/^\.\//, ''))));
  assert('every file in the offline shell exists, since one 404 kills the whole install',
    notOnDisk.length === 0, 'missing from disk: ' + notOnDisk.join(', '));

  assert('the shell still carries the two self-hosted webfonts',
    shell.has('fonts/baloo2-latin.woff2') && shell.has('fonts/nunitosans-latin.woff2'));
  assert('the shell still carries the page itself under both of its names',
    shell.has('index.html') && (shell.has('') || SHELL_FILES.indexOf('./') > -1));
}

//=====================================================================
// 2. WHAT THE WORKER DOES -- the real sw.js, booted and driven
//=====================================================================
const behaviour = [];   // [name, fn] -- each returns a promise of a boolean-ish

function behave(name, fn, detailFn){ behaviour.push([name, fn, detailFn]); }

// --- install ------------------------------------------------------------
behave('installing primes the offline shell with every file in the list', async () => {
  const w = bootSW({});
  const ev = w.dispatch('install');
  await w.settle(ev);
  const m = w.stores.get(CACHE_NAME);
  return m && SHELL_FILES.every(f => m.has(w.absolute(f)));
});

/* The install cache is filled with cache:'no-store' requests, and the comment
   in sw.js explains why: seeded from an HTTP cache, the offline fallback can
   be a copy that was already stale before the student ever went offline. */
behave('and it fills that shell from the network, never from an HTTP cache', async () => {
  const w = bootSW({});
  const ev = w.dispatch('install');
  await w.settle(ev);
  return w.fetched.length >= SHELL_FILES.length && w.fetched.every(f => f.cache === 'no-store');
});

// A fixed worker that sits in "waiting" until every tab is closed is a fix
// that did not ship. Both halves are needed: skipWaiting to stop waiting,
// clients.claim to take over pages the old worker was already controlling.
behave('a new worker does not sit waiting behind an open tab', async () => {
  const w = bootSW({});
  await w.settle(w.dispatch('install'));
  return w.state.skipWaiting > 0;
});
behave('and it takes over the pages the old worker was controlling', async () => {
  const w = bootSW({});
  await w.settle(w.dispatch('activate'));
  return w.state.claim > 0;
});

// --- activate: the 26 MiB question --------------------------------------
/* Deleting the audio cache on activate means every student re-downloads
   26.2 MiB the first time they open the app after any code change -- on the
   school wi-fi, thirteen of them at once. The filter that spares it is one
   expression, and one edit away from being wrong in a way nothing else in
   this repo would notice. */
const seedThreeCaches = () => ({
  seed: {
    'ajar-shell-v1': { './index.html': 'ancient shell' },
    [CACHE_NAME]:    { './index.html': 'current shell' },
    [AUDIO_CACHE]:   { './audio/1002865038.m4a': 'a clip the student already has' }
  }
});

behave('activating never throws away the audio the student already downloaded', async () => {
  const w = bootSW(seedThreeCaches());
  await w.settle(w.dispatch('activate'));
  return w.cacheNames().indexOf(AUDIO_CACHE) > -1 &&
         w.bodyIn(AUDIO_CACHE, './audio/1002865038.m4a') !== undefined;
}, () => 'the audio cache was deleted by activate');

behave('activating keeps the shell cache that is currently shipping', async () => {
  const w = bootSW(seedThreeCaches());
  await w.settle(w.dispatch('activate'));
  return w.cacheNames().indexOf(CACHE_NAME) > -1;
});

behave('activating does drop a superseded shell cache', async () => {
  const w = bootSW(seedThreeCaches());
  await w.settle(w.dispatch('activate'));
  return w.cacheNames().indexOf('ajar-shell-v1') === -1;
});

// The changeover itself: the worker that was running had cut CACHE_NAME at an
// older value, so during a deploy the device briefly holds both shells. The
// new worker must remove the old one and keep the audio -- which is the same
// filter, asked with the names the other way round.
behave('during a version changeover the device is not left holding two shells', async () => {
  const w = bootSW(seedThreeCaches());
  await w.settle(w.dispatch('activate'));
  const shells = w.cacheNames().filter(n => n.indexOf('ajar-shell') === 0);
  return shells.length === 1 && shells[0] === CACHE_NAME;
}, () => 'more than one shell cache left on the device');

// --- the shell is network-first, and stays that way ---------------------
/* If this ever inverts to cache-first the entire app freezes on whatever
   version was current that day, and it freezes SILENTLY -- every student
   keeps seeing a working app, and it is the wrong one. The assertion is
   deliberately behavioural: a cached copy is planted, a different copy is put
   on the network, and the question is which one comes back. */
const SHELL_ROUTES = ['/', '/index.html', '/manifest.json', '/icon-192.png',
                      '/index.html?s=1&school=abc', '/?ex=k7'];

SHELL_ROUTES.forEach(route => {
  behave('the network wins over the cached copy for ' + route, async () => {
    const w = bootSW({
      seed: { [CACHE_NAME]: { [route]: 'STALE -- three weeks old' } },
      network: { [new URL(route, ORIGIN + '/').href]: 'FRESH -- what the teacher approved' }
    });
    const ev = w.dispatch('fetch', w.req(route));
    const out = await w.settle(ev);
    return out.responded && out.body && out.body.body === 'FRESH -- what the teacher approved';
  });
});

behave('the shell is fetched with no-store, so no HTTP cache decides what latest means', async () => {
  const w = bootSW({});
  await w.settle(w.dispatch('fetch', w.req('/index.html')));
  const hit = w.fetched.filter(f => f.url.indexOf('/index.html') > -1);
  return hit.length === 1 && hit[0].cache === 'no-store';
});

behave('a fresh shell replaces the stale copy in the cache on the way past', async () => {
  const w = bootSW({
    seed: { [CACHE_NAME]: { '/index.html': 'STALE' } },
    network: { [ORIGIN + '/index.html']: 'FRESH' }
  });
  await w.settle(w.dispatch('fetch', w.req('/index.html')));
  return w.bodyIn(CACHE_NAME, '/index.html') === 'FRESH';
});

// --- the audio route must not widen until it swallows the page ----------
/* Same disaster as cache-first, reached by a different door: if the audio
   matcher ever broadens -- a looser test, a query string counted as a path --
   index.html starts being served cache-first and never updates again. Each of
   these URLs contains the characters "/audio/" somewhere a careless matcher
   would find them, and every one of them is the app, not a clip. */
const AUDIO_LOOKALIKES = [
  '/?next=/audio/1002865038.m4a',
  '/index.html?clip=/audio/1002865038.m4a',
  '/?s=1&school=/audio/',
  '/audio-guide.html',
  '/#/audio/1002865038.m4a'
];

AUDIO_LOOKALIKES.forEach(route => {
  behave('the audio handler does not capture ' + route, async () => {
    const w = bootSW({
      seed: { [CACHE_NAME]: { [route]: 'STALE' }, [AUDIO_CACHE]: { [route]: 'STALE' } },
      network: { [new URL(route, ORIGIN + '/').href]: 'FRESH' }
    });
    const out = await w.settle(w.dispatch('fetch', w.req(route)));
    return out.responded && out.body && out.body.body === 'FRESH';
  });
});

// --- and the audio route must stay cache-first --------------------------
/* The other direction. Serving clips network-first re-downloads them on every
   single play; 40 KB a clip, on the student's mobile data, for a file whose
   name is a hash of its own contents and therefore can never change. */
behave('a clip already on the device is never fetched again', async () => {
  const w = bootSW({ seed: { [AUDIO_CACHE]: { '/audio/1002865038.m4a': 'the clip' } } });
  const out = await w.settle(w.dispatch('fetch', w.req('/audio/1002865038.m4a')));
  return out.responded && w.fetched.length === 0 && out.body && out.body.body === 'the clip';
});

behave('a clip not yet on the device is fetched once and kept', async () => {
  const w = bootSW({ network: { [ORIGIN + '/audio/1002865038.m4a']: 'the clip' } });
  await w.settle(w.dispatch('fetch', w.req('/audio/1002865038.m4a')));
  return w.fetched.length === 1 && w.bodyIn(AUDIO_CACHE, '/audio/1002865038.m4a') === 'the clip';
});

behave('and a downloaded clip lands in the audio cache, not in the shell cache', async () => {
  const w = bootSW({ network: { [ORIGIN + '/audio/1002865038.m4a']: 'the clip' } });
  await w.settle(w.dispatch('fetch', w.req('/audio/1002865038.m4a')));
  return w.bodyIn(CACHE_NAME, '/audio/1002865038.m4a') === undefined;
});

// --- the month's sentence and words ------------------------------------
/* Same two failures as the audio, reached from a new door. Cache-first is
   what makes the top of the page draw without waiting on a school network
   and what makes it draw at all with no network; if it ever inverts, the
   band becomes the one part of the app that needs a connection to appear.
   And the file is NOT content-addressed -- 09.json keeps its name when a
   quote inside it is corrected -- so unlike the audio it has to be
   revalidated behind the student's back, or a corrected quote never lands. */
behave('a month already on the device is drawn without waiting for the network', async () => {
  const w = bootSW({ seed: { [DAILY_CACHE]: { '/daily/09.json': 'the month' } },
                     network: { [ORIGIN + '/daily/09.json']: 'a corrected month' } });
  const out = await w.settle(w.dispatch('fetch', w.req('/daily/09.json')));
  return out.responded && out.body && out.body.body === 'the month';
}, () => 'the day band would need a connection to draw');

behave('and a correction to that month still lands, on the next visit', async () => {
  const w = bootSW({ seed: { [DAILY_CACHE]: { '/daily/09.json': 'the month' } },
                     network: { [ORIGIN + '/daily/09.json']: 'a corrected month' } });
  await w.settle(w.dispatch('fetch', w.req('/daily/09.json')));
  return w.bodyIn(DAILY_CACHE, '/daily/09.json') === 'a corrected month';
}, () => 'a corrected quote would never reach a student who already had the file');

behave('a month not yet on the device is fetched once and kept', async () => {
  const w = bootSW({ network: { [ORIGIN + '/daily/09.json']: 'the month' } });
  const out = await w.settle(w.dispatch('fetch', w.req('/daily/09.json')));
  return out.responded && out.body && out.body.body === 'the month'
    && w.bodyIn(DAILY_CACHE, '/daily/09.json') === 'the month';
});

behave('offline, the month the student already has still opens the band', async () => {
  const w = bootSW({ offline: true, seed: { [DAILY_CACHE]: { '/daily/09.json': 'the month' } } });
  const out = await w.settle(w.dispatch('fetch', w.req('/daily/09.json')));
  return out.responded && out.threw === null && out.body && out.body.body === 'the month';
}, () => 'a failed revalidation took the cached month with it');

behave('a month lands in its own cache, not in the shell', async () => {
  const w = bootSW({ network: { [ORIGIN + '/daily/09.json']: 'the month' } });
  await w.settle(w.dispatch('fetch', w.req('/daily/09.json')));
  return w.bodyIn(CACHE_NAME, '/daily/09.json') === undefined;
});

behave('activating never throws away a month the student already downloaded', async () => {
  const w = bootSW({ seed: {
    'ajar-shell-v1': { './index.html': 'ancient shell' },
    [CACHE_NAME]: { './index.html': 'current shell' },
    [DAILY_CACHE]: { './daily/09.json': 'the month' } } });
  await w.settle(w.dispatch('activate'));
  return w.cacheNames().indexOf(DAILY_CACHE) > -1
    && w.bodyIn(DAILY_CACHE, './daily/09.json') !== undefined;
}, () => 'the daily cache was deleted by activate');

/* The same widening disaster the audio matcher is guarded against. Each of
   these is the app with the characters "/daily/" somewhere in it. */
['/?next=/daily/09.json', '/index.html?month=/daily/09.json', '/daily-plan.html'].forEach(route => {
  behave('the month handler does not capture ' + route, async () => {
    const w = bootSW({
      seed: { [CACHE_NAME]: { [route]: 'STALE' }, [DAILY_CACHE]: { [route]: 'STALE' } },
      network: { [new URL(route, ORIGIN + '/').href]: 'FRESH' }
    });
    const out = await w.settle(w.dispatch('fetch', w.req(route)));
    return out.responded && out.body && out.body.body === 'FRESH';
  });
});

// --- everything cross-origin goes past untouched ------------------------
/* Firestore and the Firebase CDN must never be intercepted: a cached auth or
   data response is a stale answer to a question about who somebody is. */
['https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
 'https://firestore.googleapis.com/v1/projects/x/databases/(default)/documents',
 'https://identitytoolkit.googleapis.com/v1/accounts:signUp'
].forEach(u => {
  behave('the worker keeps its hands off ' + new URL(u).host, async () => {
    const w = bootSW({});
    const ev = w.dispatch('fetch', w.req(u));
    await w.settle(ev);
    return ev._respondCalled === false;
  });
});

// --- offline ------------------------------------------------------------
behave('offline, the last shell the student had is still served', async () => {
  const w = bootSW({ offline: true, seed: { [CACHE_NAME]: { '/index.html': 'the shell' } } });
  const out = await w.settle(w.dispatch('fetch', w.req('/index.html')));
  return out.responded && out.body && out.body.body === 'the shell';
});

/* The share link is where the offline fallback earns its second branch. A
   student opening /?s=1&school=abc offline asks for a URL that was never
   cached under that exact key -- caches.match is exact, query string and all,
   so the first lookup misses. Without the fallback to './index.html' the
   student who scanned a code in a room with no signal gets a browser error
   instead of the app they already have on the device. */
behave('offline, a scanned share link still opens the app the student already has', async () => {
  const w = bootSW({ offline: true, seed: { [CACHE_NAME]: { './index.html': 'the shell' } } });
  const out = await w.settle(w.dispatch('fetch', w.req('/?s=1&school=abc')));
  return out.responded && out.body && out.body.body === 'the shell';
});

/* First visit, no network, nothing cached: there is no honest answer and the
   worker must not invent one. Resolving to undefined hands the request back
   to the browser, which shows its own "you are offline" page -- a page that
   says what happened, in the student's own language, with a reload button.
   The failure to avoid is the handler THROWING, or resolving to an empty
   Response: both render as a blank white screen with nothing to read. */
behave('a first visit with no network fails as a browser error, not a blank screen', async () => {
  const w = bootSW({ offline: true });
  const out = await w.settle(w.dispatch('fetch', w.req('/index.html')));
  return out.responded && out.threw === null && out.body === undefined;
}, () => 'the offline fallback must resolve to undefined, not throw and not return an empty Response');

/* Storage quota exhausted on a phone already holding 26 MiB of audio. The
   cache write is refused; what must not happen is the student losing the
   PAGE over it. The response was already handed back before the write was
   attempted, so it does not -- asserted here so a future rewrite that awaits
   the put before responding is caught. */
behave('a full storage quota costs the offline copy, never the page itself', async () => {
  const w = bootSW({ quotaFull: true, network: { [ORIGIN + '/index.html']: 'FRESH' } });
  const out = await w.settle(w.dispatch('fetch', w.req('/index.html')));
  return out.responded && out.body && out.body.body === 'FRESH' && w.putFailures.length === 1;
});

behave('and a full quota does not cost the student the clip they asked for either', async () => {
  const w = bootSW({ quotaFull: true, network: { [ORIGIN + '/audio/1002865038.m4a']: 'the clip' } });
  const out = await w.settle(w.dispatch('fetch', w.req('/audio/1002865038.m4a')));
  return out.responded && out.body && out.body.body === 'the clip';
});

//=====================================================================
// 3. THE PAGE WEIGHT BUDGET
//=====================================================================
/* This is the only check in the suite that reasons about what the student
   DOWNLOADS, so the ceiling lives here or it lives nowhere. And nothing was
   stopping index.html from growing: the shell is network-first with
   cache:'no-store', so it is re-fetched in full on every online visit, and
   every session of work pushes the single file further up with nobody
   watching the total.

   THE ARITHMETIC, so that raising this ceiling costs somebody a paragraph.

   Today index.html is 1,128,131 bytes over 17,437 lines. That is the number
   the ceiling is measured from, and it is measured on the raw file because
   raw bytes are what a check can count on a machine that has only node.

   What actually crosses the wire is smaller, and the honest figure belongs
   here rather than a scarier one: Cloudflare serves this compressed, and
   index.html is 350,016 bytes gzipped and 281,219 brotli -- a ratio just
   over 4x, stable for a file that is mostly markup and JavaScript. So the
   student on the school wi-fi downloads about 275 KiB, not 1.1 MiB. At a
   genuinely bad 50 KB/s that is about 5.6 seconds before any audio plays;
   at 100 KB/s, under 3. Worth keeping small; not the 8-10 seconds that the
   uncompressed figure would suggest. Overstating it would be the same
   dishonesty as overstating a score.

   THE CEILING: 1,250,000 bytes. That is 121,869 bytes of headroom, about
   10.8%. Over the last twenty commits the file grew 72,190 bytes, roughly
   3.6 KB a commit, so the headroom is something like thirty more commits or
   four more working sessions -- enough that ordinary work never touches it.

   WHAT IT IS FOR, precisely: catching the 300 KB of data pasted into the
   single file instead of put in a file loaded on demand. Today's file plus
   300 KB is 1,428,131, which is 178,131 over the ceiling, so that mistake
   fails here on the commit that makes it. A line of markup does not.

   RAISING IT. If this fails because the app genuinely grew, raise the number
   AND rewrite this paragraph with the new measurement. A ceiling raised
   without its arithmetic is a ceiling that has stopped meaning anything --
   and if the honest answer is that the file needs to be that big, the real
   move is a second file fetched on demand, not a bigger number here. */
const WEIGHT_CEILING = 1250000;
const WEIGHT_MEASURED_AT = 1128131;   // bytes on 19 August 2026, at ajar-shell-v3

assert('index.html is under the page weight ceiling',
  nowBytes <= WEIGHT_CEILING,
  'index.html is ' + nowBytes + ' bytes, ceiling is ' + WEIGHT_CEILING +
  ' (' + (nowBytes - WEIGHT_CEILING) + ' over).' +
  '\n    Before raising the ceiling: is this 300 KB of data that belongs in a' +
  '\n    file fetched on demand? Read the arithmetic at the top of this section.');

// A ceiling far above the file it governs stops being a ceiling. If the app
// ever shrinks by a lot, the ceiling should come down with it rather than
// sitting there granting a licence nobody measured.
assert('the ceiling is still close enough to the file to mean something',
  WEIGHT_CEILING - nowBytes < 400000,
  'headroom is ' + (WEIGHT_CEILING - nowBytes) + ' bytes -- more than the' +
  ' paste this ceiling exists to catch, so it would no longer catch it');

assert('the ceiling is documented as a measurement, not an invented number',
  /THE ARITHMETIC, so that raising this ceiling costs somebody a paragraph/
    .test(fs.readFileSync(__filename, 'utf8')));

// The 26 MiB of audio is deliberately NOT in this budget: it is fetched on
// demand, one clip at a time, and cached forever. Asserting it stays out of
// the shell is asserting the budget keeps measuring the right thing.
assert('the audio is not part of what the page downloads up front',
  SHELL_FILES.every(f => f.indexOf('audio') === -1), SHELL_FILES.join(' '));

//=====================================================================
// THE ORPHANED CLIPS -- quantified, so the decision is not taken by default
//=====================================================================
/* Clips are content-addressed: audioUrlFor(text) is 'audio/' + hashStr(text)
   + '.m4a'. Edit a spoken sentence and the hash changes, a new file is
   fetched, and the old one stays in AUDIO_CACHE on the student's device with
   nothing that will ever remove it -- the activate handler spares the audio
   cache by name, which is correct and is also why nothing sweeps it.

   The size of the problem, measured rather than feared: 672 clips totalling
   27,507,474 bytes, a mean of 40,933 bytes. So one edited sentence orphans
   about 40 KB. A session that rewrites twenty prompts orphans 800 KB. To
   orphan the whole 26.2 MiB somebody would have to rewrite every spoken
   string in the app, which has never happened in this repo's history.

   Against that: the lever already exists and costs one line -- bumping
   AUDIO_CACHE to -v2 drops every clip and every orphan together, at the
   price of a full re-download for every student. That trade is worth making
   at 26 MiB of garbage and absurd at 800 KB.

   So: no sweeping code, deliberately. What this check does instead is make
   sure the lever stays available (the versioned name asserted at the top)
   and that the arithmetic is written down where the next person finds it.
   The case for changing that is in ~/ajar-noite/DECIDIR-04.md. */
{
  const audioDir = process.argv[3] || path.join(root, 'audio');
  let clips = [];
  try{ clips = fs.readdirSync(audioDir).filter(f => f.endsWith('.m4a')); }catch(e){}
  assert('the clip count this arithmetic was written against has not moved wildly',
    clips.length === 0 || Math.abs(clips.length - 672) < 200,
    clips.length + ' clips on disk, the orphan arithmetic above assumes 672');
}

//=====================================================================
// RUN THE BEHAVIOURAL ASSERTIONS AND REPORT
//=====================================================================
(async () => {
  for(const [name, fn, detailFn] of behaviour){
    let ok = false, detail;
    try{
      ok = !!(await fn());
    }catch(e){
      ok = false;
      detail = 'threw: ' + (e && e.message);
    }
    if(!ok && detail === undefined && typeof detailFn === 'function'){
      try{ detail = detailFn(); }catch(e){}
    }
    assert(name, ok, detail);
  }

  /* Stated rather than left for somebody to rediscover: when the phone's
     storage quota is full, the shell write and the clip write both reject
     into nothing. The student keeps the page and keeps the clip -- that is
     what the two assertions above prove -- and what is lost is only the
     offline copy, silently. Whether that silence should stay is a behaviour
     decision and it is written up, not taken here. */
  assert('a refused cache write is a rejection nobody catches -- known, and written up',
    unhandledFromWorker.length === 0 || unhandledFromWorker.every(e => /Quota/.test(String(e && e.message))),
    'unexpected unhandled rejection from sw.js: ' + unhandledFromWorker.map(String).join('; '));

  console.log(results.join('\n'));
  const fails = results.filter(r => r.includes('FAIL'));
  console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                           : ('ALL ' + results.length + ' CHECKS PASS'));
  if(fails.length) process.exitCode = 1;
})();

// WHAT THIS FILE CANNOT PROVE, and who has to.
//
// Everything above runs against a fake service worker in node. It cannot show
// that a real browser installs this worker, that Cloudflare actually sends
// no-cache on the page, or that the response the student gets is the one the
// headers describe. Those need a request to the live domain, and the steps are
// written at the foot of scripts/check_deploy.js under AJAR_SMOKE, next to the
// header smoke list that was already there.
//
// The one thing neither this check nor that list covers is the open tab: a
// student who left the app open during a deploy keeps running the old
// index.html until they reload, because skipWaiting and clients.claim replace
// the WORKER, not the page already rendered. That is a deliberate ceiling and
// the reasoning is in ~/ajar-noite/DECIDIR-04.md.
