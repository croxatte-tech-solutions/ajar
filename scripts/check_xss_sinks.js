// Every place human words come back out of the page.
//
// WHY THIS CHECK IS WORTH MORE HERE THAN IN MOST APPS
// ---------------------------------------------------
// _headers ships a Content-Security-Policy and says out loud, in its own
// comment, what it cannot do: "script-src below cannot stop injected inline
// script". That admission is correct and it is not fixable — the app is one
// HTML file with nine inline <script> blocks and 129 inline handlers, and a
// nonce policy would not harden it, it would break it.
//
// So the CSP is not the defence against XSS in this app. escapeHtml at each
// output point IS the defence, and it is the whole of it. One innerHTML that
// interpolates a person's words without it is not a smudge on a page; it is
// arbitrary JavaScript in whoever is looking at that screen.
//
// AND THE SCREEN THAT MATTERS IS NOT THE STUDENT'S
// ------------------------------------------------
// The teacher's panel is where a student's name, and a student's practice
// summary, are rendered. She is the account with the final word in Padrao C —
// nothing reaches a class until she approves it — she is signed in by email,
// and her panel is usually the classroom projector. Script running there does
// not deface anything. It approves exercises as her, reads every private note
// as her, and rewrites the class list as her, in front of the room.
//
// connect-src does not save that case either. The attack has nowhere it needs
// to send anything: the app's own Firestore is same-origin as far as the
// policy is concerned, and acting AS her is the prize.
//
// WHAT CHANGED UNDER THIS CHECK'S FEET
// ------------------------------------
// check_names.js already measured the escape used for names in attributes,
// found it handles the apostrophe and not the double quote, and wrote down:
// "no real name format needs one". That was true of a name TYPED BY THE
// TEACHER, which is what the class list was. It stopped being true when the
// class list started filling itself from schools/{id}/students/{uid} —
// a document each student writes about themselves. The escape did not change;
// the trust boundary moved across it, and nothing was watching that.
//
// So the assertions below run against a HOSTILE class: a member of the school
// who writes markup into the fields the rules let them write. Some of it comes
// back escaped. The places it does not are named as holes and pinned, the same
// way the two KNOWN GAPs in scripts/rules-test/rules.test.js are — written up
// with a concrete exploitation path in ~/ajar-noite/SEGURANCA.md, and not
// repaired here, because output escaping is one of the three things this
// project does not fix on the way past something else.
//
// NO TEMPLATE LITERAL IN THIS FILE, for the reason check_names.js gives: a
// probe that lives inside a backtick string loses one layer of backslash
// before it is ever compiled, and a file about quotes cannot afford that.
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/type\s*=\s*["']module["']/.test(m[1]))
  .map(m => m[2]);

const results = [];
function assert(n, c, detail){
  results.push(n + ': ' + (c ? 'PASS' : 'FAIL'));
  if(!c && detail !== undefined) results.push('    got: ' + JSON.stringify(detail).slice(0, 300));
}

//---------------------------------------------------------------------------
// The payloads. Static reasoning, run against the real functions — nothing
// here touches a network, an emulator, or the live site.
//---------------------------------------------------------------------------
const IMG    = '<img src=x onerror=alert(1)>';
const SVG    = '<svg onload=alert(1)>';
// Fits inside the 60 characters firestore.rules allows a displayName, with
// room to spare. autofocus is what makes it need no click at all.
const ATTR   = 'a" autofocus onfocus="alert(1)//';
const ENTITY = '&lt;img src=x onerror=alert(1)&gt;';

//---------------------------------------------------------------------------
// A DOM thin enough to render into and read back.
//---------------------------------------------------------------------------
// A scratch node's textContent has to behave the way a browser's does, or
// section 2 measures the stub instead of the app: speakButtonHtml puts the
// spoken words in through textContent and reads them back out of innerHTML,
// and it is that round trip which turns the markup into entities. A browser
// escapes &, < and > there and leaves quotes alone — which is exactly why the
// function then handles the double quote itself.
const asHtmlText = s => String(s).replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));

