// The gaps a student types into, and the one way this screen can fail silently.
//
// Complete the Words used to draw the passage with static blanks and ask for
// the whole word in a list underneath. The brief at the top of the task says
// what the real test does -- "you type only the missing letters" -- so the app
// was describing one thing and asking for another, and the stem was drawn
// twice with the student mapping between the two copies in their head.
//
// The gaps are now typed into the passage. The passage is built by rewriting
// the SAME `display` string the preview uses, which keeps one source of truth
// -- and buys the failure this file exists for: the rewrite is a regular
// expression over the markup blankWord() produces, so ANY change to how a
// blank is drawn makes it stop matching, and the exercise then renders with no
// inputs at all. No error, no empty state, just a passage nobody can answer.
// That is why the first assertion is a count and not a spelling.
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');

const results = [];
function assert(n, c, d){
  results.push(n + ': ' + (c ? 'PASS' : 'FAIL'));
  if(!c && d !== undefined) results.push('    got: ' + String(d).slice(0, 200));
}

// --- the rewrite still matches what blankWord actually emits ---
const fnSrc = (html.match(/function completeWordsPassageHtml\(item\)\{[\s\S]*?\n\}/) || [])[0];
assert('the passage builder exists', !!fnSrc);

const blankWordSrc = (html.match(/function blankWord\(word\)\{[\s\S]*?\n\}/) || [])[0] || '';
assert('blankWord still wraps its marks in the span the builder looks for',
  blankWordSrc.indexOf('blank-marks') > -1, blankWordSrc.slice(0, 120));

if(fnSrc){
  const build = new Function('item', 'return (' + fnSrc + ')(item)');
  const mk = (shown, n) => '<span class="blank">' + shown +
    '<span class="blank-marks">' + '_'.repeat(n) + '</span></span>';
  const display = 'Setting clear ' + mk('expect', 6) + ' about ' + mk('cho', 3) +
                  ', and ' + mk('respo', 6) + ' for what each one can do.';
  const out = build({ data: { display } });

  const gaps = (out.match(/class="cw-gap"/g) || []).length;
  assert('every blank in the passage becomes a gap the student can type in',
    gaps === 3, gaps);
  assert('and they are numbered so checkCompleteWords finds them',
    /id="cw-blank-0"/.test(out) && /id="cw-blank-1"/.test(out) && /id="cw-blank-2"/.test(out));

  // The count of missing letters is the whole hint. A gap that says six when
  // five are missing is worse than no hint: the student trusts it.
  assert('each gap is as wide as the letters missing from it',
    (out.match(/--n:(\d+)/g) || []).join(',') === '--n:6,--n:3,--n:6',
    (out.match(/--n:\d+/g) || []).join(','));
  assert('and cannot take more letters than are missing',
    (out.match(/maxlength="(\d+)"/g) || []).join(',') === 'maxlength="6",maxlength="3",maxlength="6"',
    (out.match(/maxlength="\d+"/g) || []).join(','));

  // Four attributes, and every one of them earns its place: without them the
  // phone capitalises the first letter and offers a completion, and the
  // student is then being tested on refusing their own keyboard.
  ['autocomplete="off"', 'autocapitalize="off"', 'autocorrect="off"', 'spellcheck="false"']
    .forEach(a => {
      assert('every gap turns off ' + a.split('=')[0],
        (out.match(new RegExp(a.replace(/"/g, '"'), 'g')) || []).length === 3);
    });

  assert('every gap says what it is, for a screen reader that cannot see the passage',
    (out.match(/aria-label="gap \d+, the word starts [a-z]+, \d+ letters missing"/g) || []).length === 3,
    (out.match(/aria-label="[^"]*"/g) || []).join(' | '));

  // Found on an iPhone, not by reasoning: a line break between the stem and
  // its gap puts 'cho' at the end of one line and its box at the start of the
  // next, which nobody can read.
  assert('the stem and its gap are wrapped so a line break cannot separate them',
    (out.match(/class="cw-word"/g) || []).length === 3);
}

// --- and the rules that only a phone reveals ---
assert('the gap is 16px, because iOS Safari zooms the page in below that',
  /\.cw-gap\{[^}]*font-size:16px/.test(html.replace(/\s+/g, ' ')),
  (html.match(/\.cw-gap\{[^}]*\}/) || [''])[0].slice(0, 120));
assert('and its line box hugs the text, so the marks sit under the letters',
  /\.cw-gap\{[^}]*line-height:1\.15/.test(html.replace(/\s+/g, ' ')));
assert('the marks are drawn from the right, so a typed letter spends one',
  /background-position:right bottom/.test(html.replace(/\s+/g, ' ')));
assert('and they shrink by exactly what has been typed',
  /var\(--typed, 0\)/.test(html) && /setProperty\([^)]*--typed/.test(html));

// --- the old list is gone, not hidden ---
// Two ways to answer the same question is debt: one of them stops being
// tested, and then stops being true.
['cw-input-row', 'cw-blank-input', 'cw-input-hint', 'cw-inputs'].forEach(dead => {
  assert('the list version is gone, including ' + dead, html.indexOf(dead) === -1);
});

console.log(results.join('\n'));
const fails = results.filter(r => r.indexOf('FAIL') > -1);
console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                         : ('ALL ' + results.length + ' CHECKS PASS'));
if(fails.length) process.exitCode = 1;
