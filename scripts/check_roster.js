// The class list, which she no longer types.
//
// It existed because a typed name produced "Ana", "ana " and "Anna" as three
// students and split the history that feeds every pattern. The answer then
// was to make her type each name once and have students tap theirs.
//
// The answer now is that nobody types anything: students have accounts, an
// account carries the name its owner chose, and the list is read from who
// joined. That also fixes a case the old design could not — several of these
// students come from Vietnam and Indonesia and take a Western name on
// arrival, so the name she would have typed is not the name they use, and the
// two would never have met.
//
// So these checks are about the same thing they always were: one student
// cannot become two. The mechanism changed; the guarantee did not.
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
  function assert(n, c, d){ results.push(n + ': ' + (c ? 'PASS' : 'FAIL') + (c || d === undefined ? '' : '\\n      ' + JSON.stringify(d))); }

  //=================================================================
  // THE LIST IS WHO JOINED
  //=================================================================
  setClassMembers([
    { uid: 'u1', displayName: 'Kevin' },
    { uid: 'u2', displayName: 'Ana' },
    { uid: 'u3', displayName: 'Bo', birthday: '04-11' },
  ]);
  renderRoster();
  const box = document.getElementById('roster-box').innerHTML;
  assert('every account that joined is listed', ['Kevin','Ana','Bo'].every(n => box.indexOf(n) > -1), box.slice(0,200));
  assert('it says the list fills itself, so she does not go looking for an Add button',
    box.indexOf('fills itself') > -1, box.slice(0,300));
  assert('and it explains the name is theirs, not hers to choose',
    box.indexOf('answer to') > -1, box.slice(0,400));

  //=================================================================
  // ONE STUDENT CANNOT BECOME TWO — the guarantee that outlived the design
  //=================================================================
  // A uid is one person by construction. The old split needed two spellings
  // of one name to exist as two entries; there is nowhere for a second
  // spelling to come from now.
  assert('nothing in the app adds a student by typing a name',
    __html.indexOf('function rosterAddStudent') === -1);
  assert('nor removes one', __html.indexOf('function rosterRemove') === -1);
  assert('and no field exists to type one into', __html.indexOf('id="roster-name"') === -1);

  //=================================================================
  // WHAT IS STILL HERS: WHO IS IN THE ROOM
  //=================================================================
  // No account can report attendance. That tick is about the room in front of
  // her, so it stays.
  rosterTogglePresent('Ana');
  assert('she can mark somebody present', (loadRoster().present || []).indexOf('Ana') > -1,
    loadRoster());
  rosterTogglePresent('Ana');
  assert('and unmark them', (loadRoster().present || []).indexOf('Ana') === -1, loadRoster());

  //=================================================================
  // AND AN EMPTY CLASS SAYS WHAT TO DO
  //=================================================================
  setClassMembers([]);
  renderRoster();
  const empty = document.getElementById('roster-box').innerHTML;
  assert('an empty list is a state, not a blank', empty.indexOf('Nobody has joined yet') > -1,
    empty.slice(0,200));
  assert('and it says how somebody joins', empty.indexOf('class link') > -1, empty.slice(0,300));

  console.log(results.join('\\n'));
  const fails = results.filter(r => r.indexOf('FAIL') > -1);
  console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                           : ('ALL ' + results.length + ' CHECKS PASS'));
  if(fails.length) process.exitCode = 1;
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
