// Renaming a storage key must not lose what is already on a device.
//
// Every key was prefixed cse_ — the school's initials, in a public repository.
// They are ajar_ now. That rename is one search-and-replace and a whole class
// of data loss: on a phone that has been in use for weeks, the app would look
// for ajar_student_name, find nothing, and ask a student to introduce
// themselves again — losing the name their entire history is filed under, their
// teacher's note, and the batch they were part-way through.
//
// This file has its own enumerable localStorage, because the other harnesses
// stub it as three functions with nothing to walk, and the migration reads the
// key list. And it has no template literal, for the same reason check_names.js
// does not: a file about string handling cannot afford a layer that eats
// backslashes.
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/type\s*=\s*["']module["']/.test(m[1]))
  .map(m => m[2]);

const results = [];
function assert(n, c, detail){
  results.push(n + ': ' + (c ? 'PASS' : 'FAIL'));
  if(!c && detail !== undefined) results.push('    got: ' + JSON.stringify(detail));
}

// A store whose keys are enumerable, like the real thing. Object.keys on it has
// to return the stored keys and not the method names, which is what a plain
// object literal of three functions would give.
function makeStore(initial){
  const data = Object.assign({}, initial);
  const api = {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; },
    get length(){ return Object.keys(data).length; },
    key: i => Object.keys(data)[i],
  };
  // Object.keys(localStorage) must see the DATA. The methods live on the
  // prototype so they are not enumerable own properties.
  const store = Object.create(api);
  Object.keys(data).forEach(k => { store[k] = data[k]; });
  // Keep the mirror in step, since the app writes through setItem.
  api.setItem = (k, v) => { data[k] = String(v); store[k] = String(v); };
  api.removeItem = k => { delete data[k]; delete store[k]; };
  api.getItem = k => (k in data ? data[k] : null);
  return store;
}

const el = () => {
  const n = { style:{}, innerHTML:'', textContent:'', value:'', id:'', children: [],
    classList:{toggle(){},add(){},remove(){},contains:()=>false},
    addEventListener(){}, querySelector:()=>el(), querySelectorAll:()=>[],
    closest:()=>null, select(){}, focus(){}, remove(){}, insertBefore(){},
    getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}) };
  n.appendChild = c => { n.children.push(c); };
  n.parentNode = { insertBefore(){}, removeChild(){} };
  return n;
};

// The state a device in real use would be holding, under the OLD names —
// including the two that are prefixes with something appended, which is the
// case a hand-written list of keys cannot cover.
const LEGACY = {
  'cse_student_name': "Ana O'Brien",
  'cse_roster': JSON.stringify({ students: ["Ana O'Brien", 'Bruno'], present: ["ana o'brien"] }),
  'cse_teacher_notes': JSON.stringify({ "Ana O'Brien": 'Your emails are strong.' }),
  'cse_usage_log_by_name': JSON.stringify({ "ana o'brien": [{ type: 'email', theme: 'career', outcome: 0.8, ts: 1 }] }),
  'cse_progress': JSON.stringify({ week: 8, day: 1 }),
  'cse_class_term_start': '2026-08-17',
  'cse_guide_seen_student': '1',
  'cse_msg_abc123': 'Confidence is built one sentence at a time.',
  'unrelated_key': 'must be left alone',
};

