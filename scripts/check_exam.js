// The Reading section sat under test conditions.
//
// Two things here are easy to get wrong in ways nobody notices until a
// student is halfway through a real sitting:
//
// 1. The section must total exactly the published item count. Two of the
//    three task types are fixed size, but Read in Daily Life carries two
//    questions or three, so the remainder is filled by draws of 2 and 3.
//    Filling 10 that way can strand you on 1 (10-3-3-3), which no draw
//    can finish — an infinite loop, or a section quietly short of 50.
//
// 2. A sat section must not touch the practice log. That is what keeps a
//    rehearsal out of the day's best score and out of the patterns the
//    teacher reads.
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/type\s*=\s*["']module["']/.test(m[1]))
  .map(m => m[2]);

const store = {};
const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
// The exam mounts and unmounts its own clock bar as a sibling of the
// practice wrap, so the stub needs the node-level methods that involves —
// remove, insertBefore, parentNode — not just the read-only shape the
// other checks get by with.
const el = () => {
  const node = {
    style: {}, innerHTML: '', textContent: '', value: '', id: '',
    classList: { toggle(){}, add(){}, remove(){}, contains: () => false },
    appendChild(){}, addEventListener(){}, querySelector: () => el(),
    querySelectorAll: () => [], closest: () => null, select(){}, focus(){},
    remove(){}, insertBefore(){},
    getBoundingClientRect: () => ({ top:0, left:0, width:0, height:0 }),
  };
  node.parentNode = { insertBefore(){}, removeChild(){} };
  return node;
};

const testScript = `
(async () => {
  const results = [];
  function assert(n, c){ results.push(n + ': ' + (c ? 'PASS' : 'FAIL')); }

  const cfg = EXAM_SECTIONS.reading;

  // --- the published figures, and where they come from ---
  assert('the Reading section is 50 items', cfg.items === 50);
  assert('the Reading section is 30 minutes', cfg.seconds === 30 * 60);
  assert('the brief quotes the same figures the exam uses',
    TASK_BRIEF['complete-words'].ours.indexOf(String(cfg.items)) > -1);

  // --- composition totals exactly 50, every time ---
  // Run it enough times to hit the awkward draws rather than the lucky ones.
  let totals = {}, worst = null;
  for(let i = 0; i < 60; i++){
    const items = buildExamItems(cfg);
    const n = items.reduce((s, it) => s + examQuestionCount(it), 0);
    totals[n] = (totals[n] || 0) + 1;
    if(n !== cfg.items) worst = { n, i };
  }
  assert('every built section totals exactly 50 questions (60 builds)',
    Object.keys(totals).length === 1 && totals[cfg.items] === 60);
  if(worst) results.push('  built ' + worst.n + ' on run ' + worst.i);

  // --- only Reading task types appear ---
  const built = buildExamItems(cfg);
  const kinds = [...new Set(built.map(i => i.type))].sort();
  assert('only the three Reading task types appear',
    JSON.stringify(kinds) === JSON.stringify(['complete-words','daily-read','passage']));
  assert('no Listening or Speaking task sneaks in',
    !built.some(i => ['talk','conversation','announcement','interview','listen-repeat','choose-response'].includes(i.type)));

  // --- the fixed-size types are drawn by the plan ---
  const count = t => built.filter(i => i.type === t).length;
  assert('two Complete the Words sets', count('complete-words') === 2);
  assert('four academic passages', count('passage') === 4);
  assert('Complete the Words carries ten gaps each',
    built.filter(i => i.type === 'complete-words').every(i => examQuestionCount(i) === 10));
  assert('each passage carries five questions',
    built.filter(i => i.type === 'passage').every(i => examQuestionCount(i) === 5));
  assert('Daily Life fills exactly the remaining ten',
    built.filter(i => i.type === 'daily-read').reduce((s,i) => s + examQuestionCount(i), 0) === 10);

  // --- the order is not the plan's order ---
  // Without a shuffle a student meets all the passages together, which
  // makes the section easier to pace than the real one.
  const firstTypes = [];
  for(let i = 0; i < 12; i++) firstTypes.push(buildExamItems(cfg)[0].type);
  assert('the running order varies between sittings', new Set(firstTypes).size > 1);

  // --- a sat section never reaches the practice log ---
  localStorage.removeItem('cse_usage_log_by_name');
  setStudentName('Test Student');
  startExam('reading');
  assert('an exam is now in progress', examActive());

  logUsage('passage', 'campus', 1);
  logUsage('daily-read', 'money', 0.5);
  assert('practising during an exam writes nothing to the practice log',
    localStorage.getItem('cse_usage_log_by_name') === null);

  const mid = JSON.parse(localStorage.getItem('ajar_exam_current'));
  assert('the exam counted those answers instead', mid.answered > 0);

  // =====================================================
  // LISTENING
  // =====================================================
  const lis = EXAM_SECTIONS.listening;

  assert('the Listening section is 47 items', lis.items === 47);
  assert('the Listening section is 29 minutes', lis.seconds === 29 * 60);
  assert('Listening needs no variable-size fill', lis.fill === null);

  // Two listening types nest their questions inside a set. Counting one
  // of those as a single item would build a section far short of 47 while
  // still calling itself 47.
  const anItem = { data: generateOne('announcement', 'campus').data };
  const crItem = { data: generateOne('choose-response', 'campus').data };
  assert('an announcement set counts every question inside it', examQuestionCount(anItem) === 4);
  assert('a Choose a Response set counts every exchange', examQuestionCount(crItem) === 5);
  assert('a set is not counted as one item', examQuestionCount(anItem) > 1);

  let lisTotals = {};
  for(let i = 0; i < 40; i++){
    const items = buildExamItems(lis);
    lisTotals[items.reduce((s, it) => s + examQuestionCount(it), 0)] = 1;
  }
  assert('every Listening section totals exactly 47 (40 builds)',
    Object.keys(lisTotals).length === 1 && lisTotals[47] === 1);

  const lisBuilt = buildExamItems(lis);
  const lisKinds = [...new Set(lisBuilt.map(i => i.type))].sort();
  assert('only the four Listening task types appear',
    JSON.stringify(lisKinds) === JSON.stringify(['announcement','choose-response','conversation','talk']));
  assert('no Reading task appears in Listening',
    !lisBuilt.some(i => ['complete-words','passage','daily-read'].includes(i.type)));
  assert('Reading and Listening share no task type',
    !Object.keys(EXAM_SECTIONS.reading.fixed).some(t => Object.keys(lis.fixed).includes(t)));

  // --- one listen in a section, two in practice ---
  // The single fact a Listening rehearsal exists to teach.
  localStorage.removeItem('ajar_exam_current');
  assert('practice gives two listens for an announcement', maxListens('announcement') === 2);
  assert('practice gives two listens for a talk', maxListens('talk') === 2);
  assert('practice gives two listens for a conversation', maxListens('conversation') === 2);
  assert('practice gives two listens for Choose a Response', maxListens('choose-response') === 2);

  startExam('listening');
  assert('a section gives one listen for an announcement', maxListens('announcement') === 1);
  assert('a section gives one listen for a talk', maxListens('talk') === 1);
  assert('a section gives one listen for a conversation', maxListens('conversation') === 1);
  assert('a section gives one listen for Choose a Response', maxListens('choose-response') === 1);
  assert('the out-of-listens note does not claim two were given',
    listensSpentNote('answer').indexOf('Both listens') === -1);
  assert('and says there was one listen, as on test day',
    listensSpentNote('answer').indexOf('One listen') > -1);

  // The sentence that tells the student how many listens they get has to
  // agree with how many they get. Found on a real iPhone: inside a
  // Listening section the screen said "you will hear it at most twice"
  // while maxListens() correctly returned 1. The limit was right; the
  // sentence describing it was three separate hardcoded strings.
  assert('a section promises one listen, not two',
    listensAheadNote().indexOf('once only') > -1);
  assert('and does not still say twice', listensAheadNote().indexOf('twice') === -1);
  assert('nothing hardcodes the promise any more',
    (HTML_SOURCE.split('Press listen to begin. You will hear').length - 1) === 0);

  // The brief must stop promising a second listen while the section is
  // taking it away, or it contradicts the screen it sits on.
  const briefInExam = taskBriefHtml('talk');
  assert('the brief drops the two-listen promise during a section',
    briefInExam.indexOf('Two listens here') === -1);
  assert('the brief says the audio plays once instead', briefInExam.indexOf('once') > -1);

  finishExam('completed');
  assert('two listens return once the section is over', maxListens('talk') === 2);
  assert('and so does the practice brief', taskBriefHtml('talk').indexOf('Two listens here') > -1);

  // A Reading section must not quietly change the audio rules, since it
  // has no audio to change.
  localStorage.removeItem('ajar_exam_current');
  startExam('reading');
  assert('a Reading section still limits listening to one, not two',
    maxListens('talk') === 1);
  finishExam('completed');

  // =====================================================
  // SPEAKING — the section that admits most
  // =====================================================
  const sp = EXAM_SECTIONS.speaking;

  assert('the Speaking section is 11 items', sp.items === 11);
  assert('the Speaking section is 8 minutes', sp.seconds === 8 * 60);
  assert('one repeat set and one interview', sp.fixed['listen-repeat'] === 1 && sp.fixed.interview === 1);
  // 7 + 4 is not an arrangement of ours: a repeat set IS seven sentences
  // and an interview IS four questions.
  assert('which is exactly eleven without padding',
    examQuestionCount({ data: generateOne('listen-repeat','campus').data }) +
    examQuestionCount({ data: generateOne('interview','campus').data }) === 11);

  let spTotals = {};
  for(let i = 0; i < 25; i++){
    spTotals[buildExamItems(sp).reduce((n, it) => n + examQuestionCount(it), 0)] = 1;
  }
  assert('every Speaking section totals exactly 11 (25 builds)',
    Object.keys(spTotals).length === 1 && spTotals[11] === 1);

  // Repeat Accuracy is judgeable: the target sentence is known, so a
  // transcript can be aligned against it. How someone sounds is not.
  assert('the repeated sentences are marked', examIsScored(sp, 'listen-repeat'));
  assert('the interview is not', !examIsScored(sp, 'interview'));
  assert('the band is out of the seven it can mark', examScoredItems(sp, buildExamItems(sp)) === 7);
  assert('all seven right is band 6', examBand(7, examScoredItems(sp, buildExamItems(sp))) === 6);
  assert('scoring out of eleven would have capped an honest student',
    examBand(7, sp.items) < 6);

  localStorage.removeItem('ajar_exam_current');
  startExam('speaking');
  const spItems = JSON.parse(localStorage.getItem('ajar_exam_current')).items;
  let spSt = JSON.parse(localStorage.getItem('ajar_exam_current'));
  spSt.idx = spItems.findIndex(i => i.type === 'listen-repeat');
  localStorage.setItem('ajar_exam_current', JSON.stringify(spSt));
  logUsage('listen-repeat', 'campus', 1);
  let spAfter = JSON.parse(localStorage.getItem('ajar_exam_current'));
  assert('a perfect repeat set scores all seven', spAfter.correct === 7);

  spSt = JSON.parse(localStorage.getItem('ajar_exam_current'));
  spSt.idx = spItems.findIndex(i => i.type === 'interview');
  localStorage.setItem('ajar_exam_current', JSON.stringify(spSt));
  logUsage('interview', 'campus', 1);
  spAfter = JSON.parse(localStorage.getItem('ajar_exam_current'));
  assert('the interview adds nothing to the score', spAfter.correct === 7);
  assert('but it is handed over rather than dropped', (spAfter.written || []).length === 1);
  assert('kept as the interview it answers', spAfter.written[0].type === 'interview');
  finishExam('completed');
  localStorage.removeItem('ajar_exam_current');

  // The interview answer lives in its own field, so the capture has to
  // know about both — reading only #response handed over an empty answer.
  assert('the capture reads the interview field too',
    HTML_SOURCE.indexOf("getElementById('interview-answer')") > -1 &&
    HTML_SOURCE.slice(HTML_SOURCE.indexOf('function recordExamOutcome'),
                      HTML_SOURCE.indexOf('function advanceExam'))
      .indexOf('interview-answer') > -1);

  assert('all four sections can now be sat', Object.keys(EXAM_SECTIONS).length === 4);
  assert('the four together are the full test',
    Object.values(EXAM_SECTIONS).reduce((n, c) => n + c.items, 0) === 120 &&
    Math.round(Object.values(EXAM_SECTIONS).reduce((n, c) => n + c.seconds, 0) / 60) === 90);

  // --- there must always be a way forward ---
  //
  // This is the one that got shipped broken. Every type ends its last
  // question on a "Done — 3 of 4 correct" screen whose only control is
  // the footer, and in a section that footer offered "Try another one
  // like this" — which re-draws the same type instead of advancing.
  // Nothing else moved the section on: goToNextExercise is reached only
  // from the per-task timer expiring, and a section turns that timer off.
  // So a student who answered an exercise had nothing to click, and the
  // section stopped dead with the clock still running.
  //
  // My checks all drove advanceExam() directly, so every one of them
  // passed while the screen had no button to call it.
  localStorage.removeItem('ajar_exam_current');
  assert('practice offers another draw of the same type',
    practiceFooter().indexOf('practiceAgain()') > -1);

  startExam('listening');
  assert('a section offers a way forward instead',
    practiceFooter().indexOf('advanceExam()') > -1);
  assert('a section does not offer to re-draw the exercise',
    practiceFooter().indexOf('practiceAgain()') === -1);
  assert('the finished screen offers the next exercise',
    practiceFooter(true).indexOf('Next exercise') > -1);

  // Several exercises carry their own "Next question" control for moving
  // WITHIN the exercise. A footer beside it also reading "Next" means
  // something else — leave the exercise — and a student one question from
  // the end who reads them as the same thing silently loses a mark.
  assert('mid-exercise the footer says it skips, not that it is next',
    practiceFooter(false).indexOf('Skip this exercise') > -1);
  assert('mid-exercise the footer does not just say Next',
    practiceFooter(false).indexOf('Next exercise') === -1);
  assert('the two footers do not read the same',
    practiceFooter(true) !== practiceFooter(false));
  assert('skipping is the quieter of the two controls',
    practiceFooter(false).indexOf('ghost') > -1 && practiceFooter(true).indexOf('ghost') === -1);
  finishExam('completed');
  assert('the practice footer comes back afterwards',
    practiceFooter().indexOf('practiceAgain()') > -1);

  // Nothing may render the old constant directly — that is exactly how
  // the dead end happened, and a new exercise type would reintroduce it.
  // Plain split, not a regex: this code is itself inside a template
  // literal, so a backslash escape is eaten before the regex ever sees it
  // and /\+/ arrives as /+/ — "nothing to repeat".
  const midExercise = HTML_SOURCE.split('+= practiceFooter();').length - 1;
  const onDone = HTML_SOURCE.split('+ practiceFooter(true);').length - 1;
  assert('every exercise renders the footer through the swap, not the constant',
    midExercise + onDone >= 15);
  assert('the finished screens are the ones marked done', onDone >= 5);
  assert('and the live ones are not', midExercise >= 8);
  assert('the raw constant is referenced only where it is defined and returned',
    (HTML_SOURCE.match(/PRACTICE_AGAIN_BTN/g) || []).length === 2);

  // =====================================================
  // WRITING — where the app must admit what it cannot mark
  // =====================================================
  const wr = EXAM_SECTIONS.writing;

  assert('the Writing section is 12 items', wr.items === 12);
  assert('the Writing section is 23 minutes', wr.seconds === 23 * 60);
  assert('the brief quotes the same Writing figures',
    TASK_BRIEF.sentence.ours.indexOf('12 items') > -1);
  assert('ten sentences, one email, one discussion',
    wr.fixed.sentence === 10 && wr.fixed.email === 1 && wr.fixed.discussion === 1);

  // The heart of it: prose is delivered, not scored.
  assert('Build a Sentence is markable by this app', examIsScored(wr, 'sentence'));
  assert('an email is not', !examIsScored(wr, 'email'));
  assert('a discussion post is not', !examIsScored(wr, 'discussion'));
  assert('the band is out of the ten it can mark, not twelve',
    examScoredItems(wr, buildExamItems(wr)) === 10);
  assert('sections that can mark everything are unaffected',
    examScoredItems(EXAM_SECTIONS.reading, buildExamItems(EXAM_SECTIONS.reading)) === 50 &&
    examScoredItems(EXAM_SECTIONS.listening, buildExamItems(EXAM_SECTIONS.listening)) === 47);
  assert('and they score every type', examIsScored(EXAM_SECTIONS.reading, 'passage'));

  let wrTotals = {};
  for(let i = 0; i < 30; i++){
    const items = buildExamItems(wr);
    wrTotals[items.reduce((s, it) => s + examQuestionCount(it), 0)] = 1;
  }
  assert('every Writing section totals exactly 12 (30 builds)',
    Object.keys(wrTotals).length === 1 && wrTotals[12] === 1);

  // What arrives for an email is whether its word count sat in range —
  // a pacing hint. Letting that into the band would put a number on prose
  // nobody read, and teach students to write to a length.
  localStorage.removeItem('ajar_exam_current');
  startExam('writing');
  const wrItems = JSON.parse(localStorage.getItem('ajar_exam_current')).items;

  const sentIdx = wrItems.findIndex(i => i.type === 'sentence');
  let wrSt = JSON.parse(localStorage.getItem('ajar_exam_current'));
  wrSt.idx = sentIdx; localStorage.setItem('ajar_exam_current', JSON.stringify(wrSt));
  logUsage('sentence', wrItems[sentIdx].theme, 1);
  let wrAfter = JSON.parse(localStorage.getItem('ajar_exam_current'));
  assert('a correct sentence counts towards the band', wrAfter.correct === 1);
  assert('and counts as answered', wrAfter.answered === 1);

  const emailIdx = wrItems.findIndex(i => i.type === 'email');
  wrSt = JSON.parse(localStorage.getItem('ajar_exam_current'));
  wrSt.idx = emailIdx; localStorage.setItem('ajar_exam_current', JSON.stringify(wrSt));
  logUsage('email', wrItems[emailIdx].theme, 1);   // "in range" — not a mark
  wrAfter = JSON.parse(localStorage.getItem('ajar_exam_current'));
  assert('a delivered email adds nothing to the score', wrAfter.correct === 1);
  assert('and nothing to the answered count', wrAfter.answered === 1);
  assert('but it is kept rather than dropped', (wrAfter.written || []).length === 1);
  // Defensive: with the separation removed nothing is stored, and this
  // should report a clean failure rather than crash and stop the suite.
  assert('kept with which task it answers', ((wrAfter.written || [])[0] || {}).type === 'email');
  assert('and counted as delivered', wrAfter.delivered === 1);

  const discIdx = wrItems.findIndex(i => i.type === 'discussion');
  wrSt = JSON.parse(localStorage.getItem('ajar_exam_current'));
  wrSt.idx = discIdx; localStorage.setItem('ajar_exam_current', JSON.stringify(wrSt));
  logUsage('discussion', wrItems[discIdx].theme, 0);  // "out of range" — also not a mark
  wrAfter = JSON.parse(localStorage.getItem('ajar_exam_current'));
  assert('a short discussion post is not marked down either', wrAfter.correct === 1);
  assert('it is kept too', (wrAfter.written || []).length === 2);

  // A perfect Writing sitting is band 6 out of ten, not out of twelve —
  // scoring out of twelve would cap an honest student at 5.
  wrSt = JSON.parse(localStorage.getItem('ajar_exam_current'));
  wrSt.correct = 10; localStorage.setItem('ajar_exam_current', JSON.stringify(wrSt));
  assert('all ten sentences right is band 6',
    examBand(10, examScoredItems(wr, buildExamItems(wr))) === 6);
  assert('scoring it out of twelve would have capped it below 6',
    examBand(10, wr.items) < 6);

  finishExam('completed');
  const wrDone = JSON.parse(localStorage.getItem('ajar_exam_current'));
  assert('the writing survives to the results screen', (wrDone.written || []).length === 2);

  // The results screen counts the words of what it hands back. A regex
  // written as /\\\\s+/ inside a template literal matches a literal
  // backslash, not whitespace, and reports every essay as one word — the
  // same escaping trap that has bitten this file's own checks twice.
  const wordCount = HTML_SOURCE.indexOf("w.text.split(/") > -1;
  assert('the results screen counts the words it hands back', wordCount);
  assert('and splits on whitespace, not on a literal backslash',
    HTML_SOURCE.indexOf("w.text.split(/" + String.fromCharCode(92) + String.fromCharCode(92) + "s+/)") === -1);

  localStorage.removeItem('ajar_exam_current');

  // --- answering must always open the way forward ---
  //
  // Reported from a real sitting: built the sentence, tapped Check, stuck.
  //
  // Six types re-render into a "Done — 3 of 4 correct" panel and pick up
  // the finished footer that way. Build a Sentence and Complete the Words
  // just write a line into a result div and leave the rest of the screen
  // standing — so the footer went on offering to SKIP an exercise the
  // student had already answered. Answering correctly and being shown only
  // a button that says leave without answering is a dead end.
  //
  // The fix hangs off the outcome funnel rather than each checker, so this
  // asserts the funnel, not the six screens.
  assert('the footer is findable so it can be swapped when answered',
    HTML_SOURCE.indexOf('exam-footer') > -1);
  assert('answering swaps the footer to the finished one',
    HTML_SOURCE.indexOf('markExerciseAnswered') > -1);

  const funnel = HTML_SOURCE.slice(
    HTML_SOURCE.indexOf('function recordExamOutcome'),
    HTML_SOURCE.indexOf('function advanceExam'));
  assert('a scored answer opens the way forward',
    (funnel.split('markExerciseAnswered()').length - 1) >= 2);
  assert('and so does a delivered piece of writing',
    funnel.indexOf('delivered') < funnel.lastIndexOf('markExerciseAnswered()'));

  // The swap must produce the finished label, not the skip one.
  localStorage.removeItem('ajar_exam_current');
  startExam('writing');
  assert('the swapped-in footer says next, not skip',
    practiceFooter(true).indexOf('Next exercise') > -1 &&
    practiceFooter(true).indexOf('Skip') === -1);
  assert('an untouched exercise still offers only to skip',
    practiceFooter(false).indexOf('Skip this exercise') > -1);
  finishExam('completed');
  localStorage.removeItem('ajar_exam_current');

  // --- each item must be its own exercise, not the previous one's leftovers ---
  //
  // Reported from a real sitting: in Listening the next audio did not come
  // up and the new questions stayed attached to the previous clip.
  //
  // Every type keeps its progress on window and resets it with
  // if(state.itemId !== item.id). Exam items were all built with the
  // same id, '__exam__', so that guard never fired: the second
  // conversation inherited the first one's question index, its spent
  // listens and its answers. advanceExam cleared three of the eight state
  // objects by hand, which is why some types looked fine and hid it.
  //
  // Every check I had drove advanceExam() directly without rendering, so
  // none of them ever touched a guard. These render.
  localStorage.removeItem('ajar_exam_current');
  startExam('listening');
  const exIds = JSON.parse(localStorage.getItem('ajar_exam_current')).items.map(i => i.id);
  assert('every item in a section has its own id', new Set(exIds).size === exIds.length);
  assert('no item reuses the routing key as its id',
    exIds.every(id => id !== '__exam__'));

  // Two items of the same type, back to back: the second must start clean.
  const cur = JSON.parse(localStorage.getItem('ajar_exam_current'));
  const convIdx = cur.items.map((it, n) => it.type === 'conversation' ? n : -1).filter(n => n >= 0);
  if(convIdx.length >= 2){
    cur.idx = convIdx[0];
    localStorage.setItem('ajar_exam_current', JSON.stringify(cur));
    renderPractice();
    // part-way through the first conversation: a question in, a listen spent
    window._cvState.q = 1;
    window._cvState.listens = 1;
    window._cvState.results = [1];
    const firstId = window._cvState.itemId;

    const mid = JSON.parse(localStorage.getItem('ajar_exam_current'));
    mid.idx = convIdx[1];
    localStorage.setItem('ajar_exam_current', JSON.stringify(mid));
    renderPractice();

    assert('the next conversation gets its own state', window._cvState.itemId !== firstId);
    assert('it starts on its first question, not the previous one\\'s', window._cvState.q === 0);
    assert('its listens are not already spent', window._cvState.listens === 0);
    assert('it carries none of the previous answers', window._cvState.results.length === 0);
  } else {
    assert('a Listening section has two conversations to compare', false);
  }
  finishExam('completed');

  // The same guard, across every type that keeps state. A type added later
  // with a stale-state bug should fail here rather than in a lesson.
  localStorage.removeItem('ajar_exam_current');
  ['reading', 'listening'].forEach(sec => {
    localStorage.removeItem('ajar_exam_current');
    startExam(sec);
    const ids = JSON.parse(localStorage.getItem('ajar_exam_current')).items.map(i => i.id);
    assert('ids are unique across the whole ' + sec + ' section',
      new Set(ids).size === ids.length);
    finishExam('completed');
  });
  localStorage.removeItem('ajar_exam_current');

  // --- sit each section end to end ---
  // Building a section and finishing one are separate things. This walks
  // every item the way a student does — answer, advance — and checks it
  // arrives at the end by itself rather than running out of items, or
  // looping, or stopping one short.
  Object.keys(EXAM_SECTIONS).forEach(k => {
    const sec = EXAM_SECTIONS[k];
    localStorage.removeItem('ajar_exam_current');
    localStorage.removeItem('cse_usage_log_by_name');
    startExam(k);
    let steps = 0;
    while(steps++ < 200){
      const cur = JSON.parse(localStorage.getItem('ajar_exam_current'));
      if(!cur || cur.finished) break;
      const it = cur.items[cur.idx];
      logUsage(it.type, it.theme, 1);
      goToNextExercise();
    }
    const end = JSON.parse(localStorage.getItem('ajar_exam_current'));
    // Writing marks ten of its twelve, so the yardstick is what the
    // section can mark, not how many items it holds.
    const markable = examScoredItems(sec, end.items);
    assert('a full ' + k + ' sitting reaches the end on its own', end.finished === true);
    assert('a full ' + k + ' sitting ends because it was completed', end.reason === 'completed');
    assert('every markable question in ' + k + ' was reached', end.answered === markable);
    assert('all-correct in ' + k + ' scores everything markable', end.correct === markable);
    assert('all-correct in ' + k + ' is band 6', examBand(end.correct, markable) === 6);
    assert('a full ' + k + ' sitting left the practice log alone',
      localStorage.getItem('cse_usage_log_by_name') === null);
    if(sec.scored){
      // One entry per unscored EXERCISE, not per question: Speaking's
      // single interview is worth four items but is one piece of work
      // handed over. Counting questions here expected four and got one.
      const handedOver = end.items.filter(it => !sec.scored.includes(it.type)).length;
      assert('the unmarkable work in ' + k + ' was kept, not lost',
        (end.written || []).length === handedOver);
    }
  });

  // --- both sections offered, and both reachable ---

  Object.keys(EXAM_SECTIONS).forEach(k => {
    localStorage.removeItem('ajar_exam_current');
    startExam(k);
    const built = JSON.parse(localStorage.getItem('ajar_exam_current'));
    assert('the ' + k + ' section builds to its published size',
      built.items.reduce((s, it) => s + examQuestionCount(it), 0) === EXAM_SECTIONS[k].items);
    finishExam('completed');
  });
  localStorage.removeItem('ajar_exam_current');

  // --- the day's exercise must not steal the section ---
  // renderStudent lands a student straight on the day's task when exactly
  // one is approved, by treating "selectedId is not in the batch" as
  // "nothing chosen". '__exam__' is not in the batch either, so without a
  // guard that convenience yanks the student out of a running section —
  // and it fires late, when shared classroom content resolves, so it lands
  // minutes in rather than at the start.
  localStorage.removeItem('ajar_exam_current');
  startExam('reading');
  selectedId = '__exam__';
  saveBatch([{ id:'only-one', type:'passage', theme:'campus', status:'approved',
               data: generateOne('passage','campus').data }]);
  renderStudent();
  assert('a one-item batch does not hijack a running section', selectedId === '__exam__');
  finishExam('completed');
  // The other half of this pair used to assert the one-item convenience
  // resumed after the exam — it auto-opened the day's task, which replaced
  // '__exam__' as a side effect. That convenience is gone: pressing "I'm a
  // student" lands on the student's own page now.
  //
  // So test the exit a student actually takes. finishExam leaves the id in
  // place on purpose — the results screen is still on show and a stray
  // renderPractice would wipe it — and leaveExam is the button that lets go.
  assert('the results screen still belongs to the exam', selectedId === '__exam__');
  leaveExam();
  renderStudent();
  assert('and leaving it hands the screen back', selectedId !== '__exam__');

  // --- scoring scales by how many questions an exercise was worth ---
  localStorage.removeItem('ajar_exam_current');
  startExam('reading');
  const ex0 = JSON.parse(localStorage.getItem('ajar_exam_current'));
  const first = ex0.items[0];
  const worth = examQuestionCount(first);
  logUsage(first.type, first.theme, 1);
  const after = JSON.parse(localStorage.getItem('ajar_exam_current'));
  assert('a fully correct exercise scores all its questions', after.correct === worth);
  assert('and counts all of them as answered', after.answered === worth);

  // --- the band is a proportion, and says so ---
  assert('nothing correct is band 1', examBand(0, 50) === 1);
  assert('everything correct is band 6', examBand(50, 50) === 6);
  assert('half correct sits in the middle', examBand(25, 50) === 3.5);
  assert('bands move in half steps', examBand(37, 50) === 4.5);
  assert('a band is never below 1', examBand(0, 50) >= 1);
  assert('a band is never above 6', examBand(50, 50) <= 6);
  assert('an empty section does not divide by zero', examBand(0, 0) === 1);

  // --- the clock is an end time, not a countdown ---
  // A countdown in memory would restart on refresh, turning a reload into
  // free time. This is the whole reason it is stored as endsAt.
  localStorage.removeItem('ajar_exam_current');
  startExam('reading');
  const e1 = JSON.parse(localStorage.getItem('ajar_exam_current'));
  assert('the exam stores when it ends, not how long is left', typeof e1.endsAt === 'number');
  assert('it ends one section-length from the start',
    Math.abs((e1.endsAt - e1.startedAt) - cfg.seconds * 1000) < 50);
  e1.endsAt = Date.now() - 1000;
  localStorage.setItem('ajar_exam_current', JSON.stringify(e1));
  assert('time already gone reads as zero left', examSecondsLeft(e1) === 0);

  // --- finishing ---
  finishExam('time');
  const done = JSON.parse(localStorage.getItem('ajar_exam_current'));
  assert('a finished exam is marked finished', done.finished === true);
  assert('it records why it ended', done.reason === 'time');
  assert('a finished exam is no longer active', !examActive());
  assert('answering after the end changes nothing', (() => {
    const before = JSON.parse(localStorage.getItem('ajar_exam_current')).correct;
    recordExamOutcome('passage', 'campus', 1);
    return JSON.parse(localStorage.getItem('ajar_exam_current')).correct === before;
  })());

  // --- and once finished, practice logging works again ---
  localStorage.removeItem('cse_usage_log_by_name');
  logUsage('passage', 'campus', 1);
  assert('practice logging resumes once the exam is over',
    localStorage.getItem('cse_usage_log_by_name') !== null);

  // --- unanswered questions are not silently counted right ---
  localStorage.removeItem('ajar_exam_current');
  startExam('reading');
  finishExam('time');
  const walkedAway = JSON.parse(localStorage.getItem('ajar_exam_current'));
  assert('walking away scores nothing', walkedAway.correct === 0);
  assert('and the band reflects that', examBand(walkedAway.correct, cfg.items) === 1);

  console.log(results.join('\\n'));
  const fails = results.filter(r => r.includes('FAIL'));
  console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                           : ('ALL ' + results.length + ' CHECKS PASS'));
  globalThis.__fails = fails.length;
})();
`;

const sandbox = {
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  document: {
    getElementById: () => el(), createElement: () => el(),
    querySelector: () => el(), querySelectorAll: () => [],
    addEventListener(){}, body: el(),
  },
  window: { addEventListener(){}, _lrState:null, _sentenceState:null, _interviewState:null, _crState:null },
  localStorage,
  location: { origin:'https://example.com', pathname:'/app', hash:'', search:'' },
  navigator: { language:'en-US', languages:['en-US'], clipboard:{writeText:()=>Promise.resolve()}, mediaDevices:undefined },
  confirm: () => true,
  alert: () => {},
  Audio: function(){ this.play = () => Promise.resolve(); this.pause = () => {}; },
  SpeechSynthesisUtterance: function(t){ this.text = t; },
  speechSynthesis: { speak(){}, getVoices(){ return []; }, addEventListener(){}, cancel(){} },
  // The page's own source, so a check can assert on what the markup does
  // rather than only on what the functions return.
  HTML_SOURCE: html,
  URLSearchParams,
  console, Date, Math, JSON, Array, Object, String, Number, Intl, Set, Promise,
  setInterval: (...a) => { const t = setInterval(...a); if(t && t.unref) t.unref(); return t; },
  clearInterval, setTimeout, clearTimeout,
};
sandbox.self = sandbox.window;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(blocks.join('\n;\n') + '\n;\n' + testScript, sandbox)
  .catch(e => { console.error('RUNTIME ERROR:', e.stack); process.exitCode = 1; });

process.on('beforeExit', () => { if (sandbox.__fails) process.exitCode = 1; });
