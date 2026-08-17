// Who sees the class's set, and when the clock is allowed to start.
//
// Two reported problems with one shape: the app decided things FOR the
// student that the student should decide.
//
// It showed the whole-class set on their own phone as if each exercise had
// been released to them personally. That set belongs on the classroom
// screen — everyone scans the one they are doing — so on a phone it was
// both wrong and illogical: it announced to a student, privately, that an
// exercise everyone could see had been given to them.
//
// And it started the clock when the screen drew. Build a Sentence gives 41
// seconds; a student still looking up at the screen lost part of it before
// reading a word, and thirteen phones drawing at slightly different moments
// made that unequal too.
//
// Both are checked by running the app, not by reading it. The gate in
// particular has to hold for all twelve renderers, and the way to know that
// is to render and look at what came out — a regex would only prove that a
// guard was typed somewhere.
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/type\s*=\s*["']module["']/.test(m[1]))
  .map(m => m[2]);

// Elements keyed by id, so writing to practice-wrap and then reading it back
// returns what was written. A fresh stub per call would report every screen
// as empty and pass everything.
const nodes = {};
const el = (id) => {
  if(id && nodes[id]) return nodes[id];
  const n = {
    style:{}, innerHTML:'', textContent:'', value:'', id: id || '',
    classList:{toggle(){},add(){},remove(){},contains:()=>false},
    appendChild(){}, addEventListener(){}, querySelector:()=>el(), querySelectorAll:()=>[],
    closest:()=>null, select(){}, focus(){}, remove(){}, insertBefore(){},
    getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}),
  };
  n.parentNode = { insertBefore(){}, removeChild(){} };
  if(id) nodes[id] = n;
  return n;
};

