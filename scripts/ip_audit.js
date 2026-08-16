// Copyright audit: does OUR content reproduce ETS's copyrighted expression?
// Test formats/ideas are not copyrightable; specific wording is. This looks
// for shared word sequences between our banks and ETS's own materials.
const fs=require('fs'), vm=require('vm'), path=require('path');
const html=fs.readFileSync('real-life-english-repo/index.html','utf8');
const blocks=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m=>!/type\s*=\s*["']module["']/.test(m[1])).map(m=>m[2]);
const el=()=>({style:{},innerHTML:'',classList:{toggle(){},add(){},remove(){},contains:()=>false},appendChild(){},addEventListener(){},querySelector:()=>el(),closest:()=>null,select(){},focus(){}});
const sb={btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
 document:{getElementById:()=>el(),createElement:()=>el(),querySelector:()=>el(),querySelectorAll:()=>[],addEventListener(){},body:el()},
 window:{addEventListener(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 location:{origin:'https://x',pathname:'/',hash:'',search:''},navigator:{language:'en-US',languages:['en-US']},
 SpeechSynthesisUtterance:function(){},speechSynthesis:{speak(){},getVoices:()=>[],addEventListener(){},cancel(){}},
 Audio:function(){this.play=()=>Promise.resolve();this.pause=()=>{};},URLSearchParams,console,Date,Math,JSON,Array,Object,String,Number,Intl,Set,Promise,setInterval,clearInterval,setTimeout,clearTimeout};
sb.self=sb.window;sb.globalThis=sb;vm.createContext(sb);
vm.runInContext(blocks.join('\n;\n')+`;globalThis.__c={
 lr:LISTEN_SETS, iv:INTERVIEW_BANK, em:EMAIL_BANK, di:DISCUSSION_BANK,
 cw:COMPLETE_WORDS_BANK, se:SENTENCE_BANK, cr:CHOOSE_RESPONSE_BANK, themes:ALL_THEMES};`, sb);
const c=sb.__c;

// every user-facing string we ship
const ours=[];
for(const th of c.themes){
  (c.lr[th]||[]).forEach(s=>{ ours.push(s.situation); s.items.forEach(i=>ours.push(i.text)); });
  (c.iv[th]||[]).forEach(s=>{ if(s.scenario) ours.push(s.scenario); s.questions.forEach(q=>ours.push(q.text)); });
  (c.em[th]||[]).forEach(e=>{ ours.push(e.situation); e.bullets.forEach(b=>ours.push(b)); });
  (c.di[th]||[]).forEach(d=>{ ours.push(d.professor.post); d.posts.forEach(p=>ours.push(p.text)); });
  (c.cw[th]||[]).forEach(p=>ours.push(String(p).replace(/\*\*/g,'')));
  (c.cr[th]||[]).forEach(q=>{ ours.push(q.prompt); q.options.forEach(o=>ours.push(o)); });
  (c.se[th]||[]).forEach(s=>ours.push(s.target));
}

const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);
const N=Number(process.env.IP_N||7);   // 8+ consecutive shared words = meaningful expressive overlap
function grams(words){ const g=new Set(); for(let i=0;i+N<=words.length;i++) g.add(words.slice(i,i+N).join(' ')); return g; }

// ETS source corpus
const dir='ets-pdfs/txt';
const etsGrams=new Map();
for(const f of fs.readdirSync(dir).filter(x=>x.endsWith('.txt'))){
  const w=norm(fs.readFileSync(path.join(dir,f),'utf8'));
  for(const g of grams(w)) if(!etsGrams.has(g)) etsGrams.set(g,f);
}
console.log('corpus ETS:', fs.readdirSync(dir).filter(x=>x.endsWith('.txt')).length, 'documentos |', etsGrams.size, 'sequencias de', N, 'palavras');
console.log('nosso conteudo:', ours.length, 'strings\n');

const hits=[];
for(const s of ours){
  const w=norm(s);
  for(const g of grams(w)) if(etsGrams.has(g)) hits.push({g, src:etsGrams.get(g), ours:s});
}
const uniq=[...new Map(hits.map(h=>[h.g,h])).values()];

// --- second pass: which of OUR strings, and how long a verbatim run ---
const areas={};
for(const th of c.themes){
  (c.lr[th]||[]).forEach(s=>{ (areas['LR situation']=areas['LR situation']||[]).push(s.situation);
                              s.items.forEach(i=>(areas['LR sentence']=areas['LR sentence']||[]).push(i.text)); });
  (c.iv[th]||[]).forEach(s=>{ if(s.scenario)(areas['Interview scenario']=areas['Interview scenario']||[]).push(s.scenario);
                              s.questions.forEach(q=>(areas['Interview question']=areas['Interview question']||[]).push(q.text)); });
  (c.em[th]||[]).forEach(e=>{ (areas['Email situation']=areas['Email situation']||[]).push(e.situation);
                              e.bullets.forEach(b=>(areas['Email bullet']=areas['Email bullet']||[]).push(b)); });
  (c.di[th]||[]).forEach(d=>{ (areas['Discussion professor']=areas['Discussion professor']||[]).push(d.professor.post);
                              d.posts.forEach(p=>(areas['Discussion student']=areas['Discussion student']||[]).push(p.text)); });
  (c.cw[th]||[]).forEach(p=>(areas['Complete the Words']=areas['Complete the Words']||[]).push(String(p).replace(/\*\*/g,'')));
  (c.se[th]||[]).forEach(s=>(areas['Build a Sentence']=areas['Build a Sentence']||[]).push(s.target));
  (c.cr[th]||[]).forEach(q=>{ (areas['Choose Response prompt']=areas['Choose Response prompt']||[]).push(q.prompt);
                              q.options.forEach(o=>(areas['Choose Response option']=areas['Choose Response option']||[]).push(o)); });
}
function longestRun(s){
  const w=norm(s); let best=0;
  for(let i=0;i<w.length;i++){
    if(i+N<=w.length && etsGrams.has(w.slice(i,i+N).join(' '))){
      let L=N; while(i+L<w.length && etsGrams.has(w.slice(i+L-N+1,i+L+1).join(' '))) L++;
      if(L>best) best=L;
    }
  }
  return best;
}
let total=0;
console.log('area                    afetados / total   pior trecho');
for(const [area,list] of Object.entries(areas)){
  const bad=list.map(s=>({s,run:longestRun(s)})).filter(x=>x.run>=N);
  total+=bad.length;
  const worst=bad.sort((a,b)=>b.run-a.run)[0];
  console.log(`${area.padEnd(22)} ${String(bad.length).padStart(4)} / ${String(list.length).padStart(4)}` +
    (worst?`      ${worst.run} palavras\n     -> "${worst.s.slice(0,100)}"`:''));
}
console.log('');
console.log(total === 0
  ? 'ALL CLEAR: nenhuma sobreposicao de '+N+'+ palavras com material da ETS ('+ours.length+' strings verificadas)'
  : 'FAILURES: '+total+' strings reproduzem expressao da ETS');
if(total>0) process.exitCode = 1;
if(process.env.IP_LIST){
  console.log('\n--- strings ---');
  for(const [area,list] of Object.entries(areas))
    for(const s of list){ const r=longestRun(s); if(r>=N) console.log(`[${area}|${r}] ${s}`); }
}
