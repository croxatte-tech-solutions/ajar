// The teacher panel: who may see it, and how much of it shows at once.
//
// Found by opening the site in an anonymous tab: clicking "I'm a teacher"
// went straight into the panel with no sign-in. Publishing was never at
// risk — the Firestore rules require a teacher account tied to that
// school — but READING was. Every visitor is signed in anonymously so
// students need no account, and the read rule is "signed in", which
// anonymous satisfies. So the panel put the class list and each student's
// summary on screen for whoever opened the address.
//
// Nothing leaked while the roster was empty. It would have started
// leaking the day a teacher added her class.
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');

const results = [];
function assert(n, c){ results.push(n + ': ' + (c ? 'PASS' : 'FAIL')); }

// --- the gate exists and covers the class data ---
assert('a signed-in check exists', /function teacherIsSignedIn\(\)/.test(html));
assert('it asks whether the account is a teacher, not just any account',
  /isTeacher/.test(html.slice(html.indexOf('function teacherIsSignedIn'),
                              html.indexOf('function teacherIsSignedIn') + 400)));

const gated = (html.match(/const TEACHER_GATED = \[([^\]]*)\]/) || [])[1] || '';
['sec-roster', 'sec-class', 'sec-review', 'sec-share', 'sec-progress', 'sec-individual']
  .forEach(id => assert(id + ' is behind the sign-in', gated.indexOf(id) > -1));
assert('the sign-in itself is NOT behind the sign-in', gated.indexOf('sec-account') === -1);

// The gate must run before anything draws the class.
const rt = html.slice(html.indexOf('function renderTeacher()'),
                      html.indexOf('function renderTeacher()') + 300);
assert('the gate runs first, before the panel is drawn', rt.indexOf('applyTeacherGate') > -1);
assert('and a signed-out visitor gets no further', /applyTeacherGate\(\)\)\{[^}]*return/.test(rt));
// Signing out has to take the class off the screen, not just swap the
// sign-in card — otherwise the panel stays open behind it.
const authLine = (html.split('\n').find(l => l.indexOf('__onAuthChanged =') > -1) || '');
assert('signing in or out redraws the panel, not just the card',
  authLine.indexOf('renderTeacher()') > -1);

// --- tabs, not a scroll position ---
assert('the old scroll-jump is gone', html.indexOf('function jumpToSection') === -1);
assert('the scroll-spy is gone too', html.indexOf('markSectionInView') === -1);
assert('sections are shown one at a time', /function showSection\(/.test(html));
assert('the chosen section is remembered between visits', /TEACHER_SECTION_KEY/.test(html));
assert('an unknown saved section falls back rather than showing nothing',
  /TEACHER_SECTIONS\.some\(s => s\.id === saved\)/.test(html));

// Ordering trap: two panels are built by the renders, so selecting the tab
// before they exist leaves them on screen next to the chosen one.
const body = html.slice(html.indexOf('function renderTeacher()'));
const gateAt = body.indexOf('applyTeacherGate');
const tabAt = body.indexOf('showSection(null, activeTeacherSection()');
assert('the tab is applied after the panels are built', tabAt > gateAt);

// --- the page says less ---
assert('the long generation blurb is collapsible',
  /<details class="brief"><summary>How this app makes the exercises/.test(html));
assert('the batch explanation is collapsible',
  /<details class="brief"><summary>How the daily batch works/.test(html));
assert('the assign explanation is collapsible',
  /<details class="brief"><summary>When to assign to one student/.test(html));

// "Prototype" belongs in the header and the guide, not repeated down the
// working screen.
const teacherView = html.slice(html.indexOf('id="view-teacher"'), html.indexOf('id="view-student"'));
assert('the working screen does not repeat the prototype notice',
  (teacherView.match(/prototype/gi) || []).length === 0);

// --- twelve buttons in four labelled rows ---
assert('task types are grouped by exam section', /class="type-group"/.test(html));
assert('each row is labelled', /type-group-label/.test(html));
assert('the rows follow the exam order',
  /\['Reading', 'Listening', 'Writing', 'Speaking'\]/.test(html));
assert('a row spans the full width so the grouping survives the flex parent',
  /\.type-group\{flex:1 1 100%/.test(html));
assert('the section is no longer repeated on every button',
  !/\$\{t\.tag\} <span style="opacity:\.6">· \$\{t\.section\}<\/span>/.test(html));

console.log(results.join('\n'));
const fails = results.filter(r => r.includes('FAIL'));
console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                         : ('ALL ' + results.length + ' CHECKS PASS'));
if (fails.length) process.exitCode = 1;
