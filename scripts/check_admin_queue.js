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
    'validateProfileForm,privacyText,authErrorText,renderAdmin,adminRowHtml,refreshAdmin,adminApprove,adminDecline};', sandbox);
  return { api: sandbox.__api, sandbox, asked, pushed, approvals, declines, store };
}





function adminBox(){ return el('admin-box').innerHTML || ''; }
const REQ = [{ uid:'u1', name:'B. New', email:'b@x.test', schoolNameTyped:'Northside High', requestedAt: 1755400000000 }];

(async () => {
  //===================================================================
  // THE QUEUE IS INVISIBLE TO EVERYONE ELSE
  //===================================================================
  const plain = boot({ search:'', requests: REQ });
  await plain.api.refreshAdmin();
  assert('a signed-out visitor sees no queue', adminBox() === '', adminBox().slice(0,80));

  const teacher = boot({ search:'', teacher:true, requests: REQ });
  await teacher.api.refreshAdmin();
  assert('a TEACHER sees no queue either — approving is not a teacher power',
    adminBox() === '', adminBox().slice(0,80));

  //===================================================================
  // AND VISIBLE TO THE ONE ACCOUNT THAT OWNS THE APP
  //===================================================================
  const admin = boot({ search:'', admin:true, requests: REQ });
  await admin.api.refreshAdmin();
  const box = adminBox();
  assert('the administrator sees who is waiting', box.indexOf('B. New') > -1, box.slice(0,120));
  assert('with the email, so a person can be recognised', box.indexOf('b@x.test') > -1);

  // The whole safety of self-service teacher signup is that this string is
  // read by a human and decides nothing on its own.
  assert('THE TYPED SCHOOL IS SHOWN AS A CLAIM, NOT AS A FACT',
    box.indexOf('what the applicant typed') > -1, box.slice(0,400));
  assert('and the screen says the app did not check it',
    box.indexOf('not something the app checked') > -1);
  assert('the administrator types the school id themselves',
    box.indexOf('School id to put them in') > -1);
  assert('the typed name is never offered as the id',
    box.indexOf('value="Northside High"') > -1 && box.indexOf('id="adm-sid-u1" placeholder') > -1);

  //===================================================================
  // APPROVING INTO NOTHING IS REFUSED BEFORE IT IS ATTEMPTED
  //===================================================================
  admin.sandbox.document.getElementById('adm-sid-u1').value = '';
  admin.sandbox.document.getElementById('adm-sname-u1').value = 'Northside High';
  await admin.api.adminApprove('u1');
  assert('an empty school id does not reach the database',
    admin.approvals.length === 0, admin.approvals);
  assert('and says which field, not "invalid"',
    adminBox().indexOf('the long random one') > -1, adminBox().slice(0,200));

  admin.sandbox.document.getElementById('adm-sid-u1').value = 'not a valid id!';
  await admin.api.adminApprove('u1');
  assert('a malformed school id does not reach the database either',
    admin.approvals.length === 0, admin.approvals);

  //===================================================================
  // AND A REAL APPROVAL CARRIES WHAT THE ADMINISTRATOR CHOSE
  //===================================================================
  admin.sandbox.document.getElementById('adm-sid-u1').value = 'hja-2f7c91b4e6d3';
  admin.sandbox.document.getElementById('adm-sname-u1').value = 'Northside High';
  await admin.api.adminApprove('u1');
  assert('approving writes the teacher record', admin.approvals.length === 1, admin.approvals);
  assert('with the school id the ADMINISTRATOR typed, never the applicant\'s claim',
    admin.approvals[0].schoolId === 'hja-2f7c91b4e6d3', admin.approvals[0]);
  assert('and it is confirmed first, because it grants sight of a class',
    html.indexOf('teacher access to') > -1 && html.indexOf('confirm(') > -1);

  //===================================================================
  // NOTHING PARTIAL WHEN IT GOES WRONG
  //===================================================================
  assert('a failed approval says nothing was changed',
    html.indexOf('That did not go through. Nothing was changed.') > -1);
  assert('and the failure is logged rather than swallowed',
    html.indexOf("console.error('Ajar: approving failed") > -1);
  assert('declining asks first, since a request cannot be undeleted',
    html.indexOf('they can ask again') > -1);

  //===================================================================
  // AN EMPTY QUEUE IS A STATE, NOT A BLANK
  //===================================================================
  const empty = boot({ search:'', admin:true, requests: [] });
  await empty.api.refreshAdmin();
  assert('an empty queue says so', adminBox().indexOf('Nobody is waiting') > -1, adminBox().slice(0,120));

  console.log(results.join('\n'));
  const fails = results.filter(r => r.indexOf('FAIL') > -1);
  console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                           : ('ALL ' + results.length + ' CHECKS PASS'));
  if(fails.length) process.exitCode = 1;
})();
