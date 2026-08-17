// Does a KNOWN-CORRECT answer always score correct?
//
// Every other check in this suite asks whether the content is right. This one
// asks the question a student actually feels: I answered it correctly — did
// the app agree? It generates real items across all 14 themes, works out the
// right answer from the item's own data, feeds that answer to the real
// checking function, and asserts the score that comes out is full marks.
//
// It also checks the other half of the same promise: that the instruction on
// screen describes the answer the checker will accept. An instruction that
// asks for one thing while the checker demands another marks a student wrong
// for doing as they were told, which is indistinguishable from a wrong key.
//
//   node scripts/check_correct_is_correct.js index.html
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

const testScript = `
${blocks.join('\n;\n')}
;
(function(){
  const results = [];
  function assert(n, c, detail){ results.push(n + ': ' + (c ? 'PASS' : 'FAIL') + (c || !detail ? '' : '\\n      ' + detail)); }

  // Divert the outcome funnel so a score can be read back.
  const realLog = logUsage;
  let scores = [];
  logUsage = (type, theme, outcome01) => { scores.push(outcome01); };
  const last = () => scores.length ? scores[scores.length-1] : null;
  const put = (id, v) => { document.getElementById(id).value = v; };
  const mount = (type, theme, data) => {
    selectedId = '__self__';
    window._selfItem = { id:'rt', type, tag:'x', theme, status:'approved', data };
    practiceOverride = null;
  };
  const REPS = 6;   // x14 themes; enough to cycle every bank entry

  const bad = { cw:[], sn:[], mcq:[], wr:[], iv:[], lr:[] };

  for(const theme of ALL_THEMES){
   for(let r = 0; r < REPS; r++){
    //---------------------------------------------------------------
    // Complete the Words
    //---------------------------------------------------------------
    {
      const d = genCompleteWords(theme);
      mount('complete-words', theme, d);
      scores = [];
      d.words.forEach((w,i) => put('cw-blank-' + i, w));
      checkCompleteWords();
      if(last() !== 1) bad.cw.push(theme + ': the exact answer words scored ' + last());
      // The checker's own comment promises case and punctuation tolerance.
      scores = [];
      d.words.forEach((w,i) => put('cw-blank-' + i, '  ' + w.toUpperCase() + ',  '));
      checkCompleteWords();
      if(last() !== 1) bad.cw.push(theme + ': "VIDEO," scored ' + last() + ' — the promised case/punctuation tolerance is not there');
      // Partial credit: 9 of 10 gaps right must not score zero, because the
      // exam counts this exercise as TEN items (examQuestionCount).
      scores = [];
      d.words.forEach((w,i) => put('cw-blank-' + i, i === 0 ? 'zzzz' : w));
      checkCompleteWords();
      if(last() === 0) bad.cw.push(theme + ': 9 of 10 gaps right scored 0 — the exam credits this exercise as 10 items, so 9 correct gaps are lost');
    }
    //---------------------------------------------------------------
    // Build a Sentence
    //---------------------------------------------------------------
    {
      const d = genSentence(theme);
      mount('sentence', theme, d);
      scores = [];
      window._sentenceState = { remaining:[], assembled: d.target.replace(/[.?]$/,'').split(' ') };
      checkSentence();
      if(last() !== 1) bad.sn.push(theme + ': the target word order scored ' + last() + ' — ' + JSON.stringify(d.target));
    }
    //---------------------------------------------------------------
    // The six multiple-choice types, driven through their real
    // answer/advance handlers with the key from the item's own data
    //---------------------------------------------------------------
    const mcq = [
      ['announcement', () => genAnnouncement(theme), d => {
        window._anState = { itemId:'rt', ann:0, q:0, listens:1, results:[], chosen:null };
        d.set.forEach(a => a.questions.forEach(q => { answerAnnouncement(q.answer); advanceAnnouncement(); })); }],
      ['passage', () => genPassage(theme), d => {
        window._pgState = { itemId:'rt', q:0, results:[], chosen:null };
        d.questions.forEach(q => { answerPassage(q.answer); advancePassage(); }); }],
      ['daily-read', () => genDailyRead(theme), d => {
        window._drState = { itemId:'rt', q:0, results:[], chosen:null };
        d.questions.forEach(q => { answerDailyRead(q.answer); advanceDailyRead(); }); }],
      ['talk', () => genTalk(theme), d => {
        window._tkState = { itemId:'rt', q:0, listens:1, results:[], chosen:null };
        d.questions.forEach(q => { answerTalk(q.answer); advanceTalk(); }); }],
      ['conversation', () => genConversation(theme), d => {
        window._cvState = { itemId:'rt', q:0, listens:1, results:[], chosen:null };
        d.questions.forEach(q => { answerConversation(q.answer); advanceConversation(); }); }],
      ['choose-response', () => genChooseResponse(theme), d => {
        window._crState = { itemId:'rt', step:0, listens:1, results:[], chosen:null };
        d.set.forEach(q => { answerChooseResponse(q.answer); advanceChooseResponse(); }); }],
    ];
    for(const [type, gen, drive] of mcq){
      const d = gen();
      mount(type, theme, d);
      scores = [];
      try{ drive(d); }catch(e){ bad.mcq.push(type + '/' + theme + ': driver threw ' + e.message); continue; }
      if(last() !== 1) bad.mcq.push(type + '/' + theme + ': every question answered with its own key scored ' + last());
    }
    //---------------------------------------------------------------
    // The two writing tasks
    //---------------------------------------------------------------
    {
      const d = genDiscussion(theme);
      mount('discussion', theme, d);
      // ETS publishes one number for this task and it is a FLOOR: at least
      // 100 words. The task brief in this app repeats it as "the same
      // 100-word floor". A longer post therefore obeys both.
      scores = [];
      put('response', 'I disagree, and here is why. ' + 'word '.repeat(135));
      checkWriting();
      if(last() !== 1) bad.wr.push(theme + ': a 141-word discussion post scored ' + last() + ' — over the published floor, penalised anyway');
      scores = [];
      put('response', 'I disagree, and here is why. ' + 'word '.repeat(105));
      checkWriting();
      if(last() !== 1) bad.wr.push(theme + ': a 111-word discussion post scored ' + last());
    }
    //---------------------------------------------------------------
    // Listen and Repeat — a word-perfect repetition is a 5
    //---------------------------------------------------------------
    {
      const d = genListenRepeatSet(theme);
      d.set.forEach((it, i) => {
        if(repeatAccuracy(it.text, it.text).score !== 5)
          bad.lr.push(theme + ' #' + (i+1) + ': a word-perfect repetition scored ' + repeatAccuracy(it.text, it.text).score);
        // What a browser transcriber actually returns: lower case, no
        // punctuation, no apostrophes.
        const stt = it.text.toLowerCase().replace(/['\\u2019]/g,'').replace(/[^a-z0-9\\s]/g,' ').replace(/\\s+/g,' ').trim();
        const sc = repeatAccuracy(it.text, stt).score;
        if(sc !== 5) bad.lr.push(theme + ' #' + (i+1) + ': a perfect repetition transcribed without punctuation scored ' + sc + ' — "' + it.text + '"');
      });
    }
   }
  }

  assert('Complete the Words: a correct answer scores correct', bad.cw.length === 0, [...new Set(bad.cw)].slice(0,4).join('\\n      '));
  assert('Build a Sentence: the target order scores correct', bad.sn.length === 0, [...new Set(bad.sn)].slice(0,4).join('\\n      '));
  assert('all six multiple-choice types: keyed answers score full marks', bad.mcq.length === 0, [...new Set(bad.mcq)].slice(0,4).join('\\n      '));
  assert('Academic Discussion: a post over the published 100-word floor is not penalised', bad.wr.length === 0, [...new Set(bad.wr)].slice(0,3).join('\\n      '));
  assert('Listen and Repeat: a word-perfect repetition scores 5', bad.lr.length === 0, [...new Set(bad.lr)].slice(0,4).join('\\n      '));

  //=================================================================
  // INSTRUCTION vs CHECKER — does the screen ask for what is graded?
  //=================================================================
  {
    const d = genCompleteWords('campus');
    mount('complete-words', 'campus', d);
    const brief = TASK_BRIEF['complete-words'].real;
    const askedForLettersOnly = /only the missing letters/i.test(brief)
      || Object.values(TASK_TYPES).length && /Fill in the missing letters/.test(html_marker);
    scores = [];
    d.words.forEach((w,i) => { const b = blankInfo(w); put('cw-blank-' + i, w.slice(b.shown.length)); });
    checkCompleteWords();
    const lettersAccepted = last() === 1;
    const example = d.words.slice(0,3).map(w => { const b = blankInfo(w); return b.shown + '_'.repeat(b.hiddenCount) + ' -> typed "' + w.slice(b.shown.length) + '"'; }).join(', ');
    assert('Complete the Words: the brief asks for the missing letters, so the checker must accept them',
      !askedForLettersOnly || lettersAccepted,
      'brief says: "' + brief + '"\\n      but only the whole word is accepted. Rejected: ' + example);
  }
  {
    // About a third of Build a Sentence items hide an extra word in the
    // scramble that must be left out. Nothing on the screen says so: the
    // instruction is "Tap the words in the correct order to build the
    // sentence", which reads as "use them all".
    let withDistractor = 0, total = 0, themeWithOne = null;
    for(const th in SENTENCE_BANK) SENTENCE_BANK[th].forEach(it => {
      total++; if(it.distractor){ withDistractor++; if(!themeWithOne) themeWithOne = th; } });

    // RENDER IT. Reading the template caught nothing once the warning became a
    // computed expression shown only for items that carry a distractor — the
    // regex saw JavaScript, not the sentence a student reads. Same mistake as
    // asserting a file contains a string instead of running the code.
    let onScreen = SENTENCE_UI_TEXT;
    if(themeWithOne){
      const withOne = SENTENCE_BANK[themeWithOne].find(it => it.distractor);
      selectedId = '__self__';
      window._selfItem = { id:'__self__', type:'sentence', tag:tagFor('sentence'),
        theme: themeWithOne, status:'approved',
        data: { target: withOne.target,
                scrambled: [...withOne.target.replace(/[.,!?;:]/g,'').split(/\\s+/), withOne.distractor] } };
      window._sentenceState = null;
      startedItems().add('__self__');
      renderPractice();
      const w = document.getElementById('practice-wrap');
      if(w && w.innerHTML) onScreen = w.innerHTML;
    }
    const screenWarns = /one word|words do not belong|does not belong|leave (it|them) out|not every word|left over|unused/i.test(onScreen);
    assert('Build a Sentence: if a scramble hides an unused word, the screen says so ('
      + withDistractor + ' of ' + total + ' items do)',
      withDistractor === 0 || screenWarns,
      'nothing on the rendered screen says a word is left over — a student who uses every chip is marked wrong and never told why');
  }

  logUsage = realLog;
  console.log(results.join('\\n'));
  const fails = results.filter(r => r.indexOf('FAIL') > -1);
  globalThis.__fails = fails.length;
  console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length) : ('ALL ' + results.length + ' CHECKS PASS'));
})();
`;

// Two strings the checks above need to read out of the markup rather than out
// of a data structure: the scenario-list preview line and the Build a Sentence
// instruction. Pulled from the file so the assertion tracks the real UI.
// Kept only as a fallback label for the failure message. The assertion itself
// now reads the RENDERED screen from inside the sandbox — see the block that
// uses it — because this regex reads the template and stops at the first '<',
// so a warning built as a computed expression is invisible to it.
const uiText = (html.match(/Tap the words in the correct order[^<]*/) || ['(not found)'])[0];
const previewText = (html.match(/'Fill in the missing letters'/) || [''])[0];

const sandbox = {
  html_marker: previewText,
  SENTENCE_UI_TEXT: uiText,
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
