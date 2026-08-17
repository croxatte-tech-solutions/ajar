// The school's date, the school's clock, and which class day today is.
//
// "Week 8 · Monday" was a pointer the teacher moved by hand, connected to no
// real day. The app could not say whether it was showing today or the day
// she happened to have left it on last week, and a student had nothing on
// screen tying the practice to the class.
//
// The reason this file exists rather than a couple of assertions bolted onto
// another one: date code is the kind that looks right every day except a few.
// So it is run at fixed moments — the instant before midnight in Denver, the
// two daylight-saving switches, a weekend, the day before term — rather than
// at whatever time the suite happens to run.
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/type\s*=\s*["']module["']/.test(m[1]))
  .map(m => m[2]);

const nodes = {};
const el = (id) => {
  if(id && nodes[id]) return nodes[id];
  const n = {
    style:{}, innerHTML:'', textContent:'', value:'', id: id || '',
    classList:{toggle(){},add(){},remove(){},contains:()=>false}, children: [],
    addEventListener(){}, querySelector:()=>el(), querySelectorAll:()=>[],
    closest:()=>null, select(){}, focus(){}, remove(){}, insertBefore(){},
    getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}),
  };
  n.appendChild = (c) => { n.children.push(c); };
  n.parentNode = { insertBefore(){}, removeChild(){} };
  if(id) nodes[id] = n;
  return n;
};

const testScript = `
(async () => {
  const results = [];
  function assert(n, c){ results.push(n + ': ' + (c ? 'PASS' : 'FAIL')); }

  // Every moment below is written as a UTC instant, because that is the only
  // unambiguous way to say "this exact point in time" in a test about
  // timezones. Denver is UTC-6 on daylight time and UTC-7 the rest of the
  // year; the code is not told which, and that is the point.
  const at = iso => new Date(iso);

  //=================================================================
  // THE DATE IS THE SCHOOL'S, NOT THE DEVICE'S
  //=================================================================
  // 06:00 UTC on the 18th is still the evening of the 17th in Denver. A
  // phone reading its own clock calls this tomorrow; the class does not.
  const lateNight = at('2026-08-18T04:30:00Z');   // 22:30 Mon 17 Aug, Denver
  assert('the evening before midnight is still the same class day',
    schoolDateLabel(lateNight).indexOf('August 17, 2026') > -1);
  assert('and it is named as a Monday',
    schoolDateLabel(lateNight).indexOf('Monday') > -1);
  assert('the plan agrees it is Monday of week 8', (() => {
    const p = schoolPlanToday(lateNight);
    return p && p.week === 8 && p.day === 1;
  })());

  // Half an hour later it has rolled over in Denver too.
  const justAfter = at('2026-08-18T06:30:00Z');   // 00:30 Tue 18 Aug, Denver
  assert('and half an hour later it is the next class day',
    schoolDateLabel(justAfter).indexOf('August 18, 2026') > -1);
  assert('which the plan reads as Tuesday, day 2', (() => {
    const p = schoolPlanToday(justAfter);
    return p && p.week === 8 && p.day === 2;
  })());

  //=================================================================
  // AMERICAN ORDER, SPELLED OUT
  //=================================================================
  // 8/17 vs 17/8 is a real confusion in a class of international students,
  // so the month is a word and the order is the American one.
  const label = schoolDateLabel(lateNight);
  assert('the date is spelled out, not numeric', !/\\d+\\/\\d+/.test(label));
  assert('weekday first, then month, then day, then year',
    /^Monday, August 17, 2026$/.test(label));

  const time = schoolTimeLabel(lateNight);
  assert('the time is 12-hour with AM or PM', /(AM|PM)/.test(time));
  assert('and reads 10:30 PM in Denver', time.indexOf('10:30') > -1);

  //=================================================================
  // DAYLIGHT SAVING, WHICH IS WHY THE ZONE IS NAMED AND NOT AN OFFSET
  //=================================================================
  // A fixed -7 would be an hour wrong for eight months of the year, and
  // wrong in the direction that shifts a class day at midnight.
  assert('summer says MDT', schoolTimeLabel(at('2026-08-18T04:30:00Z')).indexOf('MDT') > -1);
  assert('winter says MST', schoolTimeLabel(at('2026-12-15T19:30:00Z')).indexOf('MST') > -1);
  // 08:30 UTC on 1 November 2026 is 02:30 MDT; the switch happens at 02:00
  // local, so this is the repeated hour.
  assert('the autumn switch does not move the date',
    schoolDateLabel(at('2026-11-01T08:30:00Z')).indexOf('November 1, 2026') > -1);
  assert('the spring switch does not move it either',
    schoolDateLabel(at('2026-03-08T09:30:00Z')).indexOf('March 8, 2026') > -1);

  //=================================================================
  // THE PLAN, AND WHEN THERE IS NO PLAN
  //=================================================================
  // Weeks advance by seven days from the anchor.
  assert('a week later is week 9', (() => {
    const p = schoolPlanToday(at('2026-08-25T18:00:00Z'));   // Tue 25 Aug
    return p && p.week === 9 && p.day === 2;
  })());
  assert('and three weeks and three days later is Thursday of week 11', (() => {
    const p = schoolPlanToday(at('2026-09-10T18:00:00Z'));   // Thu 10 Sep
    return p && p.week === 11 && p.day === 4;
  })());
  assert('four weeks on lands on week 12, the mock exam week', (() => {
    const p = schoolPlanToday(at('2026-09-14T18:00:00Z'));   // Mon 14 Sep
    return p && p.week === 12 && p.day === 1;
  })());

  // The class runs Monday to Thursday. Saying nothing beats inventing a day.
  assert('Friday is not a class day', schoolPlanToday(at('2026-08-21T18:00:00Z')) === null);
  assert('nor is Saturday', schoolPlanToday(at('2026-08-22T18:00:00Z')) === null);
  assert('nor is Sunday', schoolPlanToday(at('2026-08-23T18:00:00Z')) === null);
  assert('before term starts there is no week',
    schoolPlanToday(at('2026-08-14T18:00:00Z')) === null);
  // The Monday straight after the last week of the plan, not some date far
  // away: an off-by-one here would show a Week 13 that does not exist.
  assert('and the Monday after the plan ends has no week',
    schoolPlanToday(at('2026-09-21T18:00:00Z')) === null);

  // The anchor is week 8 because weeks 1-7 happened before the app existed.
  assert('term starts on the Monday named in the config',
    CONFIG.termStart === '2026-08-17');
  assert('and that Monday really is a Monday',
    schoolDateLabel(at('2026-08-17T18:00:00Z')).indexOf('Monday') > -1);
  assert('the anchor week is 8, not 1', TERM_START_WEEK === 8);

  //=================================================================
  // ON SCREEN
  //=================================================================
  const clock = document.getElementById('welcome-clock');
  renderSchoolClock();
  assert('the welcome screen carries the date', clock.innerHTML.indexOf(',') > -1);
  assert('and the time', /(AM|PM)/.test(clock.innerHTML));

  // The panel has to say whether it is showing today or a day she left it
  // on. That was the whole complaint.
  const real = schoolPlanToday();
  saveProgress({ week: 1, day: 1 });
  renderProgressBox();
  const drifted = document.getElementById('progress-box').innerHTML;
  if(real){
    assert('when the pointer is not on today, the panel says so',
      drifted.indexOf('today is Week ' + real.week) > -1);
    assert('and offers one tap to fix it', drifted.indexOf('goToTodaysPlan()') > -1);

    goToTodaysPlan();
    const p = loadProgress();
    assert('which moves the pointer to today',
      p.week === real.week && p.day === real.day);
    renderProgressBox();
    assert('and then the panel says this is today',
      document.getElementById('progress-box').innerHTML.indexOf('this is today') > -1);
    assert('and stops offering to move it',
      document.getElementById('progress-box').innerHTML.indexOf('goToTodaysPlan()') === -1);
  } else {
    // The suite runs on weekends too. Say the date, offer nothing.
    assert('off a class day it still shows the date',
      drifted.indexOf('🗓') > -1);
    assert('and does not offer to jump to a day that is not one',
      drifted.indexOf('goToTodaysPlan()') === -1);
  }

  // Nothing here is automatic. The week and the day are hers — she goes back
  // into finished weeks — so a pointer that corrected itself would fight her.
  saveProgress({ week: 3, day: 2 });
  renderProgressBox();
  const kept = loadProgress();
  assert('rendering never moves the pointer by itself',
    kept.week === 3 && kept.day === 2);

  console.log(results.join('\\n'));
  const fails = results.filter(r => r.includes('FAIL'));
  console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                           : ('ALL ' + results.length + ' CHECKS PASS'));
  globalThis.__fails = fails.length;
})();
`;

