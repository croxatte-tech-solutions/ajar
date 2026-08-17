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

  // --- the English on the door stays long enough to read ---
  //
  // This was a flat 7 seconds, picked without measuring. The English on that
  // screen is 61 words, which is 15s for a native adult and 41s for a slower
  // second-language reader — the audience. So seven seconds did not let a
  // NATIVE speaker finish half of it.
  //
  // Computed from the text now, so rewriting the copy moves the timing with
  // it rather than leaving a stale constant behind.
  const enText = (WELCOME_TEXT.en.lede || '') + ' ' + (WELCOME_TEXT.en.meaning || '');
  // \\s+, not \s+. This probe is a template literal, so a single backslash is
  // eaten before the regex is ever compiled — it split on the letter "s",
  // counted 31 pieces instead of 61 words, and made four assertions below
  // pass while the real numbers said they should fail. Seventh time this
  // exact escape has bitten me in this project.
  const enWords = enText.split(/\\s+/).filter(Boolean).length;
  const delayMs = welcomeSwapDelay(WELCOME_TEXT.en.lede, WELCOME_TEXT.en.meaning);

  assert('the swap delay is computed, not a constant',
    typeof welcomeSwapDelay === 'function');
  assert('the delay grows with the text',
    welcomeSwapDelay('one two three four five') < welcomeSwapDelay(enText + ' ' + enText));

  assert('the word count is the real one, not an artefact', enWords === 61);

  // THREE PHASES: English, their language for the same length, then English
  // again and it stays. The third phase is why the first can be halved — it is
  // no longer anybody's only chance to read the English.
  assert('the first phase is half the reading estimate',
    Math.abs(delayMs - welcomeReadMs(enText) / 2) < 1200);
  assert('and it is not the whole estimate any more',
    delayMs < welcomeReadMs(enText) * 0.6);

  // Who finishes inside the first phase, stated rather than assumed. The two
  // who do not are the reason English comes back permanently.
  const finishes = wpm => (enWords / wpm) * 60000 <= delayMs;
  assert('a native adult finishes the English in the first phase', finishes(238));
  assert('so does a fluent second-language reader', finishes(180));
  assert('an intermediate reader does not, by design', !finishes(120));
  assert('nor does a slower one', !finishes(90));

  // So the third phase has to exist, and has to be the last word.
  const wel = __html.slice(__html.indexOf('function renderWelcome'),
                           __html.indexOf('function welcomeReadMs'));
  assert('their language is shown for the same length as English',
    /paintWelcomeCopy\\(local, true\\);\\s*window\\._welcomeReturn = setTimeout\\(\\(\\) => paintWelcomeCopy\\(en, true\\), phase\\)/
      .test(wel.replace(/\\n/g, ' ').replace(/\\s+/g, ' ')));
  assert('and English comes back with no timer after it',
    (wel.match(/setTimeout/g) || []).length === 2);

  assert('a very short translation still gets a floor', welcomeSwapDelay('hi') >= 12000);
  assert('and a very long one is capped', welcomeSwapDelay(enText.repeat(20)) <= 30000);

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

  // --- feedback about the app reaches somebody ---
  //
  // Two screens send it and they disagreed. The panel read the teacher's
  // saved address; the end-of-section review read CONFIG.feedbackEmail,
  // which was never defined anywhere. That built a mailto: with an empty
  // recipient, so a student who wrote a review and pressed send opened a
  // blank mail window and reasonably concluded the app was broken.
  const DEV_EMAIL = 'croxattetechsolutions@gmail.com';
  assert('the developer address lives in the config block',
    CONFIG.devEmail === DEV_EMAIL);
  assert('nothing still reads the address that never existed',
    __html.indexOf('CONFIG.feedbackEmail') === -1);
  assert('the section review resolves its recipient through the one helper',
    __html.indexOf('const to = feedbackTo();') > -1);
  assert('and so does the feedback panel',
    __html.indexOf('const email = feedbackTo();') > -1);

  // Run it. Both branches matter: hers when she has set one, the
  // developer's when she has not.
  localStorage.removeItem('cse_teacher_email');
  assert('with nothing set it goes to the developer', feedbackTo() === DEV_EMAIL);
  localStorage.setItem('cse_teacher_email', '   ');
  assert('a blank saved address still goes to the developer', feedbackTo() === DEV_EMAIL);
  localStorage.setItem('cse_teacher_email', 'ms@school.example');
  assert('a teacher who set her own address reads it first',
    feedbackTo() === 'ms@school.example');
  localStorage.removeItem('cse_teacher_email');

  // The panel used to promise a copy-this-yourself box when no address was
  // set. There is always an address now, so that sentence was a lie.
  assert('the panel no longer promises a copyable note instead',
    __html.indexOf("they'll just get a copyable note instead") === -1);
  assert('and it names where feedback actually goes',
    __html.indexOf('Feedback about the app goes to the developer at') > -1);

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
  // A real store rather than a stub that always answers null: feedbackTo()
  // has two branches and only one of them is reachable with an empty store.
  localStorage: (() => {
    const m = {};
    return { getItem: k => (k in m ? m[k] : null),
             setItem: (k, v) => { m[k] = String(v); },
             removeItem: k => { delete m[k]; } };
  })(),
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
sandbox.__html = html;   // the probe checks a few things that are text, not behaviour
vm.createContext(sandbox);
vm.runInContext(blocks.join('\n;\n') + '\n;\n' + testScript, sandbox)
  .catch(e => { console.error('RUNTIME ERROR:', e.stack); process.exitCode = 1; });

process.on('beforeExit', () => { if (sandbox.__fails) process.exitCode = 1; });
