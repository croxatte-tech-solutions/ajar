// Listen to an Announcement. Same defining rule as the rest of the
// Listening section: the announcement is HEARD, never written on screen —
// including while the questions are showing, since a visible transcript
// turns the whole thing into a reading exercise. Also pins the two flaws
// that quietly ruin a multiple-choice bank: a correct answer guessable
// from its length, and one that always sits in the same position.
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/type\s*=\s*["']module["']/.test(m[1])).map(m => m[2]);
const combined = blocks.join('\n;\n');
function makeElStub(){
  return { style:{}, innerHTML:'', textContent:'', value:'', checked:false,
    classList:{toggle(){},add(){},remove(){},contains(){return false;}}, appendChild(){}, addEventListener(){},
    // ChildNode.remove(). A real element has it everywhere the app runs, and
    // this stub did not — so hideStudentSkeleton() threw inside renderStudent
    // and took nine checkers down with it. The stub being LESS capable than
    // the browser is the mirror of the trap 54e2f1d recorded, and it fails
    // the same way: the tests disagree with a shape the app produces fine.
    // Detachment is not modelled because nothing under test asks whether the
    // element went away, only that removing it does not throw.
    remove(){},
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
  const words = s => s.trim().split(' ').length;

  // --- bank shape, against ETS's published 40-85 word range ---
  for(const theme of ALL_THEMES){
    const bank = ANNOUNCEMENT_BANK[theme];
    assert(theme+' has at least 2 announcements', Array.isArray(bank) && bank.length >= 2);
    bank.forEach((a,i) => {
      const w = theme+'['+i+']';
      assert(w+' announcement is 40-85 words (got '+words(a.text)+')', words(a.text) >= 40 && words(a.text) <= 85);
      assert(w+' names the listening context', typeof a.context === 'string' && a.context.length > 8);
      assert(w+' has 2 questions', a.questions.length === 2);
      a.questions.forEach(q => {
        assert(w+' question has 4 distinct options', q.options.length === 4 && new Set(q.options).size === 4);
        assert(w+' answer index is valid', q.answer >= 0 && q.answer < 4);
      });
    });
  }

  // --- the answer must not be guessable from length or position ---
  let longestWins = 0, spread = 0, nq = 0;
  for(const theme of ALL_THEMES)
    for(const a of ANNOUNCEMENT_BANK[theme])
      for(const q of a.questions){
        const L = q.options.map(words), mx = Math.max(...L), tied = L.filter(x=>x===mx).length;
        if(L[q.answer] === mx) longestWins += 1/tied;
        spread += mx - Math.min(...L); nq++;
      }
  assert('picking the longest option is no better than chance (got '
    + Math.round(100*longestWins/nq) + '%, chance 25%)', longestWins/nq <= 0.30);
  assert('options within a question are near-equal in length', spread/nq <= 1.2);

  const pos = {};
  for(let i=0;i<200;i++)
    for(const a of genAnnouncement('campus').set)
      for(const q of a.questions) pos[q.answer] = (pos[q.answer]||0)+1;
  assert('the answer lands in all four positions', Object.keys(pos).length === 4);
  const counts = Object.values(pos);
  assert('no position is overwhelmingly favoured', Math.max(...counts) < Math.min(...counts)*2);

  // shuffling must not break which option is correct
  let intact = true;
  for(let i=0;i<40;i++)
    for(const a of genAnnouncement('health').set){
      const src = ANNOUNCEMENT_BANK.health.find(x => x.text === a.text);
      a.questions.forEach((q,qi) => {
        if(q.options[q.answer] !== src.questions[qi].options[src.questions[qi].answer]) intact = false;
        if(new Set(q.options).size !== 4) intact = false;
      });
    }
  assert('shuffling preserves the correct option and loses none', intact);

  // --- generation and wiring ---
  const g = genAnnouncement('campus');
  assert('an exercise is 2 announcements', g.set.length === 2);
  assert('an exercise never repeats an announcement', new Set(g.set.map(a=>a.text)).size === 2);
  assert('generateOne routes the type', generateOne('announcement','money').data.set.length === 2);
  assert('the batch is one connected unit', generateBatchItems('announcement','travel').length === 1);
  assert('the type is registered under Listening',
    TASK_TYPES.some(t=>t.id==='announcement' && t.section==='Listening'));

  // --- the student screen: heard, never read ---
  const item = { id:'an1', type:'announcement', tag:'Listen to an Announcement',
                 theme:'campus', status:'approved', data:g };
  saveBatch([item]); selectedId='an1';
  // An exercise arrives closed now — the student presses Start, which is
  // what reveals it. This file is about what is behind that, so open it.
  startedItems().add('an1'); practiceOverride=null; window._anState=null;
  setStudentName('Ana');
  renderPractice();
  const a0 = g.set[0];
  const shown = t => document.getElementById('practice-wrap').innerHTML.indexOf(escapeHtml(t)) > -1;
  assert('the announcement text is NOT on screen before listening', !shown(a0.text));
  assert('the question is hidden until the student listens', !shown(a0.questions[0].q));
  assert('the listening context IS shown', shown(a0.context));

  playAnnouncement();
  assert('listening reveals the question', shown(a0.questions[0].q));
  assert('the announcement text is STILL hidden while answering', !shown(a0.text));

  const wrong = a0.questions[0].answer === 0 ? 1 : 0;
  answerAnnouncement(wrong);
  assert('answering records one result', window._anState.results.length === 1);
  assert('a wrong answer scores zero', window._anState.results[0] === 0);
  assert('the transcript appears only after answering',
    document.getElementById('an-result').innerHTML.indexOf(escapeHtml(a0.text)) > -1);
  answerAnnouncement(2);
  assert('a second click cannot change the answer', window._anState.results.length === 1);

  // second question about the SAME announcement must not demand a re-listen
  advanceAnnouncement();
  assert('the next question stays on the same announcement', window._anState.ann === 0 && window._anState.q === 1);
  assert('the listen count is not reset mid-announcement', window._anState.listens === 1);
  assert('the second question shows without listening again', shown(a0.questions[1].q));

  answerAnnouncement(a0.questions[1].answer);
  advanceAnnouncement();
  assert('moving to the next announcement resets the listens', window._anState.ann === 1 && window._anState.listens === 0);

  // finish the whole set without throwing
  playAnnouncement();
  answerAnnouncement(currentItem().data.set[1].questions[0].answer); advanceAnnouncement();
  answerAnnouncement(currentItem().data.set[1].questions[1].answer); advanceAnnouncement();
  assert('completing the set records every question', window._anState.results.length === 4);

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
