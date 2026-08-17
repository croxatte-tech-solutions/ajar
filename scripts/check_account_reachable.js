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
  const approvals = [];
  const declines = [];
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
      if(prop === 'isAdmin') return async () => !!opts.admin;
      if(prop === 'listTeacherRequests') return async () => (opts.requests || []);
      if(prop === 'approveTeacher') return async (uid, name, schoolId, schoolName) => {
        approvals.push({ uid, name, schoolId, schoolName }); return true; };
      if(prop === 'declineTeacher') return async uid => { declines.push(uid); return true; };
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
    'renderTeacherSignIn,renderAccount,ageGate,ageOn,birthdayFrom,MIN_AGE,COUNTRIES,'+
    'validateProfileForm,renderAdmin,refreshAdmin,renderWhoAmI,accountEntryHtml,setView};', sandbox);
  return { api: sandbox.__api, sandbox, asked, pushed, approvals, declines, store };
}






function whoAmI(){ return el('who-am-i').innerHTML || ''; }

(async () => {
  //===================================================================
  // THE DOOR EXISTS AT ALL
  //===================================================================
  // It did not. The account view, the signup form, the age gate and the
  // approval queue were all built, and nothing anywhere called
  // setView('account') — every one of them was unreachable, and a student had
  // no way to sign out. Three thousand green checks did not notice, because
  // not one of them asked whether a screen could be opened.
  assert('something in the app navigates to the account view',
    html.indexOf("setView('account')") > -1);

  const anon = boot({ search:'?school=scan-school' });
  anon.api.setView('student');
  anon.api.renderWhoAmI();
  assert('a signed-out student is offered an account',
    whoAmI().indexOf("setView('account')") > -1, whoAmI().slice(0,160));

  anon.api.setStudentName('Ana');
  anon.api.renderWhoAmI();
  assert('and so is one who has typed a name',
    whoAmI().indexOf("setView('account')") > -1 && whoAmI().indexOf('Hi, Ana') > -1,
    whoAmI().slice(0,160));

  const t = boot({ search:'?school=scan-school', teacher:true });
  t.api.setView('teacher');
  t.api.renderWhoAmI();
  assert('a teacher gets it too',
    whoAmI().indexOf("setView('account')") > -1, whoAmI().slice(0,220));
  assert('without losing the quick sign-out she needs on a shared computer',
    whoAmI().indexOf('teacherSignOut()') > -1);

  //===================================================================
  // AND IT IS A DOOR, NOT A TRAPDOOR
  //===================================================================
  // A screen you can enter and not leave is the same dead end in a nicer
  // jumper. On the account view the control reverses.
  const back = boot({ search:'?school=scan-school' });
  back.api.setView('account');
  back.api.renderWhoAmI();
  assert('on the account screen the control turns into the way back',
    whoAmI().indexOf('Back') > -1, whoAmI().slice(0,160));
  assert('and it does not offer to open the screen you are already on',
    whoAmI().indexOf("setView('account')") === -1, whoAmI().slice(0,160));
  assert('a student goes back to practice',
    whoAmI().indexOf("setView('student')") > -1, whoAmI().slice(0,160));

  const tback = boot({ search:'?school=scan-school', teacher:true });
  tback.api.setView('account');
  tback.api.renderWhoAmI();
  assert('a teacher goes back to her panel, not to the student view',
    whoAmI().indexOf("setView('teacher')") > -1, whoAmI().slice(0,220));

  //===================================================================
  // IT IS NOT A THIRD MODE
  //===================================================================
  // Teacher and Student are modes — the same person moves between them. An
  // Account button sitting in that switcher would read as a third mode
  // rather than as identity, which is why it lives in the masthead instead.
  const sw = html.slice(html.indexOf('<div class="switcher">'),
                        html.indexOf('</div>', html.indexOf('<div class="switcher">')));
  assert('the mode switcher still holds exactly the two modes',
    (sw.match(/<button/g) || []).length === 2, sw);
  assert('and the account entry is not one of them', sw.indexOf('account') === -1);

  //===================================================================
  // THE VIEW IS WIRED, NOT JUST REACHABLE
  //===================================================================
  assert('opening it draws the account panel', html.indexOf('renderAccount(); refreshAdmin()') > -1);
  assert('and the view element exists to draw into', html.indexOf('id="account-box"') > -1);
  assert('the masthead is hidden only on the front door, so the door stays visible',
    html.indexOf("const chromeHidden = v === 'welcome' ? 'none' : '';") > -1);
  assert('the current screen is announced to assistive tech',
    html.indexOf('aria-current="${on ? \'page\' : \'false\'}"') > -1);

  console.log(results.join('\n'));
  const fails = results.filter(r => r.indexOf('FAIL') > -1);
  console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                           : ('ALL ' + results.length + ' CHECKS PASS'));
  if(fails.length) process.exitCode = 1;
})();
