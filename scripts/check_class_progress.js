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
    querySelector(){return makeElStub();}, closest(){return null;}, select(){}, focus(){} };
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

  localStorage.removeItem('cse_roster');
  localStorage.removeItem('cse_teacher_notes');
  localStorage.removeItem('cse_usage_log_by_name');
  localStorage.removeItem('cse_student_name');
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

  // --- the panel ---
  setStudentName('');
  renderClassProgress();
  const html = document.getElementById('class-progress').innerHTML;
  assert('every student on the list appears', html.indexOf('Alex') > -1 && html.indexOf('Sam') > -1);
  assert('the panel says the advice is hers', html.indexOf('never writes it for you') > -1);

  // Two nav entries reading "Progress" is a menu nobody can use.
  const labels = TEACHER_SECTIONS.map(x => x.label);
  assert('no two sections share a label', new Set(labels).size === labels.length);

  console.log(results.join('\\n'));
  const fails = results.filter(r=>r.includes('FAIL'));
  console.log(fails.length ? ('FAILURES: '+fails.length+' / '+results.length) : ('ALL '+results.length+' CHECKS PASS'));
})();
`;

const sandbox = {
  btoa: s=>Buffer.from(s,'binary').toString('base64'),
  atob: s=>Buffer.from(s,'base64').toString('binary'),
  document: makeDocStub(),
  window: { addEventListener(){}, _lrState:null, _sentenceState:null },
  localStorage,
  location: { origin:'https://example.com', pathname:'/app', hash:'', search:'' },
  navigator: { language:'en-US', languages:['en-US'], clipboard:{writeText:()=>Promise.resolve()}, mediaDevices:undefined },
  SpeechSynthesisUtterance: function(t){ this.text=t; },
  speechSynthesis: { speak(){}, getVoices(){return [];}, addEventListener(){}, cancel(){} },
  URLSearchParams,
  console, Date, Math, JSON, Array, Object, String, Number, Intl, Set, Promise,
  setInterval, clearInterval, setTimeout, clearTimeout,
};
sandbox.self = sandbox.window;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(testScript, sandbox).catch(e => { console.error('RUNTIME ERROR:', e.stack); process.exitCode = 1; });
