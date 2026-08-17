// The graded timer.
//
// Thresholds are absolute seconds, not percentages, because they answer
// "what can the student still DO with the time left" — about a minute to
// finish a closing sentence at the 10-20 words a minute a second-language
// writer manages under pressure, and about a minute to reread a hundred
// words. On percentages the 45-second speaking task would have turned
// amber with four seconds left, which is an alarm rather than a warning.
//
// Only the two long writing tasks are graded. The rest stay closest to the
// real clock, which does not change colour at all.
//
// This file tests the LOGIC — which state applies when. The visual half
// (scale 1.0 / 1.08 / 1.18, weight 800, and no layout shift) needs real
// CSS and was verified in a browser; the DOM stub here has no styles.
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

  // The shared stub has no className or working classList, so give the
  // timer element just enough of one to observe what renderTaskTimer does.
  const el = document.getElementById('task-timer');
  const classes = new Set();
  el.className = '';
  el.classList = {
    toggle(c, on){ if(on) classes.add(c); else classes.delete(c); el.className = [...classes].join(' '); },
    add(c){ classes.add(c); el.className = [...classes].join(' '); },
    remove(c){ classes.delete(c); el.className = [...classes].join(' '); },
    contains(c){ return classes.has(c); },
  };
  const at = (type, left) => {
    window._timerState = { type, left, onEnd:null };
    renderTaskTimer();
    return { caution: classes.has('caution'), urgent: classes.has('urgent'), warn: classes.has('warn') };
  };

  // --- the two long writing tasks are graded ---
  ['email','discussion'].forEach(type => {
    assert(type + ' is plain with time in hand', !at(type,400).caution && !at(type,400).urgent);
    assert(type + ' is still plain at 2:01', !at(type,121).caution);
    assert(type + ' turns amber at exactly 2:00', at(type,120).caution);
    assert(type + ' is still amber at 0:46', at(type,46).caution && !at(type,46).urgent);
    assert(type + ' turns red at exactly 0:45', at(type,45).urgent);
    assert(type + ' is never amber and red at once', !(at(type,45).caution && at(type,45).urgent));
    assert(type + ' is still red at zero', at(type,0).urgent);
    assert(type + ' never uses the old single warn', !at(type,30).warn);
  });

  // --- everything else is not ---
  // A 45-second spoken answer is entirely inside the pressure window, and
  // the student is talking, which is the thing being measured. Colour there
  // adds an alarm without adding information.
  ['interview','sentence','complete-words'].forEach(type => {
    assert(type + ' never turns amber', !at(type,20).caution && !at(type,5).caution);
    assert(type + ' never turns red by this scheme', !at(type,1).urgent);
  });

  // --- absolute, which is the whole design ---
  // As percentages, 45 seconds is 10% of the interview: the warning would
  // arrive with four seconds to go.
  assert('amber is 2 minutes, not a percentage', TIMER_CAUTION_S === 120);
  assert('red is 45 seconds, not a percentage', TIMER_URGENT_S === 45);
  assert('amber leaves a minute of room before red', TIMER_CAUTION_S - TIMER_URGENT_S >= 60);
  assert('both fit inside the shorter graded task', TIMER_CAUTION_S < TASK_TIME_LIMITS.email);
  assert('only the long writing tasks are graded',
    Object.keys(GRADED_TIMER).sort().join(',') === 'discussion,email');

  // --- and the student is told the real clock differs ---
  assert('the note says the real clock does not do this',
    timerBadgeHtml('email').indexOf('the real one does not') > -1);
  assert('short tasks carry no such note',
    timerBadgeHtml('interview').indexOf('the real one does not') === -1);
  assert('the note reads as sentences, not run together',
    timerBadgeHtml('email').indexOf('task. The clock') > -1);

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
