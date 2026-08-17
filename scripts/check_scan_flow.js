// What happens when a student scans the code on the wall.
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
    'itemShareLink,dismissScanError,currentSchool};', sandbox);
  return { api: sandbox.__api, sandbox, asked, store };
}

function itemDoc(id, type){
  const g = { id, type, tag: 'x', theme: 'campus', status: 'approved' };
  return { items: [g] };
}
function panel(){ return el('practice-wrap').innerHTML || ''; }

(async () => {
  //===================================================================
  // THE LESSON THAT FAILED, REPRODUCED
  //===================================================================
  // A code naming exercise A, whose document has not landed yet, while the
  // whole-class batch holds three other exercises.
  const classroom = boot({
    search: '?ex=ex_wanted&school=scan-school',
    docs: {},                                        // ex_wanted not written yet
    batch: { items: [ itemDoc('other1').items[0], itemDoc('other2').items[0], itemDoc('other3').items[0] ] },
  });
  await classroom.api.loadSharedClassroomContent();

  // The invariant is not "asked once" — the app deliberately retries once
  // CloudSync arrives, because the first attempt runs before the module has
  // loaded. What must hold is that it never asks for a DIFFERENT exercise.
  assert('only the scanned code is ever looked up',
    classroom.asked.length > 0 && classroom.asked.every(id => id === 'ex_wanted'),
    classroom.asked);
  assert('a missing document does NOT load the whole-class batch',
    classroom.api.loadBatch().length === 0, classroom.api.loadBatch().length);
  assert('and the student is not dropped into a different exercise',
    !classroom.api.getStudentBatch().some(i => i.id.indexOf('other') === 0));

  classroom.sandbox.currentView = 'student';
  classroom.api.setStudentName('Ana');
  classroom.api.renderStudent();
  const shown = panel();
  assert('the screen says the exercise is no longer available',
    shown.indexOf('no longer available') > -1, shown.slice(0, 120));
  assert('and does not show a list to pick from', shown.indexOf('scenario-pick') === -1);
  assert('and offers a way to keep working', shown.indexOf('Practise on my own') > -1);
  assert('it is announced, not just drawn', shown.indexOf('role="alert"') > -1);

  //===================================================================
  // THE FOUR OTHER WAYS A SCAN FAILS, EACH SAYING SOMETHING DIFFERENT
  //===================================================================
  // One vague "something went wrong" sends all four to the teacher.
  const cases = [
    ['denied',  '?ex=ex_a&school=scan-school', 'different class'],
    ['network', '?ex=ex_a&school=scan-school', 'Could not check'],
    [null,      '?ex=has/slash&school=scan-school', 'not readable'],
  ];
  for(const [mode, search, expect] of cases){
    const c = boot({ search, itemMode: mode, docs: {}, batch: { items: [itemDoc('other').items[0]] } });
    await c.api.loadSharedClassroomContent();
    c.sandbox.currentView = 'student';
    c.api.setStudentName('Ana');
    c.api.renderStudent();
    assert('a ' + (mode || 'malformed') + ' scan says "' + expect + '"',
      panel().indexOf(expect) > -1, panel().slice(0, 100));
    assert('and never loads the batch instead', c.api.loadBatch().length === 0);
  }
  // A malformed id must not even be asked for — it would build a bad path.
  const bad = boot({ search: '?ex=has/slash&school=scan-school', docs: {} });
  await bad.api.loadSharedClassroomContent();
  assert('a malformed id is refused before it reaches Firestore', bad.asked.length === 0, bad.asked);

  //===================================================================
  // AND THE HAPPY PATH STILL WORKS
  //===================================================================
  const ok = boot({
    search: '?ex=ex_wanted&school=scan-school',
    docs: { 'item_ex_wanted': itemDoc('ex_wanted') },
    batch: { items: [itemDoc('other').items[0]] },
  });
  await ok.api.loadSharedClassroomContent();
  assert('a code whose document exists loads exactly that exercise',
    ok.api.loadBatch().length === 1 && ok.api.loadBatch()[0].id === 'ex_wanted',
    ok.api.loadBatch().map(i => i.id));
  assert('and nothing from the batch comes with it',
    !ok.api.loadBatch().some(i => i.id === 'other'));

  //===================================================================
  // THE CODE IS NOT SHOWN UNTIL ITS DOCUMENT EXISTS
  //===================================================================
  // The root cause. Thirteen phones scanning within seconds of approval is
  // what turns "the write is still in flight" from unlikely into certain.
  const t = boot({ teacher: true, search: '?school=scan-school' });
  const item = { id: 'pub1', type: 'passage', tag: 'x', theme: 'campus', status: 'approved',
                 data: t.api.generateOne('passage', 'campus').data };
  t.api.saveBatch([item]);
  t.api.setPublishState('pub1', 'publishing');
  assert('while publishing, the classroom screen has no code for it',
    t.api.tvItems().length === 0);
  t.api.setPublishState('pub1', 'failed');
  assert('and a failed publish gets no code either', t.api.tvItems().length === 0);
  t.api.setPublishState('pub1', 'live');
  assert('once the document is really there, the code appears',
    t.api.tvItems().length === 1);

  //===================================================================
  // AND THE LINK ITSELF CARRIES WHAT IT NEEDS
  //===================================================================
  const link = t.api.itemShareLink(item);
  assert('the link names the exercise', link.indexOf('ex=pub1') > -1, link);
  assert('and the school, so it cannot resolve against another one',
    link.indexOf('school=') > -1, link);
  assert('and it is short enough to survive a QR at projection size',
    link.length < 120, link.length);

  console.log(results.join('\n'));
  const fails = results.filter(r => r.indexOf('FAIL') > -1);
  console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                           : ('ALL ' + results.length + ' CHECKS PASS'));
  if(fails.length) process.exitCode = 1;
})();
