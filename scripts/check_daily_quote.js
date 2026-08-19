// The sentence of the day, the three words, and the header they sit in.
//
// WHAT THIS EXISTS TO CATCH, in the order the failures would actually happen.
//
// 1. THE HEADER TAKING THE PAGE DOWN. The band is the first thing on both
//    working screens, and its content comes from a file that is fetched
//    rather than shipped. First visit of a new month on a school network
//    that is down, a half-written file, a day the corpus has not reached
//    yet: every one of those has to end with the band gone and the page
//    under it exactly as it was. A header that half-draws is worse than no
//    header, and it is worse on every screen at once.
//
// 2. THE SENTENCE STOPPING BEING THE SAME FOR EVERYBODY. The whole feature
//    is that a teacher can say "the sentence today is about this" and
//    thirteen people are looking at the same words. That holds only while
//    the index is the date and nothing else -- no shuffle, no per-student
//    state, and the SCHOOL's date rather than the device's, or two students
//    either side of midnight get different days.
//
// 3. A QUOTE REACHING innerHTML UNESCAPED. A corpus of nineteenth-century
//    translations is full of apostrophes, dashes and quotation marks. It is
//    text from a file landing in innerHTML, which makes it an output point.
//
// 4. THE CORPUS QUIETLY GETTING WORSE. Over 120 characters and it does not
//    fit a phone. A definition over twelve words is not a simple definition.
//    A citation without an author, a work and a reason it is public domain
//    is a copyright problem shipped to a classroom. Two words on a day is a
//    broken promise, not a smaller box.
//
// 5. THE ROTATION REPEATING. Below.
//
// THE ARITHMETIC OF THE ROTATION, since rule 5 is the one that needs it.
// A student stays about nine months, which is roughly 270 days, and sees
// three words a day: about 810 slots. Repeating a word inside that window
// means the student is shown something the app has already taught them and
// the day is wasted. So no word may appear twice inside any 270-day window,
// measured cyclically over the 366 slots of the year -- 12 files times the
// days in each month, with 29 February addressed on its own.
//
// 810 distinct words is more than the Academic Word List can supply on its
// own: the AWL is 570 head words. The corpus therefore draws from three
// pools, in this order of preference, which is also the fill rule:
//   - the uncommon words of that day's sentence, up to 3;
//   - the AWL, 570 head words;
//   - the New Academic Word List, about 960 further head words.
// 570 + 960 = 1,530 academic head words, plus whatever the 366 sentences
// contribute (the seed corpus averages 1.3 a day, so on the order of 480
// over a year). That is comfortably above 810 with room for the words that
// have to be skipped as too common or too rare.
//
// The seed corpus in daily/ is 20 days. It is the MACHINE that is finished
// tonight, not the corpus, and this file checks every rule against whatever
// days are actually present -- so the same assertions keep working as the
// corpus grows in reviewed batches.
//
// Run as the rest of the suite runs:  node scripts/check_daily_quote.js index.html audio
//
// The behavioural half boots the real index.html against a fake network that
// can be offline, empty or serving nonsense, the same way check_links.js
// boots it against a fake CloudSync. No regex lives inside the template
// literal below: backslashes have been lost that way in this repo seven
// separate times, and the seventh loss passed green.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(process.argv[2] || path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const dailyDir = path.join(root, 'daily');

const results = [];
function assert(n, c, detail){
  results.push(n + ': ' + (c ? 'PASS' : 'FAIL'));
  if(!c && detail !== undefined) results.push('    got: ' + String(detail).slice(0, 200));
}

//=====================================================================
// 1. THE CORPUS ITSELF
//=====================================================================
const MAX_QUOTE_CHARS = 120;
const MAX_DEF_WORDS = 12;
// Six, in two rows of three. Three was a thin day for somebody who opens
// this once and closes it.
const WORDS_PER_DAY = 6;
const ROTATION_WINDOW_DAYS = 270;
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];   // February leap-length: 29 Feb has a slot
// Anything in these ranges is a pictograph. The em dash (U+2014) and the
// curly quotes are deliberately NOT here -- they are punctuation a
// nineteenth-century translation is full of, and banning them would empty
// the corpus rather than clean it.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]/u;

let monthFiles = [];
try{ monthFiles = fs.readdirSync(dailyDir).filter(f => /^\d{2}\.json$/.test(f)).sort(); }
catch(e){ monthFiles = []; }

assert('the corpus lives in files of its own, not pasted into index.html',
  monthFiles.length > 0 && html.indexOf('publicDomain') === -1, monthFiles.join(', '));
assert('and it is addressed one file per month of the year',
  monthFiles.every(f => { const n = Number(f.slice(0, 2)); return n >= 1 && n <= 12; }),
  monthFiles.join(', '));

