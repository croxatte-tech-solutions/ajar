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
globalThis.__dump = { themes: ALL_THEMES, listen: LISTEN_SETS, interview: INTERVIEW_BANK, choose: CHOOSE_RESPONSE_BANK, ann: ANNOUNCEMENT_BANK, conv: CONVERSATION_BANK, convText: conversationText, talk: TALK_BANK, hash: hashStr };
`, sb);
const d=sb.__dump, out=[];
for(const th of d.themes){
  // LISTEN_SETS[theme] is now an array of complete 7-sentence scenarios,
  // so each scenario is its own "exercise" and gets its own single voice.
  (d.listen[th]||[]).forEach((sc,si)=>sc.items.forEach((s,i)=>
    out.push({kind:'lr', theme:th, set:si, idx:i, text:s.text})));
  (d.interview[th]||[]).forEach((set,si)=>set.questions.forEach((q,qi)=>
    out.push({kind:'iv', theme:th, set:si, idx:qi, text:q.text})));
  // Listen and Choose prompts are heard, never read. Each theme's bank is
  // one 'exercise' for voice purposes, so a drawn set sounds like one person.
  (d.choose[th]||[]).forEach((q,qi)=>out.push({kind:'cr', theme:th, set:0, idx:qi, text:q.prompt}));
  // Each announcement is its own exercise for voice purposes -- one
  // speaker delivering one notice, as in the real recordings.
  (d.ann[th]||[]).forEach((a,ai)=>out.push({kind:'an', theme:th, set:ai, idx:0, text:a.text}));
  // A conversation is TWO speakers in one clip, so it carries its turns
  // along and the generator renders each turn with its own voice before
  // stitching them. The hash still comes from the joined text alone, which
  // is exactly what the app asks for at play time.
  (d.conv[th]||[]).forEach((c,ci)=>out.push({kind:'cv', theme:th, set:ci, idx:0,
    text:d.convText(c.turns), turns:c.turns.map(t=>({s:t[0], t:t[1]}))}));
  // An academic talk is one speaker for ~200 words -- one clip, one voice,
  // the longest single utterance the app renders.
  (d.talk[th]||[]).forEach((k,ki)=>out.push({kind:'tk', theme:th, set:ki, idx:0, text:k.text}));
}
out.forEach(o=>o.hash=d.hash(o.text));
fs.writeFileSync(process.argv[3], JSON.stringify(out,null,1));
console.log('themes:',d.themes.length,'| clips:',out.length,
  '| lr:',out.filter(o=>o.kind==='lr').length,'| iv:',out.filter(o=>o.kind==='iv').length,
  '| cv:',out.filter(o=>o.kind==='cv').length,'| tk:',out.filter(o=>o.kind==='tk').length);
