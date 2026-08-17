// Read an Academic Passage. Pins the five-question shape, the ~200-word
// length, and the one thing no other task type in this app does:
// vocabulary in context. That question is only fair if the word is really
// in the passage, is really the word being asked about, and is NOT one of
// the answer options — a trim while balancing option lengths once left
// "absorbed" as the answer to "the word absorbed is closest in meaning to".
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/type\s*=\s*["']module["']/.test(m[1])).map(m => m[2]);
const combined = blocks.join('\n;\n');
function makeElStub(){
  return { style:{}, innerHTML:'', textContent:'', value:'', checked:false,
    classList:{toggle(){},add(){},remove(){},contains(){return false;}}, appendChild(){}, addEventListener(){},
    querySelector(){return makeElStub();}, closest(){return null;}, select(){}, focus(){} };
}
function makeDocStub(){
  const els = {};
  return { getElementById(id){ if(!els[id]) els[id]=makeElStub(); return els[id]; },
    createElement(){return makeElStub();}, querySelector(){return makeElStub();},
    querySelectorAll(){return [];}, addEventListener(){}, body:makeElStub() };
}
const store = {};
const localStorage = { getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} };

const testScript = `
${combined}
;
(function(){
  const results = [];
  function assert(n,c){ results.push(n+': '+(c?'PASS':'FAIL')); }
  const words = s => s.trim().split(/\\s+/).filter(Boolean).length;

  for(const theme of ALL_THEMES){
    const bank = PASSAGE_BANK[theme];
    assert(theme+' has at least 2 passages', Array.isArray(bank) && bank.length >= 2);
    bank.forEach((p,i) => {
      const w = theme+'['+i+']';
      const n = words(p.text);
      assert(w+' is about 200 words (got '+n+')', n >= 170 && n <= 235);
      assert(w+' has a title', typeof p.title === 'string' && p.title.length > 3);
      assert(w+' names what is being read', typeof p.context === 'string' && p.context.length > 8);
      assert(w+' has 5 questions (got '+p.questions.length+')', p.questions.length === 5);
      assert(w+' asks 5 different questions', new Set(p.questions.map(q=>q.q)).size === 5);
      assert(w+' is written in paragraphs', p.text.indexOf('\\n\\n') > -1);

      // --- vocabulary in context, the part unique to this task ---
      const vq = p.questions.filter(q => /closest in meaning/.test(q.q));
      assert(w+' has exactly one vocabulary question', vq.length === 1);
      if(vq.length === 1){
        assert(w+' the vocabulary word appears in the passage',
          p.text.indexOf(p.vocab) > -1);
        assert(w+' the question asks about that word',
          vq[0].q.indexOf(p.vocab) > -1);
        // If the word itself is an option, the question answers itself.
        const echoed = vq[0].options.filter(o =>
          o.toLowerCase().split(/\\s+/).indexOf(p.vocab.toLowerCase()) > -1);
        assert(w+' no option repeats the word being defined'
          + (echoed.length ? ' (found: '+echoed.join(', ')+')' : ''), echoed.length === 0);
      }

      p.questions.forEach(q => {
        assert(w+' question has 4 distinct options', q.options.length === 4 && new Set(q.options).size === 4);
        assert(w+' answer index is valid', q.answer >= 0 && q.answer < 4);
      });
    });
  }

  // --- guessing by option length, with ties broken at random ---
  let longestWins = 0, nq = 0;
  for(const theme of ALL_THEMES)
    for(const p of PASSAGE_BANK[theme])
      for(const q of p.questions){
        const L = q.options.map(words), mx = Math.max(...L), tied = L.filter(x=>x===mx).length;
        if(L[q.answer] === mx) longestWins += 1/tied;
        nq++;
      }
  assert('picking the longest option is no better than chance (got '
    + Math.round(100*longestWins/nq) + '%, chance 25%)', longestWins/nq <= 0.30);

  const pos = {};
  for(let i=0;i<200;i++)
    for(const q of genPassage('money').questions) pos[q.answer] = (pos[q.answer]||0)+1;
  assert('the answer lands in all four positions', Object.keys(pos).length === 4);
  const counts = Object.values(pos);
  assert('no position is overwhelmingly favoured', Math.max(...counts) < Math.min(...counts)*2);

  let intact = true;
  for(let i=0;i<40;i++){
    const g = genPassage('travel');
    const src = PASSAGE_BANK.travel.find(x => x.title === g.title);
    g.questions.forEach((q,qi) => {
      if(q.options[q.answer] !== src.questions[qi].options[src.questions[qi].answer]) intact = false;
    });
  }
  assert('shuffling preserves the correct option', intact);

  // --- wiring ---
  const g = genPassage('campus');
  assert('generateOne routes the type', generateOne('passage','health').data.questions.length === 5);
  assert('the batch is one connected unit', generateBatchItems('passage','travel').length === 1);
  assert('the type is registered under Reading',
    TASK_TYPES.some(t=>t.id==='passage' && t.section==='Reading'));
  assert('the teacher can pick either passage', topicsFor('passage','campus').length === PASSAGE_BANK.campus.length);

  // --- the student screen ---
  const item = { id:'pg1', type:'passage', tag:'Read an Academic Passage',
                 theme:'campus', status:'approved', data:g };
  saveBatch([item]); selectedId='pg1';
  // An exercise arrives closed now — the student presses Start, which is
  // what reveals it. This file is about what is behind that, so open it.
  startedItems().add('pg1'); practiceOverride=null; window._pgState=null;
  setStudentName('Ana');
  renderPractice();
  const html = () => document.getElementById('practice-wrap').innerHTML;
  const opening = g.text.split(/\\s+/).slice(0,8).join(' ');
  assert('the passage IS on screen from the start', html().indexOf(escapeHtml(opening)) > -1);
  assert('the first question is shown immediately', html().indexOf(escapeHtml(g.questions[0].q)) > -1);
  assert('no listen button appears', html().indexOf('🔊') === -1);

  const wrong = g.questions[0].answer === 0 ? 1 : 0;
  answerPassage(wrong);
  assert('answering records one result', window._pgState.results.length === 1);
  assert('a wrong answer scores zero', window._pgState.results[0] === 0);
  assert('the passage stays on screen after answering', html().indexOf(escapeHtml(opening)) > -1);
  answerPassage(2);
  assert('a second click cannot change the answer', window._pgState.results.length === 1);

  for(let k=1;k<5;k++){
    advancePassage();
    answerPassage(currentItem().data.questions[k].answer);
  }
  advancePassage();
  assert('completing records all five questions', window._pgState.results.length === 5);

  // --- the vocabulary word is marked, and only on its own question ---
  {
    const p = PASSAGE_BANK.campus[0];
    const marked = passageDocHtml(p, true);
    const plain = passageDocHtml(p, false);
    assert('the vocabulary word is highlighted on its question', marked.indexOf('pg-vocab') > -1);
    assert('it is not highlighted on the other questions', plain.indexOf('pg-vocab') === -1);
    assert('only the first occurrence is marked',
      (marked.match(/pg-vocab/g) || []).length === 1);
    assert('the passage is escaped', marked.indexOf('<script') === -1);
    assert('paragraphs survive as paragraphs', (marked.match(/<p>/g) || []).length >= 2);
  }

  console.log(results.join('\\n'));
  const fails = results.filter(r=>r.includes('FAIL'));
  globalThis.__fails = fails.length;
  console.log(fails.length ? ('FAILURES: '+fails.length+' / '+results.length) : ('ALL '+results.length+' CHECKS PASS'));
})();

`;
const sandbox = {
  btoa: s=>Buffer.from(s,'binary').toString('base64'),
  atob: s=>Buffer.from(s,'base64').toString('binary'),
  document: makeDocStub(), window: { addEventListener(){} }, localStorage,
  location: { origin:'https://example.com', pathname:'/app', hash:'', search:'' },
  navigator: { language:'en-US', languages:['en-US'] },
  SpeechSynthesisUtterance: function(t){ this.text=t; },
  speechSynthesis: { speak(){}, getVoices(){return [];}, addEventListener(){}, cancel(){} },
  Audio: function(){ this.play=()=>Promise.resolve(); this.pause=()=>{}; },
  AUDIO_FILES: new Set(require('fs').existsSync(process.argv[3]||'') ? require('fs').readdirSync(process.argv[3]) : []),
  URLSearchParams, console, Date, Math, JSON, Array, Object, String, Number, Intl, Set, Promise,
  // The app registers live intervals the moment it loads — the class
  // progress refresh and the welcome screen's language swap. A real
  // interval holds Node's event loop open, so the process never exits
  // and the verdict cannot be read from an exit code at all. unref lets
  // them tick without being a reason to stay alive.
  setInterval: (...a) => { const t = setInterval(...a); if (t && t.unref) t.unref(); return t; },
  clearInterval, setTimeout, clearTimeout,
};
sandbox.self = sandbox.window; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(testScript, sandbox);

// Printed text is not a result anyone can act on: a caller cannot tell a
// run that failed its checks from one that crashed before printing. This
// carries the verdict out as an exit code. beforeExit fires once the loop
// drains — after the body has settled — so it covers the files that end
// synchronously and the ones that end on a promise alike.
process.on('beforeExit', () => { if (sandbox.__fails) process.exitCode = 1; });
