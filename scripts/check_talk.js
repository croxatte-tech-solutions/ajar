// Listen to an Academic Talk. ETS declares "about 100-250 words"; the 14
// talks in the seven practice tests actually run 163-230 words, median
// 203, and this pins the measured range rather than the declared one.
//
// It also pins the thing that makes this task type different from a
// generic comprehension bank: the four questions must test four
// DIFFERENT skills, and one of them must ask why the speaker mentioned
// something rather than what was said about it.
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
  const words = s => s.trim().split(' ').filter(Boolean).length;

  for(const theme of ALL_THEMES){
    const bank = TALK_BANK[theme];
    assert(theme+' has at least 2 talks', Array.isArray(bank) && bank.length >= 2);
    bank.forEach((t,i) => {
      const w = theme+'['+i+']';
      const n = words(t.text);
      assert(w+' is 163-230 words (got '+n+')', n >= 163 && n <= 230);
      assert(w+' names the listening context', typeof t.context === 'string' && t.context.length > 8);
      assert(w+' has 4 questions', t.questions.length === 4);
      assert(w+' asks 4 different questions', new Set(t.questions.map(q=>q.q)).size === 4);
      // Question 1 is the main-idea question on every real item. Spelled
      // out rather than with a word-boundary escape: inside a template
      // literal \\b is a backspace character, not a regex boundary.
      const MAIN = ['mainly', 'main topic', 'main point', 'main argument', 'main concern'];
      assert(w+' opens with the main-idea question',
        MAIN.some(k => t.questions[0].q.toLowerCase().indexOf(k) > -1));
      // At least one function question -- the kind students find hardest
      // and the kind an ordinary comprehension bank never contains.
      assert(w+' includes a "why does the speaker" question',
        t.questions.some(q => /^Why does the speaker/.test(q.q)));
      t.questions.forEach(q => {
        assert(w+' question has 4 distinct options', q.options.length === 4 && new Set(q.options).size === 4);
        assert(w+' answer index is valid', q.answer >= 0 && q.answer < 4);
      });
    });
  }

  // --- the answer must not be guessable from length or position ---
  let longestWins = 0, spread = 0, nq = 0;
  for(const theme of ALL_THEMES)
    for(const t of TALK_BANK[theme])
      for(const q of t.questions){
        const L = q.options.map(words), mx = Math.max(...L), tied = L.filter(x=>x===mx).length;
        if(L[q.answer] === mx) longestWins += 1/tied;
        spread += mx - Math.min(...L); nq++;
      }
  assert('picking the longest option is no better than chance (got '
    + Math.round(100*longestWins/nq) + '%, chance 25%)', longestWins/nq <= 0.35);
  assert('options within a question are near-equal in length', spread/nq <= 1.2);

  const pos = {};
  for(let i=0;i<200;i++)
    for(const q of genTalk('campus').questions) pos[q.answer] = (pos[q.answer]||0)+1;
  assert('the answer lands in all four positions', Object.keys(pos).length === 4);
  const counts = Object.values(pos);
  assert('no position is overwhelmingly favoured', Math.max(...counts) < Math.min(...counts)*2);

  let intact = true;
  for(let i=0;i<40;i++){
    const g = genTalk('health');
    const src = TALK_BANK.health.find(x => x.text === g.text);
    g.questions.forEach((q,qi) => {
      if(q.options[q.answer] !== src.questions[qi].options[src.questions[qi].answer]) intact = false;
      if(new Set(q.options).size !== 4) intact = false;
    });
  }
  assert('shuffling preserves the correct option and loses none', intact);

  // --- generation and wiring ---
  const g = genTalk('campus');
  assert('an exercise is one talk with 4 questions', g.questions.length === 4 && words(g.text) > 100);
  assert('generateOne routes the type', generateOne('talk','money').data.questions.length === 4);
  assert('the batch is one connected unit', generateBatchItems('talk','travel').length === 1);
  assert('the type is registered under Listening',
    TASK_TYPES.some(t=>t.id==='talk' && t.section==='Listening'));
  assert('the teacher can pick either talk', topicsFor('talk','campus').length === TALK_BANK.campus.length);
  assert('picking a topic returns that exact talk',
    generateOne('talk','travel',1).data.text === TALK_BANK.travel[1].text);

  // --- the student screen: heard, never read ---
  const item = { id:'tk1', type:'talk', tag:'Listen to an Academic Talk',
                 theme:'campus', status:'approved', data:g };
  saveBatch([item]); selectedId='tk1'; practiceOverride=null; window._tkState=null;
  setStudentName('Ana');
  renderPractice();
  const shown = t => document.getElementById('practice-wrap').innerHTML.indexOf(escapeHtml(t)) > -1;
  const opening = g.text.split(' ').slice(0,9).join(' ');
  const ending  = g.text.split(' ').slice(-9).join(' ');
  assert('no part of the talk is on screen before listening', !shown(opening) && !shown(ending));
  assert('the question is hidden until the student listens', !shown(g.questions[0].q));
  assert('the listening context IS shown', shown(g.context));

  playTalk();
  assert('listening reveals the question', shown(g.questions[0].q));
  assert('the talk is STILL hidden while answering', !shown(opening) && !shown(ending));

  const wrong = g.questions[0].answer === 0 ? 1 : 0;
  answerTalk(wrong);
  assert('answering records one result', window._tkState.results.length === 1);
  assert('a wrong answer scores zero', window._tkState.results[0] === 0);
  const rev = document.getElementById('tk-result').innerHTML;
  assert('the transcript appears only after answering',
    rev.indexOf(escapeHtml(opening)) > -1 && rev.indexOf(escapeHtml(ending)) > -1);
  answerTalk(2);
  assert('a second click cannot change the answer', window._tkState.results.length === 1);

  // All four questions come off ONE listen -- re-listening per question
  // would quietly turn this into four short exercises.
  advanceTalk();
  assert('the second question stays on the same talk', window._tkState.q === 1);
  assert('the listen count is not reset between questions', window._tkState.listens === 1);
  assert('the second question shows without listening again', shown(g.questions[1].q));

  for(let k=1;k<4;k++){
    answerTalk(currentItem().data.questions[k].answer);
    advanceTalk();
  }
  assert('completing the set records all four questions', window._tkState.results.length === 4);
  assert('the three right answers scored', window._tkState.results.slice(1).every(x=>x===1));

  // Every talk needs its clip on disk under the exact name the app asks for.
  if(typeof AUDIO_FILES !== 'undefined'){
    let noClip = [];
    for(const theme of ALL_THEMES)
      for(const t of TALK_BANK[theme]){
        const f = audioUrlFor(t.text).replace('audio/','');
        if(!AUDIO_FILES.has(f)) noClip.push(theme);
      }
    assert('every talk has its clip on disk'
      + (noClip.length ? ' (missing: '+noClip.join(', ')+')' : ''), noClip.length === 0);
  }

  console.log(results.join('\\n'));
  const fails = results.filter(r=>r.includes('FAIL'));
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
  setInterval, clearInterval, setTimeout, clearTimeout,
};
sandbox.self = sandbox.window; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(testScript, sandbox);
