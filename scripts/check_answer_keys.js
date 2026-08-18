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


/* WHICH ENGLISH, AND WHERE — THE THREE ANSWERS ARE DIFFERENT.

   Verified against what ETS actually publishes, after assuming the opposite
   once and being corrected:

   Listening carries British, Australian and New Zealand voices on purpose,
   North American being only the most common of four. So British vocabulary in
   a listening bank is not a defect — it is what test day sounds like, and
   scrubbing it would fail the student who has only ever heard American
   English and meets a British lecturer.

   Reading passages use American spelling; ETS writes its own materials that
   way. So the reading banks do, now.

   And Writing accepts either system while marking CONSISTENCY — "colour" and
   "organize" in one essay counts against you though each is correct
   somewhere. That is a mark these students were losing without being told
   why, and the app now says it. */
{
  const BRIT_SPELLING = /\b(centre|colour|coloured|behaviour|organis(e|ed|ation)|recognis(e|ed)|realis(e|ed)|travell(ing|ed|er)|cancell(ed|ing)|labell(ed|ing)|programme|favourite|neighbour(hood)?|theatre|metres?|litres?|defence|licence|analys(e|ed)|whilst|learnt|spelt|storey s?|enrolment|fulfil|skilful|instalment)\b/gi;

  const readingText = [];
  for(const th in PASSAGE_BANK) PASSAGE_BANK[th].forEach(a => {
    readingText.push(a.title || '', a.text || '');
    (a.questions || []).forEach(q => { readingText.push(q.q); q.options.forEach(o => readingText.push(o)); });
  });
  for(const th in DAILY_READ_BANK) DAILY_READ_BANK[th].forEach(a => {
    readingText.push(a.title || '', [].concat(a.body || []).join(' '));
    (a.questions || []).forEach(q => { readingText.push(q.q); q.options.forEach(o => readingText.push(o)); });
  });
  const readHits = (readingText.join(' ').match(BRIT_SPELLING) || []);
  assert('reading passages use the spelling the test shows (' + readHits.length + ' British forms)',
    readHits.length === 0, readHits.slice(0, 8).join(', '));

  // Listening is NOT held to that, and the assertion says so out loud so that
  // nobody "finishes the job" later and takes the exam's own variety out.
  const listeningText = [];
  for(const [bank, get] of [[CONVERSATION_BANK, a => (a.turns || []).map(t => t[1]).join(' ')],
                            [TALK_BANK, a => a.text || ''],
                            [ANNOUNCEMENT_BANK, a => (a.set || [a]).map(x => x.text || '').join(' ')]])
    for(const th in bank) bank[th].forEach(a => listeningText.push(get(a)));
  /* Vocabulary, not spelling — because that is what listening actually
     carries. The clips say "chemist" and "flat" and "queue"; nobody spells
     anything aloud. Measuring spelling here returned zero, which would have
     read as "the British English is gone" — the opposite of the truth.

     Counted as plain substrings. This probe runs inside a template literal
     where a backslash does not survive, and a lost \\b has now produced a
     wrong number ten times in this repo. A rule that cannot be written with a
     regex cannot lose one. */
  const BRIT_WORDS = ['chemist', 'flat', 'lift', 'queue', 'car park', 'timetable',
                      'petrol', 'autumn', 'rubbish', 'maths', 'lorry', 'torch',
                      'jumper', 'trainers', 'biscuit'];
  const heard = listeningText.join(' ').toLowerCase();
  const heardBritish = BRIT_WORDS.reduce((n, w) => n + (heard.split(w).length - 1), 0);
  assert('listening keeps the British English the exam actually plays (' + heardBritish + ' terms, deliberately)',
    heardBritish > 0, 'if this reaches zero somebody has removed what ETS puts in on purpose');
  assert('and each one is explained after the answer, not left as a trap',
    HTML_SOURCE.indexOf('BRITISH_TO_AMERICAN') > -1
    && HTML_SOURCE.split('britishNoteHtml(').length - 1 >= 5);
}

