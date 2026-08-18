// What happens when a student scans the code on the wall.
//
// This is the check that should have existed before the lesson it is named
// after. Reported: "abri o qr code grande gerado e ia para tela do aluno, tela
// geral" — the big projected code opened the student's general list instead of
// the exercise it named.
//
// The cause was three defects that only combine in a classroom:
//   1. the code was drawn the instant an item was approved, while the write of
//      that item's own document was still in flight;
//   2. that write was fire-and-forget with an empty catch, so a failure looked
//      exactly like a success;
//   3. and a failed lookup fell through to the whole-class batch, which turned
//      "this document is not there yet" into "here is a different exercise".
//
// Thirteen phones scanning within seconds of each other is the load that makes
// (1) certain rather than unlikely. Nothing in the suite exercised the scan
// path end to end, so all three survived 3000 green checks.
//
// No template literal in this file: it asserts on URLs and ids.
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/type\s*=\s*["']module["']/.test(m[1]))
  .map(m => m[2]);

const results = [];
function assert(n, c, detail){
  results.push(n + ': ' + (c ? 'PASS' : 'FAIL'));
  if(!c && detail !== undefined) results.push('    got: ' + JSON.stringify(detail));
}

const nodes = {};
const el = (id) => {
  if(id && nodes[id]) return nodes[id];
  const n = { style:{}, innerHTML:'', textContent:'', value:'', id: id || '', children: [],
    classList:{toggle(){},add(){},remove(){},contains:()=>false},
    addEventListener(){}, querySelector:()=>el(), querySelectorAll:()=>[],
    closest:()=>null, select(){}, focus(){}, remove(){}, insertBefore(){},
    getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}) };
  n.appendChild = c => { n.children.push(c); };
  n.parentNode = { insertBefore(){}, removeChild(){} };
  if(id) nodes[id] = n;
  return n;
};

// A Firestore that can be made to behave like a classroom: a document that is
// not written yet, one that never will be, one that belongs to another school.
function boot(opts){
  opts = opts || {};
  const store = Object.assign({}, opts.storage || {});
  const docs = Object.assign({}, opts.docs || {});
  const asked = [];
  const live = []; const answersCb = []; const rounds = []; const sent = []; let cleared = 0;
  const cloud = new Proxy({}, {
    get(_, prop){
      /* A class needs an account now, so the student scanning a code has one
         unless a case says otherwise. Before this change the stub returned
         null here and every scan below was being made by a visitor the
         product no longer serves. */
      if(prop === 'currentUser') return () => {
        if(opts.teacher) return { uid:'t1', isAnonymous:false, roleKnown:true, isTeacher:true, schoolId:'scan-school' };
        if(opts.anonymous) return { uid:'a1', isAnonymous:true, roleKnown:true, isTeacher:false, schoolId:null };
        return { uid:'s1', email:'ana@x.test', isAnonymous:false, roleKnown:true, isTeacher:false, schoolId:null };
      };
      if(prop === 'pullClassroomItem') return async id => {
        asked.push(id);
        if(opts.itemMode === 'denied'){ const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; }
        if(opts.itemMode === 'network') throw new Error('Failed to get document because the client is offline.');
        return docs['item_' + id] || null;
      };
      if(prop === 'pullClassroomBatch') return async () => (opts.batch || null);
      if(prop === 'pullRoster') return async () => (opts.roster || null);
      if(prop === 'pullNote') return async () => '';
      if(prop === 'pullClassSummaries') return async () => ({});
      // The first realtime listener this app has. The stub keeps the handler
      // so a test can push a new round in and watch the phone react.
      if(prop === 'watchLiveRound') return (onChange) => { live.push(onChange); return () => { live.pop(); }; };
      if(prop === 'watchLiveAnswers') return (onChange) => { answersCb.push(onChange); return () => {}; };
      if(prop === 'setLiveRound') return async st => { rounds.push(st); live.forEach(f => f(st)); return true; };
      if(prop === 'endLiveRound') return async () => { rounds.push({phase:'ended'}); live.forEach(f => f({phase:'ended'})); return true; };
      if(prop === 'sendLiveAnswer') return async (index, choice, correct) => { sent.push({index, choice, correct}); return true; };
      if(prop === 'clearLiveAnswers') return async () => { cleared++; return true; };
      return () => Promise.resolve();
    },
  });
  const sandbox = {
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    document: { getElementById: id => el(id), createElement: () => el(), querySelector: () => el(),
                querySelectorAll: () => [], addEventListener(){}, body: el() },
    window: { addEventListener(){}, scrollTo(){} },
    localStorage: { getItem: k => (k in store ? store[k] : null),
                    setItem: (k, v) => { store[k] = String(v); },
                    removeItem: k => { delete store[k]; } },
    location: { origin:'https://hiajar.com', pathname:'/', hash:'',
                search: opts.search === undefined ? '' : opts.search, href: 'https://hiajar.com/' },
    history: { replaceState(){} },
    URL: URL,
    navigator: { language:'en-US', languages:['en-US'] },
    confirm: () => true,
    Audio: function(){ this.play = () => Promise.resolve(); this.pause = () => {}; },
    SpeechSynthesisUtterance: function(t){ this.text = t; },
    speechSynthesis: { speak(){}, getVoices(){ return []; }, addEventListener(){}, cancel(){} },
    URLSearchParams,
    console: { log(){}, info(){}, warn(){}, error(){} },
    Date, Math, JSON, Array, Object, String, Number, Intl, Set, Promise, Function, RegExp,
    setInterval: (...a) => { const t = setInterval(...a); if(t && t.unref) t.unref(); return t; },
    clearInterval, setTimeout, clearTimeout,
  };
  sandbox.self = sandbox.window;
  sandbox.globalThis = sandbox;
  sandbox.window.CloudSync = cloud;
  sandbox.CloudSync = cloud;
  vm.createContext(sandbox);
  vm.runInContext(blocks.join('\n;\n') +
    ';globalThis.__api={loadSharedClassroomContent,renderStudent,getStudentBatch,setStudentName,' +
    'setRosterArrival,generateOne,tagFor,saveBatch,loadBatch,setPublishState,publishState,tvItems,' +
    'itemShareLink,currentSchool,renderLiveForStudent,liveActive,liveQuestion,answerLive,'+
    'renderLivePanel,liveCounts,startLiveRound,liveGo,liveNext,liveEnd,teacherIsSignedIn,renderStudent,'+
    'liveSegments,liveSecondsFor,livePosition,liveSecondsLeft,liveAddTime,saveRoster,tagFor,setClassMembers,'+
    'saveBatch,loadBatch,setPublishState,generateOne,setStudentName,setView};', sandbox);
  return { api: sandbox.__api, sandbox, asked, store, live, answersCb, rounds, sent,
           push(st){ live.forEach(f => f(st)); },
           pushAnswers(rows){ answersCb.forEach(f => f(rows)); },
           get cleared(){ return cleared; } };
}