// [{ month, day, doy, entry }] for every day the corpus actually carries.
const corpus = [];
let parseFailures = [];
monthFiles.forEach(f => {
  const month = Number(f.slice(0, 2));
  let data = null;
  try{ data = JSON.parse(fs.readFileSync(path.join(dailyDir, f), 'utf8')); }
  catch(e){ parseFailures.push(f + ': ' + e.message); return; }
  if(!data || !data.days || typeof data.days !== 'object'){ parseFailures.push(f + ': no days'); return; }
  Object.keys(data.days).forEach(k => {
    const day = Number(k);
    const doy = DAYS_IN_MONTH.slice(0, month - 1).reduce((a, b) => a + b, 0) + day;
    corpus.push({ month, day, doy, key: month + '-' + day, entry: data.days[k] });
  });
});
corpus.sort((a, b) => a.doy - b.doy);

assert('every month file is valid JSON with a days map', parseFailures.length === 0,
  parseFailures.join(' | '));
assert('the corpus has enough days in it to exercise the machine',
  corpus.length >= 12, corpus.length + ' days');
assert('no day is addressed outside its own month',
  corpus.every(c => c.day >= 1 && c.day <= DAYS_IN_MONTH[c.month - 1]),
  corpus.filter(c => c.day < 1 || c.day > DAYS_IN_MONTH[c.month - 1]).map(c => c.key).join(', '));

// --- the sentence ---
const longQuotes = corpus.filter(c => !c.entry.quote || typeof c.entry.quote.text !== 'string'
  || c.entry.quote.text.length > MAX_QUOTE_CHARS);
assert('no sentence is longer than a phone screen can hold (' + MAX_QUOTE_CHARS + ' characters)',
  longQuotes.length === 0,
  longQuotes.map(c => c.key + ' = ' + (c.entry.quote || {}).text).join(' | '));

const emojiQuotes = corpus.filter(c => EMOJI.test(String((c.entry.quote || {}).text || '')));
assert('no sentence carries an emoji', emojiQuotes.length === 0,
  emojiQuotes.map(c => c.key).join(', '));

// A citation that cannot be checked is a copyright problem shipped to a
// classroom. Author, work, and a stated reason it is public domain -- and
// the reason has to name a year, and that year has to be old enough that
// the claim is true rather than hopeful.
const PD_CUTOFF = 1929;
const badCitations = corpus.filter(c => {
  const q = c.entry.quote || {};
  if(!q.author || !String(q.author).trim()) return true;
  if(!q.work || !String(q.work).trim()) return true;
  if(!q.publicDomain || !String(q.publicDomain).trim()) return true;
  const years = String(q.publicDomain).match(/\b\d{4}\b/g) || [];
  if(!years.length) return true;
  return Math.max.apply(null, years.map(Number)) >= PD_CUTOFF;
});
assert('every citation names its author, its work and why it is public domain',
  badCitations.length === 0, badCitations.map(c => c.key).join(', '));

// A translation with no translator named is half a citation: the underlying
// author may be ancient and the English still under copyright.
const missingTranslator = corpus.filter(c => {
  const q = c.entry.quote || {};
  if(typeof q.translated !== 'boolean') return true;
  if(q.translated) return !q.translator || !String(q.translator).trim();
  return !!q.translator;   // saying "not translated" and naming one is a contradiction
});
assert('every translated sentence names its translator, and only those do',
  missingTranslator.length === 0, missingTranslator.map(c => c.key).join(', '));

// --- the three words ---
const wrongCount = corpus.filter(c => !Array.isArray(c.entry.words) || c.entry.words.length !== WORDS_PER_DAY);
assert('every day carries exactly ' + WORDS_PER_DAY + ' words, never two and never four',
  wrongCount.length === 0,
  wrongCount.map(c => c.key + ' = ' + ((c.entry.words || []).length)).join(', '));

const allWords = [];
corpus.forEach(c => (c.entry.words || []).forEach(w => allWords.push({ c, w })));

const longDefs = allWords.filter(x => String(x.w.def || '').trim().split(/\s+/).length > MAX_DEF_WORDS);
assert('no definition runs past ' + MAX_DEF_WORDS + ' words',
  longDefs.length === 0,
  longDefs.map(x => x.w.word + ' (' + String(x.w.def).trim().split(/\s+/).length + ')').join(', '));

const emojiDefs = allWords.filter(x => EMOJI.test(String(x.w.def || '')) || EMOJI.test(String(x.w.word || '')));
assert('no word or definition carries an emoji', emojiDefs.length === 0,
  emojiDefs.map(x => x.w.word).join(', '));

// A definition that uses the word is not a definition.
const circular = allWords.filter(x =>
  String(x.w.def || '').toLowerCase().indexOf(String(x.w.word || '').toLowerCase()) > -1);
