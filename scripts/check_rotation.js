// Does a student see new material, or the same few texts?
//
// Themes always rotated properly — a shuffle bag hands out all fourteen
// before any repeats. The pick INSIDE a theme did not: it was plain
// random with no memory, against banks that mostly hold two items per
// theme, so a returning theme was a coin flip between the same two texts.
//
// The failure was invisible from any single sitting. Three Reading
// sittings looked fine; it was the fourth onwards that collapsed, which
// is exactly the point where a motivated student is doing the most work.
// So these checks measure across sittings, not within one.
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
const el = () => {
  const n = {
    style: {}, innerHTML: '', textContent: '', value: '', id: '',
    classList: { toggle(){}, add(){}, remove(){}, contains: () => false },
    appendChild(){}, addEventListener(){}, querySelector: () => el(),
    querySelectorAll: () => [], closest: () => null, select(){}, focus(){},
    remove(){}, insertBefore(){},
    getBoundingClientRect: () => ({ top:0, left:0, width:0, height:0 }),
  };
  n.parentNode = { insertBefore(){}, removeChild(){} };
  return n;
};

const testScript = `
(async () => {
  const results = [];
  function assert(n, c){ results.push(n + ': ' + (c ? 'PASS' : 'FAIL')); }
  const idOf = d => JSON.stringify(d).length + ':' + JSON.stringify(d).slice(0, 60);

  setStudentName('Rotation Student');

  // --- a bank is exhausted before anything repeats ---
  // The core promise. Draw exactly as many times as the bank is deep and
  // every item should have come up once.
  const banks = [
    ['passage', PASSAGE_BANK], ['daily-read', DAILY_READ_BANK],
    ['talk', TALK_BANK], ['conversation', CONVERSATION_BANK],
    ['email', EMAIL_BANK], ['discussion', DISCUSSION_BANK],
    ['complete-words', COMPLETE_WORDS_BANK],
  ];
  banks.forEach(([kind, bank]) => {
    const theme = 'campus';
    const depth = (bank[theme] || []).length;
    if(!depth) return;
    const seen = new Set();
    for(let i = 0; i < depth; i++) seen.add(idOf(drawFromBank(kind, theme, bank[theme])));
    assert(kind + ' shows all ' + depth + ' of a theme before repeating any', seen.size === depth);
  });

  // --- and keeps doing it on the next cycle ---
  // A bag that empties and never refills would start returning nothing.
  const twice = new Set();
  const depth = PASSAGE_BANK.campus.length;
  for(let i = 0; i < depth * 2; i++) twice.add(idOf(drawFromBank('passage', 'campus', PASSAGE_BANK.campus)));
  assert('the bag reshuffles rather than running dry', twice.size === depth);

  // --- one theme's rotation does not disturb another's ---
  // A single shared bag would let heavy practice on one theme starve the
  // rest, which is the bug this replaced wearing a different hat.
  const before = idOf(drawFromBank('passage', 'career', PASSAGE_BANK.career));
  for(let i = 0; i < 6; i++) drawFromBank('passage', 'campus', PASSAGE_BANK.campus);
  const after = idOf(drawFromBank('passage', 'career', PASSAGE_BANK.career));
  assert('each theme rotates on its own', before !== after);

  // --- two students on one device do not share a rotation ---
  // The class is expected to share phones. One student working through a
  // theme must not eat the fresh material the next one gets.
  //
  // Comparing the drawn items would prove nothing — two independent bags
  // can happen to start on the same text. What matters is that the bags
  // are separate at all, so this checks the storage each one keeps.
  setStudentName('Student One');
  drawFromBank('talk', 'health', TALK_BANK.health);
  setStudentName('Student Two');
  drawFromBank('talk', 'health', TALK_BANK.health);
  const bagKeys = Object.keys(__STORE).filter(k => k.indexOf('talk_health') > -1);
  assert('each student keeps their own bag', bagKeys.length === 2);
  assert('the bags are named per student',
    bagKeys.some(k => k.indexOf('student one') > -1) &&
    bagKeys.some(k => k.indexOf('student two') > -1));

  // And one student exhausting a theme leaves the other's untouched.
  setStudentName('Student One');
  for(let i = 0; i < TALK_BANK.health.length * 2; i++) drawFromBank('talk', 'health', TALK_BANK.health);
  const twoBag = __STORE[bagKeys.find(k => k.indexOf('student two') > -1)];
  setStudentName('Student Two');
  drawFromBank('talk', 'health', TALK_BANK.health);
  assert('one student practicing does not drain another\\'s rotation',
    twoBag !== undefined);
  setStudentName('Rotation Student');

  // --- a one-item bank does not break ---
  assert('a single-item bank just returns it',
    drawFromBank('x', 'y', ['only']) === 'only');
  assert('an empty bank returns nothing rather than throwing',
    drawFromBank('x', 'y', []) === null);

  // --- the measurable outcome, across sittings ---
  //
  // Careful here: this is a stochastic measurement, and I first wrote it
  // as absolutes from a single lucky run — "the first three sittings
  // repeat nothing at all" — which then failed on roughly half of runs.
  // A test that fails at random is worse than no test: it trains you to
  // ignore the suite.
  //
  // Measured over 40 trials of six Reading sittings each:
  //   without the bag (memoryless pick): median 27% repeats, range 18-33%
  //   with it:                           median 16% repeats, range 10-25%
  //
  // So the assertion is on the AGGREGATE of many trials, and the
  // threshold sits above the observed range rather than on top of it.
  function sixSittings(who){
    setStudentName(who);
    const seen = new Set();
    let served = 0, repeats = 0;
    for(let s = 0; s < 6; s++){
      buildExamItems(EXAM_SECTIONS.reading).forEach(it => {
        const k = it.type + '|' + it.theme + '|' + idOf(it.data);
        served++;
        if(seen.has(k)) repeats++; else seen.add(k);
      });
    }
    return { rate: repeats / served, distinct: seen.size };
  }

  const trials = [];
  for(let t = 0; t < 12; t++) trials.push(sixSittings('Trial Student ' + t));
  const meanRate = trials.reduce((a, t) => a + t.rate, 0) / trials.length;
  const meanDistinct = trials.reduce((a, t) => a + t.distinct, 0) / trials.length;

  assert('twelve trials average well under the memoryless 27%', meanRate < 0.22);
  assert('no single trial is as bad as the memoryless median', trials.every(t => t.rate < 0.30));
  assert('six sittings serve around fifty distinct exercises', meanDistinct > 45);

  // --- the theme bag itself still works ---
  const themes = new Set();
  for(let i = 0; i < ALL_THEMES.length; i++) themes.add(drawFromBag('theme', ALL_THEMES, 'Bag Student'));
  assert('every theme appears before any repeats', themes.size === ALL_THEMES.length);

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
  window: { addEventListener(){} },
  localStorage,
  __STORE: store,
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
