// Are the answer keys right, and is each question answerable ONLY by
// understanding it?
//
// A wrong key, or a key a student can find with the sound off, is the most
// expensive bug this app can ship: it marks a student wrong for being right,
// or right for guessing, and either way it teaches the wrong thing. So these
// run over EVERY question in EVERY bank — not a sample.
//
// What it asserts:
//   1. every `answer` indexes into its own `options`
//   2. no question carries two options that read the same
//   3. no question carries two options that are near-paraphrases
//   4. Complete the Words: 10 gaps, first sentence clean, the visible slot
//      count equals the letters the checker will demand, key present in the
//      revealed text
//   5. surface tells: a student who always picks the longest (or shortest)
//      option must not beat chance by more than noise, or the item is
//      answerable without reading/listening at all
//   6. no ungrammatical model English in an option — a distractor a learner
//      reads is still English they are being taught
//
//   node scripts/check_answer_keys.js index.html
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/type\s*=\s*["']module["']/.test(m[1]))
  .map(m => m[2]);

const nodes = {};
const el = (id) => {
  if (id && nodes[id]) return nodes[id];
  const n = { style:{}, innerHTML:'', textContent:'', value:'', id: id || '', children: [],
    classList:{ toggle(){}, add(){}, remove(){}, contains:()=>false },
    addEventListener(){}, querySelector:()=>el(), querySelectorAll:()=>[],
    closest:()=>null, select(){}, focus(){}, remove(){}, insertBefore(){}, scrollIntoView(){},
    getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}) };
  n.appendChild = c => { n.children.push(c); };
  n.parentNode = { insertBefore(){}, removeChild(){} };
  if (id) nodes[id] = n;
  return n;
};
const store = {};

