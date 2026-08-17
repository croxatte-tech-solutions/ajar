// The classes of mistake this project has actually made, as a standing check.
//
// Not a general-purpose linter. ESLint would be the reflex, and it is the
// wrong tool here: this app is one HTML file with no modules, no build step
// and no package.json, so ESLint means adopting an npm toolchain to police
// a file it cannot parse whole. What it would catch that matters — dangling
// references, dead handlers, missing labels — is cheap to check directly, and
// what it would catch that does not matter would drown the signal.
//
// Every rule below is here because the mistake was made, not because a style
// guide recommends it. Anything that has never gone wrong is not in here.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(process.argv[2], 'utf8');

const results = [];
function assert(n, c, detail){
  results.push(n + ': ' + (c ? 'PASS' : 'FAIL'));
  if(!c && detail) results.push('    ' + detail);
}

//=====================================================================
// SECRETS
//=====================================================================
// The repository is public. A key here is a key published.
const SECRET_PATTERNS = [
  ['a Google/Firebase private key', /"?private_key"?\s*:/],
  ['an OpenAI-style key',           /\bsk-[A-Za-z0-9]{20,}/],
  ['a GitHub token',                /\bgh[pousr]_[A-Za-z0-9]{20,}/],
  ['a Slack token',                 /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['an AWS access key',             /\bAKIA[0-9A-Z]{16}\b/],
  ['a bearer token',                /Bearer\s+[A-Za-z0-9._~+/-]{20,}/],
  ['a hardcoded password value',    /(?:password|passwd|pwd)\s*[:=]\s*["'][^"'\s]{6,}["']/i],
];
const files = ['index.html', 'sw.js', 'manifest.json', '_headers', 'firestore.rules'];
SECRET_PATTERNS.forEach(([label, re]) => {
  const hits = files.filter(f => {
    try{ return re.test(fs.readFileSync(path.join(path.dirname(process.argv[2]), f), 'utf8')); }
    catch(e){ return false; }
  });
  assert('no ' + label + ' is committed', hits.length === 0, hits.join(', '));
});
// The Firebase web config is NOT a secret — it is a public identifier, and
// firestore.rules is what actually protects the data. Asserted so nobody
// "fixes" it by hiding it and assumes the data got safer.
assert('the Firebase web config is present and treated as public',
  /apiKey:\s*"/.test(html) && fs.existsSync(path.join(path.dirname(process.argv[2]), 'firestore.rules')));
// teacherEmail must stay empty: a real address here is a real person's login
// sitting in a public file.
assert('no teacher account address is hardcoded',
  /teacherEmail:\s*''/.test(html));

//=====================================================================
// DANGLING REFERENCES
//=====================================================================
// An onclick naming a function that does not exist fails silently — the
// button simply does nothing, which is exactly how "Use this focus" was
// reported.
const defined = new Set([
  ...[...html.matchAll(/function\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1]),
  ...[...html.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function|\(|async)/g)].map(m => m[1]),
]);
const ATTR_HANDLERS = /\bon(?:click|change|input|submit|focus|blur)="\s*([A-Za-z_$][\w$]*)\s*\(/g;
const called = new Set([...html.matchAll(ATTR_HANDLERS)].map(m => m[1]));
const JS_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'return', 'typeof', 'void']);
const missingFns = [...called].filter(c => !defined.has(c) && !JS_KEYWORDS.has(c));
assert('every inline handler names a function that exists',
  missingFns.length === 0, missingFns.join(', '));

