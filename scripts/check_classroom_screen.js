// Her screen IS the classroom screen.
//
// She mirrors the teacher panel to the TV so the room can scan the codes.
// Every word that panel draws is therefore public — and it was drawing the
// exercises. The whole passage. Both sides of every conversation. All seven
// sentences to be repeated. And for eleven of the twelve types, the correct
// answer, in bold, beside the question it answers.
//
// A class watching the TV had the key before the exercise began.
//
// So this file asks one question of all twelve types at once: is there any
// string from the exercise data on that screen? Not "does the code look
// careful" — the actual rendered panel, walked for anything that came out of
// the item.
//
// The generic walk matters more than any single assertion here. A thirteenth
// task type gets covered the day it is written, without anybody remembering
// to come back and add it.
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
    style:{}, innerHTML:'', textContent:'', value:'', id: id || '', className: '',
    classList:{toggle(){},add(){},remove(){},contains:()=>false},
    children: [],
    addEventListener(){}, querySelector:()=>el(), querySelectorAll:()=>[],
    closest:()=>null, select(){}, focus(){}, remove(){}, insertBefore(){},
    getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}),
  };
  // Cards are appended, not assigned, so collect them instead of dropping
  // them on the floor — a stub that swallows appendChild would report an
  // empty panel and pass every assertion in this file.
  n.appendChild = (child) => { n.children.push(child); };
  n.parentNode = { insertBefore(){}, removeChild(){} };
  if(id) nodes[id] = n;
  return n;
};