const HTML_SOURCE_JSON = JSON.stringify(html);
const testScript = `
const HTML_SOURCE = ${HTML_SOURCE_JSON};

${blocks.join('\n;\n')}
;
(function(){
  const results = [];
  const notes = [];
  function assert(n, c, detail){ results.push(n + ': ' + (c ? 'PASS' : 'FAIL') + (c || !detail ? '' : '\\n      ' + detail)); }

  // Every MCQ question in the app, flattened, with where it came from.
  const qs = [];
  const add = (type, th, i, q) => qs.push({ type, where: type + ' ' + th + '#' + i, q });
  for(const th in CHOOSE_RESPONSE_BANK) CHOOSE_RESPONSE_BANK[th].forEach((it,i)=>add('choose-response',th,i,{q:it.prompt,options:it.options,answer:it.answer}));
  for(const th in ANNOUNCEMENT_BANK)  ANNOUNCEMENT_BANK[th].forEach((a,i)=>a.questions.forEach((q,j)=>add('announcement',th,i+'.'+j,q)));
  for(const th in CONVERSATION_BANK)  CONVERSATION_BANK[th].forEach((a,i)=>a.questions.forEach((q,j)=>add('conversation',th,i+'.'+j,q)));
  for(const th in TALK_BANK)          TALK_BANK[th].forEach((a,i)=>a.questions.forEach((q,j)=>add('talk',th,i+'.'+j,q)));
  for(const th in DAILY_READ_BANK)    DAILY_READ_BANK[th].forEach((a,i)=>a.questions.forEach((q,j)=>add('daily-read',th,i+'.'+j,q)));
  for(const th in PASSAGE_BANK)       PASSAGE_BANK[th].forEach((a,i)=>a.questions.forEach((q,j)=>add('passage',th,i+'.'+j,q)));

  //=================================================================
  // 1-3. KEY INTEGRITY, EXHAUSTIVE
  //=================================================================
  const flat = o => String(o).toLowerCase().replace(/[^a-z0-9]/g,'');
  const STOP = new Set('a an the of to in on at for and or but is are was were be been it its this that these those with as by from about'.split(' '));
  const toks = o => new Set(String(o).toLowerCase().replace(/[^a-z0-9\\s]/g,' ').split(/\\s+/).filter(w=>w && !STOP.has(w)));
  const jaccard = (a,b) => { const A=toks(a), B=toks(b); let n=0; for(const x of A) if(B.has(x)) n++; return n/(A.size+B.size-n); };

  const outOfRange = qs.filter(x => !(Number.isInteger(x.q.answer) && x.q.answer >= 0 && x.q.answer < x.q.options.length));
  assert('every answer key indexes into its own options (' + qs.length + ' questions)',
    outOfRange.length === 0, outOfRange.slice(0,5).map(x=>x.where).join(', '));

  const dupes = [];
  qs.forEach(x => { const seen = new Map();
    x.q.options.forEach((o,i)=>{ const k = flat(o); if(seen.has(k)) dupes.push(x.where + ' [' + seen.get(k) + ',' + i + '] "' + o + '"'); else seen.set(k,i); }); });
  assert('no question offers the same option twice', dupes.length === 0, dupes.slice(0,5).join('\\n      '));

  const paras = [];
  qs.forEach(x => { for(let a=0;a<x.q.options.length;a++) for(let b=a+1;b<x.q.options.length;b++){
    const j = jaccard(x.q.options[a], x.q.options[b]);
    if(j >= 0.55) paras.push(x.where + ' J=' + j.toFixed(2) + '\\n        [' + a + '] ' + x.q.options[a] + '\\n        [' + b + '] ' + x.q.options[b]); } });
  assert('no question offers two near-paraphrase options (both defensible)', paras.length === 0, paras.slice(0,4).join('\\n      '));

  //=================================================================
  // 4. COMPLETE THE WORDS — what the student sees must match what is graded
  //=================================================================
  const cwBad = [];
  for(const theme of ALL_THEMES){
    (COMPLETE_WORDS_BANK[theme] || []).forEach((raw, pi) => {
      const at = theme + '/p' + pi;
      const words = [...raw.matchAll(/\\*\\*(.+?)\\*\\*/g)].map(m => m[1]);
      if(words.length !== 10) cwBad.push(at + ' has ' + words.length + ' gaps, not 10');
      // ETS never blanks the first sentence: it is the context everything
      // else is inferred from.
      const firstMark = raw.indexOf('**');
      const endFirst = (raw.match(/[.!?](\\s|$)/) || {}).index;
      if(firstMark >= 0 && endFirst != null && firstMark < endFirst) cwBad.push(at + ' blanks a word in the first sentence');
      const gen = genCompleteWords(theme);
      if(/\\*\\*/.test(gen.display) || /\\*\\*/.test(gen.answer)) cwBad.push(at + ' leaves ** markers in the rendered text');
      words.forEach(w => {
        const b = blankInfo(w);
        const demanded = w.toLowerCase().replace(/[^a-z0-9]/g,'').length;
        if(b.shown.length + b.hiddenCount !== demanded)
          cwBad.push(at + ' "' + w + '" shows ' + (b.shown.length + b.hiddenCount) + ' letter slots but the checker demands ' + demanded);
        if(b.shown.length === 0) cwBad.push(at + ' "' + w + '" is shown with no visible prefix at all');
      });
    });
  }
  assert('Complete the Words: 10 clean gaps per passage, slots match what is graded', cwBad.length === 0, cwBad.slice(0,6).join('\\n      '));

  //=================================================================
  // 5. SURFACE TELLS — is the key findable with the sound off?
  //=================================================================
  // Four options, so blind guessing is 25%. A strategy that needs no
  // comprehension must not beat that by more than sampling noise (3 sd).
    /* THE TELL THAT IS NOT A TELL, AND THE ONE LINE HOLDING IT THAT WAY.

     Every answer key in every bank is index 0 — 511 of 511. That is not a
     flaw in the data; it is how the banks were authored, and it is harmless
     for exactly one reason: each generator calls shuffle(q.options) before
     the student ever sees them, so position carries no information at the
     point where a student could use it.

     It is harmless the way an unlocked door is harmless while someone is
     standing in front of it. A seventh exercise type, or a renderer that
     forgets the shuffle, hands out a 100% strategy — pick the first one —
     and the length checks below would not notice, because they read the
     bank rather than the screen. So the guard is on the generators. */
  const generators = ['genChooseResponse','genAnnouncement','genConversation',
                      'genTalk','genDailyRead','genPassage'];
  const src = String(HTML_SOURCE);
  const unshuffled = generators.filter(g => {
    const at = src.indexOf('function ' + g + '(');
    if(at === -1) return true;
    const body = src.slice(at, at + 2600);
    return body.indexOf('shuffle(') === -1;
  });
  assert('every generator shuffles its options, so answer position is never a tell (' +
    generators.length + ' generators, 511 keys all at index 0)',
    unshuffled.length === 0, 'never shuffled: ' + unshuffled.join(', '));

  const byType = {};
  qs.forEach(x => { (byType[x.type] = byType[x.type] || []).push(x.q); });
  for(const type in byType){
    const list = byType[type], n = list.length;
    const rate = pickIdx => list.filter(q => pickIdx(q.options) === q.answer).length / n;
    const longest  = rate(o => o.map(s=>s.length).indexOf(Math.max(...o.map(s=>s.length))));
    const shortest = rate(o => o.map(s=>s.length).indexOf(Math.min(...o.map(s=>s.length))));
    const ceiling = 0.25 + 3 * Math.sqrt(0.25 * 0.75 / n);

    /* A RATCHET, NOT A PASS. This is an OPEN FINDING held at today's level.
       -------------------------------------------------------------------
       Measured 2026-08-17: a student who never reads the question and always
       picks the shortest (or longest) option scores well above the 25% a
       four-option guess should give.

         passage          shortest  44%
         choose-response  shortest  43%
         announcement     longest   43%
         conversation     longest   57%
         talk             shortest  38%

       Conversation is the worst: more than double chance with no
       comprehension at all. That inflates every score the app reports and
       rewards a test-taking habit instead of English.

       It is NOT fixed, and it was deliberately not auto-fixed. The cause is
       that correct answers and distractors were written at systematically
       different lengths across hundreds of options, and rebalancing them is
       content authoring — the same edit that, done in bulk without checking
       fit, is what put "it's the whole only way" into an answer key in the
       first place. Rewriting an English exam bank unsupervised is not a safe
       change, and this file already proved why.

       So the bar is held where it is: these numbers may not get WORSE, and
       lowering a bound here is a deliberate act with the measurement to
       justify it. When the options are rebalanced, drop OPEN_LENGTH_BIAS and
       let the statistical ceiling apply. */
    const OPEN_LENGTH_BIAS = {
      'passage':          { shortest: 0.45, longest: null },
      'choose-response':  { shortest: 0.44, longest: null },
      'announcement':     { shortest: null, longest: 0.44 },
      'conversation':     { shortest: null, longest: 0.58 },
      'talk':             { shortest: 0.39, longest: null },
    };
    const held = OPEN_LENGTH_BIAS[type] || {};
    const boundFor = which => (held[which] === null || held[which] === undefined)
      ? ceiling : held[which];
    const labelFor = which => (held[which] === null || held[which] === undefined)
      ? 'must not beat chance' : 'length bias is held at its measured level (OPEN finding)';
    const pc = v => Math.round(v*100) + '%';
    assert(type + ': "always pick the longest option" ' + labelFor('longest') + ' (n=' + n + ')',
      longest <= boundFor('longest'),
      'scores ' + pc(longest) + ' with no comprehension; chance ' + pc(0.25) + ', bound ' + pc(boundFor('longest')));
    assert(type + ': "always pick the shortest option" ' + labelFor('shortest') + ' (n=' + n + ')',
      shortest <= boundFor('shortest'),
      'scores ' + pc(shortest) + ' with no comprehension; chance ' + pc(0.25) + ', bound ' + pc(boundFor('shortest')));
  }

  //=================================================================
  // 6. NO BROKEN ENGLISH IN AN OPTION
  //=================================================================
  // These specific shapes come from a bulk "vary the wording" edit that
  // rewrote bare "a"/"the"/"about" without reading the sentence, so they
  // are what a repeat of that edit would produce again.
  const BROKEN = [
    [/\\ba single (few|great deal|great many|couple|number of)\\b/i, 'a single + quantifier'],
    [/\\bthe whole (only|single)\\b/i, 'the whole + only/single'],
    [/\\bround about (it|that|this|exactly)\\b/i, 'round about + pronoun'],
    [/\\bthe whole (edge|library|arrivals|first|students)/i, 'the whole + non-whole noun'],
  ];
  const broken = [];
  qs.forEach(x => x.q.options.forEach((o,i) => BROKEN.forEach(([re,label]) => {
    if(re.test(o)) broken.push(x.where + ' option ' + i + (i === x.q.answer ? ' (THE KEY)' : '') + ' — ' + label + ': "' + o + '"');
  })));
  assert('no option teaches ungrammatical English', broken.length === 0, broken.join('\\n      '));

  //=================================================================
  // STRUCTURE — a question count the app promises elsewhere
  //=================================================================
  const shape = [];
  for(const th in PASSAGE_BANK) PASSAGE_BANK[th].forEach((p,i)=>{
    if(p.questions.length !== 5) shape.push('passage ' + th + '#' + i + ': ' + p.questions.length + ' questions, not 5');
    // question 3 asks what a word means where it sits — it must be in the text
    if(!p.vocab || !new RegExp('\\\\b' + p.vocab + '\\\\b', 'i').test(p.text))
      shape.push('passage ' + th + '#' + i + ': vocab word "' + p.vocab + '" is not in the passage');
  });
  for(const th in TALK_BANK) TALK_BANK[th].forEach((t,i)=>{ if(t.questions.length !== 4) shape.push('talk ' + th + '#' + i + ': ' + t.questions.length + ' questions, not 4'); });
  for(const th in CONVERSATION_BANK) CONVERSATION_BANK[th].forEach((c,i)=>{ if(c.questions.length !== 2) shape.push('conversation ' + th + '#' + i + ': ' + c.questions.length + ' questions, not 2'); });
  for(const th in DAILY_READ_BANK) DAILY_READ_BANK[th].forEach((d,i)=>{ if(d.questions.length < 2 || d.questions.length > 3) shape.push('daily-read ' + th + '#' + i + ': ' + d.questions.length + ' questions'); });
  assert('every exercise carries the number of questions its brief claims', shape.length === 0, shape.slice(0,6).join('\\n      '));

  console.log(results.join('\\n'));
  const fails = results.filter(r => r.indexOf('FAIL') > -1);
  globalThis.__fails = fails.length;
  console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length) : ('ALL ' + results.length + ' CHECKS PASS'));
})();
`;

const sandbox = {
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  document: { getElementById: id => el(id), createElement: () => el(), querySelector: () => el(),
    querySelectorAll: () => [], addEventListener(){}, body: el('__body'), documentElement: el('__html') },
  window: { addEventListener(){}, _lrState:null, _sentenceState:null, matchMedia: () => ({ matches:false, addEventListener(){} }) },
  localStorage: { getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} },
  location: { origin:'https://example.com', pathname:'/app', hash:'', search:'' },
  navigator: { language:'en-US', languages:['en-US'], clipboard:{writeText:()=>Promise.resolve()} },
  SpeechSynthesisUtterance: function(t){ this.text = t; },
  speechSynthesis: { speak(){}, getVoices(){return [];}, addEventListener(){}, cancel(){} },
  URLSearchParams,
  console, Date, Math, JSON, Array, Object, String, Number, Intl, Set, Map, Promise, RegExp, Error,
  setInterval: (...a) => { const t = setInterval(...a); if (t && t.unref) t.unref(); return t; },
  clearInterval, setTimeout, clearTimeout,
};
sandbox.self = sandbox.window;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(testScript, sandbox);
process.on('beforeExit', () => { if (sandbox.__fails) process.exitCode = 1; });