assert('no definition explains a word with itself', circular.length === 0,
  circular.map(x => x.w.word).join(', '));

const badPos = allWords.filter(x => !x.w.pos || !String(x.w.pos).trim());
assert('every word says what part of speech it is', badPos.length === 0,
  badPos.map(x => x.w.word).join(', '));

const badSyn = allWords.filter(x => !Array.isArray(x.w.syn) || x.w.syn.length < 1 || x.w.syn.length > 2
  || x.w.syn.some(s => !String(s).trim() || String(s).toLowerCase() === String(x.w.word).toLowerCase()));
assert('every word carries one or two synonyms, and never itself',
  badSyn.length === 0, badSyn.map(x => x.w.word).join(', '));

// There is no translation here, deliberately: the interface is in English
// because that is the point of an immersion app, and the exam is monolingual
// too. A translated field would also be 365 sentences in twelve languages
// that nobody would ever review.
const translatedFields = allWords.filter(x =>
  Object.keys(x.w).some(k => /^(pt|es|ko|ja|zh|ar|fr|translation|l1)$/.test(k)));
assert('no word carries a first-language translation', translatedFields.length === 0,
  translatedFields.map(x => x.w.word).join(', '));

// --- the fill rule ---
// The words of the sentence come first, then the academic lists. The order
// in the file is the order on screen, so it has to be the fill order too.
const outOfOrder = corpus.filter(c => {
  const src = (c.entry.words || []).map(w => w.src);
  const lastQuote = src.lastIndexOf('quote');
  const firstFill = src.findIndex(s => s !== 'quote');
  return lastQuote > -1 && firstFill > -1 && firstFill < lastQuote;
});
assert("a sentence's own words come before the list fills the rest",
  outOfOrder.length === 0, outOfOrder.map(c => c.key).join(', '));

// A word claiming to come from the sentence has to be in it. Inflections
// count -- "craves" is "crave" -- so the first five characters are compared
// rather than the whole word.
const notInQuote = allWords.filter(x => {
  if(x.w.src !== 'quote') return false;
  const stem = String(x.w.word).toLowerCase().slice(0, 5);
  return String((x.c.entry.quote || {}).text || '').toLowerCase().indexOf(stem) === -1;
});
assert('every word said to come from the sentence is in the sentence',
  notInQuote.length === 0, notInQuote.map(x => x.w.word).join(', '));

const badSrc = allWords.filter(x => ['quote', 'awl', 'nawl'].indexOf(x.w.src) === -1);
assert('every word says which pool it came from', badSrc.length === 0,
  badSrc.map(x => x.w.word + ' = ' + x.w.src).join(', '));

// --- the rotation ---
// Cyclic over the year, because 31 December and 1 January are one day apart
// for a student who is still enrolled in January.
const YEAR_SLOTS = DAYS_IN_MONTH.reduce((a, b) => a + b, 0);
const repeats = [];
for(let i = 0; i < corpus.length; i++){
  for(let j = i + 1; j < corpus.length; j++){
    const raw = corpus[j].doy - corpus[i].doy;
    const gap = Math.min(raw, YEAR_SLOTS - raw);
    if(gap > ROTATION_WINDOW_DAYS) continue;
    const a = (corpus[i].entry.words || []).map(w => String(w.word).toLowerCase());
    const b = (corpus[j].entry.words || []).map(w => String(w.word).toLowerCase());
    a.filter(w => b.indexOf(w) > -1).forEach(w =>
      repeats.push(w + ' on ' + corpus[i].key + ' and again ' + gap + ' days later on ' + corpus[j].key));
  }
}
/* THE SIX CHANGE EVERY DAY, AND THAT IS ASSERTED RATHER THAN ASSUMED.

   The band is keyed by day of month out of daily/MM.json, so rotation is
   structural — but "structural" is what people say right before a file gets
   a duplicated day pasted into it. A student who opens this every morning
   and meets the same six words has been given a decoration, not a lesson.

   Consecutive days, not just the 270-day window above: that one would let
   two neighbours share five of six and still pass. */
{
  const seguidos = [];
  for(let i = 1; i < corpus.length; i++){
    const ontem = new Set((corpus[i-1].entry.words || []).map(w => String(w.word).toLowerCase()));
    const hoje  = (corpus[i].entry.words || []).map(w => String(w.word).toLowerCase());
    const iguais = hoje.filter(w => ontem.has(w));
    if(iguais.length) seguidos.push(corpus[i].key + ' repeats ' + iguais.join(', '));
  }
  assert('the six words are different from yesterday\'s six, every single day',
    seguidos.length === 0, seguidos.slice(0, 3));
  assert('and every day in the corpus really carries six of them',
    corpus.every(c => (c.entry.words || []).length === WORDS_PER_DAY), corpus.length + ' days');
}

