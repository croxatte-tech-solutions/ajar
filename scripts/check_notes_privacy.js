// A teacher's written note about one student must not land on another
// student's device.
//
// SEC-001, and the worst finding of the audit. The old shape was ONE document,
// `classroom/notes`, holding `{ notes: { Ana: "...", Bruno: "..." } }`. The
// rule on `classroom/{docId}` is `allow read: if isSignedIn()`, and every
// visitor to this app is signed in anonymously — so that document was readable
// by anyone. Worse than readable: `hydrateNotesFromCloud()` fetched it on EVERY
// page load and wrote the whole object into `localStorage`, so a teacher's
// private evaluative feedback about all thirteen students was sitting on each
// of their phones. Only the UI filtered it down to the reader's own note.
//
// No exploit was required. A student opens the browser's storage inspector.
//
// What the fix achieves, and what it does not:
//   DOES     no device fetches or stores a note addressed to someone else
//   DOES     what an older build already leaked is pruned on next load
//   DOES NOT make notes cryptographically private — a student who knows a
//            classmate's name can still request that one document. Anonymous
//            auth provides no identity to check a request against. That is the
//            same accepted limit as attempts history, and it is a different
//            thing from the automatic whole-class dump this removes.
//
// No template literal in this file: it tests string keys and storage shapes.
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

