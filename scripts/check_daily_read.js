// Read in Daily Life. What makes this task itself, rather than a
// comprehension quiz with a shorter passage, is that the texts are NOT
// prose: ETS names "nonlinear text formats" and "telegraphic language" as
// the skills measured. So this pins the layouts, and pins that the text
// stays visible while answering -- hiding it would turn a reading task
// into a memory test.
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
  const LAYOUTS = ['notice','rows','messages','menu'];
  function textOf(d){
    if(d.layout === 'messages') return d.msgs.map(m=>m[1]).join(' ');
    if(d.layout === 'rows') return d.title + ' ' + d.rows.map(r=>r.join(' ')).join(' ');
    if(d.layout === 'menu') return d.title + ' ' + d.sections.map(s=>s[0]+' '+s[1].map(i=>i.join(' ')).join(' ')).join(' ') + ' ' + (d.note||'');
    return d.title + ' ' + d.body.join(' ');
  }

  const seen = {};
  for(const theme of ALL_THEMES){
    const bank = DAILY_READ_BANK[theme];
    assert(theme+' has at least 2 texts', Array.isArray(bank) && bank.length >= 2);
    bank.forEach((d,i) => {
      const w = theme+'['+i+']';
      seen[d.layout] = (seen[d.layout]||0) + 1;
      assert(w+' uses a known layout ('+d.layout+')', LAYOUTS.indexOf(d.layout) > -1);
      const n = words(textOf(d));
      assert(w+' is 15-150 words (got '+n+')', n >= 15 && n <= 150);
      assert(w+' names what is being read', typeof d.context === 'string' && d.context.length > 5);
      assert(w+' has a title', typeof d.title === 'string' && d.title.length > 2);
      // ETS: two or three questions, depending on the length of the text.
      assert(w+' has 2 or 3 questions (got '+d.questions.length+')',
        d.questions.length === 2 || d.questions.length === 3);
      assert(w+' asks different questions', new Set(d.questions.map(q=>q.q)).size === d.questions.length);
      // The layout must carry the data it needs to be drawn at all.
      const hasData = d.layout === 'notice' ? Array.isArray(d.body) && d.body.length
        : d.layout === 'rows' ? Array.isArray(d.rows) && d.rows.length
        : d.layout === 'messages' ? Array.isArray(d.msgs) && d.msgs.length
        : Array.isArray(d.sections) && d.sections.length;
      assert(w+' carries the data its layout needs', !!hasData);
      d.questions.forEach(q => {
        assert(w+' question has 4 distinct options', q.options.length === 4 && new Set(q.options).size === 4);
        assert(w+' answer index is valid', q.answer >= 0 && q.answer < 4);
      });
    });
  }

  // A question may only name someone the student can actually see. In a
  // two-person thread the app deliberately shows no sender labels (a phone
  // does not), so "Why is B confused?" is unanswerable — the reader has
  // never been told who B is. Caught on screen, pinned here.
  for(const theme of ALL_THEMES)
    for(const d of DAILY_READ_BANK[theme]){
      if(d.layout !== 'messages') continue;
      const senders = [...new Set(d.msgs.map(m => m[0]))];
      const visible = senders.length > 2 ? senders : [];
      d.questions.forEach(q => {
        // Options too, not just the stem: the first version of this check
        // read only q.q and happily passed an option saying
        // "C is the only one who objects".
        [q.q].concat(q.options).forEach(txt => {
          const named = (txt.match(/\b[A-Z][a-z]{2,}\b/g) || [])
            .filter(w => ['What','Why','Which','Who','When','How','The','Both','Only'].indexOf(w) === -1);
          const unknown = named.filter(w => visible.indexOf(w) === -1 && d.title.indexOf(w) === -1);
          assert(theme+' names only visible people in "'+txt.slice(0,26)+'"'
            + (unknown.length ? ' (unknown: '+unknown.join(', ')+')' : ''), unknown.length === 0);
          assert(theme+' uses no bare letter label in "'+txt.slice(0,26)+'"',
            !/\b(speaker |person )?[A-D]\b/.test(txt.replace(/[A-Z][a-z]+/g,'')));
        });
      });
    }

  // The task is defined by nonlinear formats, so a bank that drifted into
  // all-prose would pass every other check while testing something else.
  const nonProse = (seen.rows||0) + (seen.messages||0) + (seen.menu||0);
  assert('at least a third of texts are nonlinear formats (got '+nonProse+'/28)', nonProse >= 9);
  assert('every layout is represented', LAYOUTS.every(l => seen[l] > 0));

  // --- the answer must not be guessable ---
  let longestWins = 0, spread = 0, nq = 0;
  for(const theme of ALL_THEMES)
    for(const d of DAILY_READ_BANK[theme])
      for(const q of d.questions){
        const L = q.options.map(words), mx = Math.max(...L), tied = L.filter(x=>x===mx).length;
        if(L[q.answer] === mx) longestWins += 1/tied;
        spread += mx - Math.min(...L); nq++;
      }
  assert('picking the longest option is no better than chance (got '
    + Math.round(100*longestWins/nq) + '%, chance 25%)', longestWins/nq <= 0.30);

  const pos = {};
  for(let i=0;i<200;i++)
    for(const q of genDailyRead('money').questions) pos[q.answer] = (pos[q.answer]||0)+1;
  assert('the answer lands in all four positions', Object.keys(pos).length === 4);
  const counts = Object.values(pos);
  assert('no position is overwhelmingly favoured', Math.max(...counts) < Math.min(...counts)*2);

  let intact = true;
  for(let i=0;i<40;i++){
    const g = genDailyRead('travel');
    const src = DAILY_READ_BANK.travel.find(x => x.title === g.title);
    g.questions.forEach((q,qi) => {
      if(q.options[q.answer] !== src.questions[qi].options[src.questions[qi].answer]) intact = false;
    });
  }
  assert('shuffling preserves the correct option', intact);

  // --- wiring ---
  const g = genDailyRead('campus');
  assert('generateOne routes the type', generateOne('daily-read','money').data.questions.length >= 2);
  assert('the batch is one connected unit', generateBatchItems('daily-read','travel').length === 1);
  assert('the type is registered under Reading',
    TASK_TYPES.some(t=>t.id==='daily-read' && t.section==='Reading'));
  assert('the teacher can pick either text', topicsFor('daily-read','campus').length === DAILY_READ_BANK.campus.length);

  // --- the student screen ---
  const item = { id:'dr1', type:'daily-read', tag:'Read in Daily Life',
                 theme:'campus', status:'approved', data:g };
  saveBatch([item]); selectedId='dr1'; practiceOverride=null; window._drState=null;
  setStudentName('Ana');
  renderPractice();
  const html = () => document.getElementById('practice-wrap').innerHTML;
  const shown = t => html().indexOf(escapeHtml(t)) > -1;

  // This is the defining difference from every Listening task.
  assert('the text IS on screen from the start', shown(g.title));
  assert('the first question is on screen immediately', shown(g.questions[0].q));
  assert('no listen button appears', html().indexOf('playTalk') === -1 && html().indexOf('🔊') === -1);

  const wrong = g.questions[0].answer === 0 ? 1 : 0;
  answerDailyRead(wrong);
  assert('answering records one result', window._drState.results.length === 1);
  assert('a wrong answer scores zero', window._drState.results[0] === 0);
  assert('the text is STILL on screen after answering', shown(g.title));
  answerDailyRead(2);
  assert('a second click cannot change the answer', window._drState.results.length === 1);

  advanceDailyRead();
  assert('the next question keeps the same text', window._drState.q === 1 && shown(g.title));
  for(let k=1;k<g.questions.length;k++){
    answerDailyRead(currentItem().data.questions[k].answer);
    advanceDailyRead();
  }
  assert('completing records every question', window._drState.results.length === g.questions.length);

  // --- the renderer draws each layout as itself ---
  for(const layout of LAYOUTS){
    let sample = null;
    for(const theme of ALL_THEMES){
      const hit = DAILY_READ_BANK[theme].find(d => d.layout === layout);
      if(hit){ sample = hit; break; }
    }
    if(!sample) continue;
    const out = dailyDocHtml(sample);
    const marker = layout === 'rows' ? 'dl-rows' : layout === 'messages' ? 'dl-msgs'
      : layout === 'menu' ? 'dl-item' : '<p>';
    assert('layout "'+layout+'" renders as itself', out.indexOf(marker) > -1);
    assert('layout "'+layout+'" escapes its content', out.indexOf('<script') === -1);
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