function boot(initial){
  const store = makeStore(initial);
  const sandbox = {
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    document: { getElementById: () => el(), createElement: () => el(), querySelector: () => el(),
                querySelectorAll: () => [], addEventListener(){}, body: el() },
    window: { addEventListener(){}, scrollTo(){} },
    localStorage: store,
    location: { origin:'https://example.com', pathname:'/', hash:'', search:'' },
    navigator: { language:'en-US', languages:['en-US'] },
    confirm: () => true,
    Audio: function(){ this.play = () => Promise.resolve(); this.pause = () => {}; },
    SpeechSynthesisUtterance: function(t){ this.text = t; },
    speechSynthesis: { speak(){}, getVoices(){ return []; }, addEventListener(){}, cancel(){} },
    URLSearchParams,
    console: { log(){}, info(){}, warn(){}, error(){} },
    Date, Math, JSON, Array, Object, String, Number, Intl, Set, Promise, Function,
    setInterval: (...a) => { const t = setInterval(...a); if(t && t.unref) t.unref(); return t; },
    clearInterval, setTimeout, clearTimeout,
  };
  sandbox.self = sandbox.window;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(blocks.join('\n;\n') +
    ';globalThis.__api={getStudentName,loadRoster,loadTeacherNotes,loadProgress,' +
    'classTermStart,migrateLegacyKeys};', sandbox);
  return { store, api: sandbox.__api };
}

// --- a device that has been in use ---
const first = boot(LEGACY);

assert('nothing is left under the old prefix',
  Object.keys(first.store).filter(k => k.indexOf('cse_') === 0).length === 0,
  Object.keys(first.store).filter(k => k.indexOf('cse_') === 0));

assert('the student keeps their name', first.api.getStudentName() === "Ana O'Brien",
  first.api.getStudentName());
assert('the class list survives',
  first.api.loadRoster().students.length === 2 && first.api.loadRoster().students[0] === "Ana O'Brien");
assert('and who was marked present', first.api.loadRoster().present[0] === "ana o'brien");
assert('the teacher note to that student survives',
  first.api.loadTeacherNotes()["Ana O'Brien"] === 'Your emails are strong.');
assert('the week she was on survives',
  first.api.loadProgress().week === 8 && first.api.loadProgress().day === 1);
assert('the term anchor survives', first.api.classTermStart() === '2026-08-17');

// The practice history is the one that cannot be re-entered by hand.
const log = JSON.parse(first.store.getItem('ajar_usage_log_by_name') || '{}');
assert('the practice history survives', Object.keys(log)[0] === "ana o'brien");
assert('with its attempts intact', log["ana o'brien"][0].outcome === 0.8);

// Suffixed keys: a list of exact names could not have known these existed.
assert('a key with an id appended comes across',
  first.store.getItem('ajar_msg_abc123') === 'Confidence is built one sentence at a time.');
assert('and one with a role appended',
  first.store.getItem('ajar_guide_seen_student') === '1');

// Anything that was never ours is not ours to move.
assert('an unrelated key is left exactly as it was',
  first.store.getItem('unrelated_key') === 'must be left alone');

// --- running twice must be a no-op, since every load calls it ---
const again = first.api.migrateLegacyKeys();
assert('a second run moves nothing', again === 0, again);
assert('and the data is still there', first.api.getStudentName() === "Ana O'Brien");

// --- a fresh device has nothing to carry and must not mind ---
const clean = boot({});
assert('a device with no history migrates nothing', clean.api.migrateLegacyKeys() === 0);
assert('and starts with no name', clean.api.getStudentName() === '');

// --- both names present: the new one is what the app has been writing ---
const both = boot({ 'cse_student_name': 'Old Name', 'ajar_student_name': 'Current Name' });
assert('an existing new key is never overwritten by an old one',
  both.api.getStudentName() === 'Current Name', both.api.getStudentName());
assert('and the old one is cleared away anyway',
  both.store.getItem('cse_student_name') === null);

// --- and the app must not still READ or WRITE under the old prefix ---
// Narrowed after firing on LEGACY_PREFIX itself, which is the one place the old
// prefix has to appear — it is what the migration migrates FROM. Fourth time a
// rule I wrote has reported its own subject matter.
const uses = [...html.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\('cse_/g)].length;
assert('nothing reads or writes under the old prefix any more', uses === 0, uses);
assert('and the only mention left is the migration naming what it moves',
  (html.match(/'cse_/g) || []).length === 1);

console.log(results.join('\n'));
const fails = results.filter(r => r.includes('FAIL'));
console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                         : ('ALL ' + results.length + ' CHECKS PASS'));
if(fails.length) process.exitCode = 1;
