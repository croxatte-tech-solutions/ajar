// Writes /tmp/bank_<type>.txt: the questions where the correct answer is the
// unique length extreme, worst gap first, with every option and its length.
// Input for editing distractors — see AUDITORIA for the two rules a fix has
// to satisfy at once (character length must cross, word count must not).
//
//   node scripts/dump_bias_targets.js
const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const blocks=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].filter(m=>!/type\s*=\s*["']module["']/.test(m[1])).map(m=>m[2]);
const nodes={};const el=id=>{if(id&&nodes[id])return nodes[id];const n={style:{},innerHTML:'',textContent:'',value:'',id:id||'',children:[],classList:{toggle(){},add(){},remove(){},contains:()=>false},addEventListener(){},querySelector:()=>el(),querySelectorAll:()=>[],closest:()=>null,select(){},focus(){},remove(){},insertBefore(){},scrollIntoView(){},getBoundingClientRect:()=>({top:0,left:0,width:0,height:0})};n.appendChild=c=>n.children.push(c);n.parentNode={insertBefore(){},removeChild(){}};if(id)nodes[id]=n;return n;};
const store={};
const sb={document:{getElementById:el,createElement:()=>el(),querySelector:()=>el(),querySelectorAll:()=>[],addEventListener(){},body:el()},window:{addEventListener(){},scrollTo(){}},localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}},location:{origin:'https://h.com',pathname:'/',hash:'',search:'',href:'https://h.com/'},history:{replaceState(){}},URL,URLSearchParams,navigator:{language:'en-US',languages:['en-US']},btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),confirm:()=>true,Audio:function(){this.play=()=>Promise.resolve();this.pause=()=>{}},SpeechSynthesisUtterance:function(t){this.text=t},speechSynthesis:{speak(){},getVoices:()=>[],addEventListener(){},cancel(){}},console:{log(){},info(){},warn(){},error(){}},Date,Math,JSON,Array,Object,String,Number,Intl,Set,Map,Promise,Function,RegExp,setInterval:(...a)=>{const t=setInterval(...a);t&&t.unref&&t.unref();return t},clearInterval,setTimeout,clearTimeout};
sb.self=sb.window;sb.globalThis=sb;vm.createContext(sb);
vm.runInContext(blocks.join('\n;\n')+';globalThis.__B={CHOOSE_RESPONSE_BANK,ANNOUNCEMENT_BANK,CONVERSATION_BANK,TALK_BANK,DAILY_READ_BANK,PASSAGE_BANK};',sb);
const B=sb.__B;
const qs=[];
const add=(t,th,i,q)=>qs.push({type:t,where:th+'#'+i,q});
for(const th in B.CHOOSE_RESPONSE_BANK)B.CHOOSE_RESPONSE_BANK[th].forEach((it,i)=>add('choose-response',th,i,{options:it.options,answer:it.answer}));
for(const k of [['announcement','ANNOUNCEMENT_BANK'],['conversation','CONVERSATION_BANK'],['talk','TALK_BANK'],['daily-read','DAILY_READ_BANK'],['passage','PASSAGE_BANK']])
  for(const th in B[k[1]])B[k[1]][th].forEach((a,i)=>a.questions.forEach((q,j)=>add(k[0],th,i+'.'+j,q)));

const NEED={'announcement':['longest',14],'conversation':['longest',18],
            'talk':['shortest',18],'daily-read':['longest',12],'passage':['shortest',22]};
const out={};
qs.forEach(x=>{
  const L=x.q.options.map(s=>String(s).length),a=x.q.answer;
  const mx=Math.max(...L),mn=Math.min(...L),others=L.filter((_,i)=>i!==a);
  const t=out[x.type]=out[x.type]||{longest:[],shortest:[]};
  if(L[a]===mx&&L.filter(v=>v===mx).length===1)
    t.longest.push({where:x.where,gap:L[a]-Math.max(...others),q:x.q,L});
  if(L[a]===mn&&L.filter(v=>v===mn).length===1)
    t.shortest.push({where:x.where,gap:Math.min(...others)-L[a],q:x.q,L});
});

for(const t in NEED){const [dir,k]=NEED[t];
  const list=out[t][dir].sort((p,r)=>r.gap-p.gap).slice(0,k);
  let s='BANK: '+t+'   PROBLEM: the correct answer is the '+(dir==='longest'?'LONGEST':'SHORTEST')+' option\n';
  s+='Questions: '+list.length+'\n\n';
  list.forEach(o=>{
    s+='--- '+o.where+'   (correct is '+o.L[o.q.answer]+' chars; '+
       (dir==='longest'?'next longest is '+(o.L[o.q.answer]-o.gap):'next shortest is '+(o.L[o.q.answer]+o.gap))+')\n';
    if(o.q.q) s+='QUESTION: '+o.q.q+'\n';
    o.q.options.forEach((op,i)=>{ s+=(i===o.q.answer?'  CORRECT  ':'  wrong    ')+'['+String(op).length+'] '+op+'\n'; });
    s+='\n';
  });
  fs.writeFileSync('/tmp/bank_'+t+'.txt',s);
  console.log(t, list.length);
}