function panel(){ return el('practice-wrap').innerHTML || ''; }
function tvPanel(){ return el('live-panel').innerHTML || ''; }

function cr(t){
  const g = t.api.generateOne('choose-response', 'campus');
  return { id: 'live1', type: 'choose-response', tag: 'x', theme: 'campus', status: 'approved', data: g.data };
}

(async () => {
  //===================================================================
  // WHILE THE CLIP IS PLAYING, THE PHONES SHOW NO ANSWERS
  //===================================================================
  // The phase the idea implied without stating it. On the real test you
  // listen FIRST and see the questions AFTER — options visible during the
  // audio teach a student to read instead of to listen. This makes the class
  // mode MORE faithful to the exam than practising alone, not less.
  const s = boot({ search: '?school=scan-school' });
  const item = cr(s);
  s.api.saveBatch([item]);
  s.api.setPublishState('live1', 'live');
  s.api.setStudentName('Ana');
  s.api.setView('student');
  // The init tail is a chain of awaits, so one tick is not enough to see the
  // end of it. Waiting for the observable effect rather than for a guessed
  // number of ticks.
  for(let i = 0; i < 20 && !s.live.length; i++) await new Promise(r => setTimeout(r, 0));
  assert('the phone subscribed to the round on its own, at start-up',
    s.live.length === 1, s.live.length);

  s.push({ itemId: 'live1', segment: 0, index: 0, phase: 'listening' });
  s.api.renderStudent();
  assert('a live round takes over the student screen', s.api.liveActive() === true);
  assert('the phone says to listen', panel().indexOf('Listen') > -1, panel().slice(0,140));
  assert('AND SHOWS NO OPTIONS AT ALL WHILE THE AUDIO PLAYS',
    panel().indexOf('answerLive(') === -1, panel().slice(0,300));
  assert('and says why, so it does not read as a broken screen',
    panel().indexOf('just like the real test') > -1);

  //===================================================================
  // THEN THE ANSWERS, AND ONLY THE ANSWERS
  //===================================================================
  s.push({ itemId: 'live1', segment: 0, index: 0, phase: 'answering' });
  s.api.renderStudent();
  const q = s.api.liveQuestion();

  assert('the open question has four options', q && q.options.length === 4, q && q.options.length);
  assert('all four reach the phone',
    [0,1,2,3].every(i => panel().indexOf('answerLive(' + i + ')') > -1), panel().slice(0,300));
  assert('and nothing else is on it — no fifth control, no audio',
    (panel().match(/answerLive\(/g) || []).length === 4);
  assert('the audio is never played on the student device',
    panel().indexOf('<audio') === -1 && panel().indexOf('speak(') === -1);

  await s.api.answerLive(1);
  assert('answering sends the choice with the question it was for',
    s.sent.length === 1 && s.sent[0].index === 0 && s.sent[0].choice === 1, s.sent);
  assert('and says whether it was right, so the count can be made without names',
    typeof s.sent[0].correct === 'boolean');
  assert('the phone shows it was sent, and that it can still be changed',
    panel().indexOf('can change it') > -1, panel().slice(0,400));

  //===================================================================
  // A NEW QUESTION CLEARS THE LAST ANSWER
  //===================================================================
  // Without this a student who answered question 1 opens question 2 already
  // marked, and taps nothing because it looks done.
  s.push({ itemId: 'live1', segment: 1, index: 0, phase: 'answering' });
  s.api.renderStudent();
  assert('the previous answer does not follow them to the next question',
    panel().indexOf('can change it') === -1, panel().slice(0,300));

  //===================================================================
  // REVEALING TEACHES, WITHOUT PUBLISHING ANYBODY
  //===================================================================
  s.push({ itemId: 'live1', segment: 1, index: 0, phase: 'answering' });
  s.api.renderStudent();
  await s.api.answerLive(0);
  s.push({ itemId: 'live1', segment: 1, index: 0, phase: 'revealed' });
  s.api.renderStudent();
  assert('the right answer is marked on their own screen', panel().indexOf('✓') > -1, panel().slice(0,200));
  assert('and their own choice is identifiable to them', panel().indexOf('you chose this') > -1
    || panel().indexOf('✓') > -1);

  //===================================================================
  // HER SCREEN IS PROJECTED, SO IT CARRIES COUNTS AND NEVER NAMES
  //===================================================================
  const t = boot({ search: '?school=scan-school', teacher: true });
  const titem = cr(t);
  t.api.saveBatch([titem]);
  t.api.setPublishState('live1', 'live');
  t.api.setView('teacher');
  await t.api.startLiveRound('live1');
  assert('starting a round clears whatever the last one left behind', t.cleared >= 1, t.cleared);
  assert('and opens on listening, not on the answers', t.rounds[0].phase === 'listening', t.rounds[0]);

  t.pushAnswers([{ uid:'a', index:0, choice:1, correct:true },
                 { uid:'b', index:0, choice:2, correct:false },
                 { uid:'c', index:0, choice:1, correct:true }]);
  assert('she sees how many have answered', tvPanel().indexOf('3') > -1, tvPanel().slice(0,300));
  assert('THE PROJECTED SCREEN CARRIES NO STUDENT NAME',
    ['a','b','c'].every(u => tvPanel().indexOf('uid') === -1) && tvPanel().indexOf('who answered what') > -1,
    tvPanel().slice(0,400));
  assert('and no correct answer while the question is still open',
    tvPanel().indexOf('Answer:') === -1, tvPanel().slice(0,400));

  await t.api.liveGo('revealed');
  const c = t.api.liveCounts();
  assert('the count is the class against the material', c.answered === 3 && c.correct === 2, c);
  assert('and that is what goes on the wall', tvPanel().indexOf('got it right') > -1, tvPanel().slice(0,300));
  assert('the answer appears only once she reveals it', tvPanel().indexOf('Answer:') > -1);

  //===================================================================
  // ONE AUDIO, THEN THE QUESTIONS THAT BELONG TO IT
  //===================================================================
  // The four listening types are not the same shape, and a flat question list
  // would have meant four special cases later.
  const segs = t.api.liveSegments(titem);
  assert('Choose the Response is five clips of one question each',
    segs.length === 5 && segs.every(x => x.questions.length === 1),
    segs.map(x => x.questions.length));
  // The shapes the other three take, asserted on real generated items.
  for(const [type, clips, perClip] of [['talk', 1, 4], ['conversation', 1, 2]]){
    const it = { id:'x', type, theme:'campus', status:'approved',
                 data: t.api.generateOne(type, 'campus').data };
    const sg = t.api.liveSegments(it);
    assert(type + ' is one clip with ' + perClip + ' questions',
      sg.length === clips && sg[0].questions.length === perClip,
      sg.map(x => x.questions.length));
    assert('and the clip carries text to read out', !!sg[0].audio);
  }

  //===================================================================
  // HOW LONG THEY GET COMES FROM WHAT THERE IS TO READ
  //===================================================================
  // A fixed number is wrong in both directions at once: the banks put 43 to
  // 58 words in front of a student on Choose the Response and 15 to 27 on an
  // announcement.
  const shortQ = { q: 'Why?', options: ['One', 'Two', 'Three', 'Four'] };
  const longQ  = { q: 'What does the man suggest that she should do about the timetable?',
                   options: ['Speak to the department office before the end of the week',
                             'Wait until the revised timetable has been published online',
                             'Ask another student who took the same module last year',
                             'Change to the seminar group that meets on Thursday morning'] };
  assert('a short question gets less time', t.api.liveSecondsFor(shortQ) < t.api.liveSecondsFor(longQ),
    [t.api.liveSecondsFor(shortQ), t.api.liveSecondsFor(longQ)]);
  assert('and nothing gets less than a floor', t.api.liveSecondsFor(shortQ) >= 18,
    t.api.liveSecondsFor(shortQ));
  assert('nor more than a ceiling', t.api.liveSecondsFor(longQ) <= 45, t.api.liveSecondsFor(longQ));
  // The check on the formula rather than a number arranged to pass: the exam
  // gives about 25 seconds per listening item once its audio is taken out.
  const talkQs = t.api.liveSegments({ type:'talk', data: t.api.generateOne('talk','campus').data })[0].questions;
  const avg = Math.round(talkQs.reduce((a,q) => a + t.api.liveSecondsFor(q), 0) / talkQs.length);
  assert('a talk question lands near the exam\'s own per-item budget (' + avg + 's)',
    avg >= 20 && avg <= 30, avg);

  //===================================================================
  // THE CLOCK CLOSES THE QUESTION. IT DOES NOT MOVE THE LESSON ON.
  //===================================================================
  await t.api.liveGo('answering');
  assert('opening the answers sets a deadline', t.rounds[t.rounds.length-1].endsAt > Date.now(),
    t.rounds[t.rounds.length-1]);
  assert('and the deadline is this question\'s, not a constant',
    t.rounds[t.rounds.length-1].endsAt - Date.now()
      >= (t.api.liveSecondsFor(t.api.liveQuestion()) - 2) * 1000);
  await t.api.liveAddTime();
  assert('she can add time, and only add it',
    t.rounds[t.rounds.length-1].endsAt > t.rounds[t.rounds.length-2].endsAt);
  assert('nothing in the app takes time away mid-question',
    html.indexOf('endsAt || Date.now()) + 15000') > -1
    && html.indexOf('- 15000') === -1);
  await t.api.liveGo('revealed');
  assert('closing the question drops the deadline',
    t.rounds[t.rounds.length-1].endsAt === undefined, t.rounds[t.rounds.length-1]);
  assert('AND STOPS THERE — the clock never moves the class on',
    t.rounds[t.rounds.length-1].phase === 'revealed');
  assert('only her device is allowed to close it',
    html.indexOf("if(teacherIsSignedIn() && LIVE && LIVE.phase === 'answering'){") > -1);
  assert('a phone whose clock runs fast cannot end the question for the room',
    html.indexOf('liveGo(\'revealed\')') > html.indexOf('teacherIsSignedIn() && LIVE'));

  //===================================================================
  // THE COUNT IS THE SIGNAL. THE CLOCK IS ONLY THE BACKSTOP.
  //===================================================================
  // She is looking at the room, not at the screen, so "everybody is in" has
  // to be unmissable rather than something she works out from two numbers.
  // "X of 13" counts the class that joined, not a list she stopped typing.
  t.api.setClassMembers([{ uid:'a', displayName:'Ana' }, { uid:'b', displayName:'Bo' },
                         { uid:'c', displayName:'Cy' }]);
  await t.api.liveGo('answering');
  t.pushAnswers([{ uid:'a', index:0, choice:1, correct:true },
                 { uid:'b', index:0, choice:2, correct:false }]);
  assert('with some still out, it counts them', t.api.liveCounts().allIn === false,
    t.api.liveCounts());
  assert('and shows the clock, because somebody may never answer',
    tvPanel().indexOf('s</p>') > -1 || tvPanel().indexOf('answered') > -1);

  t.pushAnswers([{ uid:'a', index:0, choice:1, correct:true },
                 { uid:'b', index:0, choice:2, correct:false },
                 { uid:'c', index:0, choice:1, correct:true }]);
  assert('once the room is in, it says so in words',
    t.api.liveCounts().allIn === true && tvPanel().indexOf('Everyone has answered') > -1,
    tvPanel().slice(0, 200));
  assert('and the seconds stop being shown, because they no longer decide anything',
    tvPanel().indexOf('· ') === -1 || tvPanel().indexOf('Everyone has answered') > -1);
  assert('SHE STILL REVEALS IT HERSELF — the app never takes that click',
    tvPanel().indexOf("liveGo('revealed')") > -1, tvPanel().slice(0, 400));

  // Without a class list there is no "everyone" to be complete, and claiming
  // there is would be the app inventing a fact about a room it cannot see.
  t.api.setClassMembers([]);
  assert('with nobody joined, completeness is not claimed',
    t.api.liveCounts().allIn === false, t.api.liveCounts());
  t.api.setClassMembers([{ uid:'a', displayName:'Ana' }, { uid:'b', displayName:'Bo' },
                         { uid:'c', displayName:'Cy' }]);

  //===================================================================
  // AND THE TWO DIFFERENT KINDS OF "NEXT"
  //===================================================================
  // Within a clip the audio is not replayed — that is the exam, and it is the
  // whole reason a clip holds several questions.
  const conv = { id:'c1', type:'conversation', tag:'x', theme:'campus', status:'approved',
                 data: t.api.generateOne('conversation','campus').data };
  t.api.saveBatch([conv]);
  t.api.setPublishState('c1', 'live');
  await t.api.startLiveRound('c1');
  await t.api.liveGo('answering');
  await t.api.liveGo('revealed');
  await t.api.liveNext();
  let last = t.rounds[t.rounds.length-1];
  assert('the second question of the same clip does NOT go back to listening',
    last.phase === 'answering' && last.segment === 0 && last.index === 1, last);
  await t.api.liveGo('revealed');
  await t.api.liveNext();
  assert('and the end of the last clip finishes the round',
    t.rounds[t.rounds.length-1].phase === 'ended', t.rounds[t.rounds.length-1]);

  //===================================================================
  // ALL FOUR LISTENING TYPES, AND ONLY THOSE
  //===================================================================
  // The problem is thirteen phones playing one clip in one room. A passage on
  // thirteen screens is not a problem — it is how reading works — so reading
  // types stay out on purpose rather than by omission.
  const offered = ['choose-response', 'talk', 'conversation', 'announcement'];
  const excluded = ['passage', 'daily-read', 'complete-words', 'email', 'listen-repeat'];
  const t2 = boot({ search: '?school=scan-school', teacher: true });
  t2.api.setView('teacher');
  t2.api.saveBatch(offered.concat(excluded).map((ty, n) => ({
    id: 'i' + n, type: ty, tag: ty, theme: 'campus', status: 'approved',
    data: t2.api.generateOne(ty, 'campus').data })));
  offered.concat(excluded).forEach((ty, n) => t2.api.setPublishState('i' + n, 'live'));
  t2.api.renderLivePanel();
  const shelf = el('live-panel').innerHTML || '';
  offered.forEach(ty => assert('a ' + ty + ' can be run with the class',
    shelf.indexOf('>▶ ' + ty) > -1, shelf.slice(0, 300)));
  excluded.forEach(ty => assert('a ' + ty + ' is not offered, because it has no shared clip',
    shelf.indexOf('>▶ ' + ty) === -1));
  assert('and each says how much of the lesson it will take',
    shelf.indexOf('clip') > -1 && shelf.indexOf('question') > -1, shelf.slice(0, 400));

  //===================================================================
  // AN ANSWER IS FILED UNDER THE EXERCISE IT CAME FROM
  //===================================================================
  // It was hard-coded to choose-response, true while that was the only type a
  // round could run — and it would have filed every talk answered in class
  // under the wrong skill the moment the others were let in, quietly bending
  // the patterns their teacher reads.
  assert('the live round logs the item\'s own type, not a fixed one',
    html.indexOf("logUsage(li.type || 'choose-response'") > -1);

  //===================================================================
  // AND IT ENDS
  //===================================================================
  await t.api.liveEnd();
  assert('ending the round hands the screen back', t.api.liveActive() === false);
  s.push(null);
  s.api.renderStudent();
  assert('and the student is no longer held in it', s.api.liveActive() === false);

  console.log(results.join('\n'));
  const fails = results.filter(r => r.indexOf('FAIL') > -1);
  console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                           : ('ALL ' + results.length + ' CHECKS PASS'));
  if(fails.length) process.exitCode = 1;
})();
