// Does the guide still describe the app that exists?
//
// It stopped: it described a batch generator long after the app had grown
// timed sections, a single listen, estimated bands and a paste guard. A
// student could meet three features nobody had mentioned, and the one
// screen whose whole job is explaining was the screen that had gone
// quiet about them.
//
// Documentation rots silently, so the checks below pull the numbers from
// the same constants the app uses rather than from a copy in a fixture —
// changing a section's length has to change the guide or fail here.
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/type\s*=\s*["']module["']/.test(m[1]))
  .map(m => m[2]);

const el = () => {
  const n = {
    style:{}, innerHTML:'', textContent:'', value:'', id:'',
    classList:{toggle(){},add(){},remove(){},contains:()=>false},
    appendChild(){}, addEventListener(){}, querySelector:()=>el(), querySelectorAll:()=>[],
    closest:()=>null, select(){}, focus(){}, remove(){}, insertBefore(){},
    getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}),
  };
  n.parentNode = { insertBefore(){}, removeChild(){} };
  return n;
};

const testScript = `
(async () => {
  const results = [];
  function assert(n, c){ results.push(n + ': ' + (c ? 'PASS' : 'FAIL')); }

  // Collapse whitespace before matching. The guide is written as wrapped
  // prose inside a template literal, so a phrase like "best score of the
  // day" is split across two lines and a naive regex misses text that is
  // plainly there — which is a broken check, not a broken guide.
  const flat = t => t.replace(/\\s+/g, ' ');
  const teacher = flat(guideContent('teacher'));
  const student = flat(guideContent('student'));
  const both = { teacher, student };

  // --- both guides exist and are substantial ---
  Object.keys(both).forEach(who => {
    const words = both[who].replace(/<[^>]+>/g, ' ').split(/\\s+/).filter(Boolean).length;
    assert('the ' + who + ' guide actually explains something', words > 200);
    assert('the ' + who + ' guide is not a wall', words < 800);
  });

  // --- the features that were missing ---
  // Each of these shipped without ever reaching the one screen that
  // explains the app.
  const features = [
    ['the timed sections', /full section|under test conditions/i],
    ['one clock per section', /one clock/i],
    ['no going back', /going back|no going back/i],
    ['the single listen', /plays once|get one|once, like test day/i],
    ['practice being repeatable', /as many times|redo anything|as often/i],
    ['best score of the day', /best score of the day/i],
    ['bands being our estimate', /our.{0,20}estimate|not an official|not an ETS score/i],
    ['pronunciation not being measured', /pronunciation/i],
  ];
  features.forEach(([what, re]) => {
    assert('the student guide covers ' + what, re.test(student));
  });

  assert('the student guide explains the paste limit', /paste/i.test(student));
  // Match the reason, not one phrasing of it: the guide gets reworded and
  // a literal string turns an accurate sentence into a failing check.
  assert('and says why rather than just forbidding it', /only help you/i.test(student));
  assert('the student guide points at the per-exercise briefs', /On the real test/.test(student));

  // --- the teacher guide covers what she has to act on ---
  assert('the teacher guide explains the sign-in', /sign.?in/i.test(teacher));
  assert('and that students never sign in', /never sign in/i.test(teacher));
  assert('it explains that writing comes back to her', /does <b>not<\\/b> mark|hands|comes back/i.test(teacher));
  // Two sections now mark only part of what they contain, so the guide
  // says so generally rather than naming Writing's ten sentences. What
  // must survive is the admission itself: what it marks, and what it does
  // not.
  assert('it says what it marks', /marks Build a Sentence/i.test(teacher));
  assert('and what it does not', /does not mark/i.test(teacher));
  assert('and that the rest goes to her', /come back|hand you/i.test(teacher));
  assert('it keeps the final-word rule', /final word/i.test(teacher));
  assert('it still says it is a prototype', /prototype/i.test(teacher));
  assert('it warns the band is not an ETS score', /not an ETS score|our<\\/b> estimate|our.{0,15}estimate/i.test(teacher));

  // --- the numbers come from the app, not from prose ---
  // A guide that hard-codes "50 questions" goes wrong the day the section
  // changes and nobody notices.
  Object.keys(EXAM_SECTIONS).forEach(k => {
    const cfg = EXAM_SECTIONS[k];
    assert('the teacher guide quotes the real ' + k + ' item count',
      teacher.indexOf(String(cfg.items)) > -1);
    assert('and the real ' + k + ' length in minutes',
      teacher.indexOf(String(Math.round(cfg.seconds / 60))) > -1);
  });
  assert('the task-type count is taken from the list, not typed in',
    student.indexOf('The ' + TASK_TYPES.length + ' task types') > -1);

  // --- every task type is still listed for students ---
  const missing = TASK_TYPES.filter(t => student.indexOf(t.tag) === -1);
  assert('every task type appears in the student guide', missing.length === 0);
  if(missing.length) results.push('  missing: ' + missing.map(t => t.tag).join(', '));

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
  document: { getElementById:()=>el(), createElement:()=>el(), querySelector:()=>el(),
              querySelectorAll:()=>[], addEventListener(){}, body: el() },
  window: { addEventListener(){} },
  localStorage: { getItem:()=>null, setItem(){}, removeItem(){} },
  location: { origin:'https://example.com', pathname:'/app', hash:'', search:'' },
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