assert('no word comes round again inside the ' + ROTATION_WINDOW_DAYS
  + ' days a student is here', repeats.length === 0, repeats.slice(0, 6).join(' | '));
assert('and the corpus really was walked, so this is not passing on an empty list',
  allWords.length >= WORDS_PER_DAY * 12, allWords.length + ' words');

//=====================================================================
// 2. WHERE IT SITS ON THE PAGE
//=====================================================================
const at = s => html.indexOf(s);
assert('the date is the first line of the band',
  at('id="daily-clock"') > -1 && at('id="daily-clock"') < at('id="daily-quote"'));
assert('the sentence comes before the words',
  at('id="daily-quote"') > -1 && at('id="daily-quote"') < at('id="daily-words"'));
assert('and the batch review promise sits under them, not over them',
  // The teacher view is what follows the band now: the batch-review notice
  // moved inside the review panel, where somebody can act on it.
  at('id="daily-band"') > -1 && at('id="daily-band"') < at('<!-- TEACHER VIEW -->'));
assert('the explainer has moved to the foot of the page',
  at('class="tech-note"') > at('id="view-student"'));
assert('and it is still a closed box somebody chooses to open',
  /<div class="tech-note">\s*<details class="brief"><summary>How this app makes the exercises<\/summary>/.test(html));

