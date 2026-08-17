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

// --- signing out is reachable from anywhere ---
//
// The button existed, but only inside the Account panel. Once the panel
// became tabs that put it one click away and effectively invisible —
// reported as "there is no log out". It belongs in the header, which is on
// screen whichever tab is open, and it matters most when a teacher is
// walking away from a shared school computer.
//
// Part of the confusion was upstream: the panel opened with no sign-in, so
// there was nothing to sign out OF. Gating it makes the pair coherent.
const whoAmI = html.slice(html.indexOf('function renderWhoAmI()'),
                          html.indexOf('function renderWhoAmI()') + 900);
assert('the header carries the sign-out, not just the Account panel',
  whoAmI.indexOf('teacherSignOut()') > -1);
assert('it shows who is signed in beside it',
  whoAmI.indexOf('teacherDisplayName(u)') > -1);
assert('and shows nothing to sign out of when nobody is signed in',
  whoAmI.indexOf('u && u.isTeacher') > -1);
assert('signing out actually clears the session',
  /signOutTeacher\(\)/.test(html));
// Line-based, not [^;]*: the call chain is several statements on one line,
// so a "no semicolons between" regex misses text that is plainly there.
// Third time that pattern has produced a false failure in this repo.
const signOutLine = (html.split('\n').find(l => l.indexOf('signOutTeacher()') > -1 && l.indexOf('then') > -1) || '');
assert('and redraws the header afterwards', signOutLine.indexOf('renderWhoAmI') > -1);

// --- a teacher's name is hers, and shown in full ---
//
// She is the authority in the room, and the app refers to her in front of
// her class, so it asks for a first name and surname rather than a
// handle. It also has to let her fix it herself: getting a teacher's name
// wrong in front of her students is not something to need permission for.
assert('one helper decides how she is named everywhere',
  /function teacherDisplayName\(/.test(html));
assert('the header uses it rather than formatting its own',
  html.indexOf('escapeHtml(teacherDisplayName(u))') > -1);
assert('it never shows a bare email where a name belongs',
  /\(u\.name && u\.name\.trim\(\)\) \|\| u\.email/.test(html));

assert('she is asked for a first name and surname',
  /First name and surname/.test(html));
assert('and told why it matters', /Your students see this/.test(html));
assert('a single name is noticed', /function teacherNameLooksPartial\(/.test(html));
// Noticing is not refusing: plenty of people go by one name, and blocking
// the save would be the app overruling her about her own name.
const partial = html.slice(html.indexOf('function teacherNameLooksPartial'),
                           html.indexOf('function saveTeacherDisplayName'));
assert('but a single name is still allowed to be saved',
  partial.indexOf('return') > -1 && !/throw|refus/i.test(partial));

assert('she can save it from the app', /function saveTeacherDisplayName\(/.test(html));
assert('saving goes through CloudSync, not a direct write',
  /CloudSync\.saveTeacherName/.test(html));
assert('the header refreshes after saving',
  html.slice(html.indexOf('function saveTeacherDisplayName')).indexOf('renderWhoAmI()') > -1);

// The rules are what actually enforce this, not the form.
const rules = require('fs').readFileSync(
  require('path').join(require('path').dirname(process.argv[2] === 'index.html' ? '.' : process.argv[2]), 'firestore.rules'), 'utf8');
const teacherRule = rules.slice(rules.indexOf('match /teachers/'),
                                rules.indexOf('match /schools/'));
assert('the rules let a teacher update her own document', /allow update:/.test(teacherRule));
assert('only her own', /request\.auth\.uid == uid/.test(teacherRule));
assert('and only the name field', /hasOnly\(\['name'\]\)/.test(teacherRule));
assert('schoolId stays out of reach, so no account can move school',
  teacherRule.indexOf("hasOnly(['name'])") > -1 && !/affectedKeys\(\)\.hasAny/.test(teacherRule));
assert('becoming a teacher is still a console job', /allow create, delete: if false/.test(teacherRule));

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
