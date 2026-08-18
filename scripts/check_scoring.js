// How a practice score is computed.
//
// Practice is unlimited on purpose, and averaging every attempt punished
// exactly that: a student who went 20-40-60-80-90 at one task read as 58%
// when what they could now do was 90%. The score is therefore the BEST
// attempt of each DAY, averaged across days.
//
// The risk in that change is the opposite failure — a number that only
// ever goes up, where one lucky afternoon freezes a student at a level
// they cannot reach again. Most of what follows tests that it does not.
// Class roster. The feature exists for one reason: a typed name produced
// "Ana", "ana " and "Anna" as three students, and the history that feeds
// every pattern split without anyone noticing. So the checks here are not
// really about a list — they are about that split being impossible.
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/type\s*=\s*["']module["']/.test(m[1]))
  .map(m => m[2]);
const combined = blocks.join('\n;\n');

function makeElStub(){
  return { style:{}, innerHTML:'', textContent:'', value:'', checked:false,
    classList:{toggle(){},add(){},remove(){}}, appendChild(){}, addEventListener(){},
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
(async function(){
  const results = [];
  function assert(n,c){ results.push(n+': '+(c?'PASS':'FAIL')); }
  const DAY = 86400000;
  const now = Date.now();
  const mk = (outcome, daysAgo, i) => ({ type:'interview', theme:'career', outcome,
                                          ts: now - daysAgo*DAY + (i||0)*1000 });
  const setLog = entries => localStorage.setItem('ajar_usage_log_by_name',
    JSON.stringify({ x: entries }));
  const pct = v => Math.round(v*100);

  // --- the case that motivated the change ---
  setLog([0.2,0.4,0.6,0.8,0.9].map((o,i)=>mk(o,0,i)));
  let s = usageSummary('x');
  assert('repeating until it clicks scores the best, not the mean (got '+pct(s.rows[0].avg)+'%)',
    pct(s.rows[0].avg) === 90);
  assert('the attempts are kept beside the score', s.rows[0].attempts === 5);
  assert('every attempt is still stored', s.total === 5);

  // --- and the opposite failure it could have introduced ---
  // One brilliant day ten days ago must not freeze the score, or the
  // number stops meaning anything the moment a student has a good hour.
  setLog([mk(1.0,10), mk(0.3,2), mk(0.3,1), mk(0.35,0)]);
  s = usageSummary('x');
  assert('an old lucky day does not freeze the score (got '+pct(s.rows[0].avg)+'%)',
    pct(s.rows[0].avg) < 60);
  assert('but the peak is still recorded', pct(s.rows[0].best) === 100);

  // A real decline has to be visible, or the panel is flattery.
  setLog([mk(0.9,4), mk(0.85,3), mk(0.5,1), mk(0.4,0)]);
  s = usageSummary('x');
  assert('a decline still shows as a decline', s.trend === 'down');

  // Improvement across days shows too.
  setLog([mk(0.3,4), mk(0.35,3), mk(0.8,1), mk(0.9,0)]);
  s = usageSummary('x');
  assert('improvement across days reads as improvement', s.trend === 'up');

  // --- best of DAY, not best ever ---
  // Two days, 100% and 40%: the score must sit between them, because
  // best-ever would report 100% and mean-of-all would report something
  // dragged down by however many times they practiced on the bad day.
  setLog([mk(1.0,1), mk(0.4,0,0), mk(0.4,0,1), mk(0.4,0,2)]);
  s = usageSummary('x');
  assert('two days average to the middle (got '+pct(s.rows[0].avg)+'%)', pct(s.rows[0].avg) === 70);
  assert('the day count is what is averaged', s.rows[0].days === 2);
  assert('and the attempt count is separate', s.rows[0].attempts === 4);

  // Practicing more on one day cannot move that day's contribution.
  setLog([mk(1.0,1), mk(0.4,0)]);
  const twoAttempts = usageSummary('x').rows[0].avg;
  setLog([mk(1.0,1), mk(0.4,0,0), mk(0.1,0,1), mk(0.2,0,2), mk(0.3,0,3)]);
  const manyAttempts = usageSummary('x').rows[0].avg;
  assert('extra attempts on a day never lower that day', pct(twoAttempts) === pct(manyAttempts));

  // --- a single attempt is luck, not a pattern ---
  setLog([mk(0.1,0)]);
  s = usageSummary('x');
  assert('one attempt is not a weak spot', s.weakestList.length === 0);
  assert('one attempt is not a strength either', s.strongestList.length === 0);
  assert('but it is still counted', s.total === 1);

  // --- what the teacher's panel receives ---
  setLog([0.2,0.4,0.6,0.8,0.9].map((o,i)=>mk(o,0,i)));
  const p = progressSummary('x');
  assert('the teacher gets the best-of-day score', p.weakAvg === 90);
  assert('and how many attempts it took', p.weakTries === 5);
  assert('and the total', p.attemptsTotal === 5);

  console.log(results.join('\\n'));
  const fails = results.filter(r=>r.includes('FAIL'));
  globalThis.__fails = fails.length;
  console.log(fails.length ? ('FAILURES: '+fails.length+' / '+results.length) : ('ALL '+results.length+' CHECKS PASS'));
})();
`;

const sandbox = {
  btoa: s=>Buffer.from(s,'binary').toString('base64'),
  atob: s=>Buffer.from(s,'base64').toString('binary'),
  document: makeDocStub(),
  window: { addEventListener(){}, _lrState:null, _sentenceState:null },
  localStorage,
  location: { origin:'https://example.com', pathname:'/app', hash:'', search:'' },
  navigator: { language:'en-US', languages:['en-US'], clipboard:{writeText:()=>Promise.resolve()}, mediaDevices:undefined },
  SpeechSynthesisUtterance: function(t){ this.text=t; },
  speechSynthesis: { speak(){}, getVoices(){return [];}, addEventListener(){}, cancel(){} },
  URLSearchParams,
  console, Date, Math, JSON, Array, Object, String, Number, Intl, Set, Promise,
  // The app registers live intervals the moment it loads — the class
  // progress refresh and the welcome screen's language swap. A real
  // interval holds Node's event loop open, so the process never exits
  // and the verdict cannot be read from an exit code at all. unref lets
  // them tick without being a reason to stay alive.
  setInterval: (...a) => { const t = setInterval(...a); if (t && t.unref) t.unref(); return t; },
  clearInterval, setTimeout, clearTimeout,
};
sandbox.self = sandbox.window;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(testScript, sandbox).catch(e => { console.error('RUNTIME ERROR:', e.stack); process.exitCode = 1; });

// Printed text is not a result anyone can act on: a caller cannot tell a
// run that failed its checks from one that crashed before printing. This
// carries the verdict out as an exit code. beforeExit fires once the loop
// drains — after the body has settled — so it covers the files that end
// synchronously and the ones that end on a promise alike.
process.on('beforeExit', () => { if (sandbox.__fails) process.exitCode = 1; });
