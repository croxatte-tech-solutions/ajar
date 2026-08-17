// The student's own page, and being able to leave an exercise.
//
// Reported: pressing "I'm a student" opened straight into an exercise. The
// app did that on purpose when only one was approved, on the theory that a
// list of one is a wasted tap. In practice a student arrived mid-task with
// no sense of where they were, what else existed, or how to get back —
// because there was no way back at all.
//
// Scanning a QR still goes straight in. That student already chose, and the
// code IS the choice; pressing a button labelled "I'm a student" is not.
//
// No side menu here, deliberately. The student has three things to start —
// today's set, free practice, a full section — and a menu would be one more
// decision before any of them. Menus serve the person administering, and
// that is the teacher.
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');

const results = [];
function assert(n, c){ results.push(n + ': ' + (c ? 'PASS' : 'FAIL')); }

// --- nothing opens itself ---
const auto = html.slice(html.indexOf('// No auto-opening any more'),
                        html.indexOf('// No auto-opening any more') + 1200);
assert('the auto-open is gone from the plain entry path',
  auto.indexOf('No auto-opening any more') > -1);
assert('a scanned code still goes straight to its exercise',
  /if\(openedFromSharedLink && batch\.length === 1/.test(html));
assert('and only a scanned code does',
  !/if\(batch\.length===1 && !batch\.some\(i=>i\.id===selectedId\) && !examActive\(\)\)\{/.test(html));

// --- there is a way back ---
assert('a way back exists at all', /function backToMyPage\(/.test(html));
const back = html.slice(html.indexOf('function backToMyPage'),
                        html.indexOf('function mountBackBar'));
assert('going back clears the chosen exercise', /selectedId = null/.test(back));
assert('and the per-type state, so returning starts clean',
  ['_lrState','_interviewState','_crState','_anState','_cvState','_tkState']
    .every(k => back.indexOf(k) > -1));
assert('and stops any running task timer', /clearPracticeTimer\(\)/.test(back));
assert('and redraws the student page', /renderStudent\(\)/.test(back));

// A section has its own clock and its own exit. A wandering-out button
// there reads as a way to lose a timed sitting by accident.
assert('going back refuses during a section', /if\(examActive\(\)\) return;/.test(back));
const bar = html.slice(html.indexOf('function mountBackBar'),
                       html.indexOf('function renderPractice'));
assert('and the button is not even shown during one',
  /!examActive\(\)/.test(bar));
assert('the bar is shown only when an exercise is open',
  /!!selectedId && !examActive\(\)/.test(bar));

// --- mounted where twelve branches cannot lose it ---
// renderPractice ends in a return inside each of its twelve branches, which
// is exactly how the footer and the section clock went missing from some
// screens and not others.
assert('the bar mounts outside the wrap that gets replaced',
  /wrap\.parentNode\.insertBefore\(bar, wrap\)/.test(bar));
// The wrapper gained ensureWayForward, which is the point of having a wrapper:
// a safety net added once instead of in each of the twelve branches. Listen and
// Repeat was the branch that forgot its footer, which dead-ended the Speaking
// section — so this asserts the net is there, not just the bar.
{
  const flat = html.replace(/\n/g, ' ').replace(/\s+/g, ' ');
  assert('renderPractice is wrapped rather than edited twelve times',
    /function renderPractice\(\)\{ renderPracticeInner\(\); ensureWayForward\(\); mountBackBar\(\); bringPracticeIntoView\(\);/.test(flat));
  assert('and the net runs before the bars, so it sees the finished screen',
    flat.indexOf('ensureWayForward();') < flat.indexOf('mountBackBar(); bringPracticeIntoView();'));
}
assert('no screen with an exercise open is left without a way off it',
  /function ensureWayForward\(\)/.test(html));
assert('the start gate is exempt, since its whole job is its own button',
  /start-gate-btn'\) > -1\) return;/.test(html));
assert('a finished footer is left alone rather than doubled',
  /practiceAgain\('\) > -1 \|\| html\.indexOf\('exam-footer'\) > -1\) return;/.test(html));
assert('the real work moved to renderPracticeInner', /function renderPracticeInner\(\)/.test(html));

// --- no side menu on the student side ---
// view-student is the LAST of the three views in the markup, so the slice
// runs to the end of the file rather than to view-welcome, which comes
// first. Slicing backwards gave an empty string and three assertions that
// failed on markup that was plainly there.
const svStart = html.indexOf('id="view-student"');
const svEnd = html.indexOf('<script', svStart);   // markup only, not the code below it
const studentView = html.slice(svStart, svEnd > svStart ? svEnd : undefined);
assert('the student page has no nav rail of its own',
  studentView.indexOf('teacher-nav') === -1 && !/<nav/.test(studentView));
assert('it still carries the list of what the teacher approved',
  studentView.indexOf('scenario-list') > -1);
assert('and the exercise area', studentView.indexOf('practice-wrap') > -1);
assert('and the teacher\'s note and announcement',
  studentView.indexOf('student-note') > -1 && studentView.indexOf('announcement-banner') > -1);

console.log(results.join('\n'));
const fails = results.filter(r => r.includes('FAIL'));
console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                         : ('ALL ' + results.length + ' CHECKS PASS'));
if (fails.length) process.exitCode = 1;
