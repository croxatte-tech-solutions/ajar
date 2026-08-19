// Every theme in the dropdown must have real content for every task type.
//
// The generators all read `BANK[theme] || BANK.campus`. That fallback is
// sensible defensive code and a silent trap at the same time: if a theme
// is ever missing from one bank, the app does not fail — it quietly hands
// the student campus content while the screen says "Health & Wellbeing".
// A teacher choosing a theme for a reason would get something else and
// never be told.
//
// Nothing is missing today. This exists for the day someone adds a
// fifteenth theme to the picker and fills in eleven of the twelve banks.
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
const el = () => {
  const n = {
    style:{}, innerHTML:'', textContent:'', value:'', id:'',
    classList:{toggle(){},add(){},remove(){},contains:()=>false},
    appendChild(){}, addEventListener(){}, querySelector:()=>el(), querySelectorAll:()=>[],
    closest:()=>null, select(){}, focus(){}, remove(){}, insertBefore(){},
    getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}),
  };
  n.parentNode = { insertBefore(){}, removeChild(){} };
  return n;
};

const testScript = `
(async () => {
  const results = [];
  function assert(n, c){ results.push(n + ': ' + (c ? 'PASS' : 'FAIL')); }
  setStudentName('Theme Check');

  const banks = {
    'Read an Academic Passage': PASSAGE_BANK,
    'Read in Daily Life': DAILY_READ_BANK,
    'Listen to an Academic Talk': TALK_BANK,
    'Listen to a Conversation': CONVERSATION_BANK,
    'Listen to an Announcement': ANNOUNCEMENT_BANK,
    'Listen and Choose a Response': CHOOSE_RESPONSE_BANK,
    'Write an Email': EMAIL_BANK,
    'Academic Discussion': DISCUSSION_BANK,
    'Build a Sentence': SENTENCE_BANK,
    'Complete the Words': COMPLETE_WORDS_BANK,
    'Take an Interview': INTERVIEW_BANK,
    'Listen and Repeat': LISTEN_SETS,
  };

  // --- the picker and the content agree on how many themes there are ---
  assert('there are twelve task types', TASK_TYPES.length === 12);
  assert('every task type has a bank here', Object.keys(banks).length === TASK_TYPES.length);
  assert('the picker offers every theme the labels name',
    ALL_THEMES.every(t => THEME_LABELS[t]));

  // --- no bank is missing a theme ---
  let gaps = [];
  Object.keys(banks).forEach(name => {
    const bank = banks[name];
    const missing = ALL_THEMES.filter(t => !bank[t] || !bank[t].length);
    assert(name + ' has content for all ' + ALL_THEMES.length + ' themes', missing.length === 0);
    missing.forEach(t => gaps.push(name + ' / ' + t));
  });
  if(gaps.length) results.push('  gaps: ' + gaps.join('; '));

  // --- and generating really returns the theme that was asked for ---
  //
  // Checking the bank keys proves the data exists. This proves the
  // generator reaches it.
  //
  // The obvious test — generate for two themes and see if the output
  // matches — does NOT work, and I shipped it wrong once: the bags
  // rotate, so two calls differ even when both fell back to campus. So
  // this checks membership instead. Take the longest string the generator
  // produced and look for it in the bank it was supposed to draw from; if
  // it is not there, it came from somewhere else.
  // --- every generator reads the theme it was handed ---
  //
  // I tried to prove this by generating and looking for the text in the
  // bank. It does not work, twice over: two generators rewrite their
  // source (Complete the Words punches blanks into the passage, Write an
  // Email assembles a prompt around the situation), and the bags rotate,
  // so whether any sentence survives verbatim is a coin toss. The check
  // failed on about three runs in four — random failure, which is worse
  // than no check because it teaches you to ignore the suite.
  //
  // The gap check above is what actually guards the risk: a theme missing
  // from a bank is caught there, deterministically. What is left to
  // confirm is that each generator indexes its bank BY THEME at all,
  // rather than ignoring the argument — which is static, so read it
  // statically.
  const generators = [
    ['genPassage', 'PASSAGE_BANK'], ['genDailyRead', 'DAILY_READ_BANK'],
    ['genTalk', 'TALK_BANK'], ['genConversation', 'CONVERSATION_BANK'],
    ['genAnnouncement', 'ANNOUNCEMENT_BANK'], ['genChooseResponse', 'CHOOSE_RESPONSE_BANK'],
    ['genEmail', 'EMAIL_BANK'], ['genDiscussion', 'DISCUSSION_BANK'],
    ['genSentence', 'SENTENCE_BANK'], ['genCompleteWords', 'COMPLETE_WORDS_BANK'],
    ['genInterview', 'INTERVIEW_BANK'], ['genListenRepeatSet', 'LISTEN_SETS'],
  ];
  generators.forEach(([fn, bank]) => {
    const src = HTML_SOURCE.slice(HTML_SOURCE.indexOf('function ' + fn));
    // fromCharCode, not a backslash escape: this code lives inside a
    // template literal, where the escape is consumed before the string is
    // ever built and the line stops parsing.
    const body = src.slice(0, src.indexOf(String.fromCharCode(10) + '}'));
    assert(fn + ' looks its bank up by theme', body.indexOf(bank + '[theme]') > -1);
  });

  // And every generator returns something for every theme, without throwing.
  let broke = [];
  ALL_THEMES.forEach(theme => TASK_TYPES.forEach(t => {
    try{
      const d = generateOne(t.id, theme).data;
      if(!d || !Object.keys(d).length) broke.push(t.id + ' / ' + theme + ' empty');
    }catch(e){ broke.push(t.id + ' / ' + theme + ' threw'); }
  }));
  assert('all ' + (ALL_THEMES.length * TASK_TYPES.length) + ' type-and-theme combinations generate',
    broke.length === 0);
  if(broke.length) results.push('  broke: ' + broke.slice(0, 6).join('; '));

  // --- a theme is never so thin that rotation is pointless ---
  Object.keys(banks).forEach(name => {
    const bank = banks[name];
    const thin = ALL_THEMES.filter(t => (bank[t] || []).length < 2);
    assert(name + ' offers at least two items per theme', thin.length === 0);
  });


//===================================================================
// EVERY SPOKEN LINE HAS A CLIP, IN EVERY BANK THAT SPEAKS
//===================================================================
/* Two banks were checked for this and three were not. A missing clip is not
   an error anybody sees: audioUrlFor() hashes the sentence, the file 404s,
   and the student silently drops to their own device's voice — which is the
   exact inconsistency the pre-rendering exists to remove. One student hears
   Piper, the one beside them hears their phone, and they are being compared.

   choose-response is the worst place for it to happen and was the one not
   covered: 84 items, one short line each, and the type a class meets most.

   Substring work only, no patterns — this whole file is a template literal. */
if(typeof AUDIO_FILES !== 'undefined' && AUDIO_FILES.size){
  const falta = (rotulo, textos) => {
    const perdidos = [];
    textos.forEach(t => {
      if(!t) return;
      const f = audioUrlFor(t).split('/').pop();
      if(!AUDIO_FILES.has(f)) perdidos.push(f);
    });
    assert(rotulo + ': every spoken line has its clip on disk', perdidos.length === 0,
      perdidos.slice(0, 3).join(' '));
  };
  const todos = b => { const out = []; for(const th of ALL_THEMES) (b[th] || []).forEach(x => out.push(x)); return out; };
  falta('Listen and Choose a Response', todos(CHOOSE_RESPONSE_BANK).map(x => x.prompt));
  falta('Listen to an Announcement', todos(ANNOUNCEMENT_BANK).map(x => x.text));
  /* .items, and it took a wrong guess to find that out. The first version
     read .lines and .sentences, found neither, and asserted nothing at all —
     silently, and passing. So the count is asserted before the contents:
     an empty list here means the shape moved, not that everything is fine. */
  const frases = [];
  todos(LISTEN_SETS).forEach(setItem => (setItem.items || []).forEach(l =>
    frases.push(typeof l === 'string' ? l : (l && l.text))));
  assert('Listen and Repeat: the sentences were actually found', frases.length > 0, frases.length);
  falta('Listen and Repeat', frases);
}

  console.log(results.join('\\n'));
  const fails = results.filter(r => r.includes('FAIL'));
  console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                           : ('ALL ' + results.length + ' CHECKS PASS'));
  globalThis.__fails = fails.length;
})();
`;

const sandbox = {
  // The clips on disk, so the assertions below can ask whether the file the
  // app will request actually exists. Same shape the four per-type files use.
  AUDIO_FILES: new Set(require('fs').existsSync(process.argv[3] || 'audio')
    ? require('fs').readdirSync(process.argv[3] || 'audio') : []),
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  document: { getElementById:()=>el(), createElement:()=>el(), querySelector:()=>el(),
              querySelectorAll:()=>[], addEventListener(){}, body: el() },
  window: { addEventListener(){} },
  localStorage,
  HTML_SOURCE: html,
  location: { origin:'https://example.com', pathname:'/app', hash:'', search:'' },
  navigator: { language:'en-US', languages:['en-US'] },
  confirm: () => true,
  Audio: function(){ this.play = () => Promise.resolve(); this.pause = () => {}; },
  SpeechSynthesisUtterance: function(t){ this.text = t; },
  speechSynthesis: { speak(){}, getVoices(){ return []; }, addEventListener(){}, cancel(){} },
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
