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
  const wrapHtml = () => document.getElementById('practice-wrap').innerHTML;

  // --- with no roster, the app must still work ---
  localStorage.removeItem('ajar_roster');
  localStorage.removeItem('ajar_student_name');
  renderNamePrompt();
  assert('with no class list a student can still type a name', wrapHtml().indexOf('name-input') > -1);

  // --- building the list ---
  ['Alex','Sam','Marisol'].forEach(n => {
    document.getElementById('roster-name').value = n;
    rosterAddStudent();
  });
  assert('three students were added', loadRoster().students.length === 3);

  // The whole point: two spellings of one person cannot both exist.
  document.getElementById('roster-name').value = 'ALEX';
  rosterAddStudent();
  document.getElementById('roster-name').value = 'alex';
  rosterAddStudent();
  assert('a name differing only in case is refused', loadRoster().students.length === 3);
  document.getElementById('roster-name').value = '   ';
  rosterAddStudent();
  assert('a blank name is refused', loadRoster().students.length === 3);

  // --- attendance marks the day, never the identity ---
  rosterTogglePresent('Sam');
  assert('a student can be marked here today', loadRoster().present.indexOf('Sam') > -1);
  rosterTogglePresent('Sam');
  assert('and unmarked again', loadRoster().present.indexOf('Sam') === -1);
  rosterTogglePresent('Marisol');
  assert('marking attendance does not change the class list', loadRoster().students.length === 3);
  // A student who missed Tuesday is still themselves on Thursday. If
  // attendance filtered the list, their history would break the moment
  // they were absent once — the exact failure this feature prevents.
  renderNamePrompt();
  assert('an absent student can still find their name', wrapHtml().indexOf('Alex') > -1);

  // --- the student screen ---
  assert('the list replaces the text box', wrapHtml().indexOf('name-input') === -1);
  ['Alex','Sam','Marisol'].forEach(n => {
    assert('the list offers ' + n, wrapHtml().indexOf('>' + n + '<') > -1);
  });
  assert('there is a way out for someone not on the list', wrapHtml().indexOf('showTypeNameInstead') > -1);

  // Tapping is the only path, so the name taken is exactly the one stored.
  pickName('Marisol');
  assert('tapping a name identifies the student exactly', getStudentName() === 'Marisol');

  // --- removing ---
  rosterRemove('Sam');
  assert('a student can be removed', loadRoster().students.indexOf('Sam') === -1);
  assert('removing one leaves the others', loadRoster().students.length === 2);
  assert('removing also clears their attendance', (loadRoster().present || []).indexOf('Sam') === -1);

  // --- emptying the list returns the app to typing ---
  loadRoster().students.slice().forEach(n => rosterRemove(n));
  localStorage.removeItem('ajar_student_name');
  renderNamePrompt();
  assert('an empty list falls back to typing', wrapHtml().indexOf('name-input') > -1);

  // --- THE CLASS LIST HAS TO REACH THE CLASS, AND SHE HAS TO KNOW IF IT DID ---
  //
  // Reported from a real class: she typed the names and the students could not
  // pick them. The cause was one character of code — pushRoster(r).catch(()=>{})
  // — because saveRoster writes localStorage FIRST. Her panel showed thirteen
  // names whether or not the write reached Firestore, so a failure was
  // invisible to the one person who could fix it.
  // The comment beside this in index.html deliberately describes the old shape
  // instead of quoting it — the first version of this rule fired on its own
  // explanation, the fifth time in this project a check has reported its own
  // subject matter. Rewording the comment was smaller than escaping a
  // comment-stripper through a template literal.
  assert('the class list publish is no longer fire and forget',
    __html.indexOf('pushRoster(r).catch(()=>{})') === -1);
  assert('she is told while it is sending', /ROSTER_STATE\.status = 'saving'/.test(__html));
  assert('and told plainly when it arrives', /Your students can see/.test(__html));
  assert('signed out is named as its own failure, since it is the likely one',
    /ROSTER_STATE\.status = denied/.test(__html) && /You are signed out/.test(__html));
  assert('and there is a way to send it again', /function retryRoster\(\)/.test(__html));
  assert('the failure says her screen and theirs disagree',
    /your screen looks right and theirs does not/.test(__html));

  // --- AND THE STUDENT MUST NOT BE OFFERED TYPING WHILE THE LIST IS COMING ---
  //
  // renderStudent runs long before the list lands. A student who looked
  // immediately was offered "type your first name" — the very thing the list
  // exists to replace, because a typed name makes Ana, ana and Anna into three
  // students with three separate histories.
  setStudentName('');
  saveRoster({ students: [], present: [] });
  location.search = '?school=roster-school';
  setRosterArrival('waiting');
  renderNamePrompt();
  const waiting = document.getElementById('practice-wrap').innerHTML;
  assert('while the list is still coming, no text box is offered',
    waiting.indexOf('name-input') === -1);
  assert('and the student is told what is happening',
    waiting.indexOf('Looking for your class list') > -1);

  setRosterArrival('none');
  renderNamePrompt();
  const noList = document.getElementById('practice-wrap').innerHTML;
  assert('once it is known there is no list, typing is offered',
    noList.indexOf('name-input') > -1);

  saveRoster({ students: ['Ana', 'Bruno'], present: [] });
  setRosterArrival('arrived');
  renderNamePrompt();
  const withList = document.getElementById('practice-wrap').innerHTML;
  assert('and when it arrives, names are tapped rather than typed',
    withList.indexOf('pickName(') > -1 && withList.indexOf('Tap your name') > -1);
  assert('with typing kept as the way out for someone not on it',
    withList.indexOf('My name isn') > -1);

  // The wait has to end. A student staring at "looking for your class list"
  // because a fetch never resolved is worse than being asked to type.
  // \\\\d, not \\d: this probe is a template literal and eats one backslash before
  // the regex compiles. Sixth time in this project.
  assert('the wait is bounded', /const ROSTER_WAIT_MS = \\d+/.test(__html));
  assert('and short enough not to read as broken',
    Number((__html.match(/const ROSTER_WAIT_MS = (\\d+)/) || [])[1]) <= 3000);

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
  window: { addEventListener(){}, _lrState:null, _sentenceState:null },
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
sandbox.__html = html;   // algumas asserções olham o código, não o comportamento
vm.createContext(sandbox);
vm.runInContext(testScript, sandbox).catch(e => { console.error('RUNTIME ERROR:', e.stack); process.exitCode = 1; });

// Printed text is not a result anyone can act on: a caller cannot tell a
// run that failed its checks from one that crashed before printing. This
// carries the verdict out as an exit code. beforeExit fires once the loop
// drains — after the body has settled — so it covers the files that end
// synchronously and the ones that end on a promise alike.
process.on('beforeExit', () => { if (sandbox.__fails) process.exitCode = 1; });
