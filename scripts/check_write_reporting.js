// Every write that can fail has to be able to say so.
//
// This is the finding that would not stop recurring. The project spent a week
// on silent writes — the roster that never reached the class, the QR codes
// pointing at documents that were never written, every student's practice
// invisible to their teacher, the batch clear that let yesterday's exercise
// stay on the wall — and yesterday's audit found four more, none of them by
// use and all of them by reading.
//
// The empty-catch ratchet does not cover it. An empty catch is one shape of
// the bug; a call with no catch at all is another, and an await inside a
// handler with no try around it is a third. All three end the same way: the
// person is told nothing.
//
// So the rule is about the write, not about the catch. Every call to a
// CloudSync method that WRITES must be able to report failure — through a
// non-empty .catch(), or inside a try whose catch is not empty.
//
//   node scripts/check_write_reporting.js index.html
const fs = require('fs');
const html = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

// The module defines these; everything outside it calls them. Reads are
// exempt: a read that fails leaves the screen as it was, which is a state the
// person can already see. A write that fails leaves a lie on the screen.
const WRITES = ['pushClassroomItem','pushClassroomBatch','pushRoster','pushNote','pushAttempt',
                'pushSummary','shareBirthday','saveProfile','saveTeacherProfile','joinSchool',
                'requestTeacherAccess','approveTeacher','declineTeacher','migrateLegacyStudent',
                'setLiveRound','endLiveRound','sendLiveAnswer','clearLiveAnswers'];

// The module block implements them; it is not a caller.
const moduleAt = html.search(/<script[^>]*type\s*=\s*["']module["']/);
const body = moduleAt === -1 ? html : html.slice(0, moduleAt);

const results = [];
function assert(n, c, detail){
  results.push(n + ': ' + (c ? 'PASS' : 'FAIL'));
  if(!c && detail !== undefined) results.push('    ' + detail);
}

// Where each enclosing function starts, so an uncovered call can be named by
// the thing a person would go and look at.
function enclosing(at){
  const before = body.slice(0, at);
  const m = [...before.matchAll(/(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g)];
  return m.length ? m[m.length - 1][1] : '(top level)';
}

const uncovered = [];
for(const name of WRITES){
  const re = new RegExp('CloudSync[?.]*\\.' + name + '\\s*\\(', 'g');
  let m;
  while((m = re.exec(body))){
    const at = m.index;
    const after = body.slice(at, at + 700);
    // Reported by its own chain: .catch( with something in it.
    const chained = /\.catch\(\s*(?!\)|\s*\)\s*=>\s*\{\s*\})/.test(after)
                    && !/\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(after);
    // Or wrapped: a try above it in the same function, with a catch that has
    // a body. Searched backwards to the function head so a try belonging to
    // some earlier function cannot be credited.
    /* Or handed to a wrapper whose whole job is to report.

       liveWrite() catches, logs, sets a message the teacher's panel draws,
       and redraws it. A call inside one is covered as surely as one inside a
       local try — and demanding a local try as well would push every caller
       to wrap a wrapper, which is how a rule stops being followed. Named
       explicitly rather than inferred: a list somebody has to add to is a
       list somebody has to think about. */
    const REPORTERS = ['liveWrite('];
    const near = body.slice(Math.max(0, at - 400), at);
    const wrapped = REPORTERS.some(w => near.indexOf(w) > -1);

    const fnAt = body.lastIndexOf('function ', at);
    const region = body.slice(fnAt === -1 ? 0 : fnAt, at);
    const tryAbove = region.lastIndexOf('try{') > -1 || region.lastIndexOf('try {') > -1;
    const catchAfter = /catch\s*\([^)]*\)\s*\{\s*[^\s}]/.test(body.slice(at, at + 2500));
    if(!(chained || wrapped || (tryAbove && catchAfter))){
      const line = body.slice(0, at).split('\n').length;
      uncovered.push(name + ' at line ' + line + ', in ' + enclosing(at) + '()');
    }
  }
}

/* A NUMBER, NOT A ZERO, AND ON PURPOSE.

   Set to what survives the day this landed. Every one of these is a real
   call that cannot report its own failure, and each is a small piece of work
   — but a rule introduced as "fix all of them now" is a rule that gets
   reverted at the first inconvenient moment. It may go down and never up. */
const BASELINE = 0;
assert('every CloudSync write can report its own failure (' + uncovered.length + ' of ' + BASELINE + ' uncovered)',
  uncovered.length <= BASELINE, uncovered.join('\n    '));

assert('the list of writes has not quietly shrunk to make this pass',
  WRITES.length >= 18, WRITES.length);

/* AND THE ERRORS NOBODY WROTE A WRITE FOR.

   Every deliberate write reports itself now. A plain programming mistake — a
   renderer throwing on a shape it did not expect — still killed the screen in
   silence, which is the same failure wearing different clothes: the student
   thinks they broke it, the teacher sees somebody who stopped working. */
assert('an uncaught error is caught', body.indexOf("addEventListener('error'") > -1);
assert('and so is a rejected promise nobody handled',
  body.indexOf("addEventListener('unhandledrejection'") > -1);
assert('the person is told, not just the console',
  body.indexOf('stopped working') > -1);
assert('and told their work is safe, which is the part they need',
  body.indexOf('Your practice is saved') > -1);
assert('it offers a way on without a reload, because most of these survive',
  body.indexOf('dismissUnexpected()') > -1);

/* NO STACK TRACES LEAVE THESE PHONES.

   The obvious move is an error-reporting service, and every one of them is a
   third-party script receiving data from a minor's device. This app promises
   their data does not leave except to their teacher, and a convenience only
   the developer enjoys is a poor reason to break it. */
// Matched on script SOURCES, not on any mention of the word. The first
// version of this fired on `scrollbar-width`, which contains "rollbar" — a
// rule that reads the whole file for a brand name will find one eventually,
// and a false alarm in a security-ish check is how people learn to skip it.
{
  const scriptSrcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1]);
  const external = scriptSrcs.filter(u => /sentry|bugsnag|rollbar|logrocket|datadog|fullstory|hotjar/i.test(u));
  assert('no third-party error reporter was added', external.length === 0, external.join(', '));
}

/* THE BAD WIFI, ANSWERED WHERE IT BREAKS.

   Every incident this project fixed started the same way: a write that did
   not reach Firestore because the connection dropped for a second. Reporting
   the failure is right and still leaves the person to retry. A persistent
   cache queues the write and sends it when the network returns, so the second
   becomes a delay instead of a loss. */
{
  const moduleBlock = html.slice(html.search(/<script[^>]*type\s*=\s*["']module["']/));
  assert('Firestore keeps a local cache, so a dropped second is not a lost write',
    moduleBlock.indexOf('persistentLocalCache(') > -1);
  assert('and handles the second tab she runs the classroom screen in',
    moduleBlock.indexOf('persistentMultipleTabManager()') > -1);
}

console.log(results.join('\n'));
const fails = results.filter(r => r.indexOf('FAIL') > -1);
console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                         : ('ALL ' + results.length + ' CHECKS PASS'));
if(fails.length) process.exitCode = 1;
