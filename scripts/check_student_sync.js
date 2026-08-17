// Does the student's work actually reach the teacher, and do they find out
// when it does not.
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
  const pushed = [];
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
      if(prop === 'pullNote') return async () => '';
      if(prop === 'pullClassSummaries') return async () => ({});
      if(prop === 'pushAttempt') return async () => {
        pushed.push('attempt');
        if(opts.pushMode === 'denied'){ const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; }
        if(opts.pushMode === 'network') throw new Error('client is offline');
        return true;
      };
      if(prop === 'pushSummary') return async () => {
        pushed.push('summary');
        if(opts.pushMode) throw new Error('same failure as the attempt');
        return true;
      };
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
    'itemShareLink,dismissScanError,currentSchool,logUsage,syncState,renderSyncWarning,setStudentName};', sandbox);
  return { api: sandbox.__api, sandbox, asked, pushed, store };
}


function warning(){ return el('sync-warning').innerHTML || ''; }

(async () => {
  //===================================================================
  // THE WRITE THAT NOBODY WAS WATCHING
  //===================================================================
  // schools/*/students held exactly one document and it was a test. Nothing
  // could tell whether the class had never practised or whether every save
  // had failed in silence, because both catches were empty. That ambiguity
  // is the bug; the missing data is only its symptom.
  const ok = boot({ search: '?school=scan-school' });
  ok.sandbox.currentView = 'student';
  ok.api.setStudentName('Ana');
  ok.api.logUsage('passage', 'campus', 0.8);
  await new Promise(r => setTimeout(r, 0));
  assert('finishing an exercise sends it to the teacher',
    ok.pushed.indexOf('attempt') > -1, ok.pushed);
  assert('and sends the summary her class panel reads',
    ok.pushed.indexOf('summary') > -1, ok.pushed);
  assert('when it lands, the student is told nothing — silence is the good case',
    warning() === '' && ok.api.syncState() === 'live', ok.api.syncState());

  //===================================================================
  // AND WHEN IT DOES NOT LAND
  //===================================================================
  for(const mode of ['denied', 'network']){
    const f = boot({ search: '?school=scan-school', pushMode: mode });
    f.sandbox.currentView = 'student';
    f.api.setStudentName('Ana');
    f.api.logUsage('passage', 'campus', 0.8);
    await new Promise(r => setTimeout(r, 0));
    assert('a ' + mode + ' failure is recorded rather than swallowed',
      f.api.syncState() === 'failed', f.api.syncState());
    assert('and the student is told, because only they can mention it to her',
      warning().indexOf('not reaching your teacher') > -1, warning().slice(0, 120));
    assert('it is announced, not just coloured (' + mode + ')',
      warning().indexOf('role="alert"') > -1);
    assert('and it does not tell them to stop practising (' + mode + ')',
      warning().indexOf('Keep practising') > -1);
    // Practice must still work. A sync that blocks the exercise turns a
    // reporting problem into a teaching one.
    assert('their own history still records it locally (' + mode + ')',
      (f.store['ajar_usage_log_by_name'] || '').indexOf('passage') > -1);
  }

  //===================================================================
  // THE WARNING LIVES WHERE A RE-RENDER CANNOT EAT IT
  //===================================================================
  // Every renderer overwrites practice-wrap. A warning inside it would vanish
  // on the next question, which is worse than never showing one.
  assert('the notice sits outside practice-wrap',
    html.indexOf('<div id="sync-warning"></div>') <
    html.indexOf('<div id="practice-wrap"'));
  assert('and nothing in the app writes into it from a renderer',
    html.split('sync-warning').length - 1 <= 3, html.split('sync-warning').length - 1);

  //===================================================================
  // NO EMPTY CATCH LEFT ON THIS PATH
  //===================================================================
  const at = html.indexOf('function logUsage(');
  const fn = html.slice(at, html.indexOf('\nfunction ', at + 10));
  assert('logUsage swallows nothing any more',
    fn.indexOf('catch(()=>{})') === -1 && fn.indexOf('catch(e){}') === -1,
    fn.match(/catch\([^)]*\)\s*\{\s*\}/g));

  console.log(results.join('\n'));
  const fails = results.filter(r => r.indexOf('FAIL') > -1);
  console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                           : ('ALL ' + results.length + ' CHECKS PASS'));
  if(fails.length) process.exitCode = 1;
})();