const nodes = {};
const el = (id) => {
  if(id && nodes[id]) return nodes[id];
  const n = { style:{}, innerHTML:'', value:'', id: id || '', children: [],
    classList:{toggle(){},add(){},remove(){},contains:()=>false},
    addEventListener(){}, querySelector:()=>el(), querySelectorAll:()=>[],
    closest:()=>null, select(){}, focus(){}, remove(){}, insertBefore(){},
    setAttribute(){}, getAttribute:()=>'', scrollIntoView(){},
    getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}) };
  n.appendChild = c => { n.children.push(c); };
  n.parentNode = { insertBefore(){}, removeChild(){} };
  Object.defineProperty(n, 'textContent', {
    get(){ return n._text || ''; },
    set(v){ n._text = String(v); n.innerHTML = asHtmlText(v); },
  });
  if(id) nodes[id] = n;
  return n;
};

const store = {};
const sandbox = {
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  document: { getElementById: id => el(id), createElement: () => el(), querySelector: () => el(),
              querySelectorAll: () => [], addEventListener(){}, body: el() },
  window: { addEventListener(){}, scrollTo(){}, innerWidth: 900, innerHeight: 700 },
  localStorage: { getItem: k => (k in store ? store[k] : null),
                  setItem: (k, v) => { store[k] = String(v); },
                  removeItem: k => { delete store[k]; } },
  location: { origin:'https://example.com', pathname:'/', hash:'', search:'' },
  navigator: { language:'en-US', languages:['en-US'] },
  confirm: () => true,
  Audio: function(){ this.play = () => Promise.resolve(); this.pause = () => {}; },
  SpeechSynthesisUtterance: function(t){ this.text = t; },
  speechSynthesis: { speak(){}, getVoices(){ return []; }, addEventListener(){}, cancel(){} },
  URLSearchParams, Blob: function(){}, URL: { createObjectURL: () => 'blob:x' },
  console, Date, Math, JSON, Array, Object, String, Number, Intl, Set, Map, Promise, Function,
  setInterval: (...a) => { const t = setInterval(...a); if(t && t.unref) t.unref(); return t; },
  clearInterval, setTimeout, clearTimeout,
};
sandbox.self = sandbox.window;
sandbox.globalThis = sandbox;
// A teacher, signed in, looking at her own class. That is the session every
// interesting payload below is aimed at.
const cloudStub = new Proxy({}, {
  get(_, prop){
    if(prop === 'currentUser') return () => ({ uid:'t1', isTeacher: true, schoolId: 'xss-school',
      name: 'Teacher', schoolName: 'School', isAnonymous: false, roleKnown: true });
    if(prop === 'pullClassSummaries') return async () => ({});
    if(prop === 'pullClassMembers') return async () => [];
    return () => Promise.resolve();
  },
});
sandbox.window.CloudSync = cloudStub;
sandbox.CloudSync = cloudStub;
vm.createContext(sandbox);
vm.runInContext(blocks.join('\n;\n') + ';globalThis.__api={escapeHtml,audioUrlFor,hashStr,' +
  'renderRoster,renderClassProgress,saveRoster,loadRoster,' +
  'speakButtonHtml,teacherNoteHtml,setStudentName,renderAnnouncement};', sandbox);
const api = sandbox.__api;

//===========================================================================
// 1. escapeHtml ITSELF — five characters, not two
//===========================================================================
// Escaping < and > and stopping there is the version of this function that
// looks right and leaves every attribute in the app open: a payload that
// never needs an angle bracket walks straight through it. So each of the five
// is asserted by running the real function, one at a time.
const e = api.escapeHtml;
assert('a less-than cannot survive escaping', e('<b>').indexOf('<') === -1, e('<b>'));
assert('nor a greater-than', e('<b>').indexOf('>') === -1, e('<b>'));
assert('nor a double quote, which is what ends an attribute',
  e('a" onload="x').indexOf('"') === -1, e('a" onload="x'));
assert('nor a single quote, which is what ends a handler argument',
  e("a' onload='x").indexOf("'") === -1, e("a' onload='x"));
assert('and the ampersand is escaped too, so nothing is encoded twice',
  e('&') === '&amp;' && e(ENTITY).indexOf('&amp;lt;') === 0, e(ENTITY));
// The reason the ampersand matters: an entity that survives one round of
// escaping and is then decoded again by something downstream is a payload
// delivered in two halves.
assert('an entity already in the text stays inert rather than decoding back',
  e(ENTITY).indexOf('<img') === -1, e(ENTITY));
assert('the whole image payload comes back with nothing executable in it',
  e(IMG).indexOf('<') === -1 && e(IMG).indexOf('>') === -1);
