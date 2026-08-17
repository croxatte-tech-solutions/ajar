// How exploitable each bank is without reading or listening.
//
// Reports the honest rate: the strategy "always pick the longest" has to GUESS
// among ties, so k options tied for longest with the correct one among them
// scores 1/k. The original audit used indexOf(max), crediting a full point
// whenever the correct answer merely sorted first among equals, which is why
// it reported 57% on conversation where the real figure is 48%.
//
//   node scripts/measure_length_bias.js
const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(process.argv[2]||'index.html','utf8');
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

const by={};
// Honest exploitability: the strategy "always pick the longest" has to GUESS
// among ties. k options tied for longest, correct among them => scores 1/k.
// The audit used indexOf(max), which credits the strategy a full point whenever
// the correct answer merely sorts first among equals. That overstates it.
qs.forEach(x=>{
  const L=x.q.options.map(s=>String(s).length);
  const mx=Math.max(...L),mn=Math.min(...L);
  const kMax=L.filter(v=>v===mx).length,kMin=L.filter(v=>v===mn).length;
  const b=by[x.type]=by[x.type]||{n:0,long:0,short:0,chance:0,hardLong:[],hardShort:[]};
  b.n++; b.chance+=1/L.length;
  if(L[x.q.answer]===mx){b.long+=1/kMax; if(kMax===1)b.hardLong.push(x.where);}
  if(L[x.q.answer]===mn){b.short+=1/kMin; if(kMin===1)b.hardShort.push(x.where);}
});
const pc=v=>Math.round(v*100)+'%';
console.log('type              n   longest  shortest   chance');
for(const t in by){const b=by[t];
  console.log(t.padEnd(16),String(b.n).padStart(3),
    pc(b.long/b.n).padStart(7), pc(b.short/b.n).padStart(9), pc(b.chance/b.n).padStart(8));}
console.log('\nQuestions where the correct answer is the UNIQUE extreme (the ones worth editing):');
for(const t in by){const b=by[t];
  console.log(' ',t.padEnd(16),'longest',String(b.hardLong.length).padStart(3),' shortest',String(b.hardShort.length).padStart(3));}
console.log(JSON.stringify(Object.fromEntries(Object.entries(by).map(([k,v])=>[k,{long:v.hardLong,short:v.hardShort}])),null,1).slice(0,0));
require('fs').writeFileSync('/tmp/bias_targets.json',JSON.stringify(Object.fromEntries(Object.entries(by).map(([k,v])=>[k,{long:v.hardLong,short:v.hardShort}])),null,1));
