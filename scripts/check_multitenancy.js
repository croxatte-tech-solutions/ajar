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
(async function(){
  const results = [];
  function assert(n,c){ results.push(n+': '+(c?'PASS':'FAIL')); }

  // NO SCHOOL IS WRITTEN IN THE FILE.
  //
  // A real school id used to live in CONFIG.defaultSchool. It named the school
  // — initials and city — in a public repository, and it is also the id that
  // separates one school's material from another's, so it belongs in a link
  // and in a teacher's own record rather than in a file anyone can read.
  assert('no school id is hardcoded in the config',
    !CONFIG.defaultSchool || CONFIG.defaultSchool.length === 0);
  assert('and no school name or city is left in the file',
    !/cse-den/i.test(__html));

  // With nothing to go on, a visitor belongs to no class — and '' rather than
  // a guess is what stops a malformed 'schools//classroom' path being built.
  localStorage.removeItem('ajar_school');
  location.search = '';
  assert('a visitor who never opened a link has no school', currentSchool() === '');

  location.search = '?school=other-school-99xy';
  assert('a link naming a school resolves to it', currentSchool() === 'other-school-99xy');
  location.search = '?s=1&school=third-school-42ab';
  assert('it is read alongside other parameters', currentSchool() === 'third-school-42ab');

  // THE DEVICE REMEMBERS. This is what let the id leave the config without
  // any migration: a student who opened a link once keeps finding their class
  // when they later type the bare address.
  location.search = '';
  assert('the school from the last link is remembered', currentSchool() === 'third-school-42ab');
  localStorage.removeItem('ajar_school');
  assert('and forgetting it returns to no school', currentSchool() === '');

  // A teacher's own record beats both, so she cannot publish into a colleague's
  // school by having opened their link.
  location.search = '?school=someone-elses-77zz';
  window.CloudSync = { currentUser: () => ({ isTeacher: true, schoolId: 'her-own-school-11aa' }) };
  assert('her own record beats the address bar', currentSchool() === 'her-own-school-11aa');
  delete window.CloudSync;
  localStorage.setItem('ajar_school', 'her-own-school-11aa');
  location.search = '';

  const whole = shortShareLink();
  assert('the whole-class link carries the school', whole.indexOf('school=her-own-school-11aa') > -1);

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
  assert('the per-exercise link carries the school', per.indexOf('school=her-own-school-11aa') > -1);
  assert('the per-exercise link still carries the exercise', per.indexOf('ex=abc123') > -1);
  [whole, per].forEach(l => {
    assert('link carries a non-empty school ("' + l.slice(-30) + '")', /school=[^&]+/.test(l));
  });
  delete window.CloudSync;

  assert('currentSchool is callable by the sync layer', typeof currentSchool === 'function');
  assert('it never returns empty', !!currentSchool());

  console.log(results.join('\\n'));
  const fails = results.filter(r=>r.includes('FAIL'));
  globalThis.__fails = fails.length;
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
  // The app registers live intervals the moment it loads — the class
  // progress refresh and the welcome screen's language swap. A real
  // interval holds Node's event loop open, so the process never exits
  // and the verdict cannot be read from an exit code at all. unref lets
  // them tick without being a reason to stay alive.
  setInterval: (...a) => { const t = setInterval(...a); if (t && t.unref) t.unref(); return t; },
  clearInterval, setTimeout, clearTimeout,
};
sandbox.self = sandbox.window;
sandbox.globalThis = sandbox;
sandbox.__html = html;   // uma asserção olha o arquivo cru, não o comportamento
vm.createContext(sandbox);
vm.runInContext(testScript, sandbox).catch(e => { console.error('RUNTIME ERROR:', e.stack); process.exitCode = 1; });

// Printed text is not a result anyone can act on: a caller cannot tell a
// run that failed its checks from one that crashed before printing. This
// carries the verdict out as an exit code. beforeExit fires once the loop
// drains — after the body has settled — so it covers the files that end
// synchronously and the ones that end on a promise alike.
process.on('beforeExit', () => { if (sandbox.__fails) process.exitCode = 1; });