assert('and so does the svg one', e(SVG).indexOf('<') === -1);
// The escape is applied to whatever it is given, including things that are
// not strings — a Firestore field arriving as a number or an object must not
// sail past it on a type error.
assert('a non-string is coerced rather than skipped', e(null) === 'null');

//===========================================================================
// 2. THE OUTPUT POINTS THAT DO HOLD
//===========================================================================
// The sinks that carry human words and escape them. Each is asserted from
// what the function actually produced, not from finding the word escapeHtml
// somewhere near it in the source.

// The transcript. Chrome's recogniser returns whatever it heard as a string,
// and the student is the one speaking into it.
assert('what the student said is escaped before it is shown back',
  html.indexOf('You said: <i>"${escapeHtml(transcript)}"</i>') > -1);

// The teacher's note, as the student reads it. She types it; it lands on
// their screen.
api.setStudentName('Ana');
store['ajar_teacher_notes'] = JSON.stringify({ Ana: IMG });
const note = api.teacherNoteHtml();
assert('the teacher note reaches the student escaped',
  note.indexOf('<img') === -1 && note.indexOf('&lt;img') > -1, note);

// The announcement. Same shape: her words, their screen. It is also what the
// legacy #batch= route writes without her (S-01), which is the other reason
// this one has to hold.
store['ajar_announcement'] = IMG;
api.renderAnnouncement();
const banner = el('announcement-banner').innerHTML;
assert('the announcement banner escapes what she wrote',
  banner.indexOf('<img') === -1 && banner.indexOf('&lt;img') > -1, banner);

// Spoken text travels as data, not as code. This is the pattern the app
// adopted after the audio buttons died on one double quote, and the check
// exists so a thirteenth site cannot be built the old way by accident.
const btn = api.speakButtonHtml('She said "hello" loudly', 'Hear it');
assert('a spoken string with a double quote does not end the attribute',
  btn.indexOf('data-speak="She said &quot;hello&quot; loudly"') > -1, btn);
// With the comments taken out first: the old shape is still quoted in the note
// above speakButtonHtml, which is where it belongs and not where it counts.
const code = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
assert('and spoken text is never interpolated into a handler again',
  code.indexOf('onclick="speak(') === -1);

//===========================================================================
// 3. THE TEACHER'S PANEL, WITH A HOSTILE CLASSMATE IN IT
//===========================================================================
// This is the scenario, not an illustration of one. A student writes their own
// record at schools/{id}/students/{uid}. firestore.rules caps the display name
// at 60 characters and says nothing whatsoever about the shape of `summary` —
// validStudent() lets it through unexamined. Whatever they put in it is read
// by pullClassMembers() and drawn on her panel.
api.saveRoster({ students: ['Ana'], present: [] });
vm.runInContext('_classProgress = { Ana: { uid: "s1", displayName: "Ana", summary: {' +
  ' weakType: "passage", weakAvg: ' + JSON.stringify(IMG) + ', weakTries: 1,' +
  ' attemptsToday: 1, attemptsTotal: ' + JSON.stringify(SVG) + ', trend: "up" } } };' +
  'if(!window._privateShown) window._privateShown = new Set();' +
  'window._privateShown.add(PRIVATE_INSIGHT_KEY);', sandbox);
api.renderClassProgress();
const panel = el('class-progress').innerHTML;
assert('her panel does draw the class once she opens it',
  panel.indexOf('Weakest so far') > -1, panel.slice(0, 160));
assert('the student name on the card is escaped', panel.indexOf('>Ana<') > -1);
// S-02, CLOSED. This was pinned as a KNOWN HOLE the night it was found and is
// now the opposite assertion: the summary is the one thing on this screen the
// student writes about themselves, and it no longer reaches her panel as
// markup. The four counts are coerced with Number/trunc where they are read,
// so a hostile value renders as 0 rather than as an escaped tag -- safe AND
// legible, where escaping alone would have drawn the attacker's tag as text.
assert('a hostile practice summary is not markup in her panel (weakAvg)',
  panel.indexOf(IMG) === -1, panel.slice(0, 200));
assert('nor is the attempt total beside it',
  panel.indexOf(SVG) === -1);
