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
    'renderTeacherSignIn,renderAccount,ageGate,ageOn,birthdayFrom,MIN_AGE,COUNTRIES,'+
    'validateProfileForm,privacyText,authErrorText,roleChoiceHtml,chooseRole,pickedRole,renderAccount,'+
    'verifyNoticeHtml,renderInstallOffer,exportClassJson,setClassMembers,dismissInstall,'+
    'firstNameOf,nameSuggestions,profileFieldsHtml};', sandbox);
  return { api: sandbox.__api, sandbox, asked, pushed, store };
}




(async () => {
  const a = boot({ search: '' }).api;
  const G = (dob, today) => a.ageGate(dob, today);

  //===================================================================
  // SIXTEEN, AND THE EDGES AROUND IT
  //===================================================================
  /* THIRTEEN NOW, AND THE WALL IS WHY.

     This asserted sixteen, and sixteen was right while anonymous practice
     existed: somebody too young for an account still had the app, they just
     kept everything on their own device. With a sign-in wall the number stops
     meaning "the age we may store data about" and starts meaning "the age we
     let anyone in at all", and a fifteen-year-old is then excluded from the
     product rather than from its storage.

     13 covers COPPA and the LGPD. It is partially exposed in the EU, and what
     holds the position is not the number but where consent comes from: a
     school consenting in an educational setting, which is the path this app
     is on. */
  assert('the floor is 13, which is what a sign-in wall makes it',
    a.MIN_AGE === 13, a.MIN_AGE);
  assert('somebody clearly old enough is let in', G('1990-01-01', '2026-08-17').ok === true);
  assert('somebody clearly too young is not', G('2015-01-01', '2026-08-17').ok === false);
  assert('and is told why, not just refused',
    G('2015-01-01', '2026-08-17').reason === 'too-young', G('2015-01-01','2026-08-17'));

  // The day either side of a sixteenth birthday. Off-by-one here is the whole
  // control failing, in the direction that admits a fifteen-year-old.
  assert('the day BEFORE their thirteenth birthday is refused',
    G('2013-08-18', '2026-08-17').ok === false, G('2013-08-18', '2026-08-17'));
  assert('the day OF their thirteenth birthday is accepted',
    G('2013-08-17', '2026-08-17').ok === true, G('2013-08-17', '2026-08-17'));
  assert('the day after, obviously, too',
    G('2013-08-16', '2026-08-17').ok === true);
  // A birthday later in the same month, and in a later month, are the two
  // ways a naive year-subtraction lets somebody through.
  assert('a birthday later this month is still not reached',
    G('2013-08-31', '2026-08-17').ok === false, a.ageOn('2013-08-31', '2026-08-17'));
  assert('nor is one later this year', G('2013-12-01', '2026-08-17').ok === false);
  assert('while one earlier this year has been', G('2013-01-01', '2026-08-17').ok === true);

  // 29 February exists in the bank of possible birth dates and stops existing
  // in three years out of four. Comparing month-then-day rather than building
  // Date objects is what keeps it from sliding to 1 March on the way through.
  assert('a 29 February birth date is handled in a non-leap year',
    a.ageOn('2008-02-29', '2026-02-28') === 17, a.ageOn('2008-02-29', '2026-02-28'));
  assert('and on the leap day itself',
    a.ageOn('2008-02-29', '2028-02-29') === 20, a.ageOn('2008-02-29', '2028-02-29'));

  assert('a date in the future is impossible, not merely young',
    G('2030-01-01', '2026-08-17').reason === 'impossible');
  assert('so is a date no human matches', G('1850-01-01', '2026-08-17').reason === 'impossible');
  for(const junk of ['', 'yesterday', '17/08/2010', '2010-8-1', '20100801', null]){
    assert('a malformed date is refused rather than guessed: ' + JSON.stringify(junk),
      G(junk, '2026-08-17').ok === false && G(junk, '2026-08-17').reason === 'format');
  }

  //===================================================================
  // A REFUSED DATE IS NEVER WRITTEN DOWN
  //===================================================================
  // Storing the birth date of somebody we have just told we cannot accept
  // would be collecting a minor's data at the exact moment of saying we do not.
  const tooYoung = { name:'Kid', country:'Brazil', dob:'2018-01-01', role:'student', consent:true };
  assert('a form for somebody too young does not validate',
    typeof a.validateProfileForm(tooYoung) === 'string');
  assert('and the message says what the rule is, not "invalid"',
    a.validateProfileForm(tooYoung).indexOf('13 and over') > -1,
    a.validateProfileForm(tooYoung));
  assert('and still tells them they can practice anyway',
    a.validateProfileForm(tooYoung).indexOf('without one') > -1);
  assert('nothing writes a profile from a form that did not validate',
    html.indexOf('const bad = validateProfileForm(f);') > -1
    && html.indexOf('if(bad){ accountMsg(bad, false); return; }') > -1);

  //===================================================================
  // THE BIRTHDAY THE CLASS SEES CARRIES NO YEAR
  //===================================================================
  assert('a shared birthday is month and day only',
    a.birthdayFrom('2007-04-11') === '04-11', a.birthdayFrom('2007-04-11'));
  assert('and cannot be built from a date that was never valid',
    a.birthdayFrom('nonsense') === '');
  assert('the only writer of that field refuses anything else',
    html.indexOf("/^[0-9]{2}-[0-9]{2}$/.test(String(mmdd") > -1);

  //===================================================================
  // WHICH OF THE TWO YOU ARE IS ASKED FIRST, NOT BURIED
  //===================================================================
  // It used to be a radio in the middle of the form, which is where a
  // question goes when nobody decided how much it matters. It matters: the
  // two answers lead to different forms, different landing screens, and one
  // of them opens a request a person has to review.
  const rc = a.roleChoiceHtml();
  assert('the two doors are offered before anything is typed',
    rc.indexOf("chooseRole('student')") > -1 && rc.indexOf("chooseRole('teacher')") > -1, rc.slice(0,120));
  assert('and the teacher door says plainly that it asks rather than grants',
    rc.indexOf('asks rather than grants') > -1, rc.slice(0,400));
  assert('and that they can practice while they wait',
    rc.indexOf('practice straight away') > -1);

  // The point of the whole design: Google returns the same account whichever
  // door was used, so a second SIGN-IN button could only ever mean "the one
  // you clicked" — while looking like a security boundary it is not.
  assert('there is no second Google button pretending to be a teacher login',
    (html.match(/signInWithGoogle\(\)/g) || []).length <= 2,
    (html.match(/signInWithGoogle\(\)/g) || []).length);
  assert('the role is read from the choice, never from a control in the form',
    html.indexOf("input[name=\"acct-role\"]") === -1);
  a.chooseRole('teacher');
  assert('choosing teacher is remembered', a.pickedRole() === 'teacher');
  a.chooseRole('student');
  assert('and so is choosing student', a.pickedRole() === 'student');

  //===================================================================
  // THE REST OF THE FORM
  //===================================================================
  const base = { name:'Ana', country:'Brazil', dob:'2000-01-01', role:'student', consent:true };
  assert('a complete student form validates', a.validateProfileForm(base) === null);
  assert('a missing name is caught', typeof a.validateProfileForm({ ...base, name:'' }) === 'string');
  assert('a missing country is caught', typeof a.validateProfileForm({ ...base, country:'' }) === 'string');
  assert('an unticked consent box is caught',
    typeof a.validateProfileForm({ ...base, consent:false }) === 'string');
  assert('a teacher must name a school',
    typeof a.validateProfileForm({ ...base, role:'teacher', school:'' }) === 'string');
  assert('and with one, it validates',
    a.validateProfileForm({ ...base, role:'teacher', school:'CSE' }) === null);
  assert('the country list is not a shortlist that excludes people',
    a.COUNTRIES.length > 180, a.COUNTRIES.length);

  //===================================================================
  // THE NOTICE SAYS WHAT THE CODE ACTUALLY DOES
  //===================================================================
  // A privacy notice describing a different app than the one running is worse
  // than none: it is a promise nobody is keeping.
  const pv = a.privacyText();
  assert('it states the age floor as the code enforces it', pv.indexOf('13 or older') > -1);
  assert('it says the teacher does not get the date of birth',
    pv.indexOf('does not receive your date of birth') > -1);
  assert('it says the birthday year is never shared', pv.indexOf('Never the year') > -1);
  /* THE PROMISE THE APP COULD NOT KEEP.

     The notice said asking would remove your profile and your practice
     history. The rules said students/{uid} could be deleted by nobody at all,
     so the only way to keep it was a person reading an inbox — legal, and a
     promise resting on somebody remembering.

     It is a control now, and these assertions exist because a privacy notice
     that describes a different product than the one running is the one kind
     of documentation that can be held against you. */
  assert('deletion is something they can do, not something they must ask for',
    pv.indexOf('delete everything yourself') > -1, pv.slice(0, 200));
  assert('and the control it describes actually exists',
    html.indexOf('deleteMyAccount()') > -1 && html.indexOf('async deleteEverything()') > -1);
  assert('it still gives a real address, for a copy or a locked-out account',
    pv.indexOf('croxattetechsolutions@gmail.com') > -1);
  assert('the notice does not promise it is reversible, because it is not',
    pv.indexOf('cannot be undone') > -1);
  // Two confirmations and a typed word: the shape every product that has been
  // burned by a one-tap delete converges on.
  assert('deleting asks twice, and the second one has to be typed',
    html.indexOf("prompt('Type DELETE to confirm.')") > -1);
  // The account goes last, or the documents are orphaned with no signed-in
  // user able to reach them — the rules compare against request.auth.uid.
  assert('the login is deleted last, so nothing is left unreachable',
    html.indexOf("await deleteDoc(doc(db, 'users', uid));") <
    html.indexOf('await deleteUser(u);'));
  /* It used to assert the opposite, and the opposite was true when it was
     written: practice worked signed out and the notice said so.

     The sign-in wall made that sentence false, and a privacy notice carrying a
     promise the product no longer keeps is the one kind of documentation that
     gets used against you. Found from a screenshot of the sign-in panel, which
     still said the same thing — three places in total, all corrected in the
     same change as this. */
  assert('the notice explains that an account is required, rather than promising it is not',
    pv.indexOf('Why an account is required') > -1, pv.slice(0, 200));
  assert('and says plainly that this changed, instead of pretending it was always so',
    pv.indexOf('It did not used to be') > -1);
  assert('and ties the age to the wall, which is why the age moved',
    pv.indexOf('the only way in') > -1);

  /* THE NOTICE IS CHECKED AGAINST THE RULES, NOT AGAINST ITSELF.

     Every assertion above reads the notice and asks whether it SAYS the right
     thing. None of them can tell whether what it says is TRUE, because the
     truth lives in another file. That gap is not hypothetical here: the
     notice promised "not the person who runs the app" in those words, the
     owner decided the administrator should read those records, and the rule
     changed — with this suite staying green through the whole thing.

     So this reads firestore.rules and requires the two to agree, in BOTH
     directions. Opening the rule without rewording the notice fails. Wording
     the notice as though the rule were open when it is not fails as well. */
  {
    const rules = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'firestore.rules'), 'utf8');
    const from = rules.indexOf('match /users/{uid}');
    const block = rules.slice(from, rules.indexOf('match /teachers/', from));
    const readLine = block.slice(block.indexOf('allow read:'),
                                block.indexOf(';', block.indexOf('allow read:')));
    const adminMayRead = readLine.indexOf('isAdmin()') > -1;

    assert('the notice and the rules agree on whether the operator can read a profile',
      adminMayRead === (pv.indexOf('the person who runs Ajar') > -1),
      { adminMayRead, noticeSaysSo: pv.indexOf('the person who runs Ajar') > -1 });
    assert('AND the sentence that said he could not is gone rather than contradicted',
      !(adminMayRead && pv.indexOf('Not the person who runs the app') > -1));
    // Reading is what running a service needs. Rewriting somebody's profile is
    // not, and the notice promises that limit by name.
    const delLine = block.slice(block.indexOf('allow delete:'),
                                block.indexOf(';', block.indexOf('allow delete:')));
    assert('deleting a profile is still the owner alone, as the notice promises',
      delLine.indexOf('isAdmin()') === -1
      && pv.indexOf('cannot change or delete your profile') > -1);
  }
  // The claim that is gone: nothing anywhere still offers practice without one.
  assert('no screen still promises the app works signed out',
    html.indexOf('everything still works and stays on') === -1);

  //===================================================================
  // THE OPTIONAL CONSENT IS OPTIONAL, AND SAYS SO
  //===================================================================
  // Bundling this into the required box would make the account conditional on
  // agreeing to it — and consent that is a condition of the service is not
  // freely given, which means it is not consent and the data could not
  // lawfully be used for this at all. Tying them together would have produced
  // the opposite of the intention: the data collected, and no right to use it.
  assert('the research consent is a separate control from the required one',
    html.indexOf('id="acct-research"') > -1 && html.indexOf('id="acct-consent"') > -1);
  assert('AND IT IS NOT TICKED FOR THEM',
    html.indexOf('id="acct-research" checked') === -1
    && html.indexOf('id="acct-research"') > -1);
  assert('refusing it does not stop an account being created',
    a.validateProfileForm({ name:'Ana', country:'Brazil', dob:'2000-01-01',
                            role:'student', consent:true, research:false }) === null);
  assert('and the form never demands it', html.indexOf("!f.research") === -1);
  assert('the notice says leaving it unticked changes nothing',
    pv.indexOf('Leave it unticked and nothing changes') > -1);
  assert('and that it is never a condition of having an account',
    pv.indexOf('never will be') > -1);
  assert('and that counts naming nobody are worked out either way',
    pv.indexOf('name nobody') > -1);

  //===================================================================
  // ERRORS A PERSON CAN ACT ON
  //===================================================================
  assert('a blocked popup says to allow pop-ups',
    a.authErrorText({ code:'auth/popup-blocked' }).indexOf('Allow pop-ups') > -1);
  assert('an unauthorised domain names it as a setting, not a fault of theirs',
    a.authErrorText({ code:'auth/unauthorized-domain' }).indexOf('developer') > -1);
  /* It used to require the opposite, and the opposite cost an afternoon.

     The rule was "never show the person a Firebase code", which is right for
     every error we recognise — "auth/invalid-credential" in front of a teacher
     mid-class is worse than useless. It is wrong for the ones we do not. He
     saw "Something went wrong" while the real answer was auth/internal-error,
     and neither of us could act on it: he had nothing to search for and I had
     nothing to read. An unknown error that hides its own name is a dead end
     for both ends of it. */
  const unknown = a.authErrorText({ code:'auth/whatever' });
  assert('an unknown code still says something in words', unknown.indexOf('Try again') > -1);
  assert('AND NAMES ITSELF, so it can be searched for', unknown.indexOf('auth/whatever') > -1, unknown);
  assert('while a known code is still explained rather than quoted',
    a.authErrorText({ code:'auth/invalid-credential' }).indexOf('auth/') === -1);
  /* The one that actually happened — and the assertion that was wrong here.

     This used to require the message to blame the authorised-domains list.
     That cause was a guess, and it was wrong twice: both real failures were a
     Content-Security-Policy directive, with the domain list already correct.
     A check that pins a guess turns it into a fact nobody rechecks.

     So it now requires the opposite: name the code, and name no cause. */
  {
    const t = a.authErrorText({ code:'auth/internal-error' });
    assert('auth/internal-error names itself so it can be searched for',
      t.indexOf('auth/internal-error') > -1, t);
    assert('AND blames no single setting, because the cause is not knowable here',
      t.indexOf('Authorized domains') === -1 && t.indexOf('authorised domains') === -1, t);
  }

  //===================================================================
  // EMAIL VERIFICATION IS SAID, NOT ENFORCED, AND THE ROOM IS WHY
  //===================================================================
  // The usual answer is to lock the account until the link is clicked. The
  // moment that bites is a student in a lesson who cannot open their email on
  // the school wifi, locked out of the exercise their teacher just put on the
  // wall — a small security gain traded for the exact classroom failure this
  // project keeps fixing.
  const unverified = { isAnonymous:false, email:'ana@x.test', emailVerified:false };
  const verified   = { isAnonymous:false, email:'ana@x.test', emailVerified:true };
  assert('an unverified account is told', a.verifyNoticeHtml(unverified).indexOf('Confirm your email') > -1);
  assert('AND TOLD NOTHING IS LOCKED, which is the part that matters in a lesson',
    a.verifyNoticeHtml(unverified).indexOf('Nothing here is locked') > -1);
  assert('with a way to get the link again', a.verifyNoticeHtml(unverified).indexOf('resendVerification()') > -1);
  assert('a verified account is not nagged', a.verifyNoticeHtml(verified) === '');
  assert('an anonymous visitor is not asked to verify an email they never gave',
    a.verifyNoticeHtml({ isAnonymous:true }) === '');
  /* Counted where it is READ, not searched for as a phrase. The first version
     of this fired on verifyNoticeHtml itself — the function that implements
     the very behaviour it was checking — which is the twelfth time in this
     repo a rule has caught its own documentation or its own implementation.

     Three readings are the whole design: the module reports it, the sign-in
     returns it, and one function draws a notice. A fourth means somebody has
     started gating on it, which is the thing that must not happen quietly. */
  // Lines, not occurrences: `emailVerified: !!currentUser.emailVerified` is
  // one place and two matches, and counting matches made the number mean
  // nothing. Three lines are the whole design — the module reports it, the
  // sign-in returns it, one function draws a notice.
  const readLines = html.split('\n').filter(l => l.indexOf('emailVerified') > -1);
  assert('emailVerified is read in exactly the places that report it (' + readLines.length + ' lines)',
    readLines.length <= 3, 'a fourth reader means somebody has started locking the app on it');

  //===================================================================
  // THE PREVIEW ADDRESS, NAMED BEFORE IT WASTES AN AFTERNOON
  //===================================================================
  // Cloudflare gives every branch a *.pages.dev preview — free, and the
  // obvious way to test before a change reaches a lesson. Those hosts are not
  // in Firebase's authorised list, so sign-in dies there talking about
  // nothing the tester did.
  assert('an unauthorised domain error names the host when it is a preview',
    html.indexOf('Authorized domains') > -1 && html.indexOf('pages') > -1);

  //===================================================================
  // OFFERED, NEVER NAGGED
  //===================================================================
  a.renderInstallOffer();
  assert('nothing is offered before the browser says it is installable',
    (el('install-offer').innerHTML || '') === '', el('install-offer').innerHTML);
  a.dismissInstall();
  a.renderInstallOffer();
  assert('and once dismissed it stays dismissed',
    (el('install-offer').innerHTML || '') === '');

  //===================================================================
  // A COPY OF THE CLASS SHE HOLDS HERSELF
  //===================================================================
  // Firestore's scheduled backups need the paid plan. A file in her hands is
  // free and readable on the day this app is the problem.
  assert('the export exists and is a download, not an email',
    html.indexOf('function exportClassJson()') > -1 && html.indexOf('a.download') > -1);
  assert('and it carries names and results but no email or date of birth',
    html.indexOf('no email, no date of birth') > -1);

  //===================================================================
  // THE NAME A ROOM CALLS YOU BY
  //===================================================================
  /* Two names, because they do two jobs. A class list reading "Rony Croxatte
     Martins" is a list nobody talks like, and it hands the whole class a name
     only the record needed. */
  assert('a blank preferred name falls back to the first name they typed',
    a.firstNameOf('Ana Beatriz Souza') === 'Ana', a.firstNameOf('Ana Beatriz Souza'));
  assert('AND a single-word name is its own first name',
    a.firstNameOf('Ana') === 'Ana');
  assert('and nothing at all does not throw',
    a.firstNameOf('') === '' && a.firstNameOf(null) === '');
  assert('double spaces do not produce an empty first name',
    a.firstNameOf('  Ana   Souza ') === 'Ana', a.firstNameOf('  Ana   Souza '));

  {
    const taken = ['Ana', 'Ana S.'];
    const ideas = a.nameSuggestions('Ana', 'Ana Souza', taken);
    /* The whole point of a suggestion is that it is available. Offering a
       name that is also taken sends the person round the same wall twice,
       and it is the easy mistake here: the surname form is generated from
       their own typing without ever looking at the list. */
    assert('no suggestion is a name that is already taken',
      ideas.every(n => taken.indexOf(n) === -1), ideas);
    assert('AND there is always at least one, because numbers cannot run out',
      ideas.length > 0, ideas);
    assert('a name is preferred to a queue ticket where one exists',
      ideas.indexOf('Ana Souza') > -1, ideas);
  }
  {
    // Nobody typed a surname, so only the numbered forms are possible.
    const ideas = a.nameSuggestions('Ana', 'Ana', ['Ana']);
    assert('somebody with one name still gets an answer',
      ideas.length > 0 && ideas.every(n => n !== 'Ana'), ideas);
  }
  {
    const html2 = a.profileFieldsHtml('Rony Croxatte Martins', '');
    assert('the form asks what to call them, next to the full name',
      html2.indexOf('id="acct-callme"') > -1);
    assert('AND suggests their first name rather than leaving it blank',
      html2.indexOf('placeholder="Rony"') > -1, html2.slice(0, 400));
    /* A phrase that does not span a line break. The first version of this
       matched across one, and the check failed on a rewording that had not
       changed the meaning at all — a false alarm is a check nobody trusts. */
    assert('and says which of the two names the class will see',
      html2.indexOf('The name people here call you by') > -1);
    assert('AND that the full name is for their own language, not the register',
      html2.indexOf('In your own language') > -1);
    assert('and that the class never sees it',
      html2.indexOf('Nobody in your class sees this') > -1);
  }
  /* The record and the room, kept apart at the one place they are written. */
  assert('the profile stores the room name as displayName and the record as fullName',
    html.indexOf('displayName: callMe, fullName: f.name,') > -1);
  assert('AND the class record is written with the room name, not the full one',
    html.indexOf('setStudentName(callMe);') > -1);
  assert('a name already in the class is refused before anything is written',
    html.indexOf('Somebody in this class is already called ') > -1
    && html.indexOf('const taken = await classNamesOtherThanMine();') <
       html.indexOf('await window.CloudSync.saveProfile({'));
  /* A read that cannot run must not block an account. Reads are exempt in
     this codebase, and the worst case here is two people called Ana in one
     list — visible to the teacher, and nobody's work is lost. */
  assert('and a failed check lets them through instead of blocking the signup',
    html.indexOf('could not check whether that name is already in the class') > -1);
  /* The corner reads a localStorage key that only signup writes, so on a
     second device somebody with an account of six months was greeted by
     nobody. */
  assert('a restored session fills the corner from the profile',
    html.indexOf('if(ACCOUNT_PROFILE && ACCOUNT_PROFILE.displayName) setStudentName(ACCOUNT_PROFILE.displayName);') > -1);

  //===================================================================
  // THE FORM LOOKS LIKE THE REST OF THE FORM
  //===================================================================
  /* The comment above the input rules in this file warns that a type added
     later gets "styled by nobody, discovered by whoever it is shown to". It
     lists number, search, tel and url. It does not list date — so the date
     of birth sat narrow and square in a row of wide rounded fields, and the
     person who discovered it was the owner, typing the first real date of
     birth this app has ever taken. */
  assert('the date of birth is styled like every other field',
    html.indexOf('input[type=date]{ border-radius:var(--r-sm); }') > -1);
  assert('AND the browser is stopped from drawing its own narrow box',
    html.indexOf('input[type=date]::-webkit-date-and-time-value') > -1);

  //===================================================================
  // A PASSWORD IS TYPED TWICE ON THE WAY OUT, ONCE ON THE WAY IN
  //===================================================================
  /* Asymmetric on purpose. A mistyped password signing IN is one failed
     attempt and a clear message. A mistyped password signing UP locks
     somebody out of an account they never got into, and the way back is a
     reset email to an address they may have mistyped in the field above it. */
  assert('creating an account asks for the password twice',
    html.indexOf('id="acct-pass2"') > -1
    && html.indexOf("if(f.pass !== f.pass2)") > -1);
  assert('AND signing in does not, because there is nothing to protect there',
    (html.match(/id="acct-pass2"/g) || []).length === 1);

  //===================================================================
  // SIGNING IN ANONYMOUSLY DOES NOT EVICT SOMEBODY WHO IS SIGNED IN
  //===================================================================
  /* The bug he reported as "it keeps asking me to log in again", which was
     also the bug he reported as "it does not take me to my screen" — one
     cause wearing two costumes, and neither of them named it.

     signInAnonymously() ran unconditionally on every page load. It does not
     hand back whoever is already signed in: with a Google session in place
     it mints a NEW anonymous user and replaces it. Restoring a saved session
     is asynchronous, so the two raced. When the anonymous call won, a
     signed-in person became a stranger — the account screen asked them to
     sign in, and routeHome() gave up silently because an anonymous session
     is not an account.

     Nothing here could see it: every assertion in this suite runs against a
     stubbed CloudSync, so the real listener was never exercised. What CAN be
     asserted is the shape — that the call is inside the listener and behind
     a test for nobody being there. */
  assert('nothing signs in anonymously without first asking whether somebody is here',
    html.indexOf('if(!user) signInAnonymously(auth)') > -1);
  assert('AND the unconditional call at module level is gone',
    html.indexOf('\n    signInAnonymously(auth).catch') === -1);
  assert('it only decides once, so a later sign-out does not mint a stranger',
    html.indexOf('if(!authBootstrapped){') > -1);
  /* Every CloudSync method awaits authReady. A promise that never settles is
     the quietest failure there is — no error, no screen, nothing to report. */
  /* Inside the catch, not merely somewhere after it. The first version of
     this compared indexOf against indexOf and matched the OTHER
     authReadyResolve, three hundred lines earlier — it would have passed
     with the fix removed. */
  assert('and a failed anonymous sign-in still releases everything waiting on it',
    html.slice(html.indexOf('anonymous sign-in failed'),
               html.indexOf('anonymous sign-in failed') + 700)
        .indexOf('authReadyResolve();') > -1);

  //===================================================================
  // THE NAME CAN BE CHANGED AFTER THE DAY IT WAS CHOSEN
  //===================================================================
  /* There was no way in at all. The field existed only on the signup form,
     so everybody who already had an account was stuck — including the owner,
     who asked for "Rony" and had nowhere to type it. */
  assert('a signed-in person can change what they are called',
    html.indexOf('onclick="editCallMe(true);return false"') > -1
    && html.indexOf('async function saveCallMe()') > -1);
  /* A rename that half-lands is this app's oldest failure shape: right where
     the person is looking, stale everywhere else. The teacher reads the class
     record, which pushSummary only writes when somebody practises. */
  assert('AND the class record is renamed too, not left until they next practise',
    html.indexOf('async renameInClass(name)') > -1
    && html.indexOf('await window.CloudSync.renameInClass(wanted);') > -1);
  assert('with its own sentence, because it fails separately from the profile',
    html.indexOf('your class list has not caught up yet') > -1);
  assert('the same name is refused on a change as on a signup',
    (html.match(/Somebody in this class is already called /g) || []).length === 2);
  /* saveProfile overwrites the whole document, so editing a name used to move
     the day the account was created to today. */
  assert('and editing a name does not restamp when the account was created',
    html.indexOf('createdAt: profile.createdAt || Date.now(),') > -1);

  console.log(results.join('\n'));
  const fails = results.filter(r => r.indexOf('FAIL') > -1);
  console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                           : ('ALL ' + results.length + ' CHECKS PASS'));
  if(fails.length) process.exitCode = 1;
})();