// getElementById on an id that is neither in the markup nor created in code.
const markupIds = new Set([...html.matchAll(/id="([^"${]+)"/g)].map(m => m[1]));
const createdIds = new Set([...html.matchAll(/\.id\s*=\s*'([^']+)'/g)].map(m => m[1]));
const looked = new Set([...html.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]));
const missingIds = [...looked].filter(i => !markupIds.has(i) && !createdIds.has(i));
assert('every element looked up by id exists somewhere',
  missingIds.length === 0, missingIds.join(', '));

//=====================================================================
// ACCESSIBLE NAMES
//=====================================================================
// A button whose whole label is an emoji or an arrow announces as that
// character, or as nothing.
const ICON_ONLY = /<button(?![^>]*aria-label)[^>]*>\s*(?:[\u{1F300}-\u{1FAFF}\u{2190}-\u{21FF}\u{25A0}-\u{27BF}✖✓↺↻]|&[a-z]+;)\s*<\/button>/gu;
const unlabelled = [...html.matchAll(ICON_ONLY)].map(m => m[0].slice(0, 60));
assert('no icon-only button is left without a label',
  unlabelled.length === 0, unlabelled.join(' | '));

// Every text-ish input needs a label or an aria-label. A placeholder is not
// a label: it disappears the moment someone types.
const inputs = [...html.matchAll(/<(input|textarea|select)\b([^>]*)>/g)]
  .filter(m => !/type="(?:hidden|checkbox|radio)"/.test(m[2]))
  // A bare <select> or <textarea> with no attributes at all is prose — this
  // file discusses its own markup in comments, and the scan reads comments
  // too. A real control here always carries at least an id or a class, and
  // one with no attributes could not be reached by any code anyway.
  .filter(m => m[2].trim().length > 0);
const labelled = new Set([...html.matchAll(/<label[^>]*for="([^"${]+)"/g)].map(m => m[1]));
const bare = inputs.filter(m => {
  if(/aria-label/.test(m[2])) return false;
  const id = (m[2].match(/id="([^"${]+)"/) || [])[1];
  if(id && labelled.has(id)) return false;
  // Template-built ids are labelled by template-built <label for>, which the
  // two static scans above cannot pair up. Checked by eye instead of guessed.
  if(/id="[^"]*\$\{/.test(m[2])) return false;
  return true;
});
assert('every input has a label or an aria-label',
  bare.length === 0, bare.map(m => m[0].slice(0, 70)).join(' | '));

// Focus has to be visible, or the app cannot be used from a keyboard.
assert('keyboard focus is visible on buttons', /\.btn:focus-visible/.test(html));
assert('and on the panel navigation', /#teacher-nav a:focus-visible/.test(html));

// A clock that changes on its own says nothing to a screen reader unless the
// region is live.
assert('the task clock is announced', /id="task-timer"[^>]*aria-live/.test(html));
assert('the section clock is announced', /id="exam-clock"[^>]*aria-live/.test(html));

//=====================================================================
// FRAGILE STRING BUILDING
//=====================================================================
// speak('${text}') used to be built inside an onclick attribute, where one
// double quote in the text ended the attribute early and left invalid
// JavaScript — the audio button then did nothing at all, silently. The text
// travels as a data attribute now, set through textContent, so no character
// in it means anything.
//
// Asserted as ZERO rather than as a known count: the point is that the old
// shape is gone and cannot come back one site at a time.
// Comments stripped first — BLOCK comments too, which is what the previous
// attempt missed: the passage in index.html documenting this very mistake is a
// /* */ block whose continuation lines start with plain spaces, so a
// line-prefix filter left them in. Third time a rule in this file has reported
// its own subject matter, and the second time the fix was itself too narrow.
const codeOnly = html
  .replace(/\/\*[\s\S]*?\*\//g, ' ')      // /* ... */ in both CSS and JS
  .replace(/^\s*\/\/.*$/gm, ' ');          // // to end of line
const speakSites = [...codeOnly.matchAll(/onclick="speak\('/g)].length;
assert('no spoken text is interpolated into an attribute', speakSites === 0);
assert('spoken text travels as data', /data-speak="/.test(html));
assert('and one delegated listener handles all of them',
  /closest\('\[data-speak\]'\)/.test(html));

//=====================================================================
// COMMENTS THAT NO LONGER DESCRIBE THE CODE
//=====================================================================
// The pattern that has cost the most time on this project: prose that
// contradicts the logic beside it, believed over the logic.
assert('no comment still claims the app is on GitHub Pages as a live fact',
  !/GitHub Pages (?:sends|forces) "?Cache-Control/.test(html));
// Narrowed after it fired on its own subject matter. The file mentions 1220px
// once, inside a comment ABOUT having got the number wrong — a record of the
// mistake, not the mistake. So this looks for a claim, not a mention.
assert('no comment asserts a breakpoint the stylesheet does not have',
  !/(?:breakpoint|from|above|min-width)[^.\n]{0,20}\b1220px\b/.test(html)
  && /min-width:\s*1400px/.test(html));

//=====================================================================
// FALLBACKS THAT SWALLOW EVERYTHING
//=====================================================================
// A ratchet, not a ban. All 21 empty catches in the file today guard the same
// three things — localStorage in private mode, an absent CloudSync, a DOM node
// that may not be mounted — and each has a working fallback on the next line.
// Demanding a comment on every one retroactively would be style noise, and a
// checker that cries wolf is a checker that gets ignored.
//
// What matters is that the number does not quietly grow. A new empty catch is
// a new place a real failure can hide, and it should be a deliberate decision
// with this number moved by hand.
// 21 -> 23: currentSchool() gained two localStorage guards when the school id
// came out of the config and the device started remembering it from the link.
// Same known class as the other 21 — private-mode Safari throws, and there is
// a working fallback on the next line. Moved by hand, which is the point of a
// baseline rather than a ban.
const SILENT_CATCH_BASELINE = 23;
const silent = [...html.matchAll(/catch\s*\(\s*\w*\s*\)\s*\{\s*\}/g)].length;
assert('no new silent catch block has appeared (' + silent + ' of ' + SILENT_CATCH_BASELINE + ')',
  silent <= SILENT_CATCH_BASELINE,
  'was ' + SILENT_CATCH_BASELINE + ', now ' + silent + ' — if the new one is deliberate, move the baseline');

console.log(results.join('\n'));
const fails = results.filter(r => r.includes('FAIL'));
console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                         : ('ALL ' + results.length + ' CHECKS PASS'));
if(fails.length) process.exitCode = 1;
