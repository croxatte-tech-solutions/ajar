// Render the app's own QR codes to PNG, headlessly.
//
// Part one of the QR verification pipeline. This deliberately uses the
// SAME qrcode library the app ships, loaded out of index.html, so what
// gets checked is what a student's camera will point at — not a
// re-implementation that could agree with itself while both are wrong.
//
// PNG is written by hand from the module matrix rather than by
// rasterising the SVG. Rasterising would drag in a converter, a browser,
// or a pip install, and each of those is a place for the test to become
// about the tooling instead of about the QR. zlib is in Node already.
//
//   node scripts/qr_render.js index.html out/
//
// Writes out/NN_type.png plus out/manifest.json holding the link each
// image is supposed to encode.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const htmlPath = process.argv[2] || 'index.html';
const outDir = process.argv[3] || 'qr-out';
const COUNT = Number(process.argv[4] || 8);

const html = fs.readFileSync(htmlPath, 'utf8');
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/type\s*=\s*["']module["']/.test(m[1]))
  .map(m => m[2]);

// --- minimal PNG writer: 1 byte per pixel, greyscale, no filtering ---
function crc32(buf){
  let c, crc = 0xffffffff;
  for(let n = 0; n < buf.length; n++){
    c = (crc ^ buf[n]) & 0xff;
    for(let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function greyPng(pixels, width, height){
  const raw = Buffer.alloc((width + 1) * height);
  for(let y = 0; y < height; y++){
    raw[y * (width + 1)] = 0;                       // filter: none
    pixels.copy(raw, y * (width + 1) + 1, y * width, (y + 1) * width);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // 8-bit
  ihdr[9] = 0;   // greyscale
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// A QR needs a quiet zone — four modules of white on every side. Without
// it many scanners simply refuse, and that failure looks like "the app is
// broken" to whoever is holding the phone.
const QUIET = 4;
const SCALE = 8;

function qrToPng(qr){
  const count = qr.getModuleCount();
  const side = (count + QUIET * 2) * SCALE;
  const px = Buffer.alloc(side * side, 255);
  for(let r = 0; r < count; r++){
    for(let c = 0; c < count; c++){
      if(!qr.isDark(r, c)) continue;
      for(let dy = 0; dy < SCALE; dy++){
        const y = (r + QUIET) * SCALE + dy;
        const start = y * side + (c + QUIET) * SCALE;
        px.fill(0, start, start + SCALE);
      }
    }
  }
  return { png: greyPng(px, side, side), modules: count, sidePx: side };
}

// --- run the app, build a realistic batch, render each QR ---
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
    appendChild(){}, addEventListener(){}, querySelector:()=>el(),
    querySelectorAll:()=>[], closest:()=>null, select(){}, focus(){},
    remove(){}, insertBefore(){},
    getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}),
  };
  n.parentNode = { insertBefore(){}, removeChild(){} };
  return n;
};
const sandbox = {
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  document: { getElementById:()=>el(), createElement:()=>el(), querySelector:()=>el(),
              querySelectorAll:()=>[], addEventListener(){}, body: el() },
  window: { addEventListener(){} },
  localStorage,
  location: { origin:'https://hiajar.com', pathname:'/', hash:'', search:'' },
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
// Firebase is what makes the share link short. Without it itemShareLink
// packs the whole exercise into the URL and no QR can hold it — that is a
// real state, tested separately, but the codes a class scans are the
// online ones, so stand a stub in for CloudSync here.
// A Proxy rather than a hand-listed stub: start-up calls several CloudSync
// methods, and enumerating them here would mean this script breaks every
// time one is added. Anything asked for resolves; currentUser answers for
// real, because that is the one the link shape depends on.
const cloudStub = new Proxy({}, {
  get(_, prop){
    if(prop === 'currentUser') return () => ({ isTeacher: true, schoolId: 'verify-school' });
    return () => Promise.resolve();
  },
});
sandbox.window.CloudSync = cloudStub;
sandbox.CloudSync = cloudStub;
vm.runInContext(blocks.join('\n;\n') +
  ';globalThis.__api={generateOne,itemShareLink,tagFor,uid,qrcode,TASK_TYPES,ALL_THEMES,setStudentName};',
  sandbox);

const api = sandbox.__api;
api.setStudentName('QR Verify');
fs.mkdirSync(outDir, { recursive: true });

const manifest = [];
for(let i = 0; i < COUNT; i++){
  const t = api.TASK_TYPES[i % api.TASK_TYPES.length];
  const theme = api.ALL_THEMES[i % api.ALL_THEMES.length];
  const item = { id: api.uid(), type: t.id, tag: t.tag, theme,
                 status: 'approved', data: api.generateOne(t.id, theme).data };
  const link = api.itemShareLink(item);

  const qr = api.qrcode(0, 'M');
  qr.addData(link);
  qr.make();
  const { png, modules, sidePx } = qrToPng(qr);

  const name = String(i).padStart(2, '0') + '_' + t.id + '.png';
  fs.writeFileSync(path.join(outDir, name), png);
  manifest.push({ file: name, type: t.id, theme, id: item.id, link, modules, sidePx });
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('rendered ' + manifest.length + ' QR codes to ' + outDir);