// And it draws as a NUMBER, not as an escaped tag. This is the half that
// escaping alone would not have given: escapeHtml would make the payload safe
// and still print &lt;img src=x&gt; across her class list, which reads as the
// app being broken. Number() makes it a 0.
// Scoped to the region built FROM THE SUMMARY -- the card head and the
// "Weakest so far" line -- and deliberately not to the whole card. The
// teacher's own note sits below in a textarea, and a note SHE typed showing up
// escaped and visible is the correct outcome, not a finding. Asserting over
// the whole panel would have confused her words with the student's record,
// which is exactly the distinction this whole fix is about.
const summaryRegion = panel.slice(0, panel.indexOf('<div class="field">'));
assert('the counts region carries no markup and no escaped markup either (img)',
  summaryRegion.indexOf('&lt;img') === -1 && summaryRegion.indexOf('<img') === -1,
  summaryRegion.slice(-200));
assert('nor from the other field (svg)',
  summaryRegion.indexOf('&lt;svg') === -1 && summaryRegion.indexOf('<svg') === -1,
  summaryRegion.slice(-200));
assert('the weakest percentage draws as a number',
  /&middot; \d+%/.test(panel), panel.slice(panel.indexOf('Weakest'), panel.indexOf('Weakest') + 120));
// The panel also has to SURVIVE. tagFor does .find(...).tag, which throws on a
// type it does not know, and weakType comes off that same student-written
// record -- an unknown type took the whole class screen down. Quieter than a
// payload, and just as effective at losing the lesson.
vm.runInContext('_classProgress.Ana.summary.weakType = "not-a-real-type";', sandbox);
let survived = true;
try { api.renderClassProgress(); } catch(e) { survived = false; }
assert('an unknown weakType does not take her panel down', survived);
// What makes this the worst one rather than a curiosity: the fields are read
// straight off the record, so the attacker never has to touch her device.
assert('the fields come off the Firestore record, not from anything typed on her laptop',
  html.indexOf('const sum = d.summary || null;') > -1);

//===========================================================================
// 4. THE CLASS LIST, WITH A HOSTILE DISPLAY NAME IN IT
//===========================================================================
// The list fills itself from the accounts that turned up. The name is drawn
// twice on each row: once as text, once inside an inline handler.
vm.runInContext('CLASS_MEMBERS = [{ uid: "s1", displayName: ' + JSON.stringify(ATTR) + ' }];',
  sandbox);
api.renderRoster();
const list = el('roster-box').innerHTML;
assert('the visible half of the row escapes the name',
  list.indexOf('<span>' + ATTR + '</span>') === -1 && list.indexOf('&quot;') > -1,
  list.slice(0, 240));
// S-03, CLOSED. The old spelling escaped the apostrophe and left the double
// quote free to end an attribute delimited by double quotes. check_names.js
// recorded that limit while the name was typed by the teacher; it is now typed
// by the person it names, which is what turned a limit into a hole.
assert('the name can no longer end the onchange attribute early',
  list.indexOf('onchange="rosterTogglePresent(' + "'" + ATTR + "'" + ')"') === -1,
  list.slice(Math.max(0, list.indexOf('onchange')), list.indexOf('onchange') + 120));
assert('the quote that used to end it arrives as an entity instead',
  list.indexOf('onchange="rosterTogglePresent(') > -1 && list.indexOf('&quot;') > -1);
assert('and the payload that does it fits the 60 characters the rules allow',
  ATTR.length <= 60, ATTR.length);
// Every handler that carries an argument through an attribute now goes through
// the same escaper. Named one by one so that adding a sixth without it has to
// walk past this line, and so that nobody re-spells the escape by hand.
['pickName', 'onTeacherNoteChange', 'showInsights', 'lrPlay', 'lrRecord'].forEach(fn => {
  assert(fn + ' carries its argument through the shared attribute escaper',
    html.indexOf(fn + "('${") > -1);
});
// The invariant is not "how many times the old spelling appears" -- it appears
// inside escapeAttrArg itself, and in the comment explaining why it was wrong.
// It is that it appears NOWHERE ELSE. Cut the helper out and look at the rest.
const helperAt = html.indexOf('function escapeAttrArg(');
const outside = html.slice(0, html.lastIndexOf('// A value that lands inside a JS string'))
  + html.slice(html.indexOf('}', html.indexOf('return escapeHtml', helperAt)));
assert('the apostrophe-only escape exists nowhere except inside the shared helper',
  outside.indexOf("replace(/'/g") === -1,
  outside.slice(Math.max(0, outside.indexOf("replace(/'/g") - 60), outside.indexOf("replace(/'/g") + 40));
