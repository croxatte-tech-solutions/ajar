// The rules that are not allowed to break, as executable statements.
//
// These are the promises the app makes to a teacher and to a school, and the
// reason they are a test rather than a paragraph in a README is that a
// paragraph cannot fail. Each one runs the real code.
//
// The four:
//   a. Nothing generated reaches a student until the teacher approves it.
//   b. No immigration data (SEVIS, I-20, F1 status) goes anywhere near a
//      remote call — including the fact that no such field exists to leak.
//   c. First-language support is used for orientation, never inside a task.
//   d. No invented proficiency levels.
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/type\s*=\s*["']module["']/.test(m[1]))
  .map(m => m[2]);

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

const testScript = `
(async () => {
  const results = [];
  function assert(n, c){ results.push(n + ': ' + (c ? 'PASS' : 'FAIL')); }

  //===================================================================
  // (a) NOTHING REACHES A STUDENT UNTIL SHE APPROVES IT
  //===================================================================
  localStorage.removeItem('cse_individual');
  setStudentName('Ana');
  location.search = '?s=1';   // arrived through her code, so the class set is in play

  // A freshly generated batch is pending, every item of it.
  generateBatch('email', 'career');
  const fresh = loadBatch();
  assert('a generated batch has something in it', fresh.length > 0);
  assert('and every item of it is pending, not approved',
    fresh.every(i => i.status === 'pending'));
  assert('so a student sees none of it', getStudentBatch().length === 0);

  // One approval, one item visible. Not the batch — the item.
  setStatus(fresh[0].id, 'approved');
  assert('approving one item releases exactly that one',
    getStudentBatch().length === 1 && getStudentBatch()[0].id === fresh[0].id);
  assert('the rest stay pending',
    loadBatch().filter(i => i.status === 'pending').length === fresh.length - 1);

  // Discarding takes it back.
  setStatus(fresh[0].id, 'discarded');
  assert('discarding removes it from the student again', getStudentBatch().length === 0);

  // And the published payload carries approved items only, since that is what
  // actually crosses the wire to a phone.
  const published = loadBatch().filter(i => i.status === 'approved');
  assert('nothing pending is in what gets published', published.length === 0);

  //===================================================================
  // (a) SECOND PATH: NAMING ONE STUDENT
  //===================================================================
  // This was the hole. Assigning to a student by name marked the items
  // approved at the moment of creation, so it published an exercise the
  // teacher had never read — the one path in the app that walked around the
  // rule the whole product rests on.
  document.getElementById('indiv-name').value = 'Carla';
  document.getElementById('indiv-type').value = 'email';
  document.getElementById('indiv-theme').value = 'health';
  generateForIndividual();
  const mine = individualAssignments['carla'];
  assert('naming a student generates something', !!mine && mine.items.length > 0);
  assert('and every item of it is pending, not approved',
    mine.items.every(i => i.status === 'pending'));
  assert('so nothing is published to her yet',
    Object.keys(individualForShare()).length === 0);

  setStudentName('Carla');
  location.search = '';
  assert('and Carla sees none of it on her own device',
    getStudentBatch().length === 0);

  setIndividualStatus('carla', 'approved');
  assert('approving it publishes it', Object.keys(individualForShare()).length === 1);

  // Her device and Carla's are different machines. individualAssignments is
  // memory on the teacher side; it reaches a student only through the payload
  // that gets published. So the student half is tested by applying that
  // payload, which is what actually happens on Carla's phone.
  applySharedPayload({ items: [], individual: individualForShare() });
  assert('and it arrives on Carla device once published',
    getStudentBatch().length === mine.items.length);

  setIndividualStatus('carla', 'discarded');
  assert('discarding empties what gets published',
    Object.keys(individualForShare()).length === 0);
  applySharedPayload({ items: [], individual: individualForShare() });
  assert('and it leaves her device on the next publish',
    getStudentBatch().length === 0);
  removeIndividual('carla');
  setStudentName('Ana');

  //===================================================================
  // (b) NO IMMIGRATION DATA, AND NOWHERE FOR IT TO GO
  //===================================================================
  // Two halves. There is no field for it — checked against the shapes the app
  // actually builds — and there is no remote call that could carry one.
  const FORBIDDEN = ['sevis', 'i20', 'i-20', 'visa_', 'visaStatus', 'passportNumber',
                     'alienNumber', 'uscis', 'immigration', 'sevisId'];
  const shapes = [];
  TASK_TYPES.forEach(t => { try{ shapes.push(generateOne(t.id, 'campus').data); }catch(e){} });
  setStudentName('Ana');
  shapes.push(progressSummary('Ana') || {});
  const keys = new Set();
  shapes.forEach(function walk(v){
    if(Array.isArray(v)) return v.forEach(walk);
    if(v && typeof v === 'object') Object.keys(v).forEach(k => { keys.add(k.toLowerCase()); walk(v[k]); });
  });
  const leaked = [...keys].filter(k => FORBIDDEN.some(f => k.indexOf(f.toLowerCase()) > -1));
  assert('no exercise or summary carries an immigration field', leaked.length === 0);
  if(leaked.length) results.push('    ' + leaked.join(', '));

  console.log(results.join('\\n'));
  const fails = results.filter(r => r.includes('FAIL'));
  globalThis.__fails = fails.length;
  globalThis.__count = results.length;
})();
`;

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
  console, Date, Math, JSON, Array, Object, String, Number, Intl, Set, Promise,
  setInterval: (...a) => { const t = setInterval(...a); if(t && t.unref) t.unref(); return t; },
  clearInterval, setTimeout, clearTimeout,
};
sandbox.self = sandbox.window;
sandbox.globalThis = sandbox;
const cloudStub = new Proxy({}, {
  get(_, prop){
    if(prop === 'currentUser') return () => ({ isTeacher: true, schoolId: 'conf-school' });
    if(prop === 'pullClassSummaries') return async () => ({});
    return () => Promise.resolve();
  },
});
sandbox.window.CloudSync = cloudStub;
sandbox.CloudSync = cloudStub;
vm.createContext(sandbox);
vm.runInContext(blocks.join('\n;\n') + '\n;\n' + testScript, sandbox)
  .catch(e => { console.error('RUNTIME ERROR:', e.stack); process.exitCode = 1; });

