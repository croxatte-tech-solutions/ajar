// Class progress, and the note that answers it.
//
// The rule this file exists to protect: the app produces the DIAGNOSIS and
// the teacher produces the ADVICE. So the checks are less about a panel
// rendering and more about that boundary holding — the summary is computed
// from real attempts, the note is never generated, and one student can
// never see another's.
// Class roster. The feature exists for one reason: a typed name produced
// "Ana", "ana " and "Anna" as three students, and the history that feeds
// every pattern split without anyone noticing. So the checks here are not
// really about a list — they are about that split being impossible.
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/type\s*=\s*["']module["']/.test(m[1]))
  .map(m => m[2]);
const combined = blocks.join('\n;\n');

function makeElStub(){
  return { style:{}, innerHTML:'', textContent:'', value:'', checked:false,
    classList:{toggle(){},add(){},remove(){}}, appendChild(){}, addEventListener(){},
    // ChildNode.remove(). A real element has it everywhere the app runs, and
    // this stub did not — so hideStudentSkeleton() threw inside renderStudent
    // and took nine checkers down with it. The stub being LESS capable than
    // the browser is the mirror of the trap 54e2f1d recorded, and it fails
    // the same way: the tests disagree with a shape the app produces fine.
    // Detachment is not modelled because nothing under test asks whether the
    // element went away, only that removing it does not throw.
    remove(){},
    querySelector(){return makeElStub();}, querySelectorAll(){return [];},
    closest(){return null;}, select(){}, focus(){}, remove(){}, insertBefore(){} };
}
function makeDocStub(){
  const els = {};
  return { getElementById(id){ if(!els[id]) els[id]=makeElStub(); return els[id]; },
    createElement(){return makeElStub();}, querySelector(){return makeElStub();},
    querySelectorAll(){return [];}, addEventListener(){}, body:makeElStub() };
}
const store = {};
const localStorage = { getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} };

const testScript = `
${combined}
;
(async function(){
  const results = [];
  function assert(n,c){ results.push(n+': '+(c?'PASS':'FAIL')); }

  localStorage.removeItem('ajar_roster');
  localStorage.removeItem('ajar_teacher_notes');
  localStorage.removeItem('ajar_usage_log_by_name');
  localStorage.removeItem('ajar_student_name');
  ['Alex','Sam'].forEach(n => { document.getElementById('roster-name').value = n; rosterAddStudent(); });

  // --- the diagnosis comes from real attempts, not from nothing ---
  assert('a student with no attempts has no summary', progressSummary('Alex') === null);
  for(let i=0;i<4;i++) logUsage('daily-read','money', 1, 'Alex');
  for(let i=0;i<4;i++) logUsage('interview','career', 0.2, 'Alex');
  const s = progressSummary('Alex');
  assert('the summary counts every attempt', s.attemptsTotal === 8);
  assert('it separates today from the total', s.attemptsToday === 8);
  assert('it names the weakest task type', s.weakType === 'interview');
  assert('it reports that weakness as a percentage', s.weakAvg === 20);
  // A single bad attempt is bad luck, not a pattern.
  logUsage('sentence','travel', 0, 'Sam');
  const j = progressSummary('Sam');
  assert('one attempt is not yet a weak spot', j && j.weakType === null);

  // --- the summary is small on purpose ---
  // The teacher's screen reads one of these per student. If it grew to
  // carry the whole history, a class of 13 would cost ~780 reads a refresh
  // and exhaust the free quota inside a lesson.
  assert('the summary carries no raw history',
    Object.keys(s).every(k => ['attemptsTotal','attemptsToday','weakType','weakAvg','weakTries','trend'].indexOf(k) > -1));

  // --- the advice is the teacher's, and only hers ---
  saveTeacherNote('Alex', 'Keep going even when a word escapes you.');
  assert('her note is stored against the student', loadTeacherNotes()['Alex'].indexOf('Keep going') > -1);
  assert('no note is invented for anyone else', loadTeacherNotes()['Sam'] === undefined);

  setStudentName('Alex');
  assert('the student sees the note', teacherNoteHtml().indexOf('Keep going') > -1);
  // Compare against the ESCAPED name: TEACHER_NAME contains an apostrophe,
  // and asserting raw text against innerHTML is how a check passes or fails
  // for reasons that have nothing to do with the feature.
  assert('and who wrote it', teacherNoteHtml().indexOf(escapeHtml(TEACHER_NAME)) > -1);
  setStudentName('Sam');
  assert('a classmate sees nothing of it', teacherNoteHtml() === '');

  // Clearing is a real action, not a leftover.
  saveTeacherNote('Alex', '   ');
  assert('an emptied note is removed, not blanked', loadTeacherNotes()['Alex'] === undefined);

  // --- closed, because her screen is the classroom screen ---
  // A student's weakest skill is theirs to know, not the room's, and she has
  // one screen which is usually mirrored to the TV. So this arrives shut, and
  // shut means the rows are not in the page at all — rendering them hidden
  // would leave every student's weak spot there for anyone who opened the
  // inspector or was handed the laptop.
  setStudentName('');
  window._privateShown = null;
  renderClassProgress();
  const shut = document.getElementById('class-progress').innerHTML;
  assert('the panel arrives closed', shut.indexOf('Show me how the class is doing') > -1);
  assert('and no weak spot is anywhere in the page while it is',
    shut.indexOf('Weakest so far') === -1);
  assert('it says why, rather than just being locked',
    shut.indexOf('theirs to know') > -1);
  assert('but she can see there is something behind it',
    shut.indexOf('2 students on your list') > -1);

  // --- opened, which is the whole point of having it ---
  // Be on the tab first. The clear below fires on a CHANGE of tab, so a test
  // that opens the panel without ever having navigated to it is testing a
  // switch that never happens.
  showSection(null, 'grp-private');
  togglePrivate(PRIVATE_INSIGHT_KEY);
  renderClassProgress();
  const html = document.getElementById('class-progress').innerHTML;
  assert('every student on the list appears', html.indexOf('Alex') > -1 && html.indexOf('Sam') > -1);
  assert('the panel says the advice is hers', html.indexOf('never writes it for you') > -1);
  assert('and it warns her the room may be reading it',
    html.indexOf('showing on this screen') > -1);
  assert('with a way to put it away again', html.indexOf('Hide this again') > -1);

  // Switching tabs has to take it off the screen, which means REDRAWING and
  // not only forgetting. The first version cleared the flag and left the
  // revealed markup in the page — the state was right and the page still had
  // every weak spot on it.
  showSection(null, 'grp-today');
  const after = document.getElementById('class-progress').innerHTML;
  assert('leaving the tab forgets it was open', privateShown().size === 0);
  assert('and no weak spot is left sitting in the page',
    after.indexOf('Weakest so far') === -1);
  assert('so coming back finds it closed',
    after.indexOf('Show me how the class is doing') > -1);

  // Two nav entries reading "Progress" is a menu nobody can use.
  const labels = TEACHER_SECTIONS.map(x => x.label);
  assert('no two sections share a label', new Set(labels).size === labels.length);

  console.log(results.join('\\n'));
  const fails = results.filter(r=>r.includes('FAIL'));
  globalThis.__fails = fails.length;
  console.log(fails.length ? ('FAILURES: '+fails.length+' / '+results.length) : ('ALL '+results.length+' CHECKS PASS'));
})();
`;