// S-05, CLOSED. The same class of mistake pointed the other way: double
// stringifying put a bare double quote INTO the attribute, so it ended at
// 'mailReview(' and the handler never compiled. The button was dead for
// everybody, always -- nobody reported it because a button that does nothing
// reads as a button you pressed wrong.
assert('the review mail button no longer double-stringifies its body',
  html.indexOf('mailReview(${JSON.stringify(JSON.stringify(body))})') === -1);
assert('it goes through the same escaper as every other handler argument',
  html.indexOf("mailReview('${escapeAttrArg(body)}')") > -1);

//===========================================================================
// 5. THE AUDIO PATH CANNOT BE STEERED OUT OF ITS DIRECTORY
//===========================================================================
// audioUrlFor builds a URL out of a hash of the text. If a hostile string
// could reach the filename, a clip request becomes a fetch of whatever the
// attacker named — so the assertion is that the name is digits and nothing
// else, for text chosen to break it.
['../../etc/passwd', IMG, ATTR, 'x".m4a?a=', ' ', '', 'unicode \u{1d4e4}'].forEach(t => {
  const url = api.audioUrlFor(t);
  assert('a hostile spoken string still names a plain clip: ' + JSON.stringify(t.slice(0, 14)),
    /^audio\/[0-9]+\.m4a$/.test(url), url);
});
assert('and no input reaches the path separator',
  api.audioUrlFor('a/../../b').indexOf('..') === -1);

//===========================================================================
// 6. WHAT THE CLIENT IS ALLOWED TO BELIEVE
//===========================================================================
// A role read out of localStorage or off a query string is a role a student
// grants themselves in the devtools. Both answers here come from a document
// Firestore decides they may read.
assert('a teacher is somebody with a teachers/{uid} record',
  html.indexOf('const isTeacherAccount = () => !!teacherRecord;') > -1);
assert('and that record is fetched, never assumed',
  /teacherRecord = snap\.exists\(\) \? snap\.data\(\) : null;/.test(html));
assert('an administrator is somebody with an admins/{uid} record',
  /getDoc\(doc\(db, 'admins', u\.uid\)\)/.test(html));
assert('no role is ever read out of localStorage',
  !/localStorage\.getItem\([^)]*(isTeacher|role|admin)/i.test(html));
