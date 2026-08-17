// The Reading section sat under test conditions.
//
// Two things here are easy to get wrong in ways nobody notices until a
// student is halfway through a real sitting:
//
// 1. The section must total exactly the published item count. Two of the
//    three task types are fixed size, but Read in Daily Life carries two
//    questions or three, so the remainder is filled by draws of 2 and 3.
//    Filling 10 that way can strand you on 1 (10-3-3-3), which no draw
//    can finish — an infinite loop, or a section quietly short of 50.
//
// 2. A sat section must not touch the practice log. That is what keeps a
//    rehearsal out of the day's best score and out of the patterns the
//    teacher reads.
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/type\s*=\s*["']module["']/.test(m[1]))
  .map(m => m[2]);

const store = {};
const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
// The exam mounts and unmounts its own clock bar as a sibling of the
// practice wrap, so the stub needs the node-level methods that involves —
// remove, insertBefore, parentNode — not just the read-only shape the
// other checks get by with.
const el = () => {
  const node = {
    style: {}, innerHTML: '', textContent: '', value: '', id: '',
    classList: { toggle(){}, add(){}, remove(){}, contains: () => false },
    appendChild(){}, addEventListener(){}, querySelector: () => el(),
    querySelectorAll: () => [], closest: () => null, select(){}, focus(){},
    remove(){}, insertBefore(){},
    getBoundingClientRect: () => ({ top:0, left:0, width:0, height:0 }),
  };
  node.parentNode = { insertBefore(){}, removeChild(){} };
  return node;
};

const testScript = `
(async () => {
  const results = [];
  function assert(n, c){ results.push(n + ': ' + (c ? 'PASS' : 'FAIL')); }

  const cfg = EXAM_SECTIONS.reading;

  // --- the published figures, and where they come from ---
  assert('the Reading section is 50 items', cfg.items === 50);
  assert('the Reading section is 30 minutes', cfg.seconds === 30 * 60);
  assert('the brief quotes the same figures the exam uses',
    TASK_BRIEF['complete-words'].ours.indexOf(String(cfg.items)) > -1);

  // --- composition totals exactly 50, every time ---
  // Run it enough times to hit the awkward draws rather than the lucky ones.
  let totals = {}, worst = null;
  for(let i = 0; i < 60; i++){
    const items = buildExamItems(cfg);
    const n = items.reduce((s, it) => s + examQuestionCount(it), 0);
    totals[n] = (totals[n] || 0) + 1;
    if(n !== cfg.items) worst = { n, i };
  }
  assert('every built section totals exactly 50 questions (60 builds)',
    Object.keys(totals).length === 1 && totals[cfg.items] === 60);
  if(worst) results.push('  built ' + worst.n + ' on run ' + worst.i);

  // --- only Reading task types appear ---
  const built = buildExamItems(cfg);
  const kinds = [...new Set(built.map(i => i.type))].sort();
  assert('only the three Reading task types appear',
    JSON.stringify(kinds) === JSON.stringify(['complete-words','daily-read','passage']));
  assert('no Listening or Speaking task sneaks in',
    !built.some(i => ['talk','conversation','announcement','interview','listen-repeat','choose-response'].includes(i.type)));

  // --- the fixed-size types are drawn by the plan ---
  const count = t => built.filter(i => i.type === t).length;
  assert('two Complete the Words sets', count('complete-words') === 2);
  assert('four academic passages', count('passage') === 4);
  assert('Complete the Words carries ten gaps each',
    built.filter(i => i.type === 'complete-words').every(i => examQuestionCount(i) === 10));
  assert('each passage carries five questions',
    built.filter(i => i.type === 'passage').every(i => examQuestionCount(i) === 5));
  assert('Daily Life fills exactly the remaining ten',
    built.filter(i => i.type === 'daily-read').reduce((s,i) => s + examQuestionCount(i), 0) === 10);

  // --- the order is not the plan's order ---
  // Without a shuffle a student meets all the passages together, which
  // makes the section easier to pace than the real one.
  const firstTypes = [];
  for(let i = 0; i < 12; i++) firstTypes.push(buildExamItems(cfg)[0].type);
  assert('the running order varies between sittings', new Set(firstTypes).size > 1);

  // --- a sat section never reaches the practice log ---
  localStorage.removeItem('cse_usage_log_by_name');
  setStudentName('Test Student');
  startExam('reading');
  assert('an exam is now in progress', examActive());

  logUsage('passage', 'campus', 1);
  logUsage('daily-read', 'money', 0.5);
  assert('practising during an exam writes nothing to the practice log',
    localStorage.getItem('cse_usage_log_by_name') === null);

  const mid = JSON.parse(localStorage.getItem('ajar_exam_current'));
  assert('the exam counted those answers instead', mid.answered > 0);

  // --- the day's exercise must not steal the section ---
  // renderStudent lands a student straight on the day's task when exactly
  // one is approved, by treating "selectedId is not in the batch" as
  // "nothing chosen". '__exam__' is not in the batch either, so without a
  // guard that convenience yanks the student out of a running section —
  // and it fires late, when shared classroom content resolves, so it lands
  // minutes in rather than at the start.
  localStorage.removeItem('ajar_exam_current');
  startExam('reading');
  selectedId = '__exam__';
  saveBatch([{ id:'only-one', type:'passage', theme:'campus', status:'approved',
               data: generateOne('passage','campus').data }]);
  renderStudent();
  assert('a one-item batch does not hijack a running section', selectedId === '__exam__');
  finishExam('completed');
  renderStudent();
  assert('and it still lands the student on the day\\'s task once the exam is over',
    selectedId !== '__exam__');

  // --- scoring scales by how many questions an exercise was worth ---
  localStorage.removeItem('ajar_exam_current');
  startExam('reading');
  const ex0 = JSON.parse(localStorage.getItem('ajar_exam_current'));
  const first = ex0.items[0];
  const worth = examQuestionCount(first);
  logUsage(first.type, first.theme, 1);
  const after = JSON.parse(localStorage.getItem('ajar_exam_current'));
  assert('a fully correct exercise scores all its questions', after.correct === worth);
  assert('and counts all of them as answered', after.answered === worth);

  // --- the band is a proportion, and says so ---
  assert('nothing correct is band 1', examBand(0, 50) === 1);
  assert('everything correct is band 6', examBand(50, 50) === 6);
  assert('half correct sits in the middle', examBand(25, 50) === 3.5);
  assert('bands move in half steps', examBand(37, 50) === 4.5);
  assert('a band is never below 1', examBand(0, 50) >= 1);
  assert('a band is never above 6', examBand(50, 50) <= 6);
  assert('an empty section does not divide by zero', examBand(0, 0) === 1);

  // --- the clock is an end time, not a countdown ---
  // A countdown in memory would restart on refresh, turning a reload into
  // free time. This is the whole reason it is stored as endsAt.
  localStorage.removeItem('ajar_exam_current');
  startExam('reading');
  const e1 = JSON.parse(localStorage.getItem('ajar_exam_current'));
  assert('the exam stores when it ends, not how long is left', typeof e1.endsAt === 'number');
  assert('it ends one section-length from the start',
    Math.abs((e1.endsAt - e1.startedAt) - cfg.seconds * 1000) < 50);
  e1.endsAt = Date.now() - 1000;
  localStorage.setItem('ajar_exam_current', JSON.stringify(e1));
  assert('time already gone reads as zero left', examSecondsLeft(e1) === 0);

  // --- finishing ---
  finishExam('time');
  const done = JSON.parse(localStorage.getItem('ajar_exam_current'));
  assert('a finished exam is marked finished', done.finished === true);
  assert('it records why it ended', done.reason === 'time');
  assert('a finished exam is no longer active', !examActive());
  assert('answering after the end changes nothing', (() => {
    const before = JSON.parse(localStorage.getItem('ajar_exam_current')).correct;
    recordExamOutcome('passage', 'campus', 1);
    return JSON.parse(localStorage.getItem('ajar_exam_current')).correct === before;
  })());

  // --- and once finished, practice logging works again ---
  localStorage.removeItem('cse_usage_log_by_name');
  logUsage('passage', 'campus', 1);
  assert('practice logging resumes once the exam is over',
    localStorage.getItem('cse_usage_log_by_name') !== null);

  // --- unanswered questions are not silently counted right ---
  localStorage.removeItem('ajar_exam_current');
  startExam('reading');
  finishExam('time');
  const walkedAway = JSON.parse(localStorage.getItem('ajar_exam_current'));
  assert('walking away scores nothing', walkedAway.correct === 0);
  assert('and the band reflects that', examBand(walkedAway.correct, cfg.items) === 1);

  console.log(results.join('\\n'));
  const fails = results.filter(r => r.includes('FAIL'));
  console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                           : ('ALL ' + results.length + ' CHECKS PASS'));
  globalThis.__fails = fails.length;
})();
`;

const sandbox = {
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  document: {
    getElementById: () => el(), createElement: () => el(),
    querySelector: () => el(), querySelectorAll: () => [],
    addEventListener(){}, body: el(),
  },
  window: { addEventListener(){}, _lrState:null, _sentenceState:null, _interviewState:null, _crState:null },
  localStorage,
  location: { origin:'https://example.com', pathname:'/app', hash:'', search:'' },
  navigator: { language:'en-US', languages:['en-US'], clipboard:{writeText:()=>Promise.resolve()}, mediaDevices:undefined },
  confirm: () => true,
  alert: () => {},
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