const sandbox = {
  btoa: s=>Buffer.from(s,'binary').toString('base64'),
  atob: s=>Buffer.from(s,'base64').toString('binary'),
  document: makeDocStub(),
  window: { addEventListener(){}, scrollTo(){}, _lrState:null, _sentenceState:null },
  localStorage,
  location: { origin:'https://example.com', pathname:'/app', hash:'', search:'' },
  navigator: { language:'en-US', languages:['en-US'], clipboard:{writeText:()=>Promise.resolve()}, mediaDevices:undefined },
  SpeechSynthesisUtterance: function(t){ this.text=t; },
  speechSynthesis: { speak(){}, getVoices(){return [];}, addEventListener(){}, cancel(){} },
  URLSearchParams,
  console, Date, Math, JSON, Array, Object, String, Number, Intl, Set, Promise,
  // The app registers live intervals the moment it loads — the class
  // progress refresh and the welcome screen's language swap. A real
  // interval holds Node's event loop open, so the process never exits
  // and the verdict cannot be read from an exit code at all. unref lets
  // them tick without being a reason to stay alive.
  setInterval: (...a) => { const t = setInterval(...a); if (t && t.unref) t.unref(); return t; },
  clearInterval, setTimeout, clearTimeout,
};
sandbox.self = sandbox.window;
sandbox.globalThis = sandbox;
// The panel refuses to render without a signed-in teacher, and showSection
// bails for the same reason — so the tab-switching assertions below need one.
const cloudStub = new Proxy({}, {
  get(_, prop){
    if(prop === 'currentUser') return () => ({ isTeacher: true, schoolId: 'check-school' });
    return () => Promise.resolve();
  },
});
sandbox.window.CloudSync = cloudStub;
sandbox.CloudSync = cloudStub;
vm.createContext(sandbox);
vm.runInContext(testScript, sandbox).catch(e => { console.error('RUNTIME ERROR:', e.stack); process.exitCode = 1; });

// Printed text is not a result anyone can act on: a caller cannot tell a
// run that failed its checks from one that crashed before printing. This
// carries the verdict out as an exit code. beforeExit fires once the loop
// drains — after the body has settled — so it covers the files that end
// synchronously and the ones that end on a promise alike.
process.on('beforeExit', () => { if (sandbox.__fails) process.exitCode = 1; });
