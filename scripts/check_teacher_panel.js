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

// --- the front door ---
//
// Typing the address lands on the welcome screen; scanning a QR does not.
// There used to be a third case that broke the rule: anyone who had been
// through the door once was sent nowhere at all — no setView ran, so they
// kept whatever currentView was initialised to, which was 'teacher'. A
// student returning to the site on their own phone landed on a teacher
// sign-in wall, and that got worse the day the panel started demanding a
// password.
assert('a shared link goes straight to the student view',
  /if\(openedFromSharedLink\) setView\('student'\);/.test(html));
assert('everyone else lands on the welcome screen',
  /else setView\('welcome'\);/.test(html));
assert('there is no "seen it before" shortcut past the door',
  html.indexOf('cse_entered') === -1 && html.indexOf('skipWelcome') === -1);
assert('the default view is never the sign-in wall',
  /let currentView = 'welcome';/.test(html));
assert('no guide opens by itself on load',
  !/skipWelcome && !localStorage\.getItem\('cse_guide_seen_teacher'\)\) showGuide/.test(html));

// --- the gate exists and covers the class data ---
assert('a signed-in check exists', /function teacherIsSignedIn\(\)/.test(html));
assert('it asks whether the account is a teacher, not just any account',
  /isTeacher/.test(html.slice(html.indexOf('function teacherIsSignedIn'),
                              html.indexOf('function teacherIsSignedIn') + 400)));

const gated = (html.match(/const TEACHER_GATED = \[([^\]]*)\]/) || [])[1] || '';
['roster-box', 'class-progress', 'sec-review', 'sec-share', 'sec-progress', 'sec-individual']
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
// Reading her record is scoped to her too. "Any signed-in user" reads as
// narrow and is not: students never sign in, so every visitor is signed
// in anonymously, and anonymous satisfies it. Her name and school were
// readable by anyone who opened the address — which started mattering the
// moment the app asked her for a full name to show her class.
assert('only she can read her own teacher record',
  /allow read: if isSignedIn\(\) && request\.auth\.uid == uid/.test(teacherRule));
assert('a bare signed-in read is no longer enough',
  !/allow read: if isSignedIn\(\);/.test(teacherRule));

assert('the rules let a teacher update her own document', /allow update:/.test(teacherRule));
assert('only her own', /request\.auth\.uid == uid/.test(teacherRule));
assert('and only the name field', /hasOnly\(\['name'\]\)/.test(teacherRule));
assert('schoolId stays out of reach, so no account can move school',
  teacherRule.indexOf("hasOnly(['name'])") > -1 && !/affectedKeys\(\)\.hasAny/.test(teacherRule));
assert('becoming a teacher is still a console job', /allow create, delete: if false/.test(teacherRule));

// --- the trial run, and feedback that cannot be skipped ---
//
// Two audiences, one mechanism: the teacher deciding whether material is
// good enough for her class, and native speakers judging whether the
// English is natural and the questions fair. Both review the material
// rather than being measured by it.
assert('the teacher has a trial-run tab',
  /id:'grp-trial',\s*label:'Trial run'/.test(html));
assert('it is behind the sign-in like the rest', gated.indexOf('sec-trial') > -1);
assert('the panel is drawn with the others', /renderReviewPanel\(\);/.test(html));