const testScript = `
(async () => {
  const results = [];
  function assert(n, c){ results.push(n + ': ' + (c ? 'PASS' : 'FAIL')); }

  const wrap = document.getElementById('practice-wrap');
  const approved = (type, theme) => {
    const g = generateOne(type, theme);
    return { id: uid(), type, tag: tagFor(type), theme, status: 'approved', data: g.data };
  };

  //=================================================================
  // WHO SEES THE CLASS'S SET
  //=================================================================
  const classSet = [approved('sentence','campus'), approved('passage','environment')];
  localStorage.setItem('ajar_batch', JSON.stringify(classSet));
  localStorage.removeItem('ajar_individual');
  setStudentName('Ana');

  location.search = '';
  assert('typing the address shows none of the class set',
    getStudentBatch().length === 0);
  assert('and does not ask for a name to then show nothing',
    hasAnyTeacherContent() === false);

  location.search = '?s=1';
  assert('opening the shared code shows it', getStudentBatch().length === 2);
  assert('and asks for a name, because there is something to name', hasAnyTeacherContent() === true);

  location.search = '?ex=' + classSet[0].id;
  assert('scanning one exercise\\'s code shows it', getStudentBatch().length === 2);

  // The rule reads the address, not storage: scanning is something a person
  // did, not a state their phone keeps. Yesterday's scan is not today's.
  location.search = '';
  assert('a scan does not follow the student home', getStudentBatch().length === 0);

  //=================================================================
  // WHAT SHE PICKED FOR ONE STUDENT IS THEIRS
  //=================================================================
  // This is the half that has to survive a plain visit — it is the whole
  // point of naming someone.
  // Write an Email rather than Take an Interview: the interview starts its
  // clock when the question is revealed, not when the screen draws, so it
  // cannot answer "did pressing Start start the clock". Email also carries a
  // subject line, which is exactly the kind of thing the card must not leak.
  const mine = [approved('email','career')];
  localStorage.setItem('ajar_individual', JSON.stringify({ ana: mine }));
  location.search = '';
  assert('a set picked for her by name reaches her without any code',
    getStudentBatch().length === 1 && getStudentBatch()[0].type === 'email');
  assert('and the app knows to say so', isIndividuallyAssigned() === true);

  setStudentName('Bruno');
  assert('a student she did not name gets nothing on a plain visit',
    getStudentBatch().length === 0);
  location.search = '?s=1';
  assert('but the class set still works for him through the code',
    getStudentBatch().length === 2);

  //=================================================================
  // NOTHING STARTS UNTIL THE STUDENT SAYS SO
  //=================================================================
  location.search = '';
  setStudentName('Ana');
  window._startedItems = null;
  const item = mine[0];
  selectedId = item.id;

  assert('a fresh exercise is closed', needsStartGate(item) === true);

  window._timerState = null;
  renderPractice();
  const gate = wrap.innerHTML;
  assert('opening it draws the card, not the exercise', gate.indexOf('▶ Start') > -1);
  assert('and no clock is running yet', !window._timerState);
  assert('the card says what kind of task it is', gate.indexOf(item.tag) > -1);
  assert('and how long it runs, so Start is an informed press',
    gate.indexOf(formatTime(TASK_TIME_LIMITS[item.type])) > -1);
  assert('and that she picked this one', gate.indexOf('picked this one for you') > -1);

  // The reveal is the point. If the theme is on the card, pressing Start
  // reveals nothing and the gate is decoration.
  const secret = item.data.subject || item.data.topic || item.data.title || '';
  assert('the card gives away neither theme nor prompt',
    secret.length > 0 && gate.indexOf(secret) === -1);

  startExercise(item.id);
  assert('pressing Start opens it', needsStartGate(item) === false);
  const open = wrap.innerHTML;
  assert('and the exercise itself is on screen now', open.indexOf('▶ Start') === -1);
  assert('and the clock is running', !!window._timerState);

  // Re-rendering happens constantly — after every answer in the
  // multi-question types. The gate coming back mid-exercise would be worse
  // than never having it.
  renderPractice();
  assert('re-rendering does not close it again', wrap.innerHTML.indexOf('▶ Start') === -1);

  // Every exercise gets its own start. Moving on must not inherit the last
  // one's permission.
  const next = approved('sentence','campus');
  assert('the next exercise is closed too', needsStartGate(next) === true);

  //=================================================================
  // THE EXEMPTIONS
  //=================================================================
  // A section confirms once and then owns the clock; a gate before each of
  // fifty questions would be absurd. Practice the student started herself
  // already had its gesture.
  selectedId = '__self__';
  assert('practice you started yourself is not gated again',
    needsStartGate(approved('passage','campus')) === false);

  selectedId = item.id;
  window._startedItems = null;
  startExam('reading', 'campus');
  assert('a section is not gated question by question',
    needsStartGate(approved('sentence','campus')) === false);
  leaveExam();

  //=================================================================
  // WALKING OUT CLOSES IT
  //=================================================================
  // Otherwise coming back drops the student into a clock they are already
  // behind on.
  window._startedItems = null;
  selectedId = item.id;
  startExercise(item.id);
  backToMyPage();
  assert('leaving an exercise closes it again', needsStartGate(item) === true);

  //=================================================================
  // AND THE LIST DOES NOT LEAK WHAT THE CARD HIDES
  //=================================================================
  // The list printed the title, the topic, the course. That handed over the
  // theme one screen before the gate, which made the gate pointless.
  setStudentName('Ana');
  location.search = '';
  selectedId = null;
  const listBox = document.getElementById('scenario-list');
  const picks = [];
  listBox.appendChild = (child) => picks.push(child.innerHTML || '');
  renderStudent();
  const listed = picks.join(' ');
  assert('the list shows the task type', listed.indexOf(item.tag) > -1);
  assert('and not the theme behind it',
    secret.length > 0 && listed.indexOf(secret) === -1);

  console.log(results.join('\\n'));
  const fails = results.filter(r => r.includes('FAIL'));
  console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                           : ('ALL ' + results.length + ' CHECKS PASS'));
  globalThis.__fails = fails.length;
})();
`;

const store = {};
const sandbox = {
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  document: { getElementById: id => el(id), createElement: () => el(), querySelector: () => el(),
              querySelectorAll: () => [], addEventListener(){}, body: el() },
  window: { addEventListener(){}, scrollTo(){} },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
  // Mutable: the whole first half of this test is about what the address bar
  // says, and arrivedThroughSharedCode() reads it live rather than caching.
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
vm.createContext(sandbox);
vm.runInContext(blocks.join('\n;\n') + '\n;\n' + testScript, sandbox)
  .catch(e => { console.error('RUNTIME ERROR:', e.stack); process.exitCode = 1; });

process.on('beforeExit', () => { if (sandbox.__fails) process.exitCode = 1; });
