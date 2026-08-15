// Loads the app's script blocks and dumps every spoken text with the
// exercise it belongs to, so the audio generator can assign one voice per
// exercise (never per sentence) the way the real test does.
const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync(process.argv[2],'utf8');
const blocks=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m=>!/type\s*=\s*["']module["']/.test(m[1])).map(m=>m[2]);
const el=()=>({style:{},innerHTML:'',textContent:'',value:'',classList:{toggle(){},add(){},remove(){},contains:()=>false},
  appendChild(){},addEventListener(){},querySelector:()=>el(),closest:()=>null,select(){},focus(){}});
const sb={btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
  document:{getElementById:()=>el(),createElement:()=>el(),querySelector:()=>el(),querySelectorAll:()=>[],addEventListener(){},body:el()},
  window:{addEventListener(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  location:{origin:'https://x',pathname:'/',hash:'',search:''},navigator:{language:'en-US',languages:['en-US']},
  SpeechSynthesisUtterance:function(){},speechSynthesis:{speak(){},getVoices:()=>[],addEventListener(){},cancel(){}},
  Audio:function(){this.play=()=>Promise.resolve();this.pause=()=>{};},
  URLSearchParams,console,Date,Math,JSON,Array,Object,String,Number,Intl,Set,Promise,setInterval,clearInterval,setTimeout,clearTimeout};
sb.self=sb.window; sb.globalThis=sb; vm.createContext(sb);
vm.runInContext(blocks.join('\n;\n')+`
globalThis.__dump = { themes: ALL_THEMES, listen: LISTEN_SETS, interview: INTERVIEW_BANK, hash: hashStr };
`, sb);
const d=sb.__dump, out=[];
for(const th of d.themes){
  (d.listen[th]||[]).forEach((s,i)=>out.push({kind:'lr', theme:th, set:0, idx:i, text:s.text}));
  (d.interview[th]||[]).forEach((set,si)=>set.questions.forEach((q,qi)=>
    out.push({kind:'iv', theme:th, set:si, idx:qi, text:q.text})));
}
out.forEach(o=>o.hash=d.hash(o.text));
fs.writeFileSync(process.argv[3], JSON.stringify(out,null,1));
console.log('themes:',d.themes.length,'| clips:',out.length,
  '| lr:',out.filter(o=>o.kind==='lr').length,'| iv:',out.filter(o=>o.kind==='iv').length);