// A fake Firestore that records what was asked for. The question this file
// exists to answer is not "what is displayed" but "what was FETCHED and
// STORED", so the transport has to be observable.
function boot(opts){
  opts = opts || {};
  const store = Object.assign({}, opts.storage || {});
  const cloudNotes = Object.assign({}, opts.cloudNotes || {});
  const asked = [];
  const wrote = [];
  const cloud = new Proxy({}, {
    get(_, prop){
      if(prop === 'currentUser') return () => (opts.teacher
        ? { isTeacher: true, schoolId: 'notes-school' } : null);
      // Undefined is the student asking for THEIR OWN, which the module
      // resolves from the signed-in account — the caller cannot name anybody.
      if(prop === 'pullNote') return async uid => {
        asked.push(uid === undefined ? '(mine)' : uid);
        return uid === undefined ? (opts.myNote || '') : (cloudNotes[String(uid)] || '');
      };
      if(prop === 'pushNote') return async (uid, text) => { wrote.push({ uid, text }); cloudNotes[String(uid)] = text; };
      if(prop === 'pullClassMembers') return async () => (opts.members || []);
      if(prop === 'pullClassSummaries') return async () => ({});
      // The old whole-class methods must not exist any more.
      if(prop === 'pullNotes' || prop === 'pushNotes') return undefined;
      return () => Promise.resolve();
    },
  });
  const sandbox = {
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    document: { getElementById: () => el(), createElement: () => el(), querySelector: () => el(),
                querySelectorAll: () => [], addEventListener(){}, body: el() },
    window: { addEventListener(){}, scrollTo(){} },
    localStorage: { getItem: k => (k in store ? store[k] : null),
                    setItem: (k, v) => { store[k] = String(v); },
                    removeItem: k => { delete store[k]; } },
    location: { origin:'https://example.com', pathname:'/', hash:'', search:'?school=notes-school' },
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
  sandbox.window.CloudSync = cloud;
  sandbox.CloudSync = cloud;
  vm.createContext(sandbox);
  vm.runInContext(blocks.join('\n;\n') +
    ';globalThis.__api={setStudentName,getStudentName,loadTeacherNotes,saveTeacherNote,' +
    'setClassMembers,uidForName,refreshClassMembers,' +
    'hydrateNotesFromCloud,pruneForeignNotes,teacherNoteHtml,saveRoster,loadRoster,' +
    'hydrateAllNotesForTeacher};', sandbox);
  return { api: sandbox.__api, store, asked, wrote, cloudNotes };
}

const CLASS_NOTES = {
  'ana': 'Your emails are strong. Work on the interview.',
  'bruno': 'Struggling with listening. Sit closer to the speaker.',
  'carla': 'Excellent progress. Consider the full section next week.',
};

//=====================================================================
// A STUDENT'S DEVICE FETCHES ONLY ITS OWN NOTE
//=====================================================================
(async () => {
  const s = boot({ cloudNotes: CLASS_NOTES, myNote: 'Watch the -ed endings.' });
  s.api.setStudentName('Ana');
  await s.api.hydrateNotesFromCloud();

  assert('the device asked for exactly one note', s.asked.length === 1, s.asked);
  // Stronger than "it asked for its own": it cannot ask for anyone else's.
  // No id crosses the wire, so the account decides what comes back and the
  // page has no way to name a classmate even if its code were changed.
  assert('AND IT NAMED NOBODY — the account decides what comes back',
    s.asked[0] === '(mine)', s.asked);

  const stored = s.api.loadTeacherNotes();
  assert('only one note is stored on the device', Object.keys(stored).length === 1, Object.keys(stored));
  assert('and it is the right one', stored['Ana'] === 'Watch the -ed endings.');
  assert('no classmate note is anywhere in this device storage',
    JSON.stringify(s.store).indexOf('Struggling with listening') === -1
    && JSON.stringify(s.store).indexOf('Excellent progress') === -1);

  //===================================================================
  // A DEVICE WITH NO NAME ASKS FOR NOTHING
  //===================================================================
  // The old build downloaded every note in the class before anyone had said
  // who they were.
  const anon = boot({ cloudNotes: CLASS_NOTES });
  anon.api.setStudentName('');
  await anon.api.hydrateNotesFromCloud();
  assert('a device with no name fetches no notes at all', anon.asked.length === 0, anon.asked);
  assert('and stores none', Object.keys(anon.api.loadTeacherNotes()).length === 0);

  //===================================================================
  // WHAT AN OLDER BUILD ALREADY LEAKED IS PRUNED
  //===================================================================
  // Fixing the write path does not empty the phones that already have it.
  const dirty = boot({
    cloudNotes: CLASS_NOTES,
    storage: { 'ajar_student_name': 'Ana',
               'ajar_teacher_notes': JSON.stringify({ Ana: CLASS_NOTES.ana,
                 Bruno: CLASS_NOTES.bruno, Carla: CLASS_NOTES.carla }) },
  });
  assert('the leaked state is present before pruning',
    Object.keys(dirty.api.loadTeacherNotes()).length === 3);
  const removed = dirty.api.pruneForeignNotes();
  assert('pruning reports what it removed', removed === 2, removed);
  const left = dirty.api.loadTeacherNotes();
  assert('only the reader own note survives', Object.keys(left).length === 1, Object.keys(left));
  assert('and it is theirs', left['Ana'] === CLASS_NOTES.ana);
  assert('the classmates notes are gone from storage entirely',
    JSON.stringify(dirty.store).indexOf('Struggling with listening') === -1);
  assert('pruning twice is a no-op', dirty.api.pruneForeignNotes() === 0);

  //===================================================================
  // BUT NOT ON THE TEACHER DEVICE, WHERE THAT OBJECT IS HER WORK
  //===================================================================
  const hers = boot({
    teacher: true, cloudNotes: CLASS_NOTES,
    storage: { 'ajar_teacher_notes': JSON.stringify({ Ana: CLASS_NOTES.ana,
      Bruno: CLASS_NOTES.bruno, Carla: CLASS_NOTES.carla }) },
  });
  assert('pruning removes nothing on the teacher device', hers.api.pruneForeignNotes() === 0);
  assert('and every note she wrote is still there',
    Object.keys(hers.api.loadTeacherNotes()).length === 3);

  //===================================================================
  // SHE PUBLISHES ONLY THE NOTE SHE CHANGED
  //===================================================================
  const w = boot({ teacher: true, cloudNotes: {} });
  // She types a name; the database files people by account. The class members
  // list is the bridge, and it is the only thing that resolves one to the
  // other.
  w.api.setClassMembers([{ uid: 'uid_bruno', displayName: 'Bruno' },
                         { uid: 'uid_ana', displayName: 'Ana' }]);
  w.api.saveTeacherNote('Bruno', 'Try the announcements again tonight.');
  assert('one write, not a whole-class object', w.wrote.length === 1, w.wrote.length);
  assert('ADDRESSED TO THE ACCOUNT, NOT TO A TYPED NAME',
    w.wrote[0].uid === 'uid_bruno', w.wrote[0]);
  assert('carrying only that text', w.wrote[0].text === 'Try the announcements again tonight.');

  // A name on her list belonging to nobody who has signed in is a real state,
  // not an error — and writing a note into a document no account can reach
  // would be the silent failure this project keeps removing.
  const orphan = boot({ teacher: true, cloudNotes: {} });
  orphan.api.setClassMembers([]);
  orphan.api.saveTeacherNote('Nobody', 'anything');
  assert('a name with no account behind it writes nothing to the cloud',
    orphan.wrote.length === 0, orphan.wrote);
  assert('but the note is still kept on her own device',
    (orphan.api.loadTeacherNotes() || {}).Nobody === 'anything');

  //===================================================================
  // AND HER OWN PANEL STILL GETS ALL OF THEM, ONE BY ONE
  //===================================================================
  const panel = boot({ teacher: true, cloudNotes: { uid_a: 'a', uid_b: 'b', uid_c: 'c' } });
  panel.api.setClassMembers([{ uid:'uid_a', displayName:'Ana' },
                             { uid:'uid_b', displayName:'Bruno' },
                             { uid:'uid_c', displayName:'Carla' }]);
  panel.api.saveRoster({ students: ['Ana', 'Bruno', 'Carla'], present: [] });
  await panel.api.hydrateAllNotesForTeacher();
  assert('she fetches one document per student', panel.asked.length === 3, panel.asked);
  assert('each by account', panel.asked.every(a => String(a).indexOf('uid_') === 0), panel.asked);
  assert('and ends up with all three', Object.keys(panel.api.loadTeacherNotes()).length === 3);

  //===================================================================
  // THE OLD SHAPE MUST BE GONE FROM THE CODE
  //===================================================================
  assert('nothing pushes a whole-class notes object', html.indexOf('pushNotes(') === -1);
  assert('nothing pulls one', html.indexOf('pullNotes(') === -1);
  assert('no code writes to the shared classroom/notes document',
    html.indexOf("'classroom', 'notes'") === -1);
  /* THE GAP THAT WAS ASSERTED AS KNOWN, CLOSED.

     The note used to sit at classroom/note_{typed name}. classroom/ has to
     stay readable without an account for a QR to work at all, and the class
     list publishes every classmate's name — so any student in the class could
     read what their teacher had written about the one beside them, and no
     rule could stop it. "Only Ana" is not expressible about a string in a
     text box. It is expressible about a uid. */
  assert('no note is filed under a typed name any more',
    html.indexOf("'note_' + String(name)") === -1);
  assert('notes hang off the student record they are about',
    html.indexOf("'students', uid, 'private', 'note'") > -1);
  assert('and a student reading their own passes no id at all, so they can only get theirs',
    html.indexOf('await window.CloudSync.pullNote();') > -1);

  console.log(results.join('\n'));
  const fails = results.filter(r => r.includes('FAIL'));
  console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                           : ('ALL ' + results.length + ' CHECKS PASS'));
  if(fails.length) process.exitCode = 1;
})();
