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
  // The element cache is module-level and shared, so a warning drawn by an
  // earlier case is still sitting in the node when the next one starts. That
  // reads as the new case having drawn it — a false failure that looks
  // exactly like a real one.
  for(const k in nodes) delete nodes[k];
  const store = Object.assign({}, opts.storage || {});
  const docs = Object.assign({}, opts.docs || {});
  const asked = [];
  const pushed = [];
  const cloud = new Proxy({}, {
    get(_, prop){
      // The shape the real CloudSync now returns. isTeacher comes from the
      // presence of a /teachers record, never from "is not anonymous".
      if(prop === 'currentUser') return () => {
        if(opts.signedOut) return null;
        if(opts.teacher) return { uid:'t1', email:'m@x.test', isAnonymous:false, roleKnown:true, isTeacher:true, schoolId:'scan-school', name:'Michelle' };
        if(opts.googleStudent) return { uid:'s1', email:'ana@gmail.test', isAnonymous:false, roleKnown:true, isTeacher:false, schoolId:null, name:'Ana' };
        if(opts.loading) return { uid:'s1', email:'ana@gmail.test', isAnonymous:false, roleKnown:false, isTeacher:false, schoolId:null };
        return { uid:'a1', email:null, isAnonymous:true, roleKnown:true, isTeacher:false, schoolId:null };
      };
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
        if(opts.noSchool) return 'no-school';
        pushed.push('attempt');
        if(opts.pushMode === 'denied'){ const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; }
        if(opts.pushMode === 'network') throw new Error('client is offline');
        return true;
      };
      if(prop === 'pushSummary') return async () => {
        if(opts.noSchool) return 'no-school';
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
    'itemShareLink,dismissScanError,currentSchool,teacherIsSignedIn,applyTeacherGate,'+
    'renderTeacherSignIn,hydrateAllNotesForTeacher,renderTeacher,setView};', sandbox);
  return { api: sandbox.__api, sandbox, asked, pushed, store };
}



function signinBox(){ return el('teacher-signin').innerHTML || ''; }

(async () => {
  //===================================================================
  // A TEACHER IS SOMEONE WITH A TEACHER RECORD
  //===================================================================
  // The old test was `!!u && !u.isAnonymous`, which was true only while the
  // one way to be non-anonymous was her own sign-in form. Google sign-in for
  // students breaks that silently and completely.
  const anon = boot({ search: '?school=scan-school' });
  assert('an anonymous student is not a teacher', anon.api.teacherIsSignedIn() === false);
  assert('and the panel stays shut for them', anon.api.applyTeacherGate() === false);

  const google = boot({ search: '?school=scan-school', googleStudent: true });
  assert('A STUDENT SIGNED IN WITH GOOGLE IS STILL NOT A TEACHER',
    google.api.teacherIsSignedIn() === false, 'signing in must not promote anyone');
  assert('the teacher panel does not open for them',
    google.api.applyTeacherGate() === false);
  // The leak that mattered: this gates on teacherIsSignedIn(), and every
  // private note about every classmate is readable by any signed-in visitor.
  await google.api.hydrateAllNotesForTeacher();
  assert('and their teacher\'s private notes are never fetched to their device',
    (google.store['ajar_teacher_notes'] || '') === '', google.store['ajar_teacher_notes']);

  google.sandbox.currentView = 'teacher';
  google.api.renderTeacherSignIn();
  assert('they are told they are on the wrong screen, not that they failed',
    signinBox().indexOf('not a teacher account') > -1, signinBox().slice(0, 140));
  assert('and pointed at what IS theirs',
    signinBox().indexOf('Practice screen') > -1);
  assert('with a way back out',
    signinBox().indexOf('teacherSignOut()') > -1);

  //===================================================================
  // AND SHE STILL GETS IN
  //===================================================================
  const t = boot({ search: '?school=scan-school', teacher: true });
  assert('a signed-in teacher with a record is a teacher', t.api.teacherIsSignedIn() === true);
  assert('and her panel opens', t.api.applyTeacherGate() === true);

  //===================================================================
  // THE GAP WHILE WE ARE STILL ASKING
  //===================================================================
  // The record is fetched asynchronously. Treating "not loaded yet" as
  // "not a teacher" is the only safe reading: a panel that flashes open for
  // a moment has already shown what it should not.
  const mid = boot({ search: '?school=scan-school', loading: true });
  assert('an account whose role is not yet known is not treated as a teacher',
    mid.api.teacherIsSignedIn() === false);
  assert('and the not-a-teacher notice does not flash up either',
    (function(){ mid.sandbox.currentView='teacher'; mid.api.renderTeacherSignIn();
                 return signinBox().indexOf('not a teacher account') === -1; })());

  //===================================================================
  // AN ANONYMOUS VISITOR IS NOT TOLD THEY HAVE THE WRONG KIND OF ACCOUNT
  //===================================================================
  // They have no account at all. isAnonymous was missing from the object
  // currentUser() returns, so every caller asking for it got undefined, which
  // reads as false — and the screen told people who had never signed in that
  // they were signed in with the wrong sort of login.
  const visitor = boot({ search: '?school=scan-school' });
  visitor.api.setView('teacher');
  visitor.api.renderTeacherSignIn();
  assert('an anonymous visitor is offered the sign-in form, not a rejection',
    signinBox().indexOf('not a teacher account') === -1, signinBox().slice(0, 160));
  assert('the app actually reports whether an account is anonymous',
    html.indexOf('isAnonymous: !!currentUser.isAnonymous') > -1);

  //===================================================================
  // THE OLD TEST IS GONE FROM THE SOURCE
  //===================================================================
  // The claim, not the mention: the comment above the fix quotes the old
  // test on purpose, and a check that fires on its own documentation is how
  // this file family has wasted an afternoon before.
  assert('nothing decides teacher-ness from "not anonymous" any more',
    html.indexOf('isTeacherAccount = u =>') === -1);
  assert('it is the teacher record that decides',
    html.indexOf('const isTeacherAccount = () => !!teacherRecord;') > -1);

  console.log(results.join('\n'));
  const fails = results.filter(r => r.indexOf('FAIL') > -1);
  console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                           : ('ALL ' + results.length + ' CHECKS PASS'));
  if(fails.length) process.exitCode = 1;
})();