assert('nor off the query string',
  !/params\.get\(['"](role|teacher|admin)['"]\)/.test(html));
// The panel must stay shut while the answer is still coming, or it flashes
// open for every visitor on every load.
assert('and "we have not asked yet" is not treated as "not a teacher, carry on"',
  html.indexOf('roleKnown: currentUser.isAnonymous || teacherRecordLoaded') > -1);

//===========================================================================
// 7. THE INVENTORY, BOUNDED
//===========================================================================
// Every interpolation that lands inside a tag rather than between two, minus
// the ones that escape. Almost all are numbers, ids and class names the app
// built itself. The point of counting is not the number: it is that adding a
// new one has to be deliberate, because this line moves when it happens.
//
// The full classification is in the comment at the foot of this file.
const inTagRaw = countRawAttributeSinks(html);
assert('no new raw interpolation has appeared inside a tag', inTagRaw <= 152, inTagRaw);
assert('and the count has not collapsed either, which would mean this stopped measuring',
  inTagRaw >= 100, inTagRaw);
// innerHTML is the whole surface. There is no insertAdjacentHTML anywhere, one
// outerHTML, and no document.write at all — so a sink cannot be hiding behind
// a route this check never looks at.
assert('nothing writes HTML through a route this check does not look at',
  html.indexOf('insertAdjacentHTML') === -1 && html.indexOf('document.write') === -1);
assert('the single outerHTML is the practice footer, which interpolates nothing human',
  (html.match(/outerHTML\s*=/g) || []).length === 1
  && html.indexOf('f.outerHTML = practiceFooter(true)') > -1);

// Counts a ${...} sitting between a '<' and its '>' — attribute position,
// where a quote is a control character and escapeHtml is the only thing that
// makes it inert. Deliberately a scan and not a parser: a parser that is
// subtly wrong here would report a comfortable number forever.
function countRawAttributeSinks(src){
  let n = 0;
  for(let i = 0; i < src.length - 1; i++){
    if(src[i] !== '$' || src[i+1] !== '{') continue;
    let d = 1, j = i + 2;
    while(j < src.length && d > 0){
      const c = src[j];
      if(c === '{' || c === '(' || c === '[') d++;
      else if(c === '}' || c === ')' || c === ']') d--;
      j++;
    }
    const expr = src.slice(i + 2, j - 1);
    if(/escapeHtml|encodeURIComponent/.test(expr)) continue;
    const before = src.slice(Math.max(0, i - 800), i);
    if(before.lastIndexOf('<') > before.lastIndexOf('>')) n++;
  }
  return n;
}

console.log(results.join('\n'));
const fails = results.filter(r => r.includes('FAIL'));
console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                         : ('ALL ' + results.length + ' CHECKS PASS'));
if(fails.length) process.exitCode = 1;

//===========================================================================
// THE SINKS, CLASSIFIED — every one that is NOT escaped, and why
//===========================================================================
// Counted with the scan above: 859 interpolations in the file, 167 of them in
// attribute position, 152 of those with no escapeHtml on the way. Grouped by
// what the interpolated value can contain, which is the only question that
// decides anything.
//
// (a) REACHABLE BY A STUDENT — the findings. Each written up with a concrete
//     exploitation path in ~/ajar-noite/SEGURANCA.md.
//
//     index.html:9941  sum.weakAvg          renderClassProgress   S-02 CRITICAL
//     index.html:9941  sum.weakTries        renderClassProgress   S-02
//     index.html:9949  sum.attemptsToday    renderClassProgress   S-02
//     index.html:9949  sum.attemptsTotal    renderClassProgress   S-02
//         TEXT position, not attribute — the scan above does not count these
//         and they are the worst of the set. Concatenated with '+' into the
//         string that becomes <b>${weak}</b>. All four are fields of
//         `summary`, which firestore.rules permits to hold anything at all.
//
//     index.html:9803  esc (displayName)    renderRoster          S-03 HIGH
//         onchange="rosterTogglePresent('${esc}')" — attribute delimited by
//         double quotes, esc escapes only the apostrophe.
//
//     index.html:11263 JSON.stringify(JSON.stringify(body))       S-05 LOW
//         onclick="mailReview(...)". The student's own text on the student's
//         own screen, so self-XSS at worst — but the attribute ends at
//         'mailReview(' and the button has never worked.
//
// (b) THE SAME PATTERN, ON TEXT NOBODY HOSTILE WRITES TODAY. Latent, in the
//     exact shape that killed the audio buttons. Pinned in section 4 above.
//
//     index.html:10028 pickName('${...}')                        roster name
//     index.html:9954  onTeacherNoteChange('${esc}')             roster name
//     index.html:9956  showInsights('${esc}')                    roster name
//     index.html:12790 lrPlay('${esc}')                          corpus sentence
//     index.html:12791 lrRecord('${esc}', ...)                   corpus sentence
//         The roster is written by the teacher (firestore.rules: classroom/*
//         is isTeacherOf only), so a payload there means her account is
//         already lost — but it is the step that turns one compromised
//         teacher into thirteen compromised students, because pickName is
//         drawn on every phone in the room.
//
// (c) SAFE BY CONSTRUCTION — the value cannot carry a quote or a bracket.
//
//     ids from the app's own tables      item.id, sec.id, t.id, q.id, k,
//                                        revealKey, PRIVATE_INSIGHT_KEY,
//                                        ex.section, role, i, id (a uid)
//     numbers and geometry               pxSize, cell, c*cell, r*cell, p,
//                                        s.seconds, target[0..1], n, avg,
//                                        Math.round(...), _tvIndex
//     class names and inline style       cls, colour, ok?'ok':'no', status,
//                                        item.status, busy, here, trend
//     escaped upstream by construction   noteFieldId(name) strips to
//                                        [a-zA-Z0-9]; itemShareLink builds a
//                                        URL out of an id and a school id.
//
// (d) NOT A SINK AT ALL. speakButtonHtml puts spoken text through a data
//     attribute and one delegated listener, which is what section 2 asserts.
//
// WHAT THIS CHECK CANNOT DO. It runs the app's own functions in a fake DOM. It
// cannot prove a browser parses the attribute the way these assertions say it
// does — that was established by hand, in a browser, for the audio buttons
// (the note above speakButtonHtml records that session), and the same reading
// is applied here. And it says nothing about whether Cloudflare actually sent
// the CSP that _headers asks for; the steps that can are under AJAR_SMOKE at
// the foot of scripts/check_deploy.js.
