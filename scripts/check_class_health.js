// The one line she reads before she starts.
//
// This is the check that should have existed before the lesson it is named
// after. Reported: "abri o qr code grande gerado e ia para tela do aluno, tela
// geral" — the big projected code opened the student's general list instead of
// the exercise it named.
//
// The cause was three defects that only combine in a classroom:
//   1. the code was drawn the instant an item was approved, while the write of
//      that item's own document was still in flight;
//   2. that write was fire-and-forget with an empty catch, so a failure looked
//      exactly like a success;
//   3. and a failed lookup fell through to the whole-class batch, which turned
//      "this document is not there yet" into "here is a different exercise".
//
// Thirteen phones scanning within seconds of each other is the load that makes
// (1) certain rather than unlikely. Nothing in the suite exercised the scan
// path end to end, so all three survived 3000 green checks.
//
// No template literal in this file: it asserts on URLs and ids.
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

const nodes = {};
const el = (id) => {
  if(id && nodes[id]) return nodes[id];
  const n = { style:{}, innerHTML:'', textContent:'', value:'', id: id || '', children: [],
    classList:{toggle(){},add(){},remove(){},contains:()=>false},
    addEventListener(){}, querySelector:()=>el(), querySelectorAll:()=>[],
    closest:()=>null, select(){}, focus(){}, remove(){}, insertBefore(){},
    getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}) };
  n.appendChild = c => { n.children.push(c); };
  n.parentNode = { insertBefore(){}, removeChild(){} };
  if(id) nodes[id] = n;
  return n;
};

// A Firestore that can be made to behave like a classroom: a document that is
// not written yet, one that never will be, one that belongs to another school.
function boot(opts){
  opts = opts || {};
  const store = Object.assign({}, opts.storage || {});
  const docs = Object.assign({}, opts.docs || {});
  const asked = [];
  const cloud = new Proxy({}, {
    get(_, prop){
      if(prop === 'currentUser') return () => (opts.teacher ? { isTeacher: true, schoolId: 'scan-school' } : null);
      if(prop === 'pullClassroomItem') return async id => {
        asked.push(id);
        if(opts.itemMode === 'denied'){ const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; }
        if(opts.itemMode === 'network') throw new Error('Failed to get document because the client is offline.');
        return docs['item_' + id] || null;
      };
      if(prop === 'pullClassroomBatch') return async () => (opts.batch || null);
      if(prop === 'pullRoster') return async () => (opts.roster || null);
      if(prop === 'pushRoster') return async () => {
        if(opts.rosterMode === 'denied'){ const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; }
        if(opts.rosterMode === 'failed') throw new Error('offline');
        return true;
      };
      if(prop === 'pullNote') return async () => '';
      if(prop === 'pullClassSummaries') return async () => ({});
      return () => Promise.resolve();
    },
  });
  const sandbox = {
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    document: { getElementById: id => el(id), createElement: () => el(), querySelector: () => el(),
                querySelectorAll: () => [], addEventListener(){}, body: el() },
    window: { addEventListener(){}, scrollTo(){} },
    localStorage: { getItem: k => (k in store ? store[k] : null),
                    setItem: (k, v) => { store[k] = String(v); },
                    removeItem: k => { delete store[k]; } },
    location: { origin:'https://hiajar.com', pathname:'/', hash:'',
                search: opts.search === undefined ? '' : opts.search, href: 'https://hiajar.com/' },
    history: { replaceState(){} },
    URL: URL,
    navigator: { language:'en-US', languages:['en-US'] },
    confirm: () => true,
    Audio: function(){ this.play = () => Promise.resolve(); this.pause = () => {}; },
    SpeechSynthesisUtterance: function(t){ this.text = t; },
    speechSynthesis: { speak(){}, getVoices(){ return []; }, addEventListener(){}, cancel(){} },
    URLSearchParams,
    console: { log(){}, info(){}, warn(){}, error(){} },
    Date, Math, JSON, Array, Object, String, Number, Intl, Set, Promise, Function, RegExp,
    setInterval: (...a) => { const t = setInterval(...a); if(t && t.unref) t.unref(); return t; },
    clearInterval, setTimeout, clearTimeout,
  };
  sandbox.self = sandbox.window;
  sandbox.globalThis = sandbox;
  sandbox.window.CloudSync = cloud;
  sandbox.CloudSync = cloud;
  vm.createContext(sandbox);
  vm.runInContext(blocks.join('\n;\n') +
    ';globalThis.__api={loadSharedClassroomContent,renderStudent,getStudentBatch,setStudentName,' +
    'setRosterArrival,generateOne,tagFor,saveBatch,loadBatch,setPublishState,publishState,tvItems,' +
    'itemShareLink,dismissScanError,currentSchool,classHealth,renderClassHealth,'+
    'saveRoster,teacherIsSignedIn,republishFailed};', sandbox);
  return { api: sandbox.__api, sandbox, asked, store };
}


