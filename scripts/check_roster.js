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
  const wrapHtml = () => document.getElementById('practice-wrap').innerHTML;

  // --- with no roster, the app must still work ---
  localStorage.removeItem('cse_roster');
  localStorage.removeItem('cse_student_name');
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
  localStorage.removeItem('cse_student_name');
  renderNamePrompt();
  assert('an empty list falls back to typing', wrapHtml().indexOf('name-input') > -1);

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
vm.createContext(sandbox);
vm.runInContext(testScript, sandbox).catch(e => { console.error('RUNTIME ERROR:', e.stack); process.exitCode = 1; });

// Printed text is not a result anyone can act on: a caller cannot tell a
// run that failed its checks from one that crashed before printing. This
// carries the verdict out as an exit code. beforeExit fires once the loop
// drains — after the body has settled — so it covers the files that end
// synchronously and the ones that end on a promise alike.
process.on('beforeExit', () => { if (sandbox.__fails) process.exitCode = 1; });
