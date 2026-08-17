// Complete the Words: which gaps admit more than one English word?
//
// NOT named check_* on purpose — it needs a system word list
// (/usr/share/dict/words), which not every machine has, so it stays out of
// the scripts/qa.sh gate and is run by hand when the passages change:
//
//   node scripts/audit_cw_ambiguity.js index.html
//
// The task is meant to be resolved by CONTEXT, so the prefix matching several
// words is normal and not a bug. What this hunts is the narrower case where a
// second word is (1) common in this app's own English, (2) the same
// inflection as the key so it fits the slot, and (3) attested in the same
// collocation — i.e. a student could defend it and still be marked wrong.
const fs = require('fs');
const vm = require('vm');
function load(htmlPath, testCode){

  const html = fs.readFileSync(htmlPath, 'utf8');
  const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter(m => !/type\s*=\s*["']module["']/.test(m[1]))
    .map(m => m[2]);
  const combined = blocks.join('\n;\n');

  const nodes = {};
  const el = (id) => {
    if(id && nodes[id]) return nodes[id];
    const n = { style:{}, innerHTML:'', textContent:'', value:'', id: id || '', children: [],
      checked:false, disabled:false, dataset:{},
      classList:{ _s:new Set(), toggle(c,v){ if(v===undefined){ this._s.has(c)?this._s.delete(c):this._s.add(c); } else if(v){ this._s.add(c); } else { this._s.delete(c); } },
        add(...c){ c.forEach(x=>this._s.add(x)); }, remove(...c){ c.forEach(x=>this._s.delete(x)); }, contains(c){ return this._s.has(c); } },
      addEventListener(){}, querySelector:()=>el(), querySelectorAll:()=>[],
      closest:()=>null, select(){}, focus(){}, blur(){}, remove(){}, insertBefore(){}, scrollIntoView(){},
      getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}) };
    n.appendChild = c => { n.children.push(c); };
    n.parentNode = { insertBefore(){}, removeChild(){} };
    if(id) nodes[id] = n;
    return n;
  };
  const store = {};
  const sandbox = {
    btoa: s=>Buffer.from(s,'binary').toString('base64'),
    atob: s=>Buffer.from(s,'base64').toString('binary'),
    document: { getElementById: id => el(id), createElement: () => el(),
      querySelector: () => el(), querySelectorAll: () => [], addEventListener(){},
      body: el('__body'), documentElement: el('__html'), head: el('__head'),
      createTextNode: () => el(), title:'' },
    window: { addEventListener(){}, removeEventListener(){}, _lrState:null, _sentenceState:null,
      matchMedia: () => ({ matches:false, addEventListener(){} }), scrollTo(){}, print(){},
      innerWidth:1024, innerHeight:768, getComputedStyle: () => ({ getPropertyValue: () => '' }) },
    localStorage: { getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);},
      removeItem:k=>{delete store[k];}, clear:()=>{ for(const k in store) delete store[k]; }, key:i=>Object.keys(store)[i], get length(){return Object.keys(store).length;} },
    location: { origin:'https://example.com', pathname:'/app', hash:'', search:'', href:'https://example.com/app' },
    navigator: { language:'en-US', languages:['en-US'], clipboard:{writeText:()=>Promise.resolve()},
      userAgent:'node' },
    SpeechSynthesisUtterance: function(t){ this.text=t; },
    speechSynthesis: { speak(){}, getVoices(){return [];}, addEventListener(){}, cancel(){}, pause(){}, resume(){} },
    Audio: function(){ return { play:()=>Promise.resolve(), pause(){}, addEventListener(){}, load(){} }; },
    fetch: () => Promise.reject(new Error('no network in harness')),
    URLSearchParams, TextEncoder, TextDecoder,
    console, Date, Math, JSON, Array, Object, String, Number, Boolean, Intl, Set, Map, WeakMap, Promise,
    RegExp, Error, TypeError, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
    setInterval: (...a) => { const t = setInterval(...a); if (t && t.unref) t.unref(); return t; },
    clearInterval, setTimeout, clearTimeout, requestAnimationFrame: f => setTimeout(f,0), cancelAnimationFrame: clearTimeout,
    __el: el, __nodes: nodes, __store: store,
  };
  sandbox.self = sandbox.window;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(combined + '\n;\n' + (testCode || ''), sandbox);
  return sandbox;
}

// Final narrowing for "more than one English word fits this blank".
// A rival counts only when all four hold:
//   1. it is an English word matching prefix + exact hidden-letter count
//   2. it appears >=3 times in the app's own English content (a word a
//      student here would actually produce)
//   3. it is in the same inflectional class as the key (fits the same slot
//      grammatically)
//   4. the collocation it would form is attested in the app's own corpus —
//      "<word before the blank> <rival>" or "<rival> <word after the blank>"
//      occurs somewhere in the app's text. That is the mechanical stand-in
//      for "reads naturally in this sentence".

