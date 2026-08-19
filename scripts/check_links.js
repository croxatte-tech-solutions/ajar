// Where every link and every route in this app actually goes.
//
// The QR incident has a check of its own (check_scan_flow.js) and the screen
// with no button out has another (check_no_dead_ends.js). Neither of them ever
// asked the plainer question: of every anchor in the file and every way a URL
// can name an exercise, does each one arrive somewhere, and does it arrive
// where its text promised?
//
// Asking it turned up four things nobody had seen.
//
//   1. THE OFFLINE MESSAGE COULD NOT BE SHOWN. SCAN_ERRORS.offline says "this
//      code needs a connection the first time it is opened" and was written
//      for the student on school wifi that blocks gstatic. It was unreachable.
//      The account gate ran first, and with the Firebase module never loaded
//      hasAccount() is false for everyone — so an offline student scanning the
//      code on the wall was told to sign in, and sent to a sign-in screen that
//      cannot work without the connection they do not have. The app's own
//      failure shape, from the comment two functions above it: true about the
//      wrong thing.
//
//   2. "?ex=" WITH NOTHING AFTER IT FELL INTO THE WHOLE-CLASS BATCH. The empty
//      string is falsy, so the branch that never falls back was skipped
//      entirely and the link resolved like a plain visit. A truncated scan or
//      a copy-paste that dropped the id is exactly the QR incident again:
//      a link that named one exercise showing a different one.
//
//   3. A WITHDRAWN EXERCISE STILL OPENED. Nothing deletes the published
//      document, and the check was on items.length rather than on any item
//      being approved — so a code for something the teacher had taken back
//      went on opening it. Padrão C says the route may not deliver what the
//      teacher has not approved, and here the route did.
//
//   4. The one link that opens a new tab carried rel="noopener" and not
//      "noreferrer".
//
// It also fixes by assertion two things that were fine and fragile: the twelve
// placeholder anchors all cancel their own jump, and the account screens never
// show two links with the same words going to different places — which is what
// a screen reader reads out when it lists the links on a page.
//
// No template literal in this file: it asserts on hrefs, ids and URLs.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const root = path.resolve(path.dirname(process.argv[2]));
const readSibling = f => { try{ return fs.readFileSync(path.join(root, f), 'utf8'); }catch(e){ return ''; } };
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/type\s*=\s*["']module["']/.test(m[1]))
  .map(m => m[2]);

const results = [];
function assert(n, c, detail){
  results.push(n + ': ' + (c ? 'PASS' : 'FAIL'));
  if(!c && detail !== undefined) results.push('    got: ' + JSON.stringify(detail));
}

//=====================================================================
// EVERY ANCHOR IN THE FILE, INCLUDING THE ONES BUILT IN JAVASCRIPT
//=====================================================================
// Templates count. renderTeacherNav builds its tabs inside a template
// literal, and a link that only exists at runtime is still a link a person
// tabs onto.
const lineOf = i => html.slice(0, i).split('\n').length;
const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(m => ({
  line: lineOf(m.index),
  href: (m[1].match(/href="([^"]*)"/) || [])[1],
  onclick: (m[1].match(/onclick="([^"]*)"/) || [])[1] || '',
  ariaLabel: (m[1].match(/aria-label="([^"]*)"/) || [])[1] || '',
  id: (m[1].match(/\bid="([^"]*)"/) || [])[1] || '',
  text: m[2].replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim(),
}));

assert('there are anchors to check, so this is not passing on an empty list',
  anchors.length >= 15, anchors.length);

// An <a> with no href is not focusable and a screen reader does not announce
// it as a link. It looks identical to a working one on a mouse.
const hrefless = anchors.filter(a => a.href === undefined).map(a => a.line);
assert('every link can be reached by the keyboard and announced as a link',
  hrefless.length === 0, hrefless);

const emptyHref = anchors.filter(a => a.href === '').map(a => a.line);
assert('no link is left with an empty href', emptyHref.length === 0, emptyHref);

// A javascript: URL is script in an attribute the CSP governs through
// script-src. _headers says removing 'unsafe-inline' is the intended
// migration, and the day it happens a javascript: link stops working while
// every href="#" one keeps going. One pattern, and it is the one that
// survives.
const jsUrls = anchors.filter(a => /^\s*javascript:/i.test(a.href || '')).map(a => a.line);
assert('no link navigates through a javascript: URL', jsUrls.length === 0, jsUrls);

//=====================================================================
// THE PLACEHOLDER LINKS — href="#" carrying an onclick
//=====================================================================
// href="#" is how this app writes a link that runs a function. It is fine,
// and it has two ways of going wrong: no handler at all, and a handler that
// forgets to cancel the jump — which scrolls the page to the top and leaves
// a bare "#" in the address bar the student then bookmarks.
const placeholders = anchors.filter(a => a.href === '#');
assert('the placeholder links are still here to be checked',
  placeholders.length >= 10, placeholders.length);

// One anchor is allowed no onclick: the way out of the parts laboratory,
// which the hash router answers instead. Counted rather than described, so
// the exception cannot quietly become a blanket.
const handlerless = placeholders.filter(a => !a.onclick);
assert('exactly one placeholder link is left to the hash router, and it is the lab exit',
  handlerless.length === 1 && handlerless[0].text.indexOf('Voltar ao app') > -1,
  handlerless.map(a => a.line + ' ' + a.text));
const noHandler = handlerless.filter(a => a.text.indexOf('Voltar ao app') === -1).map(a => a.line);
assert('every other placeholder link has something to do', noHandler.length === 0, noHandler);

const noCancel = placeholders.filter(a => a.onclick && !/return false\s*$/.test(a.onclick.trim()))
  .map(a => a.line + ' ' + a.onclick);
assert('and always cancels its own jump, so no stray # is left in the address bar',
  noCancel.length === 0, noCancel);

// The one exception, named rather than excused: the design lab's way out is a
// bare href="#", and what answers it is the hash router the lab is built on.
assert('the design lab is reached by an exact hash and nothing else',
  /location\.hash === '#design-lab'/.test(html));
assert('and its way out is answered by the hash router, not by an onclick',
  /addEventListener\('hashchange', route\)/.test(html));

//=====================================================================
// FRAGMENT LINKS — an anchor to an id must land on something
//=====================================================================
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const fragments = anchors.filter(a => a.href && a.href.length > 1 && a.href[0] === '#');
const unresolved = fragments
  .filter(a => !ids.has(a.href.slice(1)) && !a.onclick && a.href.indexOf('${') === -1)
  .map(a => a.line + ' ' + a.href);
assert('every in-page anchor either lands on a real id or cancels its own jump',
  unresolved.length === 0, unresolved);

assert('the skip link lands on a landmark that is really there',
  ids.has('main') && fragments.some(a => a.href === '#main'));

// The teacher tabs are the deliberate case: href="#grp-today" names a tab,
// not an element, and there is no id="grp-today" anywhere. That is only safe
// because the click is cancelled — otherwise the browser adds a hash for a
// target that does not exist, and the next reload carries it.
const tabAnchor = fragments.find(a => a.href.indexOf('sec.id') > -1);
assert('the teacher tabs pass the event so their jump can be cancelled',
  !!tabAnchor && /showSection\(event,/.test(tabAnchor.onclick), tabAnchor && tabAnchor.onclick);
assert('and showSection cancels it', /function showSection\(ev, id, quiet\)\{\s*\n\s*if\(ev\) ev\.preventDefault\(\);/.test(html));

//=====================================================================
// THE WAY OFF A PRACTICE SCREEN IS NEVER A DISABLED CONTROL
//=====================================================================
// check_no_dead_ends proves a way forward is PRESENT in the markup. It reads
// innerHTML for the string, which a disabled button satisfies just as well as
// a live one. This is the other half, and it is cheap: the two controls that
// move a student on must never carry disabled.
const againBtn = (html.match(/const PRACTICE_AGAIN_BTN\s*=\s*[^\n]*/) || [''])[0];
assert('the practice-again button exists to be checked', againBtn.length > 0);
assert('and is never handed out disabled', againBtn.indexOf('disabled') === -1, againBtn);
const examFooter = (html.match(/exam-footer[^\n]*advanceExam\(\)[^\n]*/) || [''])[0];
assert('the exam footer button exists to be checked', examFooter.length > 0);
assert('and is never handed out disabled', examFooter.indexOf('disabled') === -1, examFooter);

//=====================================================================
// LINKS THAT LEAVE THE APP
//=====================================================================
const external = anchors.filter(a => /^https?:\/\//i.test(a.href || ''));
assert('the external links are still here to be checked', external.length >= 1, external.length);

// Reverse tabnabbing. noopener is what nulls window.opener so the page that
// opens cannot redirect the tab it came from; noreferrer additionally keeps
// the URL — which carries the school id on a share link — from travelling as
// a Referer. Referrer-Policy in _headers narrows that today; this does not
// depend on a header staying the way it is.
const blanks = [...html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].map(m => m[0]);
assert('a link that opens a new tab is the exception, not the habit',
  blanks.length <= 1, blanks.length);
const unguarded = blanks.filter(t => {
  const rel = (t.match(/rel="([^"]*)"/) || [])[1] || '';
  return rel.indexOf('noopener') === -1 || rel.indexOf('noreferrer') === -1;
});
assert('and it cannot reach back into the tab it came from',
  unguarded.length === 0, unguarded);

// Anything a person can follow, or the browser can load, must be https. The
// http:// URLs in this file are all inside the qrcode-generator attribution
// comment, where they load nothing — so the assertion is about what is
// navigable, not about what is written down.
const navigableHttp = [
  ...[...html.matchAll(/<a\b[^>]*href="(http:\/\/[^"]*)"/g)].map(m => m[1]),
  ...[...html.matchAll(/<(?:script|link|img|iframe|source)[^>]*?(?:src|href)="(http:\/\/[^"]*)"/g)].map(m => m[1]),
  ...[...html.matchAll(/(?:import|from)\s*["'](http:\/\/[^"']*)["']/g)].map(m => m[1]),
].filter(u => u.indexOf('http://www.w3.org/2000/svg') !== 0);
assert('nothing a person can follow or the browser can load goes over plain http',
  navigableHttp.length === 0, navigableHttp);

// The domains a link may leave to. New ones are not forbidden — they are
// undecided, and the list at the foot of this file is where the decision
// gets written down.
const DECIDED_HOSTS = ['hiajar.com', 'github.com'];
const strayHosts = [...new Set(external.map(a => a.href.replace(/^https?:\/\//, '').split('/')[0].toLowerCase()))]
  .filter(h => DECIDED_HOSTS.indexOf(h) === -1);
assert('every domain a link leaves to is one somebody decided on',
  strayHosts.length === 0, strayHosts);

// mailto is the app's other way out, and it broke once by building an empty
// recipient: the section review read a config field that was never defined, so
// a student who wrote it out and pressed send opened a blank mail window and
// reasonably concluded the app was broken.
//
// What holds it up now is one constant. feedbackTo() falls back to
// CONFIG.devEmail, and mailReview() — the section review, the very one that
// broke — has no branch for an empty address: it would build "mailto:?subject="
// again. So the assertion is on the constant, which is where the regression
// would start.
assert('the feedback address falls back to the developer rather than to nothing',
  /function feedbackTo\(\)/.test(html) && /return CONFIG\.devEmail \|\| ''/.test(html));
assert('and that fallback is a real address, since the section review has no other',
  /devEmail: '[^']+@[^']+\.[^']+'/.test(html));
assert('the section review still asks feedbackTo rather than building its own',
  /function mailReview\(body\)\{\s*\n\s*const to = feedbackTo\(\);/.test(html));

//=====================================================================
// WHAT A LINK IS CALLED
//=====================================================================
// A screen reader can list the links on a page with nothing around them.
// "Click here" is four of them saying the same nothing.
const USELESS = ['here', 'click here', 'click', 'link', 'this link', 'this', 'more',
                 'read more', 'go', 'clique aqui', 'aqui', 'saiba mais'];
const vague = anchors.filter(a => USELESS.indexOf(a.text.toLowerCase()) > -1)
  .map(a => a.line + ' ' + JSON.stringify(a.text));
assert('no link is named something that means nothing out of context',
  vague.length === 0, vague);

// An empty one is worse: it is announced by its href. The welcome link is
// empty in the source on purpose — its words arrive in the student's own
// language — so what has to be true is that something fills it.
const unnamed = anchors.filter(a => !a.text && !a.ariaLabel);
const unnamedUnfilled = unnamed.filter(a => !a.id || html.indexOf("set('" + a.id + "'") === -1)
  .map(a => a.line);
assert('a link with no words in the source is filled in before it is shown',
  unnamedUnfilled.length === 0, unnamedUnfilled);

//=====================================================================
// THE ROUTES, RUN RATHER THAN READ
//=====================================================================
// Same sandbox shape as check_scan_flow, with two things it did not need:
// a hash (the legacy "#batch=" route) and the ability to have no CloudSync
// at all (the student whose school wifi blocks gstatic).
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

function boot(opts){
  opts = opts || {};
  const store = Object.assign({}, opts.storage || {});
  const docs = Object.assign({}, opts.docs || {});
  const asked = [];
  const cloud = new Proxy({}, {
    get(_, prop){
      if(prop === 'currentUser') return () => {
        if(opts.teacher) return { uid:'t1', isAnonymous:false, roleKnown:true, isTeacher:true, schoolId:'her-school' };
        if(opts.anonymous) return { uid:'a1', isAnonymous:true, roleKnown:true, isTeacher:false, schoolId:null };
        return { uid:'s1', email:'ana@x.test', isAnonymous:false, roleKnown:true, isTeacher:false, schoolId:null };
      };
      if(prop === 'signInWithGoogle') return async () => {};
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
    location: { origin:'https://hiajar.com', pathname:'/', hash: opts.hash || '',
                search: opts.search === undefined ? '' : opts.search,
                href: 'https://hiajar.com/' + (opts.search || '') + (opts.hash || ''),
                hostname: 'hiajar.com', reload(){} },
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
  // No CloudSync at all is the offline case: the Firebase modules come from a
  // CDN, and a school network that blocks it leaves this undefined.
  if(!opts.noCloud){ sandbox.window.CloudSync = cloud; sandbox.CloudSync = cloud; }
  vm.createContext(sandbox);
  vm.runInContext(blocks.join('\n;\n') +
    ';globalThis.__api={loadSharedClassroomContent,renderStudent,getStudentBatch,setStudentName,' +
    'loadBatch,currentSchool,dismissScanError,arrivedThroughSharedCode,encodeBatchForShare,' +
    'chooseHtml,roleChoiceHtml,createFormHtml,passwordFormHtml,profileFormHtml,accountSignedInHtml};', sandbox);
  return { api: sandbox.__api, sandbox, asked, store };
}

function itemDoc(id, status){
  return { items: [{ id, type: 'passage', tag: 'x', theme: 'campus', status: status || 'approved' }] };
}
function errOf(c){ return c.sandbox.window.__exError; }
function panelOf(c){ return el('practice-wrap').innerHTML || ''; }
function show(c){ c.sandbox.currentView = 'student'; c.api.setStudentName('Ana'); c.api.renderStudent(); return panelOf(c); }

(async () => {

  //-------------------------------------------------------------------
  // OFFLINE — the message written for this case must be the one shown
  //-------------------------------------------------------------------
  // Without the Firebase module there is no CloudSync, so hasAccount() is
  // false for a signed-in student too. If the account gate is asked first it
  // answers for everyone, and the student on blocked school wifi is told to
  // sign in — which needs the connection they do not have.
  for(const [what, search] of [['a code for one exercise', '?ex=ex_a&school=her-school'],
                               ['the whole-class link',    '?s=1&school=her-school']]){
    const c = boot({ noCloud: true, search });
    await c.api.loadSharedClassroomContent();
    assert('offline, ' + what + ' says the connection is missing', errOf(c) === 'offline', errOf(c));
    assert('offline, ' + what + ' does not send them to a sign-in they cannot reach',
      errOf(c) !== 'needs-account');
    assert('offline, ' + what + ' loads no exercise at all', c.api.loadBatch().length === 0);
  }
  const offlineCase = boot({ noCloud: true, search: '?ex=ex_a&school=her-school' });
  await offlineCase.api.loadSharedClassroomContent();
  const offlineShown = show(offlineCase);
  assert('and the screen names the connection rather than the account',
    offlineShown.indexOf('You are offline') > -1, offlineShown.slice(0, 160));
  assert('and still offers the one thing that works without a connection',
    offlineShown.indexOf('Practice on my own') > -1);

  //-------------------------------------------------------------------
  // "?ex=" WITH NOTHING AFTER IT
  //-------------------------------------------------------------------
  // A scan that read half the code, a copy-paste that dropped the id, a
  // shortener that ate the value. The empty string is falsy, so this used to
  // skip the branch that never falls back and resolve like a plain visit —
  // the whole-class batch, which is the QR incident wearing a different hat.
  const empty = boot({ search: '?ex=&school=her-school',
                       batch: { items: [itemDoc('other1').items[0], itemDoc('other2').items[0]] } });
  await empty.api.loadSharedClassroomContent();
  assert('a link that names no exercise is refused rather than guessed at',
    errOf(empty) === 'invalid', errOf(empty));
  assert('and it never reaches Firestore with an empty id', empty.asked.length === 0, empty.asked);
  assert('and it does NOT fall into the whole-class batch',
    empty.api.loadBatch().length === 0, empty.api.loadBatch().map(i => i.id));

  //-------------------------------------------------------------------
  // THE SAME PARAMETER TWICE
  //-------------------------------------------------------------------
  // Two codes concatenated, or a link edited by hand. Whatever it resolves to
  // it must be ONE of them and always the same one — never a lookup of both,
  // and never the second silently winning after the first failed.
  const dup = boot({ search: '?ex=ex_first&ex=ex_second&school=her-school',
                     docs: { 'item_ex_second': itemDoc('ex_second') },
                     batch: { items: [itemDoc('other').items[0]] } });
  await dup.api.loadSharedClassroomContent();
  assert('a duplicated parameter resolves to the first value and only that one',
    dup.asked.length > 0 && dup.asked.every(id => id === 'ex_first'), dup.asked);
  assert('and the second is never tried once the first comes up empty',
    dup.api.loadBatch().length === 0, dup.api.loadBatch().map(i => i.id));

  //-------------------------------------------------------------------
  // THE GOLDEN RULE, AGAINST THE OTHER ROUTE
  //-------------------------------------------------------------------
  // check_scan_flow proved "?ex=" never falls into the whole-class batch.
  // The batch is not the only other lot: "#batch=" carries a whole payload in
  // the URL, and a link can hold both. A failed "?ex=" must not land there
  // either — that would be the same defect through the older door.
  const forged = boot({ search: '?ex=ex_wanted&school=her-school' });
  const forgedHash = '#batch=' + forged.api.encodeBatchForShare(
    [itemDoc('smuggled').items[0]], {}, [], 'somebody@else.test', 'Class is cancelled.');
  const both = boot({ search: '?ex=ex_wanted&school=her-school', hash: forgedHash, docs: {} });
  await both.api.loadSharedClassroomContent();
  assert('a code that resolves to nothing does not fall into a payload in the hash',
    both.api.loadBatch().length === 0, both.api.loadBatch().map(i => i.id));
  assert('and the smuggled exercise never reaches the student',
    !both.api.getStudentBatch().some(i => i.id === 'smuggled'));
  assert('and it does not take over where feedback is sent',
    both.store['ajar_teacher_email'] === undefined, both.store['ajar_teacher_email']);
  assert('and it does not post an announcement in the teacher\u2019s name',
    both.store['ajar_announcement'] === undefined, both.store['ajar_announcement']);

  //-------------------------------------------------------------------
  // AN EXERCISE THE TEACHER HAS TAKEN BACK
  //-------------------------------------------------------------------
  // Nothing deletes the published document, so its code goes on working
  // forever. Padrão C is the line: what the teacher has not approved must not
  // arrive, and the route is not allowed to be the exception.
  const pulled = boot({ search: '?ex=ex_pulled&school=her-school',
                        docs: { 'item_ex_pulled': itemDoc('ex_pulled', 'pending') },
                        batch: { items: [itemDoc('other').items[0]] } });
  await pulled.api.loadSharedClassroomContent();
  assert('a withdrawn exercise is reported as gone, not opened',
    errOf(pulled) === 'gone', errOf(pulled));
  assert('and the unapproved item never reaches the student\u2019s list',
    pulled.api.getStudentBatch().length === 0, pulled.api.getStudentBatch().map(i => i.id));
  assert('and it does not fall into the whole-class batch either',
    pulled.api.loadBatch().length === 0, pulled.api.loadBatch().map(i => i.id));

  //-------------------------------------------------------------------
  // THE SAME ROUTE, TWICE
  //-------------------------------------------------------------------
  // Back, then reopen. Two loads of one URL must say the same thing: a route
  // that only works the first time is one that fails on the reload a
  // confused student always tries.
  const twice = boot({ search: '?ex=ex_wanted&school=her-school',
                       docs: { 'item_ex_wanted': itemDoc('ex_wanted') } });
  await twice.api.loadSharedClassroomContent();
  const firstIds = twice.api.loadBatch().map(i => i.id).join(',');
  await twice.api.loadSharedClassroomContent();
  assert('opening the same code twice opens the same exercise',
    twice.api.loadBatch().map(i => i.id).join(',') === firstIds && firstIds === 'ex_wanted', firstIds);
  const twiceGone = boot({ search: '?ex=ex_gone&school=her-school', docs: {},
                           batch: { items: [itemDoc('other').items[0]] } });
  await twiceGone.api.loadSharedClassroomContent();
  await twiceGone.api.loadSharedClassroomContent();
  assert('and reloading a code that failed gives the same answer, not the class batch',
    errOf(twiceGone) === 'gone' && twiceGone.api.loadBatch().length === 0);

  //-------------------------------------------------------------------
  // GIVING UP ON THE CODE MUST NOT LOSE THE SCHOOL
  //-------------------------------------------------------------------
  // "Practice on my own instead" rewrites the address bar. It has to drop the
  // exercise and keep the school: the school id only ever arrives in a link,
  // and a device that forgets it stops finding its class on the next visit.
  const dismiss = boot({ search: '?ex=ex_gone&school=her-school', docs: {} });
  await dismiss.api.loadSharedClassroomContent();
  show(dismiss);
  dismiss.api.dismissScanError();
  assert('giving up on a code keeps the school the device arrived with',
    dismiss.api.currentSchool() === 'her-school', dismiss.api.currentSchool());
  assert('and only the exercise is removed from the address',
    /searchParams\.delete\('ex'\)/.test(html) && !/searchParams\.delete\('school'\)/.test(html));

  //-------------------------------------------------------------------
  // THE SAME ROUTES, WITH THE OTHER TWO SESSIONS
  //-------------------------------------------------------------------
  // A route that is only safe because the menu does not show it is not safe.
  const anon = boot({ anonymous: true, search: '?s=1&school=her-school',
                      batch: { items: [itemDoc('classwork').items[0]] } });
  await anon.api.loadSharedClassroomContent();
  assert('an anonymous visitor on the whole-class link is asked to sign in',
    errOf(anon) === 'needs-account', errOf(anon));
  assert('and the class batch is never fetched for them',
    anon.api.loadBatch().length === 0, anon.api.loadBatch().map(i => i.id));

  // A teacher who opens a colleague's link. Her own record names her school
  // and must beat the address bar — otherwise she publishes into theirs.
  const visiting = boot({ teacher: true, search: '?ex=ex_a&school=someone-elses-school',
                          docs: { 'item_ex_a': itemDoc('ex_a') } });
  await visiting.api.loadSharedClassroomContent();
  assert('a teacher opening a colleague\u2019s link stays in her own school',
    visiting.api.currentSchool() === 'her-school', visiting.api.currentSchool());

  // And a student's device does remember the school from the link, because
  // that is the only place it ever comes from.
  const student = boot({ search: '?ex=ex_a&school=her-school', docs: { 'item_ex_a': itemDoc('ex_a') } });
  await student.api.loadSharedClassroomContent();
  assert('a student\u2019s device keeps the school the link carried',
    student.api.currentSchool() === 'her-school' && student.store['ajar_school'] === 'her-school');

  // A school id that could build a bad path is discarded rather than stored.
  const badSchool = boot({ search: '?ex=ex_a&school=has/slash' });
  await badSchool.api.loadSharedClassroomContent();
  assert('a malformed school in a link is never remembered',
    badSchool.store['ajar_school'] === undefined, badSchool.store['ajar_school']);

  //-------------------------------------------------------------------
  // A ROUTE NOBODY LINKS TO IS STILL A ROUTE
  //-------------------------------------------------------------------
  // The parts laboratory is reachable by typing its hash. It is scaffolding,
  // so what has to hold is that it is inert: no app path renders it, and it
  // is hidden unless the hash is exactly its own.
  assert('the parts laboratory is not reachable from anywhere in the app',
    anchors.every(a => (a.href || '').indexOf('design-lab') === -1)
    && !/setView\(['"]design-lab/.test(html));
  assert('and it stays hidden on any other hash', /lab\.hidden = !on;/.test(html));

  //-------------------------------------------------------------------
  // TWO LINKS WITH THE SAME WORDS, ON ONE SCREEN
  //-------------------------------------------------------------------
  // A screen reader can read out the links on a page as a list, with nothing
  // around them. Two saying "Change" and going to different places is a
  // coin toss for whoever is using one. The account screens are where this
  // nearly happened: "Change" the role you signed up as, and "Change" what
  // the class calls you.
  const u = { email:'ana@x.test', name:'Ana Souza', isAnonymous:false, emailVerified:true, isTeacher:false };
  const screens = {
    'the sign-in choice':  student.api.chooseHtml(),
    'the role question':   student.api.roleChoiceHtml(),
    'the sign-up form':    student.api.createFormHtml(),
    'the password form':   student.api.passwordFormHtml(),
    'the profile form':    student.api.profileFormHtml(u),
    'the account panel':   student.api.accountSignedInHtml(u),
  };
  let collisions = [];
  Object.keys(screens).forEach(name => {
    const seen = {};
    [...screens[name].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].forEach(m => {
      const text = m[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
      const goes = (m[1].match(/onclick="([^"]*)"/) || [])[1] || (m[1].match(/href="([^"]*)"/) || [])[1] || '';
      if(seen[text] !== undefined && seen[text] !== goes) collisions.push(name + ': "' + text + '"');
      seen[text] = goes;
    });
  });
  assert('no account screen shows two links with the same words going different places',
    collisions.length === 0, collisions);
  // Vacuity guard. All six screens render through window.CloudSync, and if the
  // stub ever stops satisfying renderAccount they come back as empty strings —
  // at which point the assertion above passes by having nothing to compare.
  const screenLinks = Object.keys(screens)
    .reduce((n, k) => n + (screens[k].match(/<a\b/g) || []).length, 0);
  assert('and the screens really were rendered, with links in them to compare',
    screenLinks >= 5, screenLinks);
  assert('and the one screen that carries three links at once was among them',
    (screens['the sign-up form'].match(/<a\b/g) || []).length >= 3,
    (screens['the sign-up form'].match(/<a\b/g) || []).length);

  console.log(results.join('\n'));
  const fails = results.filter(r => r.indexOf('FAIL') > -1);
  console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                           : ('ALL ' + results.length + ' CHECKS PASS'));
  if(fails.length) process.exitCode = 1;
})();

//=====================================================================
// EVERY EXTERNAL DESTINATION IN THIS APP — for Rony to decide on
//=====================================================================
// Nothing below was removed. The brief for this file says to list and ask,
// because some of these are attribution the licence requires and some are
// leftovers, and the two look identical from here.
//
// Kept as a comment rather than as data the check reads: a list that fails
// the build the day a link is legitimately added teaches people to edit the
// list without looking at it. The assertions above are on the SHAPE (https,
// noopener/noreferrer, a decided host) — this is the inventory a person
// reads.
//
// --- LINKS A PERSON CAN CLICK -------------------------------------------
//
// https://github.com/croxatte-tech-solutions/ajar#readme
//   Welcome screen, "Read more about the project →" (id welcome-more, the one
//   anchor whose words arrive in the visitor's own language). The only
//   target="_blank" in the app; now rel="noopener noreferrer".
//   WHY IT EXISTS: the README is the project's only public explanation of
//   itself, and the welcome screen is where a teacher decides whether to
//   trust it. DECISION NEEDED: none obvious — but it is the single link that
//   sends a student to a third party, and github.com sees the visit.
//
// mailto: CONFIG.devEmail — croxattetechsolutions@gmail.com
//   Three senders: contactUs() in the masthead and the privacy screen,
//   mailReview() at the end of a section, sendFeedback() in the weekly
//   prompt. A teacher who fills in her own address in the panel replaces it
//   for feedback (feedbackTo()), not for contactUs().
//   WHY IT EXISTS: a form needs a backend and spam handling; a mailto works
//   when the app itself does not, which is the case that matters.
//   DECISION NEEDED: it is a personal Gmail address on a page students read.
//   Fine for a pilot; a role address would age better.
//
// --- URLS THE BROWSER LOADS ---------------------------------------------
//
// https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js
// https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js
// https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js
// https://www.gstatic.com/firebasejs/12.17.1/firebase-app-check.js  (dynamic)
//   The four Firebase modules, version-pinned. check_conformance owns the
//   host allow-list for these; they are here so the inventory is complete.
//   WHY IT EXISTS: accounts and sync. DECISION NEEDED: this CDN is the one
//   third party the app cannot open without, and a school network that
//   blocks gstatic is what the offline route above is written for.
//
// https://hiajar.com/   — <link rel="canonical"> (line 42) and CONFIG.baseUrl
//   Ours. The canonical is what keeps a share link carrying a school id from
//   being indexed under its own URL; robots.txt states the same intent.
//
// --- WRITTEN DOWN, LOADS NOTHING ----------------------------------------
// All four are inside the qrcode-generator attribution block or a code
// comment. They are http:// and the assertion above deliberately does not
// count them, because a URL in a comment fetches nothing. Rewriting them to
// https would be editing somebody else's copyright notice.
//
// http://www.d-project.com/                                (Kazuhiko Arase)
// http://www.opensource.org/licenses/mit-license.php       (its MIT licence)
// http://www.denso-wave.com/qrcode/faqpatent-e.html        (QR patent notice)
// http://stackoverflow.com/questions/18729405/...          (UTF-8 byte array)
// http://www.w3.org/2000/svg  ×4                           (SVG namespace, not a fetch)
//
// --- THE DEPLOYMENT SURFACE, WHICH IS NOT IN THIS FILE ------------------
// check_deploy.js owns these; listed so the survey is honest about its edges.
//   _headers CSP allows: apis.google.com, www.gstatic.com,
//     www.google.com/recaptcha, static.cloudflareinsights.com,
//     cloudflareinsights.com, *.googleapis.com, *.firebaseio.com,
//     content-firebaseappcheck.googleapis.com, accounts.google.com,
//     real-life-english.firebaseapp.com
//   sitemap.xml / robots.txt: https://hiajar.com/ only.
//
//   ONE TO LOOK AT: real-life-english.firebaseapp.com is the Firebase auth
//   domain, and "real-life-english" was a candidate name dropped for a
//   trademark collision (README). It is a Google-owned host, so nothing
//   leaks — but it is the old name, visible in the sign-in popup URL and in
//   the CSP, and renaming a Firebase project is not a rename.
//
// --- WHAT THIS SURVEY COULD NOT ANSWER ----------------------------------
// Two things a person still has to do:
//   1. Follow the GitHub link on a phone and confirm the README is public.
//      A 404 here is invisible to every assertion above.
//   2. Open a share link on a device that has never seen the app, offline,
//      with the service worker serving the shell. The routes are proved
//      against a fake CloudSync; that it is really absent when gstatic is
//      blocked is a browser fact, not a Node one.
