// Listen to a Conversation. The only Listening task with two speakers, so
// on top of the usual rule -- heard, never read -- this pins the property
// the two-voice audio pipeline depends on: speakers strictly alternate, and
// the clip name is derived from the spoken words alone, with no speaker
// letters leaking into it.
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
  const words = s => s.trim().split(' ').filter(Boolean).length;

  // --- bank shape, against measured ETS conversation clips (17-30s,
  //     median 27s, ~95 words over 8-10 short turns) ---
  for(const theme of ALL_THEMES){
    const bank = CONVERSATION_BANK[theme];
    assert(theme+' has at least 2 conversations', Array.isArray(bank) && bank.length >= 2);
    bank.forEach((c,i) => {
      const w = theme+'['+i+']';
      const total = words(conversationText(c.turns));
      assert(w+' is 60-110 words (got '+total+')', total >= 60 && total <= 110);
      assert(w+' runs 8-10 turns (got '+c.turns.length+')', c.turns.length >= 8 && c.turns.length <= 10);
      assert(w+' names the listening context', typeof c.context === 'string' && c.context.length > 8);
      assert(w+' has 2 questions', c.questions.length === 2);
      // Alternating speakers is what lets gen_dialogue.py assign a
      // different voice per turn; two turns in a row from one speaker
      // would silently render as one voice talking to itself.
      let alt = true;
      c.turns.forEach((t,ti) => {
        if(t[0] !== 'M' && t[0] !== 'W') alt = false;
        if(ti && t[0] === c.turns[ti-1][0]) alt = false;
        if(!t[1] || !t[1].trim()) alt = false;
      });
      assert(w+' speakers strictly alternate M/W', alt);
      c.questions.forEach(q => {
        assert(w+' question has 4 distinct options', q.options.length === 4 && new Set(q.options).size === 4);
        assert(w+' answer index is valid', q.answer >= 0 && q.answer < 4);
      });
    });
  }

  // --- the answer must not be guessable from length or position ---
  let longestWins = 0, spread = 0, nq = 0;
  for(const theme of ALL_THEMES)
    for(const c of CONVERSATION_BANK[theme])
      for(const q of c.questions){
        const L = q.options.map(words), mx = Math.max(...L), tied = L.filter(x=>x===mx).length;
        if(L[q.answer] === mx) longestWins += 1/tied;
        spread += mx - Math.min(...L); nq++;
      }
  assert('picking the longest option is no better than chance (got '
    + Math.round(100*longestWins/nq) + '%, chance 25%)', longestWins/nq <= 0.30);
  assert('options within a question are near-equal in length', spread/nq <= 1.2);

  const pos = {};
  for(let i=0;i<200;i++)
    for(const q of genConversation('campus').questions) pos[q.answer] = (pos[q.answer]||0)+1;
  assert('the answer lands in all four positions', Object.keys(pos).length === 4);
  const counts = Object.values(pos);
  assert('no position is overwhelmingly favoured', Math.max(...counts) < Math.min(...counts)*2);

  let intact = true;
  for(let i=0;i<40;i++){
    const g = genConversation('health');
    const src = CONVERSATION_BANK.health.find(x => x.context === g.context);
    g.questions.forEach((q,qi) => {
      if(q.options[q.answer] !== src.questions[qi].options[src.questions[qi].answer]) intact = false;
      if(new Set(q.options).size !== 4) intact = false;
    });
  }
  assert('shuffling preserves the correct option and loses none', intact);

  // --- generation and wiring ---
  const g = genConversation('campus');
  assert('an exercise is one conversation with 2 questions', g.turns.length >= 8 && g.questions.length === 2);
  assert('generateOne routes the type', generateOne('conversation','money').data.questions.length === 2);
  assert('the batch is one connected unit', generateBatchItems('conversation','travel').length === 1);
  assert('the type is registered under Listening',
    TASK_TYPES.some(t=>t.id==='conversation' && t.section==='Listening'));
  assert('the teacher can pick either conversation by name',
    topicsFor('conversation','campus').length === CONVERSATION_BANK.campus.length);
  assert('picking a topic returns that exact conversation',
    generateOne('conversation','travel',1).data.context === CONVERSATION_BANK.travel[1].context);

  // The clip name must come from the spoken words only -- speaker letters
  // are layout. If they leaked in, the browser fallback would read them out.
  assert('the audio key holds no speaker labels',
    conversationText(g.turns).indexOf('M:') === -1 && conversationText(g.turns).split(' ').indexOf('W') === -1);
  assert('the audio key is every turn in order',
    conversationText(g.turns) === g.turns.map(t=>t[1]).join(' '));

  // --- the student screen: heard, never read ---
  const item = { id:'cv1', type:'conversation', tag:'Listen to a Conversation',
                 theme:'campus', status:'approved', data:g };
  saveBatch([item]); selectedId='cv1';
  // An exercise arrives closed now — the student presses Start, which is
  // what reveals it. This file is about what is behind that, so open it.
  startedItems().add('cv1'); practiceOverride=null; window._cvState=null;
  setStudentName('Ana');
  renderPractice();
  const shown = t => document.getElementById('practice-wrap').innerHTML.indexOf(escapeHtml(t)) > -1;
  const firstLine = g.turns[0][1], lastLine = g.turns[g.turns.length-1][1];
  assert('no turn of the conversation is on screen before listening', !shown(firstLine) && !shown(lastLine));
  assert('the question is hidden until the student listens', !shown(g.questions[0].q));
  assert('the listening context IS shown', shown(g.context));

  // The setup line adds "between a man and a woman" only when the context
  // does not already say who is talking -- otherwise it reads "a
  // conversation between two students between a man and a woman".
  {
    let doubled = [];
    for(const theme of ALL_THEMES)
      for(const c of CONVERSATION_BANK[theme]){
        window._cvState = { itemId:'probe', q:0, listens:0, results:[], chosen:null };
        const line = 'Listen to ' + c.context + (/\bbetween\b/.test(c.context) ? '' : ' between a man and a woman') + '.';
        if((line.match(/\bbetween\b/g) || []).length > 1) doubled.push(c.context);
      }
    assert('the setup line never says "between" twice'
      + (doubled.length ? ' ('+doubled.join('; ')+')' : ''), doubled.length === 0);
  }
  window._cvState = { itemId:'cv1', q:0, listens:0, results:[], chosen:null };
  renderConversationStep(currentItem());

  playConversation();
  assert('listening reveals the question', shown(g.questions[0].q));
  assert('the transcript is STILL hidden while answering', !shown(firstLine) && !shown(lastLine));

  const wrong = g.questions[0].answer === 0 ? 1 : 0;
  answerConversation(wrong);
  assert('answering records one result', window._cvState.results.length === 1);
  assert('a wrong answer scores zero', window._cvState.results[0] === 0);
  const rev = document.getElementById('cv-result').innerHTML;
  assert('the transcript appears only after answering',
    rev.indexOf(escapeHtml(firstLine)) > -1 && rev.indexOf(escapeHtml(lastLine)) > -1);
  assert('the transcript names who is speaking', rev.indexOf('Man:') > -1 && rev.indexOf('Woman:') > -1);
  answerConversation(2);
  assert('a second click cannot change the answer', window._cvState.results.length === 1);

  advanceConversation();
  assert('the second question stays on the same conversation', window._cvState.q === 1);
  assert('the listen count is not reset between questions', window._cvState.listens === 1);
  assert('the second question shows without listening again', shown(g.questions[1].q));

  answerConversation(currentItem().data.questions[1].answer);
  assert('a right answer scores one', window._cvState.results[1] === 1);
  advanceConversation();
  assert('completing the set records every question', window._cvState.results.length === 2);

  // Every conversation must have a real clip on disk under the exact
  // name the app asks for. Two voices are stitched at build time, so a
  // hash drift here does not degrade gracefully -- it silently falls back
  // to one browser voice reading both people.
  if(typeof AUDIO_FILES !== 'undefined'){
    let noClip = [];
    for(const theme of ALL_THEMES)
      for(const c of CONVERSATION_BANK[theme]){
        const f = audioUrlFor(conversationText(c.turns)).replace('audio/','');
        if(!AUDIO_FILES.has(f)) noClip.push(theme);
      }
    assert('every conversation has its stitched clip on disk'
      + (noClip.length ? ' (missing: '+noClip.join(', ')+')' : ''), noClip.length === 0);
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