const testScript = `
(async () => {
  const results = [];
  function assert(n, c){ results.push(n + ': ' + (c ? 'PASS' : 'FAIL')); }

  const box = document.getElementById('batch');
  const panelHtml = () => box.children.map(c => c.innerHTML || '').join('\\n');

  // Everything in the item that a student must not read early. Walked
  // rather than listed per type: the data comes in three different shapes,
  // and each of the two times I hand-listed them I missed one.
  //
  // 15 characters is the floor. Below it a string is a label or a single
  // word that turns up in ordinary page furniture; above it, it is content.
  function secretsOf(data){
    const found = [];
    (function walk(v){
      if(typeof v === 'string'){ if(v.trim().length >= 15) found.push(v.trim()); return; }
      if(Array.isArray(v)){ v.forEach(walk); return; }
      if(v && typeof v === 'object'){ Object.values(v).forEach(walk); }
    })(data);
    return found;
  }
  // The answer is the worst of it, and an option can be short enough to slip
  // under the floor above, so it is collected regardless of length.
  function answersOf(data){
    const found = [];
    (function walk(v){
      if(Array.isArray(v)){ v.forEach(walk); return; }
      if(v && typeof v === 'object'){
        if(Array.isArray(v.options) && typeof v.answer === 'number' && v.options[v.answer]){
          found.push(String(v.options[v.answer]).trim());
        }
        Object.values(v).forEach(walk);
      }
    })(data);
    return found.filter(a => a.length >= 8);
  }

  let checkedTypes = 0, totalSecrets = 0, totalAnswers = 0;

  TASK_TYPES.forEach(t => {
    const g = generateOne(t.id, 'campus');
    const item = { id: 'card-' + t.id, type: t.id, tag: t.tag, theme: 'campus',
                   status: 'approved', data: g.data };
    saveBatch([item]);

    // An approved item is not yet a projectable item — see the publication
    // gate below. The card shows a waiting panel until its own document is
    // confirmed written, so the fixture has to say it is.
    setPublishState(item.id, 'publishing');
    const waiting = (window._privateShown = null, box.children = [], renderTeacher(), panelHtml());
    assert(t.tag + ': while publishing, a waiting panel stands in for the code',
      waiting.indexOf('Publishing') > -1 && waiting.indexOf('<svg') === -1);
    setPublishState(item.id, 'live');

    // --- closed, which is how it arrives ---
    window._privateShown = null;
    box.children = [];
    renderTeacher();
    const closed = panelHtml();

    const secrets = secretsOf(item.data);
    const answers = answersOf(item.data);
    totalSecrets += secrets.length;
    totalAnswers += answers.length;
    checkedTypes++;

    const leaked = secrets.filter(x => closed.indexOf(x) > -1);
    assert(t.tag + ': nothing from the exercise is on the screen',
      leaked.length === 0);
    if(leaked.length) results.push('    leaked: ' + JSON.stringify(leaked[0].slice(0, 70)));

    const keyLeaked = answers.filter(x => closed.indexOf(x) > -1);
    assert(t.tag + ': and least of all an answer', keyLeaked.length === 0);
    if(keyLeaked.length) results.push('    answer on screen: ' + JSON.stringify(keyLeaked[0]));

    // She still has to be able to choose. Type and theme are what she picks
    // on, so they have to be there — otherwise this is safe and useless.
    assert(t.tag + ': she can still see what it is', closed.indexOf(t.tag) > -1);
    assert(t.tag + ': and what it is about', closed.indexOf('Campus') > -1);

    // And the code to project, which is the entire reason the screen is on
    // the TV in the first place.
    assert(t.tag + ': the code to scan is still there', closed.indexOf('<svg') > -1);

    // --- opened, because approving something unread is not review ---
    // This half is what stops the file passing for the wrong reason. If the
    // walk above collected nothing, or the panel rendered empty, everything
    // passes and nothing was tested.
    window._privateShown = new Set([item.id]);
    box.children = [];
    renderTeacher();
    const open = panelHtml();
    const shown = secrets.filter(x => open.indexOf(x) > -1);
    assert(t.tag + ': but she can open it and read it',
      secrets.length > 0 && shown.length > 0);
    assert(t.tag + ': and is told the room can read it too',
      open.indexOf('anyone watching this screen') > -1);
  });

  assert('all twelve task types were checked', checkedTypes === TASK_TYPES.length);
  assert('and there was real content to hide', totalSecrets > 40);
  assert('including real answer keys', totalAnswers > 10);

  //=================================================================
  // ONE WAY TO PUT IT ALL AWAY
  //=================================================================
  // A card left open scrolls out of sight and stays on the TV.
  //
  // The batch is whatever the loop above left behind, and the alarm counts
  // open cards that are actually IN it — so it has to be set here rather
  // than assumed. It counts from the batch on purpose: the private panel
  // shares this reveal mechanism, and its key must not raise an alarm about
  // exercises.
  const one = { id: 'card-alarm', type: 'passage', tag: tagFor('passage'), theme: 'campus',
                status: 'approved', data: generateOne('passage','campus').data };
  saveBatch([one]);
  setPublishState(one.id, 'live');
  window._privateShown = new Set([one.id]);
  box.children = [];
  renderTeacher();
  assert('an open card raises an alarm at the top of the panel',
    panelHtml().indexOf('are showing on this screen') > -1);
  assert('with one button that closes every one of them',
    panelHtml().indexOf('hideAllPrivate()') > -1);

  hideAllPrivate();
  box.children = [];
  renderTeacher();
  assert('and pressing it does', panelHtml().indexOf('are showing on this screen') === -1);
  assert('the alarm is absent when nothing is open, not just quiet',
    privateShown().size === 0);

  // The private panel's key is not an exercise, so it must not make the
  // exercise alarm claim answers are on screen.
  window._privateShown = new Set([PRIVATE_INSIGHT_KEY]);
  box.children = [];
  renderTeacher();
  assert('opening the private panel does not cry wolf about exercises',
    panelHtml().indexOf('answers are showing') === -1);

  //=================================================================
  // THE CLASSROOM SCREEN
  //=================================================================
  // The panel is where she works and it is not fit to be on a wall. This is a
  // screen with the code on it and nothing else, so the question it has to
  // answer is the same one as the cards: is any of the exercise on it?
  const tv = document.getElementById('tv-screen');
  window._privateShown = null;
  const shown = [];
  TASK_TYPES.slice(0, 6).forEach((t, i) => {
    shown.push({ id: 'tv-' + t.id, type: t.id, tag: t.tag, theme: 'campus',
                 status: 'approved', data: generateOne(t.id, 'campus').data });
  });
  shown.push({ id: 'tv-pending', type: 'passage', tag: tagFor('passage'), theme: 'campus',
               status: 'pending', data: generateOne('passage', 'campus').data });
  saveBatch(shown);

  // Publication state is the new gate: a code is shown only for an item whose
  // own document is confirmed written. The fixture has to say so, and that IS
  // the contract now — an approved item is not a projectable item.
  shown.forEach(i => setPublishState(i.id, 'live'));

  assert('it does not open by itself', tvIsOpen() === false);
  openClassroomScreen();
  assert('it opens', tvIsOpen() === true);

  // Every approved exercise is reachable, and the pending one is not — a code
  // for something she has not approved would put unapproved work on the wall.
  assert('it counts only the approved exercises', tvItems().length === 6);

  /* AND ONLY THE ONES THAT ARE REALLY THERE.
     This is the classroom failure that started this: the card drew a QR the
     moment an item was approved, while the write of that item's document was
     still in flight and its failure was swallowed. She approved, projected,
     thirteen phones scanned within seconds, and the scans that arrived first
     found nothing — and fell through to the whole-class batch, opening the
     wrong exercise. A wall is the worst place for a code that points at
     nothing. */
  setPublishState(shown[0].id, 'publishing');
  assert('an exercise still publishing gets no code on the wall',
    tvItems().length === 5 && tvItems().every(i => i.id !== shown[0].id));
  setPublishState(shown[0].id, 'failed');
  assert('and one whose publish failed gets none either',
    tvItems().length === 5);
  assert('but the panel knows they are waiting', tvPending().length === 1);
  setPublishState(shown[0].id, 'live');
  assert('once it is really saved, the code appears', tvItems().length === 6);
  assert('and says which one is showing', tv.innerHTML.indexOf('1 of 6') > -1);

  // Walk all six, checking each for content as we go.
  let leakedOnTv = [];
  for(let i = 0; i < 6; i++){
    const item = tvItems()[i];
    const html2 = tv.innerHTML;
    assert('code ' + (i+1) + ': the task type is named', html2.indexOf(item.tag) > -1);
    assert('code ' + (i+1) + ': there is a code to scan', html2.indexOf('<svg') > -1);
    secretsOf(item.data).forEach(x => { if(html2.indexOf(x) > -1) leakedOnTv.push(x.slice(0, 50)); });
    tvMove(1);
  }
  assert('no exercise text ever reaches the classroom screen', leakedOnTv.length === 0);
  if(leakedOnTv.length) results.push('    leaked: ' + JSON.stringify(leakedOnTv[0]));

  // Back to the first after six moves — it wraps, because a dead arrow in
  // front of a class reads as a broken app.
  assert('the arrows wrap round', tv.innerHTML.indexOf('1 of 6') > -1);
  tvMove(-1);
  assert('and go backwards', tv.innerHTML.indexOf('6 of 6') > -1);

  // What IS allowed on the wall, which is the set agreed for it.
  openClassroomScreen();
  assert('her name is on it', tv.innerHTML.indexOf('Ms Teacher') > -1);
  assert('and the date', tv.innerHTML.indexOf(schoolDateLabel()) > -1);

  // And what is NOT, beyond the exercises: none of the panel comes along.
  ['teacher-nav', 'roster', 'Weakest so far', 'Sign out', 'indiv-name'].forEach(bit => {
    assert('the panel bit "' + bit + '" is not on the wall', tv.innerHTML.indexOf(bit) === -1);
  });

  // The code is sized for a room, not for a card. The review card renders 150px.
  assert('the code is far larger than the one on the card', tvCodeSize() > 150);

  // On a short screen the code gives up room rather than pushing the arrows
  // off. A fixed flex column CLIPS what does not fit — it does not scroll — so
  // before this the controls became unreachable on a phone in landscape.
  const wasH = window.innerHeight, wasW = window.innerWidth;
  window.innerWidth = 852; window.innerHeight = 393;
  const short = tvCodeSize();
  window.innerWidth = 1180; window.innerHeight = 820;
  const roomy = tvCodeSize();
  window.innerWidth = wasW; window.innerHeight = wasH;
  assert('a short screen gets a smaller code', short < roomy);
  assert('but never one too small to scan from a room', short >= 180);
  assert('and a classroom screen gets a big one', roomy > 400);
  assert('and it can always be scrolled to if it still does not fit',
    __html.indexOf('overflow-y:auto; }') > -1);

  closeClassroomScreen();
  assert('it closes', tvIsOpen() === false);
  assert('and leaves nothing behind in the page', tv.innerHTML === '');

  // With nothing approved it says so rather than showing an empty frame.
  saveBatch([]);
  openClassroomScreen();
  assert('with nothing approved it explains instead of showing a blank wall',
    tv.innerHTML.indexOf('Nothing approved yet') > -1);
  closeClassroomScreen();

  // Nothing opens itself. This is the assertion the whole file exists for.
  window._privateShown = null;
  assert('a fresh load has every card closed', privateShown().size === 0);

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
// The panel refuses to render at all without a signed-in teacher, which is
// its own protection and correct — so stand one up. A Proxy rather than a
// hand-listed stub: start-up touches several CloudSync methods and listing
// them here would break this file every time one is added.
const cloudStub = new Proxy({}, {
  get(_, prop){
    if(prop === 'currentUser') return () => ({ isTeacher: true, schoolId: 'check-school', name: 'Ms Teacher' });
    return () => Promise.resolve();
  },
});
sandbox.window.CloudSync = cloudStub;
sandbox.CloudSync = cloudStub;
sandbox.__html = html;   // duas asserções olham o CSS, não o comportamento
vm.createContext(sandbox);
vm.runInContext(blocks.join('\n;\n') + '\n;\n' + testScript, sandbox)
  .catch(e => { console.error('RUNTIME ERROR:', e.stack); process.exitCode = 1; });

process.on('beforeExit', () => { if (sandbox.__fails) process.exitCode = 1; });
