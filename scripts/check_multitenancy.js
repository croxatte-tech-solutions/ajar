// Multi-tenancy. Two schools share one deployment and one database, so the
// thing worth testing is not that it works but that they cannot reach each
// other. The database enforces WRITING (firestore.rules checks that the
// teacher's own document names the school). This file covers the app's
// half: that every share link carries a school, that a link for one school
// resolves to that school rather than the default, and that a school id
// can never come out empty.
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/type\s*=\s*["']module["']/.test(m[1]))
  .map(m => m[2]);
const combined = blocks.join('\n;\n');

function makeElStub(){
  return { style:{}, innerHTML:'', textContent:'', value:'', checked:false,
    classList:{toggle(){},add(){},remove(){}}, appendChild(){}, addEventListener(){},
    querySelector(){return makeElStub();}, closest(){return null;}, select(){}, focus(){} };
}
function makeDocStub(){
  const els = {};
  return { getElementById(id){ if(!els[id]) els[id]=makeElStub(); return els[id]; },
    createElement(){return makeElStub();}, querySelector(){return makeElStub();},
    querySelectorAll(){return [];}, addEventListener(){}, body:makeElStub() };
}
const store = {};
const localStorage = { getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} };

const testScript = `
${combined}
;
(function(){
  const results = [];
  function assert(n,c){ results.push(n+': '+(c?'PASS':'FAIL')); }

  assert('a default school is configured', typeof CONFIG.defaultSchool === 'string' && CONFIG.defaultSchool.length > 0);
  // A guessable id would be no barrier at all, since a student joins by
  // opening a link rather than by signing in.
  assert('the default school id is not a guessable word (got "'+CONFIG.defaultSchool+'")',
    CONFIG.defaultSchool.length >= 12 && /[0-9]/.test(CONFIG.defaultSchool));

  assert('with no parameter it falls back to the default', currentSchool() === CONFIG.defaultSchool);
  location.search = '?school=other-school-99xy';
  assert('a link naming another school resolves to it', currentSchool() === 'other-school-99xy');
  assert('it is NOT silently the default', currentSchool() !== CONFIG.defaultSchool);
  location.search = '?s=1&school=third-school-42ab';
  assert('it is read alongside other parameters', currentSchool() === 'third-school-42ab');
  location.search = '';
  assert('it returns to the default when the parameter goes', currentSchool() === CONFIG.defaultSchool);

  const whole = shortShareLink();
  assert('the whole-class link carries the school', whole.indexOf('school=' + CONFIG.defaultSchool) > -1);

  const item = { id:'abc123', type:'talk', tag:'Listen to an Academic Talk', theme:'campus',
                 status:'approved', data: genTalk('campus') };
  saveBatch([item]);

  // Without cloud sync the app falls back to the older link that carries
  // the whole exercise encoded inside it. That one needs no school,
  // because it never fetches anything — the content IS the link.
  const offline = itemShareLink(item);
  assert('the offline fallback link needs no school', offline.indexOf('#batch=') > -1);

  // With cloud sync the link is a pointer, and a pointer without a school
  // would resolve against whichever school the reader happens to default
  // to. That is the failure this whole change exists to prevent.
  window.CloudSync = { pullClassroomItem(){}, pushClassroomItem(){} };
  const per = itemShareLink(item);
  assert('the per-exercise link carries the school', per.indexOf('school=' + CONFIG.defaultSchool) > -1);
  assert('the per-exercise link still carries the exercise', per.indexOf('ex=abc123') > -1);
  [whole, per].forEach(l => {
    assert('link carries a non-empty school ("' + l.slice(-30) + '")', /school=[^&]+/.test(l));
  });
  delete window.CloudSync;

  assert('currentSchool is callable by the sync layer', typeof currentSchool === 'function');
  assert('it never returns empty', !!currentSchool());

  console.log(results.join('\\n'));
  const fails = results.filter(r=>r.includes('FAIL'));
  console.log(fails.length ? ('FAILURES: '+fails.length+' / '+results.length) : ('ALL '+results.length+' CHECKS PASS'));
})();
`;

const sandbox = {
  btoa: s=>Buffer.from(s,'binary').toString('base64'),
  atob: s=>Buffer.from(s,'base64').toString('binary'),
  document: makeDocStub(),
  window: { addEventListener(){}, _lrState:null, _sentenceState:null },
  localStorage,
  location: { origin:'https://example.com', pathname:'/app', hash:'', search:'' },
  navigator: { language:'en-US', languages:['en-US'], clipboard:{writeText:()=>Promise.resolve()}, mediaDevices:undefined },
  SpeechSynthesisUtterance: function(t){ this.text=t; },
  speechSynthesis: { speak(){}, getVoices(){return [];}, addEventListener(){}, cancel(){} },
  URLSearchParams,
  console, Date, Math, JSON, Array, Object, String, Number, Intl, Set, Promise,
  setInterval, clearInterval, setTimeout, clearTimeout,
};
sandbox.self = sandbox.window;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(testScript, sandbox).catch(e => { console.error('RUNTIME ERROR:', e.stack); process.exitCode = 1; });
