// Difficulty calibration: measure every bank against the real ETS items.
// Facts only — where we sit versus the exam, so tuning targets the gaps
// instead of guessing.
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
vm.runInContext(blocks.join('\n;\n')+`;globalThis.__k={t:ALL_THEMES,cw:COMPLETE_WORDS_BANK,se:SENTENCE_BANK,
 em:EMAIL_BANK,di:DISCUSSION_BANK,cr:CHOOSE_RESPONSE_BANK,iv:INTERVIEW_BANK};`, sb);
const k=sb.__k;
const words=s=>String(s||'').trim().split(/\s+/).filter(Boolean).length;
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)];};
const stat=a=>a.length?`mediana ${med(a)}  faixa ${Math.min(...a)}-${Math.max(...a)}`:'—';

function row(label, ours, ets){
  const pad=(s,n)=>String(s).padEnd(n);
  console.log(pad(label,26)+pad('NOSSO: '+stat(ours),34)+'ETS: '+ets);
}
console.log('=== CALIBRAGEM DE DIFICULDADE (palavras, salvo indicado) ===\n');

// Complete the Words — ETS: 70-100 words, 10 blanks
const cw=[]; k.t.forEach(t=>(k.cw[t]||[]).forEach(p=>cw.push(words(String(p).replace(/\*\*/g,'')))));
row('Complete the Words', cw, '70-100 (regra publicada)');

// Build a Sentence — 43 real targets extracted from answer keys
const se=[]; k.t.forEach(t=>(k.se[t]||[]).forEach(s=>se.push(words(s.target))));
row('Build a Sentence', se, 'mediana 9  faixa 4-14  (n=43 reais)');

// Listen and Choose — 16 real audio items measured separately
const crp=[], cro=[]; k.t.forEach(t=>(k.cr[t]||[]).forEach(q=>{crp.push(words(q.prompt)); q.options.forEach(o=>cro.push(words(o)));}));
row('L&Choose prompt', crp, '~11 (exemplo oficial)');
row('L&Choose opcoes', cro, '9-10 (exemplo oficial)');

// Interview questions — 4 real sample questions from the overview
const ivq=[]; k.t.forEach(t=>(k.iv[t]||[]).forEach(s=>s.questions.forEach(q=>ivq.push(words(q.text)))));
row('Interview pergunta', ivq, 'mediana 42  faixa 33-52  (n=4 reais)');

// Email situation — real ones from the 7 practice tests
const ems=[]; k.t.forEach(t=>(k.em[t]||[]).forEach(e=>ems.push(words(e.situation))));
row('Email situacao', ems, 'mediana 41  faixa 34-46  (n=7 reais)');

// Discussion — professor post and student replies
const dip=[], dis=[]; k.t.forEach(t=>(k.di[t]||[]).forEach(d=>{dip.push(words(d.professor.post)); d.posts.forEach(p=>dis.push(words(p.text)));}));
row('Discussion professor', dip, 'mediana 62  faixa 55-70  (n=3 reais)');
row('Discussion aluno', dis, 'mediana 48  faixa 40-56  (n=6 reais)');

console.log('\n=== ITENS ABAIXO DO MINIMO DA ETS (o trabalho real) ===');
function below(label, arr, min, audio){
  const n=arr.filter(x=>x<min).length;
  console.log(`${label.padEnd(26)} ${String(n).padStart(4)} / ${String(arr.length).padStart(4)} abaixo de ${min}` + (audio?`   (${audio} clipes a regerar)`:''));
}
below('Build a Sentence', se, 9, 0);
below('L&Choose prompt', crp, 10, 'ate 84');
below('L&Choose opcoes', cro, 9, 0);
below('Interview pergunta', ivq, 33, 'ate 112');
below('Email situacao', ems, 34, 0);
below('Discussion aluno', dis, 40, 0);
below('Discussion professor', dip, 55, 0);