/* TWO TELLS NOBODY HAD MEASURED.
   ---------------------------------------------------------------
   The length work went looking for one surface a student can read without
   understanding, found it, and stopped. These are the other two, and the
   first is bigger than the length bias ever was.

   1. LEXICAL OVERLAP. "Pick the option that repeats the passage most" scores
      47% to 58% depending on the bank, against 25% for a guess. That is the
      word-matching habit an exam-prep app is supposed to train AGAINST: in a
      well-made item the correct answer is a PARAPHRASE and the distractors
      are the ones echoing the text. Here it is the other way round.

   2. NEGATION. Where exactly one option contains not/never/except, it is the
      correct one far more often than chance — 79% in Choose the Response,
      though on only 17 questions, and 61% in a talk on 9.

   Held rather than fixed. Correcting these means rewriting hundreds of
   distractors, which is authorship, and the one time this bank was edited in
   bulk without a person reading each result it put "it's the whole only way"
   into an answer key. The numbers may not get worse; lowering one is a
   deliberate act with a measurement behind it.

   The metric is crude and should be read as a direction, not a verdict: it
   counts how many of an option's content words appear in the source, so a
   correct answer that legitimately quotes a phrase scores high too. What it
   cannot explain away is the SHAPE — the right answer should not be the most
   text-like one, and in four banks it is. */
