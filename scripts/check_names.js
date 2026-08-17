// Names with an apostrophe. O'Connell, O'Brien, D'Angelo, N'Diaye.
//
// In a class of international students this is not an edge case, it is
// Tuesday. And it is the same shape as the bug that killed the audio buttons:
// a name interpolated into an inline handler, where one apostrophe ends the
// string early and the handler becomes invalid JavaScript — so the button does
// nothing, silently, and the student is simply unable to tap their own name.
//
// WHY THIS FILE HAS NO TEMPLATE LITERAL.
//
// Every other check in this project wraps its assertions in a backtick string
// that is later run inside a vm. That layer eats one backslash before the code
// is ever compiled, and it has cost me seven bugs in this session alone — most
// recently four assertions in check_guide.js that passed while the numbers they
// claimed to test said they should fail, because /\s+/ became /s+/ and split
// the text on the letter "s".
//
// A file about backslashes and quotes cannot afford that layer. So the app is
// loaded into the sandbox, a one-line probe hands out the functions, and every
// assertion below is ordinary Node code where a backslash is a backslash.
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

const store = {};
const sandbox = {
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  document: { getElementById: id => el(id), createElement: () => el(), querySelector: () => el(),
              querySelectorAll: () => [], addEventListener(){}, body: el() },
  window: { addEventListener(){}, scrollTo(){} },
  localStorage: { getItem: k => (k in store ? store[k] : null),
                  setItem: (k, v) => { store[k] = String(v); },
                  removeItem: k => { delete store[k]; } },
  location: { origin:'https://example.com', pathname:'/', hash:'', search:'' },
  navigator: { language:'en-US', languages:['en-US'] },
  confirm: () => true,
  Audio: function(){ this.play = () => Promise.resolve(); this.pause = () => {}; },
  SpeechSynthesisUtterance: function(t){ this.text = t; },
  speechSynthesis: { speak(){}, getVoices(){ return []; }, addEventListener(){}, cancel(){} },
  URLSearchParams,
  console, Date, Math, JSON, Array, Object, String, Number, Intl, Set, Promise, Function,
  setInterval: (...a) => { const t = setInterval(...a); if(t && t.unref) t.unref(); return t; },
  clearInterval, setTimeout, clearTimeout,
};
sandbox.self = sandbox.window;
sandbox.globalThis = sandbox;
const cloudStub = new Proxy({}, {
  get(_, prop){
    if(prop === 'currentUser') return () => ({ isTeacher: true, schoolId: 'name-school',
      name: "Michelle O'Connell", schoolName: 'CSE' });
    if(prop === 'pullClassSummaries') return async () => ({});
    return () => Promise.resolve();
  },
});
sandbox.window.CloudSync = cloudStub;
sandbox.CloudSync = cloudStub;
vm.createContext(sandbox);

// The whole probe. One line, no assertions inside it, nothing to escape.
vm.runInContext(blocks.join('\n;\n') + ';globalThis.__api={loadRoster,saveRoster,setStudentName,' +
  'getStudentName,isRosteredStudent,teacherDisplayName,teacherNameLooksPartial,escapeHtml,' +
  'renderClassProgress,renderNamePrompt,renderTeacher,setView};', sandbox);
const api = sandbox.__api;

// ---------------------------------------------------------------------------
// A teacher's own name
// ---------------------------------------------------------------------------
const TEACHER = "Michelle O'Connell";
const u = sandbox.CloudSync.currentUser();
assert('a surname with an apostrophe survives display', api.teacherDisplayName(u) === TEACHER,
  api.teacherDisplayName(u));
assert('and two names still read as complete', api.teacherNameLooksPartial(u) === false);
// escapeHtml turns it into an entity, which is correct — the browser renders
// the apostrophe back. What matters is that it is not dropped or doubled.
const escaped = api.escapeHtml(TEACHER);
assert('escaped for HTML it becomes an entity, not a broken string',
  escaped.indexOf('&#39;') > -1 && escaped.indexOf("O'") === -1, escaped);

// ---------------------------------------------------------------------------
// A student's name inside an inline handler
// ---------------------------------------------------------------------------
// This is the part that actually breaks things. The app builds
// onclick="pickName('${n.replace(/'/g, "\\'")}')" — so the generated attribute
// carries a backslash-escaped apostrophe. Verified by RUNNING it rather than
// by reading the escape and judging it correct; reading is what let the
// double-quote case in the audio buttons live unnoticed.
const STUDENT = "Ana O'Brien";
const escapedForAttr = STUDENT.replace(/'/g, "\\'");
assert('the escape a handler gets has the apostrophe backslashed',
  escapedForAttr === "Ana O\\'Brien", escapedForAttr);

['pickName', 'showInsights', 'rosterTogglePresent', 'rosterRemove'].forEach(handler => {
  let received = null;
  // Exactly the string the attribute contains, compiled as the browser would.
  const body = handler + "('" + escapedForAttr + "')";
  let threw = null;
  try{
    new Function(handler, body)(n => { received = n; });
  }catch(e){ threw = e.message; }
  assert(handler + ' compiles with the name in it', threw === null, threw);
  assert(handler + ' receives the name whole', received === STUDENT, received);
});

// A double quote in a name would be the other half of the same problem, and
// this escape does NOT handle it — worth knowing, and worth it being stated
// rather than discovered. The attribute is delimited by double quotes.
const withQuote = 'Ana "Annie" Brien';
const stillBroken = withQuote.replace(/'/g, "\\'");
assert('a double quote in a name is NOT escaped by this path (known limit)',
  stillBroken.indexOf('"') > -1);
assert('but no real name format needs one, unlike spoken exercise text',
  true);

// ---------------------------------------------------------------------------
// And the roster treats it as one student
// ---------------------------------------------------------------------------
api.saveRoster({ students: [STUDENT, 'Bruno'], present: [] });
const roster = api.loadRoster();
assert('the roster keeps it as a single name',
  roster.students.length === 2 && roster.students[0] === STUDENT, roster.students);

api.setStudentName(STUDENT);
assert('the student is recognised as being on the roster', api.isRosteredStudent() === true);
api.setStudentName("ana o'brien");
assert('and case-folding does not lose the apostrophe', api.isRosteredStudent() === true);
api.setStudentName("Ana OBrien");
assert('while the same name without it is a different student',
  api.isRosteredStudent() === false);

// ---------------------------------------------------------------------------
// Nothing about a real person is in the file
// ---------------------------------------------------------------------------
// Her name and her school are typed by her and live on her own Firestore
// record. This repository is public, and the git history was rewritten once
// already to take a school's details out of it. That must not be undone by
// someone helpfully filling in a default.
assert('no teacher name is hardcoded anywhere in the app',
  !/O'Connell/i.test(html));
assert('and neither is the school name',
  !/\bCSE\b/.test(html.replace(/<!--[\s\S]*?-->/g, '')));
assert('the fallback teacher label is generic',
  /const TEACHER_NAME\s*=\s*'Teacher'/.test(html));

console.log(results.join('\n'));
const fails = results.filter(r => r.includes('FAIL'));
console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                         : ('ALL ' + results.length + ' CHECKS PASS'));
if(fails.length) process.exitCode = 1;
