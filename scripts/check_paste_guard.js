// Pasting into the fields where a student produces their own language.
//
// The risk in a guard like this is not that it fails to block — it is
// that it blocks the wrong people. The teacher pastes a notice into an
// announcement; a student writes feedback in their own language and
// pastes it from wherever they drafted it. Neither is cheating, and a
// guard that catches them makes the app worse while stopping nothing.
//
// So this checks both directions: blocked where an answer is produced,
// and out of the way everywhere else.
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');

const results = [];
function assert(n, c){ results.push(n + ': ' + (c ? 'PASS' : 'FAIL')); }

// --- which fields are guarded ---
const guarded = (html.match(/const GUARDED_FIELDS\s*=\s*\[([^\]]*)\]/) || [])[1] || '';
const list = [...guarded.matchAll(/'([^']+)'/g)].map(m => m[1]);

assert('the writing answer is guarded', list.includes('response'));
assert('the typed interview answer is guarded', list.includes('interview-answer'));
assert('the named list is exactly the two long-answer fields', list.length === 2);
// The gaps in Complete the Words are produced answers too -- the student
// supplies the letters -- and they arrive as a dozen ids rather than one, so
// the guard matches them by class. Covering the long answers and leaving the
// short ones open would not be a guard, it would be a preference about typing.
assert('and every gap in Complete the Words is guarded with them',
  /classList\.contains\(['"]cw-gap['"]\)/.test(html));
assert('the gaps really are that class, so the guard is not aimed at nothing',
  /class="cw-gap"/.test(html) || /class=.cw-gap/.test(html));

// The fields a guard must NOT touch. Each is a place someone legitimately
// pastes: the teacher composing, or a student writing feedback in their
// own language.
['announcement-text', 'fb-good', 'fb-change', 'fb-copy-text'].forEach(id => {
  assert('the ' + id + ' field is left alone', !list.includes(id));
});
assert('the teacher note field is left alone',
  !list.some(id => id.indexOf('note') > -1 && id !== 'paste-note'));

// --- all three routes are covered ---
// Blocking only the paste event leaves drag-and-drop wide open, and
// leaves anything the browser inserts without calling it a paste.
assert('the keyboard paste is intercepted', /addEventListener\('paste'/.test(html));
assert('dragging text in is intercepted', /addEventListener\('drop'/.test(html));
assert('a sudden jump in length is caught whatever the route',
  /addEventListener\('input'/.test(html));

// Capture phase, so a field's own handler cannot swallow the event first.
const listeners = [...html.matchAll(/addEventListener\('(paste|drop|input)'[\s\S]{0,600}?\}, (true|false)\)/g)];
assert('the guards run in the capture phase', listeners.length === 3 && listeners.every(m => m[2] === 'true'));

// --- a short edit still goes through ---
const max = Number((html.match(/const PASTE_MAX_CHARS\s*=\s*(\d+)/) || [])[1]);
assert('a threshold is set', Number.isFinite(max) && max > 0);
assert('a word or short phrase still pastes', max >= 10);
assert('a paragraph does not', max <= 60);

// --- the student is told, in both places it can happen ---
// A block with no explanation reads as the app being broken.
assert('a place to show the message exists on the writing screen',
  (html.match(/id="paste-note"/g) || []).length >= 2);
assert('the message says what to do instead', /own words/.test(html));
assert('the rule is stated before it is hit', /pasting a whole passage in is off/.test(html));

// --- reverting must not leave the word count lying ---
// The count drives the 80-120 and 100-word guidance; if a blocked paste
// left it reading the length of text no longer in the box, the student
// would be pacing against a number that is not true.
const inputGuard = (html.match(/addEventListener\('input'[\s\S]*?\}, true\)/) || [''])[0];
assert('a reverted paste refreshes the word count', /updateWordcount/.test(inputGuard));
assert('the revert restores what was there before', /el\.value = before/.test(inputGuard));

console.log(results.join('\n'));
const fails = results.filter(r => r.includes('FAIL'));
console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                         : ('ALL ' + results.length + ' CHECKS PASS'));
if (fails.length) process.exitCode = 1;