const NEG_RE = /\\b(not|never|except|least|nor|unlike|rather than|instead of|no longer)\\b/i;
const STOPW = new Set('a an the of to in on at for and or but is are was were be been being it its this that these those with as by from about not no i you he she they we his her their there what which who how why when where do does did have has had will would can could should may might must'.split(' '));
const contentWords = s => (String(s || '').toLowerCase().match(/[a-z']+/g) || [])
  .filter(w => w.length > 3 && !STOPW.has(w));

const SOURCE_OF = {
  announcement: a => a.text,
  conversation: a => (a.turns || []).map(t => t.line || t.text || t).join(' '),
  talk: a => a.text,
  'daily-read': a => [].concat(a.title || '', a.body || []).join(' '),
  passage: a => a.text,
};
const withSource = [];
for(const [type, key] of [['announcement','ANNOUNCEMENT_BANK'],['conversation','CONVERSATION_BANK'],
                          ['talk','TALK_BANK'],['daily-read','DAILY_READ_BANK'],['passage','PASSAGE_BANK']]){
  const bank = eval(key);
  for(const th in bank) bank[th].forEach(a => (a.questions || []).forEach(q =>
    withSource.push({ type, src: String(SOURCE_OF[type](a) || ''), q })));
}
// Every question of a bank that has a source text must HAVE one, or the
// measurement below is quietly reading nothing. daily-read reported 0%
// overlap for exactly this reason: the extractor looked for a field that
// bank does not have.
const noSource = {};
withSource.forEach(x => { if(!x.src) noSource[x.type] = (noSource[x.type] || 0) + 1; });
assert('every question with a source text actually has one',
  Object.keys(noSource).length === 0, JSON.stringify(noSource));

const OVERLAP_MAX = { announcement: 0.60, conversation: 0.59, talk: 0.54, 'daily-read': 0.60, passage: 0.49 };
const byType2 = {};
withSource.forEach(x => { (byType2[x.type] = byType2[x.type] || []).push(x); });
for(const type in byType2){
  const list = byType2[type];
  const rate = list.reduce((acc, x) => {
    const S = new Set(contentWords(x.src));
    const v = x.q.options.map(o => { const c = contentWords(o);
      return c.length ? c.filter(w => S.has(w)).length / c.length : 0; });
    const mx = Math.max(...v), k = v.filter(z => z === mx).length;
    return acc + (v[x.q.answer] === mx ? 1 / k : 0);
  }, 0) / list.length;
  assert(type + ': "pick the option that repeats the text" is held at its measured level (' +
    Math.round(rate * 100) + '%, chance 25%, n=' + list.length + ')',
    rate <= (OVERLAP_MAX[type] || 0.5), 'OPEN FINDING — may not get worse');
}

const NEG_MAX = { 'choose-response': 0.80, talk: 0.62, passage: 0.56, 'daily-read': 0.70,
                  announcement: 0.60, conversation: 0.60 };
// Grouped here rather than from byType, which is built further down: this
// probe sits above it on purpose, so the two length tells and these two read
// in the order somebody would want to compare them.
const negGroups = {};
qs.forEach(x => { (negGroups[x.type] = negGroups[x.type] || []).push(x.q); });
for(const type in negGroups){
  const list = negGroups[type];
  let n = 0, score = 0;
  list.forEach(q => {
    const neg = q.options.map((o, i) => NEG_RE.test(o) ? i : -1).filter(i => i >= 0);
    if(!neg.length) return;
    n++; if(neg.indexOf(q.answer) > -1) score += 1 / neg.length;
  });
  if(n < 5) continue;   // too few to say anything about
  assert(type + ': "pick the option with a negative in it" is held at its measured level (' +
    Math.round(score / n * 100) + '%, chance 25%, n=' + n + ')',
    score / n <= (NEG_MAX[type] || 0.6), 'OPEN FINDING — may not get worse');
}

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

    /* Word spread, alongside the character tells below, because the two pull
       against each other and only one of them was ever guarded.

       check_conversation.js has always required options to sit within about
       a word of each other, and conversation passed it. The character tell in
       that same bank was 48%. Both readings are true: the options are the
       same LENGTH in words while the correct one uses longer words, and what
       a student sees on a phone is the character line, not the word count.

       The trap is that fixing either one by itself breaks the other. Padding a
       distractor with a phrase kills the character tell and blows the word
       spread; trimming to the word count re-creates the character tell. So
       both are asserted here, on every bank, and a fix has to satisfy the
       pair. Only conversation had the word half before this. */
    // \\s, not \s. This whole probe is a template literal, where \s is not a
    // recognised escape and collapses to the letter s — so this split on
    // whitespace was silently splitting on the letter "s", every option came
    // out several words too long, and the ceilings below were set from those
    // inflated numbers. It is the seventh time this file family has lost a
    // backslash that way, and the first six were caught by a number that
    // looked wrong; this one passed as green.
    const words = o => String(o).trim().split(/\\s+/).length;
    const spread = list.reduce((acc, q) => {
      const W = q.options.map(words);
      return acc + (Math.max(...W) - Math.min(...W));
    }, 0) / n;
    // Per bank, at what it measures today, so a fix for the character tell
    // cannot be bought with padding. These are not targets — they are
    // ceilings, and each may be lowered, never raised.
    const WORD_SPREAD_MAX = {
      'choose-response': 1.85, 'announcement': 1.05, 'conversation': 1.20,
      'talk': 1.10, 'daily-read': 1.45, 'passage': 1.30,
    };
    const cap = WORD_SPREAD_MAX[type] || 2.0;
    assert(type + ': options stay within about a word of each other (' +
      spread.toFixed(2) + ' of ' + cap.toFixed(2) + ' words average spread, n=' + n + ')',
      spread <= cap, 'a distractor padded to hide a length tell reads as padded');
    /* Ties are a guess, not a hit.
       The old form was indexOf(Math.max(...)), which returns the FIRST index
       holding the maximum — so it credited the strategy a whole point every
       time the correct answer merely sorted first among equal-length options.
       Every key in these banks is index 0, so that happened constantly, and
       the numbers in the comment below are inflated by it: conversation was
       reported at 57% and was really 48%. A student facing three equally long
       options has to pick one, which is worth 1/k, and that is what this
       counts now. */
    const extremeRate = pick => list.reduce((acc, q) => {
      const L = q.options.map(o => String(o).length);
      const target = pick(L);
      const tied = L.filter(v => v === target).length;
      return acc + (L[q.answer] === target ? 1 / tied : 0);
    }, 0) / n;
    const longest  = extremeRate(L => Math.max(...L));
    const shortest = extremeRate(L => Math.min(...L));
    const ceiling = 0.25 + 3 * Math.sqrt(0.25 * 0.75 / n);

    /* CLOSED 2026-08-17, and the honest numbers are smaller than the ones
       that opened it.
       -------------------------------------------------------------------
       As first reported, a student who never read or listened and always
       picked the longest (or shortest) option scored: conversation 57%,
       passage 44%, choose-response 43%, announcement 43%, talk 38% — against
       the 25% a four-option guess gives. Two things were wrong with those
       figures and one thing was right.

       Wrong, first: they credited ties. Re-measured honestly the same day,
       the real rates were 48 / 39 / 41 / 38 / 35. Still far above chance, so
       the finding stood, but it was never as bad as the report said and the
       ratchet was set from the inflated numbers.

       Wrong, second: in choose-response the length gap was a symptom. 62% of
       the wrong options ended in a tacked-on hedge — "really", "I believe",
       "I gather" — against 21% of the right ones, so "pick the one that does
       not trail off" scored 48% on its own, and those tails were also what
       made the wrong options run long. Removing all 171 fixed both.

       Right: the rest of it was real, and it was fixed the slow way — one
       wrong option rewritten in 83 questions across five banks, each swapping
       words rather than adding them, because the options must also stay
       near-equal in WORD count and padding to hide a character tell fails
       that. Every batch went through scripts/try_option_fixes.sh, which
       applies to a copy and runs these checks before index.html is touched.

       No bank now beats chance by more than noise. The statistical ceiling
       applies everywhere, so OPEN_LENGTH_BIAS is empty — if a bank drifts
       back above it, that is a regression and not a known condition. */
    const OPEN_LENGTH_BIAS = {};   // empty: nothing is held open any more
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