// The sentence it had was true before the audio was pre-rendered and stayed
// on the page for months after it stopped being true.
assert('the explainer no longer calls the audio the browser\'s own Text-to-Speech',
  !/Audio uses your browser's own Text-to-Speech/.test(html));
{
  const m = html.match(/How this app makes the exercises<\/summary><p>([\s\S]*?)<\/p>/);
  const body = m ? m[1] : '';
  assert('it says the audio is pre-rendered', /pre-rendered/.test(body), body.slice(0, 80));
  assert('and that the browser\'s voice is only the fallback',
    /steps in only when/.test(body), body.slice(0, 80));
  assert('and that the student\'s recording stays on the device',
    /never uploaded/.test(body) || /stays on this device/.test(body), body.slice(0, 80));
  assert('and it carries no emoji', !EMOJI.test(body));
}

// The band is hidden on the two screens that ask a single question, the same
// way the other two notices are.
{
  const m = html.match(/\['\.tech-note', '#daily-band'\]/);
  assert('the band is hidden on the cover and on the sign-in screen', !!m);
}

// Announced as one thing with a meaning, not as four loose fragments.
assert('the words are a labelled section, so a screen reader announces the box',
  /<section aria-labelledby="daily-words-h">/.test(html)
  && /id="daily-words-h"/.test(html));
assert('and the words themselves are a list, so it announces how many there are',
  /<ul class="daily-word-list" id="daily-words">/.test(html));
assert('the sentence is a labelled section too',
  /<section aria-labelledby="daily-quote-h">/.test(html) && /id="daily-quote-h"/.test(html));

// 320px, and the longest sentence in the corpus beside the longest words.
// This is a SHAPE assertion and says so: a check on a machine with only node
// cannot lay text out. What it can do is refuse the three CSS mistakes that
// make the band overflow, all three of which have to be present to be safe.
{
  const rules = (html.match(/\.daily[^{]*\{[^}]*\}/g) || []).join('\n');
  assert('the words box collapses to one column rather than three narrow ones',
    /grid-template-columns:repeat\(auto-fit,minmax\(160px,1fr\)\)/.test(rules), rules.slice(0, 120));
  assert('a long word wraps instead of pushing the page sideways',
    (rules.match(/overflow-wrap:anywhere/g) || []).length >= 4);
  assert('and a grid cell is allowed to be narrower than its content',
    /\.daily-word\{[^}]*min-width:0/.test(rules));
  assert('every colour in the band is a palette token, so both themes follow',
    !/#[0-9a-fA-F]{3,8}/.test(rules), (rules.match(/#[0-9a-fA-F]{3,8}/) || [])[0]);
}

// No emoji anywhere in the band's own markup.
{
  const band = html.slice(at('<div class="daily" id="daily-band">'), at('<!-- TEACHER VIEW -->'));
  assert('the band\'s markup carries no emoji', !EMOJI.test(band));
}

// The interface stays in English on purpose. Nothing here may reach for the
// student's first language.
{
  const start = html.indexOf('const DAILY_DIR');
  const end = html.indexOf('async function renderDailyBand');
  const engine = html.slice(start, html.indexOf('}', html.indexOf('catch(e){', end)));
  assert('the day\'s band never asks what language the student speaks',
    start > -1 && end > start && engine.indexOf('detectStudentLanguage') === -1);
}

//=====================================================================
// 3. THE SERVICE WORKER KEEPS THE MONTH
//=====================================================================
assert('the months have a cache of their own', /const DAILY_CACHE = 'ajar-daily-v\d+';/.test(sw));
assert('which activate spares, so a month is not lost to an app update',
  /n !== CACHE_NAME && n !== AUDIO_CACHE && n !== DAILY_CACHE/.test(sw));
assert('and the route is matched on the path, not on the whole URL',
  /url\.pathname\.includes\('\/daily\/'\)/.test(sw));

//=====================================================================
// 4. THE PAGE, BOOTED, AGAINST A NETWORK THAT CAN FAIL
//=====================================================================
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/type\s*=\s*["']module["']/.test(m[1]))
  .map(m => m[2]);

const nodes = {};
const el = (id) => {
  if(id && nodes[id]) return nodes[id];
  const n = { style:{}, innerHTML:'', textContent:'', value:'', id: id || '', children: [],
    classList:{toggle(){},add(){},remove(){},contains:()=>false},
    addEventListener(){}, querySelector:()=>el(), querySelectorAll:()=>[],
    closest:()=>null, select(){}, focus(){}, remove(){}, insertBefore(){},
    getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}) };
  n.appendChild = c => { n.children.push(c); };
  n.parentNode = { insertBefore(){}, removeChild(){} };
  if(id) nodes[id] = n;
  return n;
};

// The real month files, plus three fabricated ones that only exist to ask
// the calendar questions the seed corpus cannot: 29 February, 1 March in a
// leap year and in a common one, and 31 December in both.
const net = { files: {}, offline: false, calls: [] };
monthFiles.forEach(f => {
  net.files['daily/' + f] = fs.readFileSync(path.join(dailyDir, f), 'utf8');
});
const fabricated = (month, days) => JSON.stringify({ month, days });
const word = (w, n) => ({ word: w + n, pos: 'noun', def: 'a made up word for a calendar test', syn: ['test'], src: 'awl' });
const day = (label) => ({
  quote: { text: 'CALENDAR ' + label, author: 'A', work: 'B', translated: false,
           publicDomain: 'published in 1800' },
  // Six, because dailyEntryIn refuses a short day — a fixture that is one
  // word behind the app is a fixture that tests nothing.
  words: [word(label,1), word(label,2), word(label,3), word(label,4), word(label,5), word(label,6)]
});
net.files['daily/02.json'] = fabricated(2, { '28': day('FEB28'), '29': day('FEB29') });
net.files['daily/03.json'] = fabricated(3, { '1': day('MAR01') });
net.files['daily/12.json'] = fabricated(12, { '31': day('DEC31') });

const testScript = `
(async () => {
  const results = [];
  function assert(n, c, detail){
    results.push(n + ': ' + (c ? 'PASS' : 'FAIL'));
    if(!c && detail !== undefined) results.push('    got: ' + String(detail).slice(0, 200));
  }
  const at = iso => new Date(iso);
  const box = document.getElementById('daily-today');
  const quoteBox = document.getElementById('daily-quote');
  const wordBox = document.getElementById('daily-words');
  const clock = document.getElementById('daily-clock');

  // Let whatever the page kicked off at boot finish before anything is asked.
  for(let i = 0; i < 8; i++) await Promise.resolve();
  function reset(){
    Object.keys(_dailyMonths).forEach(k => { delete _dailyMonths[k]; });
    _dailyDrawnKey = '';
    box.style.display = 'none';
    quoteBox.innerHTML = '';
    wordBox.innerHTML = '';
    __net.calls.length = 0;
    __net.offline = false;
  }

  //=================================================================
  // AN ORDINARY DAY
  //=================================================================
  reset();
  await renderDailyBand(at('2026-08-19T18:00:00Z'));
  assert('on a day the corpus covers, the band is shown', box.style.display !== 'none');
  assert('and it carries the sentence for that exact day',
    quoteBox.innerHTML.indexOf('To be everywhere is to be nowhere.') > -1, quoteBox.innerHTML);
  assert('with the author and the work beside it',
    quoteBox.innerHTML.indexOf('Seneca') > -1 && quoteBox.innerHTML.indexOf('Letter II') > -1);
  assert('and the translator named, because the English is somebody\\'s work too',
    quoteBox.innerHTML.indexOf('Gummere') > -1);
  assert('the box holds exactly six words',
    (wordBox.innerHTML.match(/<li class="daily-word">/g) || []).length === DAILY_WORDS_PER_DAY, wordBox.innerHTML);
  assert('each with its part of speech',
    (wordBox.innerHTML.match(/class="pos"/g) || []).length === DAILY_WORDS_PER_DAY);
  assert('a definition',
    (wordBox.innerHTML.match(/class="def"/g) || []).length === DAILY_WORDS_PER_DAY);
  assert('and something to compare it to',
    (wordBox.innerHTML.match(/class="syn"/g) || []).length === DAILY_WORDS_PER_DAY);
  assert('and no translation into anybody\\'s first language',
    wordBox.innerHTML.indexOf('Similar:') > -1);

  //=================================================================
  // THE SAME DAY IS THE SAME SENTENCE, FOR EVERYONE
  //=================================================================
  const first = quoteBox.innerHTML;
  reset();
  setStudentName('Ana');
  await renderDailyBand(at('2026-08-19T18:00:00Z'));
  const ana = quoteBox.innerHTML;
  reset();
  setStudentName('Bruno');
  await renderDailyBand(at('2026-08-19T20:00:00Z'));
  assert('two students on the same day see the same sentence',
    ana === quoteBox.innerHTML && ana === first, ana);
  reset();
  setStudentName('Ana');
  await renderDailyBand(at('2026-08-19T18:00:00Z'));
  assert('and the same words, in the same order', wordBox.innerHTML.length > 0);
  const anaWords = wordBox.innerHTML;
  reset();
  setStudentName('');
  await renderDailyBand(at('2026-08-19T18:00:00Z'));
  assert('a visitor with no name at all sees them too', wordBox.innerHTML === anaWords);

  //=================================================================
  // THE SCHOOL'S DAY, NOT THE DEVICE'S
  //=================================================================
  // 05:30 UTC on the 19th is 23:30 on the 18th in Denver. A phone reading its
  // own clock would already be on the next day's sentence.
  reset();
  await renderDailyBand(at('2026-08-19T05:30:00Z'));
  assert('half an hour before midnight the class is still on yesterday\\'s sentence',
    quoteBox.innerHTML.indexOf('Nothing is ours, except time.') > -1, quoteBox.innerHTML);

  //=================================================================
  // MIDNIGHT, WITH THE PAGE STILL OPEN
  //=================================================================
  // A classroom laptop is left open for days. The band has to roll over on
  // the clock's own tick, without anybody reloading anything.
  const before = quoteBox.innerHTML;
  await renderDailyBand(at('2026-08-19T06:30:00Z'));
  assert('half an hour after it, the same page has moved on without a reload',
    quoteBox.innerHTML !== before
    && quoteBox.innerHTML.indexOf('To be everywhere is to be nowhere.') > -1, quoteBox.innerHTML);
  assert('and it did not go back to the network to do it',
    __net.calls.filter(u => u.indexOf('08.json') > -1).length === 1, __net.calls.join(', '));

  //=================================================================
  // THE CALENDAR: 29 FEBRUARY, DAY 365 AND DAY 366
  //=================================================================
  // Addressed by month and day, so a leap year does not shift the year by
  // one after February -- which is exactly what a day-of-year index does.
  reset();
  await renderDailyBand(at('2028-02-29T18:00:00Z'));
  assert('29 February has a sentence of its own in a leap year',
    quoteBox.innerHTML.indexOf('CALENDAR FEB29') > -1, quoteBox.innerHTML);
  reset();
  await renderDailyBand(at('2028-03-01T18:00:00Z'));
  const leapMarch = quoteBox.innerHTML;
  assert('and 1 March in that leap year is 1 March, not the day after 29 February',
    leapMarch.indexOf('CALENDAR MAR01') > -1, leapMarch);
  reset();
  await renderDailyBand(at('2027-03-01T18:00:00Z'));
  assert('1 March in a common year is the same sentence as in the leap year',
    quoteBox.innerHTML === leapMarch, quoteBox.innerHTML);
  reset();
  await renderDailyBand(at('2027-12-31T18:00:00Z'));
  const day365 = quoteBox.innerHTML;
  assert('the last day of a common year has a sentence',
    day365.indexOf('CALENDAR DEC31') > -1, day365);
  reset();
  await renderDailyBand(at('2028-12-31T18:00:00Z'));
  assert('and the last day of a leap year is the same one, not one off the end',
    quoteBox.innerHTML === day365, quoteBox.innerHTML);

  //=================================================================
  // THE FRAGILE CHARACTERS
  //=================================================================
  // A corpus of nineteenth-century translations is full of these, and this is
  // an output point: text from a file landing in innerHTML.
  reset();
  __net.files['daily/07.json'] = JSON.stringify({ month: 7, days: { '4': {
    quote: { text: '<script>alert(1)</' + 'script> "he said" & it\\'s an em dash \\u2014 here',
             author: 'A & B <b>', work: 'W"1', translated: true, translator: "O'Neill",
             publicDomain: 'published in 1800' },
    words: [
      { word: '<img src=x>', pos: 'noun & verb', def: "it's a \\"definition\\"", syn: ['<b>'], src: 'awl' },
      { word: 'two', pos: 'noun', def: 'a number', syn: ['pair'], src: 'awl' },
      { word: 'three', pos: 'noun', def: 'another number', syn: ['trio'], src: 'awl' },
      { word: 'four', pos: 'noun', def: 'a number', syn: ['quartet'], src: 'awl' },
      { word: 'five', pos: 'noun', def: 'a number', syn: ['quintet'], src: 'awl' },
      { word: 'six', pos: 'noun', def: 'a number', syn: ['sextet'], src: 'awl' }
    ] } } });
  await renderDailyBand(at('2026-07-04T18:00:00Z'));
  assert('a sentence with a tag in it never opens a tag on the page',
    quoteBox.innerHTML.indexOf('<script') === -1, quoteBox.innerHTML);
  assert('its angle brackets arrive escaped', quoteBox.innerHTML.indexOf('&lt;script&gt;') > -1);
  assert('so do the quotation marks in it', quoteBox.innerHTML.indexOf('&quot;he said&quot;') > -1);
  assert('and the ampersand', quoteBox.innerHTML.indexOf('&amp; it') > -1);
  assert('and the apostrophe', quoteBox.innerHTML.indexOf('&#39;s an em dash') > -1);
  assert('the em dash is left alone, because it is punctuation and not markup',
    quoteBox.innerHTML.indexOf('\\u2014') > -1);
  assert('the author line is escaped too', quoteBox.innerHTML.indexOf('A &amp; B &lt;b&gt;') > -1);
  assert('and so is the translator', quoteBox.innerHTML.indexOf('O&#39;Neill') > -1);
  assert('a word that is a tag never becomes one',
    wordBox.innerHTML.indexOf('<img') === -1 && wordBox.innerHTML.indexOf('&lt;img src=x&gt;') > -1,
    wordBox.innerHTML);
  assert('nor does a synonym', wordBox.innerHTML.indexOf('&lt;b&gt;') > -1);
  assert('and a definition with quotation marks in it stays text',
    wordBox.innerHTML.indexOf('&quot;definition&quot;') > -1);
  delete __net.files['daily/07.json'];

  //=================================================================
  // WHEN THE MONTH IS NOT THERE -- THE HEADER MUST NOT BREAK
  //=================================================================
  // First visit of a new month, on a network that is down. The band is the
  // first thing on the screen, so it going wrong goes wrong everywhere.
  reset();
  __net.offline = true;
  await renderDailyBand(at('2026-11-05T18:00:00Z'));
  assert('with no network and no file, the band simply is not there',
    box.style.display === 'none', box.style.display);
  assert('and it leaves nothing half-drawn behind it',
    quoteBox.innerHTML === '' && wordBox.innerHTML === '');
  renderSchoolClock();
  assert('the date above it is still on the screen', clock.innerHTML.indexOf(',') > -1);

  reset();
  await renderDailyBand(at('2026-11-05T18:00:00Z'));
  assert('a month the corpus has not reached yet is the same silence',
    box.style.display === 'none' && quoteBox.innerHTML === '');

  reset();
  __net.files['daily/06.json'] = '{ this is not json';
  await renderDailyBand(at('2026-06-10T18:00:00Z'));
  assert('a corrupt file is the same silence, not a thrown error',
    box.style.display === 'none' && quoteBox.innerHTML === '');
  delete __net.files['daily/06.json'];

  reset();
  __net.files['daily/06.json'] = JSON.stringify({ month: 6, days: { '1': {
    quote: { text: 'A short month', author: 'A', work: 'W', translated: false, publicDomain: '1800' },
    words: [{ word: 'one', pos: 'noun', def: 'a number', syn: ['single'], src: 'awl' }] } } });
  await renderDailyBand(at('2026-06-01T18:00:00Z'));
  assert('a day with fewer than six words is refused, not shown short',
    box.style.display === 'none' && wordBox.innerHTML === '', wordBox.innerHTML);
  await renderDailyBand(at('2026-06-20T18:00:00Z'));
  assert('and a month file that stops before the day asked for shows nothing',
    box.style.display === 'none');
  delete __net.files['daily/06.json'];

  // And after all of that, an ordinary day still works. A failure must not be
  // sticky: the band came back the moment there was something to show.
  reset();
  await renderDailyBand(at('2026-09-02T18:00:00Z'));
  assert('and the very next day the corpus covers, the band is back',
    box.style.display !== 'none'
    && quoteBox.innerHTML.indexOf('The soul should always stand ajar.') > -1, quoteBox.innerHTML);

  //=================================================================
  // IT DOES NOT GO BACK TO THE NETWORK FOR EVERY TICK
  //=================================================================
  reset();
  await renderDailyBand(at('2026-08-19T18:00:00Z'));
  await renderDailyBand(at('2026-08-19T18:00:20Z'));
  await renderDailyBand(at('2026-08-19T18:00:40Z'));
  assert('the month is fetched once and read from memory after that',
    __net.calls.length === 1, __net.calls.join(', '));

  // A month that was not there is not asked for again on every tick either --
  // a school network that blocks the request would otherwise be asked three
  // times a minute for the rest of the day.
  reset();
  __net.offline = true;
  await renderDailyBand(at('2026-11-05T18:00:00Z'));
  await renderDailyBand(at('2026-11-05T18:00:20Z'));
  await renderDailyBand(at('2026-11-05T18:00:40Z'));
  assert('and a month that failed is not asked for again on every tick',
    __net.calls.length === 1, __net.calls.join(', '));
  // But it is asked again eventually, so wifi coming back is not ignored
  // until somebody reloads the page.
  __net.offline = false;
  __net.files['daily/11.json'] = JSON.stringify({ month: 11, days: { '5': {
    quote: { text: 'The network came back', author: 'A', work: 'W', translated: false,
             publicDomain: 'published in 1800' },
    words: [
      { word: 'alpha', pos: 'noun', def: 'a letter', syn: ['first'], src: 'awl' },
      { word: 'beta', pos: 'noun', def: 'another letter', syn: ['second'], src: 'awl' },
      { word: 'gamma', pos: 'noun', def: 'a third letter', syn: ['third'], src: 'awl' },
      { word: 'delta', pos: 'noun', def: 'a fourth letter', syn: ['fourth'], src: 'awl' },
      { word: 'epsilon', pos: 'noun', def: 'a fifth letter', syn: ['fifth'], src: 'awl' },
      { word: 'zeta', pos: 'noun', def: 'a sixth letter', syn: ['sixth'], src: 'awl' }
    ] } } });
  await renderDailyBand(at('2026-11-05T18:20:00Z'));
  assert('once the ten-minute window is up it tries again, so returning wifi is not ignored',
    box.style.display !== 'none'
    && quoteBox.innerHTML.indexOf('The network came back') > -1, quoteBox.innerHTML);
  delete __net.files['daily/11.json'];

  console.log(results.join('\\n'));
  globalThis.__inner = results;
})();
`;

const store = {};
const sandbox = {
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  document: { getElementById: id => el(id), createElement: () => el(), querySelector: () => el(),
              querySelectorAll: () => [], addEventListener(){}, body: el() },
  window: { addEventListener(){}, scrollTo(){} },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
  location: { origin:'https://example.com', pathname:'/', hash:'', search:'' },
  navigator: { language:'en-US', languages:['en-US'] },
  confirm: () => true,
  Audio: function(){ this.play = () => Promise.resolve(); this.pause = () => {}; },
  SpeechSynthesisUtterance: function(t){ this.text = t; },
  speechSynthesis: { speak(){}, getVoices(){ return []; }, addEventListener(){}, cancel(){} },
  URLSearchParams, TypeError,
  console, Date, Math, JSON, Array, Object, String, Number, Intl, Set, Promise,
  setInterval: (...a) => { const t = setInterval(...a); if(t && t.unref) t.unref(); return t; },
  clearInterval, setTimeout, clearTimeout,
  __net: net,
};
// A network that can be down, empty, or serving something that is not JSON.
sandbox.fetch = (url) => {
  net.calls.push(String(url));
  if(net.offline) return Promise.reject(new TypeError('Failed to fetch'));
  const body = net.files[String(url)];
  if(body === undefined){
    return Promise.resolve({ ok: false, status: 404,
      json: () => Promise.reject(new Error('not found')) });
  }
  return Promise.resolve({ ok: true, status: 200,
    json: () => { try{ return Promise.resolve(JSON.parse(body)); }
                  catch(e){ return Promise.reject(e); } } });
};
sandbox.self = sandbox.window;
sandbox.globalThis = sandbox;
const cloudStub = new Proxy({}, {
  get(_, prop){
    if(prop === 'currentUser') return () => ({ isTeacher: true, schoolId: 'daily-check' });
    return () => Promise.resolve();
  },
});
sandbox.window.CloudSync = cloudStub;
sandbox.CloudSync = cloudStub;
vm.createContext(sandbox);
vm.runInContext(blocks.join('\n;\n') + '\n;\n' + testScript, sandbox)
  .catch(e => { console.error('RUNTIME ERROR:', e.stack); process.exitCode = 1; });

process.on('beforeExit', () => {
  if(process.exitCode === 1 && !sandbox.__inner) return;
  const all = results.concat(sandbox.__inner || []);
  if(!sandbox.__inner) all.push('the page was booted and driven: FAIL');
  console.log(results.join('\n'));
  const fails = all.filter(r => r.indexOf('FAIL') > -1);
  console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + all.length)
                           : ('ALL ' + all.length + ' CHECKS PASS'));
  if(fails.length) process.exitCode = 1;
});
