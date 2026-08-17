// Every exercise type must tell the student how the real test does it.
//
// The briefs were written for all twelve types long before every screen
// showed one, and the gap was invisible: a missing brief renders as
// nothing at all, so the screen looks finished. Five types went months
// with text written for them that no student ever saw.
//
// Counting `taskBriefHtml('...')` by hand is what hid it — two screens
// pass the type as a variable, so a grep for quoted names reports them
// missing when they are fine. This checks the two things that actually
// matter instead: every type has a brief written, and every render
// branch reaches taskBriefHtml one way or another.
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');

const results = [];
function assert(n, c){ results.push(n + ': ' + (c ? 'PASS' : 'FAIL')); }

// --- the twelve types, taken from the dispatcher rather than a list I keep ---
const practice = html.slice(html.indexOf('function renderPractice()'));
const branchTypes = [...practice.matchAll(/item\.type\s*===\s*'([a-z-]+)'/g)]
  .map(m => m[1]);
const types = [...new Set(branchTypes)];

assert('renderPractice handles twelve exercise types', types.length === 12);

// --- every type has a brief written for it ---
const briefBlock = html.slice(html.indexOf('const TASK_BRIEF'));
const briefEnd = briefBlock.indexOf('\n};');
const briefs = briefBlock.slice(0, briefEnd);
const written = [...briefs.matchAll(/^\s*'?([a-z-]+)'?:\s*\{\s*real:/gm)].map(m => m[1]);

types.forEach(t => {
  assert('a brief is written for ' + t, written.includes(t));
});

// A brief with an empty half is worse than none: it renders a heading
// promising an explanation and then says nothing.
[...briefs.matchAll(/'?([a-z-]+)'?:\s*\{\s*real:\s*'([^']*)'[^}]*ours:\s*'([^']*)'/g)]
  .forEach(m => {
    assert(m[1] + ' says what the real test does', m[2].trim().length > 20);
    assert(m[1] + ' says what we do differently', m[3].trim().length > 20);
  });

// --- every branch actually renders one ---
// Each branch runs until the `return` that ends it. A branch reaches a
// brief either directly or through a helper it calls, so helpers that
// contain taskBriefHtml count as reaching it too.
const helpersWithBrief = [...html.matchAll(/function (\w+)\s*\([^)]*\)\s*\{/g)]
  .filter(m => {
    const body = html.slice(m.index, html.indexOf('\n}', m.index));
    return body.includes('taskBriefHtml(');
  })
  .map(m => m[1]);

types.forEach(t => {
  const at = practice.indexOf("item.type==='" + t + "'");
  const branch = practice.slice(at, practice.indexOf('return;', at));
  const direct = branch.includes('taskBriefHtml(');
  const viaHelper = helpersWithBrief.some(h => branch.includes(h + '('));
  assert('the ' + t + ' screen shows its brief', direct || viaHelper);
});

// --- the note must be real prose, not a stub ---
assert('briefs name the real test explicitly', html.includes('On the real test:'));
assert('the brief is collapsible, not a wall of text',
  /<details class="brief">/.test(html));

console.log(results.join('\n'));
const fails = results.filter(r => r.includes('FAIL'));
console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                         : ('ALL ' + results.length + ' CHECKS PASS'));
if (fails.length) process.exitCode = 1;