assert('review mode can be switched on', /function setReviewMode\(/.test(html));
assert('and remembered', /REVIEW_KEY/.test(html));
assert('the questions are open, not ratings',
  /const REVIEW_QUESTIONS = \[/.test(html) && !/stars|rating|1-5|out of 5/i.test(
    html.slice(html.indexOf('const REVIEW_QUESTIONS'), html.indexOf('function loadReviewNotes'))));

// The point of the mode: an empty form is refused rather than accepted
// and quietly amounting to nothing.
const submit = html.slice(html.indexOf('function submitReview('),
                          html.indexOf('function mailReview('));
assert('an empty review is refused', /if\(!written\.length\)/.test(submit));
assert('and says what would still be useful', /nothing wrong/i.test(submit));
assert('only the answered questions are kept', /filter\(a => a\.a\.length > 1\)/.test(submit));
assert('the notes are kept for her to read', /saveReviewNote\(/.test(html));
assert('and offered as text she can copy or mail', /mailto:/.test(html.slice(html.indexOf('function mailReview'))));

// While the mode is on, the normal way out of the results screen is
// replaced — otherwise "mandatory" is a suggestion.
const resultScreen = html.slice(html.indexOf('function renderExamResult'),
                                html.indexOf('function leaveExam'));
assert('review mode replaces the ordinary exit from the results screen',
  /reviewMode\(\) \? reviewFormHtml\(ex\)/.test(resultScreen));

// Reviewers who have never met the exam need to know what they are judging.
assert('there is a brief to send to outside reviewers', /const REVIEWER_BRIEF/.test(html));
const brief = html.slice(html.indexOf('const REVIEWER_BRIEF'), html.indexOf('const REVIEWER_BRIEF') + 1400);
assert('it explains what TOEFL is', /TOEFL is the English exam/.test(brief));
assert('it warns them it will feel easy, and why that is fine',
  /find it easy/.test(brief) && /not the point/.test(brief));
assert('it asks for bluntness rather than politeness', /blunt/i.test(brief));
assert('it tells them one section is timed, not all four',
  /ONE of them/.test(brief) && /cannot go back/.test(brief));

// --- the class-day flow lives on one screen ---
//
// This was nine tabs, one per panel, and that split broke the flow three
// times. The plainest case was reported directly: "Use this focus" sets
// the task type and re-renders the picker, the picker is in Generate, and
// she taps the button from This week — so nothing appeared to happen. The
// function was never broken. The effect landed on a tab she was not
// looking at.
//
// It also made the screen impossible to mirror to a TV usefully, since the
// exercise list and its QR codes sat on a different tab from the controls.
const groups = html.slice(html.indexOf('const TEACHER_SECTIONS = ['),
                          html.indexOf('const TEACHER_PANELS'));
assert('the nav is grouped, not one tab per panel', /panels:\s*\[/.test(groups));
assert('there are five groups, not nine tabs',
  (groups.match(/\{ id:'grp-/g) || []).length === 5);

const today = groups.slice(groups.indexOf("id:'grp-today'"), groups.indexOf("id:'grp-class'"));
['sec-progress', 'sec-generate', 'sec-review', 'sec-share'].forEach(p => {
  assert("today carries " + p, today.indexOf(p) > -1);
});
assert('so the plan, the picker, the cards and the codes share one screen',
  ['sec-progress','sec-generate','sec-review','sec-share'].every(p => today.indexOf(p) > -1));

// The roster and the class view are rebuilt inside stable wrappers on every
// change, so the tab has to hide the WRAPPER. Hiding the rebuilt child meant
// adding a student made the roster reappear under Today.
assert('the class group targets the stable wrappers, not the rebuilt children',
  groups.indexOf("'roster-box','class-progress'") > -1);
assert('and the gate does too',
  /TEACHER_GATED = \[[^\]]*'roster-box'[^\]]*'class-progress'/.test(html));

// The reported button must now show its own effect.
const focus = html.slice(html.indexOf('function useThisWeeksFocus'),
                         html.indexOf('function renderProgressBox'));
assert('using the week focus moves to the screen it changed',
  focus.indexOf("showSection(null, 'grp-today'") > -1);
assert('and says what it changed rather than relying on a highlight',
  focus.indexOf('focus-applied') > -1);
assert('the confirmation names the task it set', /Set to ' \+ plan\.label/.test(focus));
assert('there is somewhere for that confirmation to appear',
  html.indexOf('id="focus-applied"') > -1);

// --- tabs, not a scroll position ---
assert('the old scroll-jump is gone', html.indexOf('function jumpToSection') === -1);
assert('the scroll-spy is gone too', html.indexOf('markSectionInView') === -1);
assert('sections are shown one at a time', /function showSection\(/.test(html));
assert('the chosen section is remembered between visits', /TEACHER_SECTION_KEY/.test(html));
assert('an unknown saved section falls back rather than showing nothing',
  /TEACHER_SECTIONS\.some\(g => g\.id === saved\)/.test(html));

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
