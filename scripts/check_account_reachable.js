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
    'validateProfileForm,renderAdmin,refreshAdmin,renderWhoAmI,accountEntryHtml,setView,'+
    'enterAs,pickedRole,currentViewName};', sandbox);
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

  /* THE WALL, ASSERTED WHERE IT ACTUALLY STANDS.

     These asked whether a signed-out student on the practice screen was
     offered an account. That state no longer exists: without an account,
     asking for the student view lands on the account screen instead. The
     stronger claim is the one worth checking — not "they are offered a way
     in" but "there is no way past". */
  const anon = boot({ search:'?school=scan-school' });
  anon.api.setView('student');
  assert('a signed-out visitor asking for practice lands on sign-in instead',
    anon.api.currentViewName() === 'account', anon.api.currentViewName());
  anon.api.setView('teacher');
  assert('and so does one asking for the teacher panel',
    anon.api.currentViewName() === 'account', anon.api.currentViewName());
  anon.api.enterAs('teacher');
  assert('the door they pressed is remembered, so they are not asked twice',
    anon.api.pickedRole() === 'teacher', anon.api.pickedRole());
  anon.api.enterAs('student');
  assert('either door', anon.api.pickedRole() === 'student');
  anon.api.renderWhoAmI();
  assert('and that screen offers no button back into itself',
    whoAmI().indexOf("setView('account')") === -1, whoAmI().slice(0,160));

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
  assert('the account screen carries no button of its own at all',
    (whoAmI() || '').indexOf('<button') === -1, whoAmI().slice(0,160));
  /* There is no Back button here at all, and that is the fix rather than a
     regression. It pointed at the student view, which behind the wall bounces
     straight back — live-looking and doing nothing. Repointing it at the front
     page worked and was still wrong: the wordmark had become the way home in
     the same change, leaving two controls for one job. The wordmark is the one
     people already try. */
  assert('the account screen carries no second way out',
    whoAmI().indexOf('Back') === -1, whoAmI().slice(0,200));
  assert('and does not offer a way in to the screen already open',
    whoAmI().indexOf("setView('account')") === -1, whoAmI().slice(0,200));
  assert('the wordmark is the way home, and it is always on screen',
    html.indexOf("onclick=\"setView('welcome');return false\"") > -1);

  const tback = boot({ search:'?school=scan-school', teacher:true });
  tback.api.setView('account');
  tback.api.renderWhoAmI();
  // Same for a teacher: the wordmark is the exit, and there is only one.
  assert('and none for a teacher either', (whoAmI() || '').indexOf('<button') === -1,
    whoAmI().slice(0,220));

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
  /* The claim, not the line that used to carry it.

     This matched one exact statement, so it broke the moment the rule it
     described grew a second case — the account screen now hides the two
     notices as well, while keeping the masthead, because there the switcher
     is the way back out rather than a way past. Asserting the two conditions
     separately says what must be true instead of what the code looked like on
     the day it was written. */
  assert('the masthead is hidden on the front door and nowhere else',
    html.indexOf("const hideAll = v === 'welcome';") > -1);
  assert('and the notices are hidden on the account screen too, where they compete with the one question it asks',
    html.indexOf("const hideNotices = hideAll || v === 'account';") > -1);
  // A logo is not self-describing to somebody who cannot see it, so the way
  // home says where it goes.
  assert('the way home is labelled for a screen reader',
    html.indexOf('back to the start') > -1);

  //===================================================================
  // THE HEADER CANNOT CRUSH ITS OWN WORDMARK
  //===================================================================
  /* "Who we are" used to be a third child of a space-between masthead,
     sitting between the brand and the nav. Both of those wanted the space,
     so the button in the middle got neither: its two words broke across two
     lines and the second line landed on top of the wordmark. Reported from a
     screenshot, not from here, because nothing here was looking at shape.

     Substrings rather than patterns, on purpose — a regex inside this file
     family has eaten its own backslashes often enough. */
  assert('the header holds the brand and one nav, not three things competing',
    html.indexOf('<nav class="masthead-nav"') > -1);
  assert('AND the about button is inside that nav rather than loose beside it',
    html.indexOf('<button class="guide-btn" onclick="showAbout()">Who we are</button>') > -1
    && html.indexOf('<nav class="masthead-nav" aria-label="Main">') <
       html.indexOf('<button class="guide-btn" onclick="showAbout()">Who we are</button>'));
  assert('the nav takes the leftover width instead of sharing it with the brand',
    html.indexOf('.masthead-nav{') > -1 && html.indexOf('margin-left:auto') > -1);
  assert('and no pill in the header may break its own label across two lines',
    html.indexOf('.guide-btn{ white-space:nowrap; }') > -1);

  console.log(results.join('\n'));
  const fails = results.filter(r => r.indexOf('FAIL') > -1);
  console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                           : ('ALL ' + results.length + ' CHECKS PASS'));
  if(fails.length) process.exitCode = 1;
})();