const store = {};
const sandbox = {
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  document: { getElementById: id => el(id), createElement: () => el(), querySelector: () => el(),
              querySelectorAll: () => [], addEventListener(){}, body: el() },
  window: { addEventListener(){}, scrollTo(){} },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
  location: { origin:'https://example.com', pathname:'/', hash:'', search:'' },
  navigator: { language:'en-US', languages:['en-US'] },
  confirm: () => true,
  Audio: function(){ this.play = () => Promise.resolve(); this.pause = () => {}; },
  SpeechSynthesisUtterance: function(t){ this.text = t; },
  speechSynthesis: { speak(){}, getVoices(){ return []; }, addEventListener(){}, cancel(){} },
  URLSearchParams,
  console, Date, Math, JSON, Array, Object, String, Number, Intl, Set, Promise,
  setInterval: (...a) => { const t = setInterval(...a); if(t && t.unref) t.unref(); return t; },
  clearInterval, setTimeout, clearTimeout,
};
sandbox.self = sandbox.window;
sandbox.globalThis = sandbox;
// renderProgressBox lives behind the teacher gate.
const cloudStub = new Proxy({}, {
  get(_, prop){
    if(prop === 'currentUser') return () => ({ isTeacher: true, schoolId: 'check-school' });
    return () => Promise.resolve();
  },
});
sandbox.window.CloudSync = cloudStub;
sandbox.CloudSync = cloudStub;
vm.createContext(sandbox);
vm.runInContext(blocks.join('\n;\n') + '\n;\n' + testScript, sandbox)
  .catch(e => { console.error('RUNTIME ERROR:', e.stack); process.exitCode = 1; });

process.on('beforeExit', () => { if (sandbox.__fails) process.exitCode = 1; });