function health(t){ t.api.renderClassHealth(); return el('class-health').innerHTML || ''; }

(async () => {
  // Signed in, one exercise approved, list of three sent.
  const t = boot({ teacher: true, search: '?school=scan-school' });
  t.sandbox.currentView = 'teacher';
  const mk = id => ({ id, type:'passage', tag:'x', theme:'campus', status:'approved',
                      data: t.api.generateOne('passage','campus').data });

  assert('signed out, it says nothing at all — there is no class to report on',
    (function(){ const o = boot({ search:'' }); return health(o) === ''; })());

  t.api.saveBatch([mk('a1'), mk('a2')]);
  t.api.setPublishState('a1', 'publishing');
  t.api.setPublishState('a2', 'publishing');
  let h = t.api.classHealth();
  assert('an approved exercise still in flight counts as waiting, not live',
    h.live === 0 && h.waiting === 2, h);
  assert('and the line says so rather than looking finished',
    health(t).indexOf('still sending') > -1, health(t).slice(0,140));
  assert('waiting is not green', health(t).indexOf('--accent') === -1);

  t.api.setPublishState('a1', 'live');
  t.api.setPublishState('a2', 'failed');
  h = t.api.classHealth();
  assert('a failed publish is counted separately from a live one',
    h.live === 1 && h.failed === 1, h);
  assert('the line names the failure instead of averaging it away',
    health(t).indexOf('1 failed') > -1, health(t).slice(0,160));
  assert('and offers the retry, because knowing without a fix is only worry',
    health(t).indexOf('republishFailed()') > -1);
  assert('a failure is never reported as ok', h.ok === false);

  // The roster half. It is the same failure with a different surface: her
  // screen showed thirteen names that no student ever received.
  t.api.setPublishState('a2', 'live');
  assert('names that were never sent are not counted as published',
    t.api.classHealth().names === 0, t.api.classHealth());
  assert('and the line says no names published, not a blank space',
    health(t).indexOf('no names published') > -1, health(t).slice(0,160));

  t.api.saveRoster({ students:['Ana','Bo','Cy'], present:[] });
  await new Promise(r => setTimeout(r, 0));
  h = t.api.classHealth();
  assert('a list Firestore acknowledged is counted', h.names === 3, h);
  assert('with everything landed, and only then, it reads clean',
    h.ok === true && health(t).indexOf('3 names published') > -1, health(t).slice(0,160));
  assert('and 2 exercises live', health(t).indexOf('2 exercises live') > -1, health(t).slice(0,160));

  // A denied write is the exact case that produced the silent classroom:
  // signed out, localStorage takes it, her screen looks correct.
  const d = boot({ teacher: true, search: '?school=scan-school', rosterMode: 'denied' });
  d.sandbox.currentView = 'teacher';
  d.api.saveRoster({ students:['Ana','Bo'], present:[] });
  await new Promise(r => setTimeout(r, 0));
  const dh = d.api.classHealth();
  assert('a refused list is reported as stuck, never as published',
    dh.namesStuck === true && dh.names === 0, dh);
  assert('it is stated in words, not left to a colour',
    health(d).indexOf('names did not arrive') > -1, health(d).slice(0,160));
  assert('and it is announced, because she is looking at the class, not the screen',
    (html.indexOf('id="class-health" role="status" aria-live="polite"') > -1));

  console.log(results.join('\n'));
  const fails = results.filter(r => r.indexOf('FAIL') > -1);
  console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                           : ('ALL ' + results.length + ' CHECKS PASS'));
  if(fails.length) process.exitCode = 1;
})();