const HTML = process.argv[2] || 'index.html';

const raw = fs.readFileSync(HTML, 'utf8');
const words = (raw.match(/[A-Za-z']{2,}/g) || []).map(w => w.toLowerCase().replace(/'/g, ''));
const freq = new Map();
const bigrams = new Set();
for (let i = 0; i < words.length; i++) {
  freq.set(words[i], (freq.get(words[i]) || 0) + 1);
  if (i + 1 < words.length) bigrams.add(words[i] + ' ' + words[i + 1]);
}
const base = fs.readFileSync('/usr/share/dict/words', 'utf8').split('\n')
  .map(w => w.trim().toLowerCase()).filter(w => /^[a-z]{2,}$/.test(w));
const dict = new Set(base);
for (const w of base) {
  dict.add(w + 's');
  if (/e$/.test(w)) { dict.add(w.slice(0, -1) + 'ing'); dict.add(w + 'd'); }
  else { dict.add(w + 'ing'); dict.add(w + 'ed'); }
  if (/y$/.test(w)) { dict.add(w.slice(0, -1) + 'ies'); dict.add(w.slice(0, -1) + 'ied'); }
}
const cls = w =>
  /ly$/.test(w) ? 'ly' : /ing$/.test(w) ? 'ing' : /(ied|ed)$/.test(w) ? 'ed' :
  /(ies|es|s)$/.test(w) ? 's' : /(tion|sion)$/.test(w) ? 'tion' : /ment$/.test(w) ? 'ment' :
  /ness$/.test(w) ? 'ness' : /(able|ible)$/.test(w) ? 'able' : /(er|or)$/.test(w) ? 'er' :
  /ive$/.test(w) ? 'ive' : /(ful|ous|al|ic)$/.test(w) ? 'adj' : 'bare';

const sandbox = load(HTML, `
globalThis.__blanks = [];
for(const theme of ALL_THEMES){
  (COMPLETE_WORDS_BANK[theme] || []).forEach((rawP, pi) => {
    const plain = rawP.replace(/\\*\\*(.+?)\\*\\*/g, '$1');
    const toks = plain.split(/\\s+/);
    [...rawP.matchAll(/\\*\\*(.+?)\\*\\*/g)].forEach((m, wi) => {
      const w = m[1], b = blankInfo(w);
      const at = toks.findIndex(t => t.replace(/[^A-Za-z]/g,'').toLowerCase() === w.toLowerCase());
      const clean = t => (t || '').replace(/[^A-Za-z]/g,'').toLowerCase();
      __blanks.push({ theme, passage: pi, idx: wi, word: w, shown: b.shown, hidden: b.hiddenCount,
        prev: clean(toks[at-1]), next: clean(toks[at+1]),
        sentence: (plain.split(/(?<=[.!?])\\s+/).find(s => new RegExp('\\\\b'+w+'\\\\b').test(s)) || '') });
    });
  });
}
`);

let n = 0;
for (const b of sandbox.__blanks) {
  const len = b.shown.length + b.hidden;
  const re = new RegExp('^' + b.shown + '[a-z]{' + b.hidden + '}$');
  const key = b.word.toLowerCase();
  const rivals = [];
  for (const w of dict) {
    if (w.length !== len || w === key || !re.test(w)) continue;
    if ((freq.get(w) || 0) < 3) continue;
    if (cls(w) !== cls(key)) continue;
    const fitsLeft  = b.prev && bigrams.has(b.prev + ' ' + w);
    const fitsRight = b.next && bigrams.has(w + ' ' + b.next);
    if (!fitsLeft && !fitsRight) continue;
    rivals.push(w + (fitsLeft && fitsRight ? '(both sides)' : fitsLeft ? '(after "' + b.prev + '")' : '(before "' + b.next + '")'));
  }
  if (!rivals.length) continue;
  n++;
  console.log(`${b.theme}/p${b.passage} gap ${b.idx + 1}: student sees "${b.shown}${'_'.repeat(b.hidden)}", key "${b.word}"`);
  console.log(`   also fits the slot: ${rivals.join(', ')}`);
  console.log(`   "${b.sentence.trim().replace(new RegExp('\\\\b' + b.word + '\\\\b'), '____')}"`);
}
console.log(`\n${n} of ${sandbox.__blanks.length} blanks admit a second word that is common, same-inflection, and attested in the same collocation.`);