// --- (b) second half, (c) and (d): properties of the file, not of a run ---
const statics = [];
function stat(n, c, detail){
  statics.push(n + ': ' + (c ? 'PASS' : 'FAIL'));
  if(!c && detail) statics.push('    ' + detail);
}

// Nothing leaves the browser except Firebase. No model API, no analytics, no
// third-party endpoint — so there is no channel a student's data could take.
//
// Comment lines are dropped first. The naive version fired on the word
// "fetch" in a sentence explaining that the service worker uses it, and on
// four attribution URLs — a licence, the QR library's patent notice, a W3C
// namespace and a Stack Overflow link. All prose. A checker that reports prose
// teaches its reader to skim it.
const code = html.split('\n')
  .filter(l => !/^\s*(?:\/\/|\*|<!--)/.test(l))
  .join('\n');
const REMOTE = /\b(?:fetch|XMLHttpRequest|navigator\.sendBeacon|WebSocket|EventSource)\s*\(/g;
const remoteCalls = [...code.matchAll(REMOTE)].map(m => m[0]);
stat('the app makes no ad-hoc network calls of its own', remoteCalls.length === 0,
  remoteCalls.join(', '));

// Hosts are checked only where the browser would actually GO — a script src,
// a stylesheet href, a module import. A URL in a comment loads nothing.
const loadable = [
  ...[...html.matchAll(/<(?:script|link|img|iframe|source)[^>]*?(?:src|href)="(https?:\/\/[^"]+)"/g)].map(m => m[1]),
  ...[...html.matchAll(/(?:import|from)\s*["'](https?:\/\/[^"']+)["']/g)].map(m => m[1]),
];
const hosts = [...new Set(loadable.map(u => u.replace(/^https?:\/\//, '').split('/')[0].toLowerCase()))];
const ALLOWED_HOSTS = ['www.gstatic.com', 'hiajar.com'];
const unexpected = hosts.filter(h => !ALLOWED_HOSTS.includes(h));
stat('every host the app actually loads from is an expected one', unexpected.length === 0,
  unexpected.join(', '));
stat('and there is at least one, so this is not passing on an empty list',
  hosts.length > 0);
stat('no model or inference API is referenced',
  !/openai|anthropic\.com|generativelanguage|api\.cohere|huggingface/i.test(html));

// (c) First-language support is orientation only: the welcome text and one
// note offering the student their own language for FEEDBACK. Never inside a
// task, because the task is the thing being measured.
stat('the welcome text is translated', /const WELCOME_TEXT\s*=/.test(html));
stat('feedback may be written in the student\'s own language',
  /const FEEDBACK_LANG_NOTE\s*=/.test(html));
// Counted by LINE, not by match: `if(X[code]) return X[code]` is one decision
// in one place and two matches, which is how the count-based version reported
// three uses of two things.
const l1Lines = html.split('\n')
  .filter(l => /WELCOME_TEXT\[|FEEDBACK_LANG_NOTE\[/.test(l) && !/^\s*(?:\/\/|\*)/.test(l));
stat('a first language is read in exactly two places', l1Lines.length === 2,
  l1Lines.map(l => l.trim().slice(0, 50)).join(' | '));
// The task renderers must not reach for the reader's language at all.
const practiceStart = html.indexOf('function renderPracticeInner');
const practiceEnd = html.indexOf('function checkWriting');
const practice = practiceStart > -1 && practiceEnd > practiceStart
  ? html.slice(practiceStart, practiceEnd) : '';
stat('no exercise renderer translates anything',
  practice.length > 1000 && !/WELCOME_TEXT|FEEDBACK_LANG_NOTE|detectStudentLanguage/.test(practice));

// (d) No invented levels. The app grades nothing by CEFR or GSE, and must not
// imply it does — the only tiering is Listen-and-Repeat syllable counts, which
// are stated as ETS tiers and named as such.
const inventedLevel = /\b(?:level|nível)\s*[:=]\s*['"](?!A1|A2|B1|B2|C1|C2)[A-Za-z0-9 +-]{1,12}['"]/g;
const invented = [...html.matchAll(inventedLevel)].map(m => m[0]);
stat('no proficiency level is invented in code', invented.length === 0, invented.join(' | '));
stat('the app claims no CEFR or GSE band for a student',
  !/\b(?:CEFR|GSE)\b/.test(html.replace(/<!--[\s\S]*?-->/g, '')));

setTimeout(() => {
  console.log(statics.join('\n'));
  const all = (sandbox.__count || 0) + statics.length;
  const bad = (sandbox.__fails || 0) + statics.filter(r => r.includes('FAIL')).length;
  console.log(bad ? ('FAILURES: ' + bad + ' / ' + all) : ('ALL ' + all + ' CHECKS PASS'));
  if(bad) process.exitCode = 1;
}, 0);
