// No screen a student can reach may lack a way off it.
//
// This is the third time this class of bug has been found by hand, and the
// first time it is written down. Listen and Repeat assigned wrap.innerHTML and
// returned, where the other eleven renderers end with += practiceFooter(). In
// free practice that meant nothing was offered after the seventh sentence; in
// the Speaking SECTION, where it is the first of two items, there was no button
// to move on at all. A student sitting Speaking reached sentence one and
// stopped — the same dead end reported once as "o botao sumiu e nao foi para o
// proximo exercicio", still alive in the one section nobody had sat.
//
// The fix is a net in the wrapper rather than a patch in the twelfth renderer,
// and this is the check that makes the net worth having: it walks every task
// type in free practice AND every question of all four sections, and asks each
// screen the same question.
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

  const wrap = document.getElementById('practice-wrap');

  // What counts as a way forward. Free practice offers another draw of the same
  // type; a section offers Skip or Next. The start gate is its own exception —
  // that screen exists to hold one button and nothing else.
  function wayForward(){
    const h = wrap.innerHTML;
    if(h.indexOf('start-gate-btn') > -1) return 'gate';
    if(h.indexOf('practiceAgain(') > -1) return 'practice';
    if(h.indexOf('exam-footer') > -1) return 'exam';
    return null;
  }
  function reset(){
    ['_lrState','_interviewState','_crState','_anState','_cvState','_tkState',
     '_sentenceState','_pgState','_drState','_startedItems'].forEach(k => window[k] = null);
  }

  //=================================================================
  // FREE PRACTICE — every one of the twelve
  //=================================================================
  location.search = '';
  let practiceDead = [];
  TASK_TYPES.forEach(t => {
    const item = { id: 'dead-' + t.id, type: t.id, tag: t.tag, theme: 'campus',
                   status: 'approved', data: generateOne(t.id, 'campus').data };
    localStorage.setItem('ajar_individual', JSON.stringify({ ana: [item] }));
    setStudentName('Ana');
    reset();
    selectedId = item.id;
    renderPractice();
    if(wayForward() !== 'gate') practiceDead.push(t.id + ' (no gate)');
    startExercise(item.id);
    if(wayForward() !== 'practice') practiceDead.push(t.id);
  });
  assert('every task type offers a way on after Start', practiceDead.length === 0);
  if(practiceDead.length) results.push('    dead: ' + practiceDead.join(', '));
  assert('and all twelve were walked', TASK_TYPES.length === 12);

  /* Listen and Choose a Response, checked here because it has no file of its
     own — 84 items, the largest bank in the app, and no test has ever driven
     its play flow. That gap is older than this change and is worth its own
     file one day; this covers the one rule that would otherwise go unchecked
     in the type a class meets most often.

     Its exchanges are short — one spoken line — which makes it the type where
     showing the options early costs the most: there is no long clip to keep
     a student listening once the answers are on screen. */
  {
    const item = { id: 'cr1', type: 'choose-response', tag: 'Listen and Choose a Response',
                   theme: 'campus', status: 'approved', data: generateOne('choose-response', 'campus').data };
    localStorage.setItem('ajar_individual', JSON.stringify({ ana: [item] }));
    setStudentName('Ana');
    reset();
    selectedId = 'cr1';
    renderPractice();
    startExercise('cr1');
    const first = item.data.set[0];
    const html2 = () => document.getElementById('practice-wrap').innerHTML;
    assert('choose-response hides its replies before the line is played',
      html2().indexOf(escapeHtml(first.options[0])) === -1);
    playChoosePrompt();
    assert('AND keeps them hidden while it is still playing',
      html2().indexOf(escapeHtml(first.options[0])) === -1);
    window._currentAudio.onended();
    assert('the line ending is what puts the replies on screen',
      html2().indexOf(escapeHtml(first.options[0])) > -1);
  }

  //=================================================================
  // THE FOUR SECTIONS — every question, not just the first
  //=================================================================
  // The first item is where Speaking died, but a section is only sound if
  // nothing in it dead-ends: fifty questions with one broken screen is still a
  // student stuck in an exam they cannot leave.
  let examDead = [];
  let walked = 0;
  Object.keys(EXAM_SECTIONS).forEach(sec => {
    localStorage.removeItem('ajar_exam');
    reset();
    startExam(sec, 'campus');
    const total = (loadExam() || { items: [] }).items.length;
    for(let i = 0; i < total; i++){
      const ex = loadExam();
      if(!ex || ex.finished) break;
      renderPractice();
      walked++;
      if(!wayForward()) examDead.push(sec + ' q' + (i + 1));
      advanceExam();
    }
    leaveExam();
  });
  assert('no question in any section is a dead end', examDead.length === 0);
  if(examDead.length) results.push('    dead: ' + examDead.slice(0, 6).join(', '));
  assert('and every section was actually walked', walked > 30);

  // The net itself, since that is what makes the two above hold for a
  // thirteenth renderer nobody has written yet.
  assert('the wrapper adds a way forward when a renderer forgets',
    typeof ensureWayForward === 'function');
  reset();
  selectedId = 'dead-listen-repeat';
  const item = { id: 'dead-listen-repeat', type: 'listen-repeat', tag: tagFor('listen-repeat'),
                 theme: 'campus', status: 'approved', data: generateOne('listen-repeat', 'campus').data };
  localStorage.setItem('ajar_individual', JSON.stringify({ ana: [item] }));
  setStudentName('Ana');
  renderPractice();
  startExercise(item.id);
  assert('Listen and Repeat specifically — the renderer that forgot',
    wayForward() === 'practice');

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
    if(prop === 'pullClassSummaries') return async () => ({});
    return () => Promise.resolve();
  },
});
sandbox.window.CloudSync = cloudStub;
sandbox.CloudSync = cloudStub;
vm.createContext(sandbox);
vm.runInContext(blocks.join('\n;\n') + '\n;\n' + testScript, sandbox)
  .catch(e => { console.error('RUNTIME ERROR:', e.stack); process.exitCode = 1; });

process.on('beforeExit', () => { if (sandbox.__fails) process.exitCode = 1; });
