// The student's voice: captured, replayed, and measured.
//
// THE FAULT THIS EXISTS FOR, first. Until this feature the app never held
// the student's audio at all. listenOnce() returns a STRING — Chrome's
// recogniser hears the student and hands back words — so two things were
// true and neither was visible from inside the app:
//
//   1. In a browser with no SpeechRecognition (Firefox anywhere, Safari
//      with Dictation off) the microphone buttons were rendered `disabled`
//      and the student was told to type. A share of every class was
//      practicing no speaking whatsoever, on the speaking screens.
//   2. Fluency was the wall clock between opening the microphone and the
//      transcript arriving. That interval is mostly the round trip to
//      Google's recogniser, so on a school connection a student who spoke
//      well read as hesitant. It was a network measurement printed under
//      the word "Fluency".
//
// Recording fixes both, and introduces a failure worse than either if it
// is done carelessly: the recorder and the recogniser are asked for one
// microphone at the same instant, one of them silently gets nothing, and
// the student is shown a transcript beside a play button that plays
// silence. Most of this file is about that, about the microphone light
// staying on after the exercise, and about the numbers a degenerate
// recording can produce — NaN, Infinity, or a confident pace derived from
// one word.
//
// It RUNS the code rather than reading it: a fake microphone that can be
// denied, revoked mid-take, held by another app, or handed to the
// recogniser only; a fake MediaRecorder with each browser's codec answer;
// and waveforms built by hand — silence, one word, unbroken speech, a room
// with a fan in it.
//
// No template literal carries a regex in this file. \s inside one is the
// letter s, and this project has been bitten by that seven times.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const SRC = process.argv[2];
const html = fs.readFileSync(SRC, 'utf8');
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/type\s*=\s*["']module["']/.test(m[1]))
  .map(m => m[2]);

const results = [];
function assert(n, c, detail){
  results.push(n + ': ' + (c ? 'PASS' : 'FAIL'));
  if(!c && detail !== undefined) results.push('    got: ' + JSON.stringify(detail));
}

//=====================================================================
// A CLASSROOM'S WORTH OF MICROPHONES, FAKED
//=====================================================================
const caps = {
  gum: 'ok',                 // ok | denied | no-mic | busy | unknown
  gumDelay: 0,
  hasMediaRecorder: true,
  isTypeSupported: null,     // null = the method is absent entirely
  constructorRefuses: null,  // a mimeType the constructor rejects anyway
  chunkBytes: 40000,         // 0 = the recorder was handed nothing at all
  hasSTT: true,
  sttResult: 'I went to the library after class',
  sttError: null,
};
let events = [];
let streams = [];
const urls = { made: [], revoked: [] };

const nodes = {};
const el = (id) => {
  if(id && nodes[id]) return nodes[id];
  const n = { style:{}, innerHTML:'', textContent:'', value:'', id: id || '', children: [],
    attrs: {},
    classList:{toggle(){},add(){},remove(){},contains:()=>false},
    addEventListener(){}, querySelector:()=>el(), querySelectorAll:()=>[],
    setAttribute(k, v){ this.attrs[k] = v; }, getAttribute(k){ return this.attrs[k]; },
    closest:()=>null, select(){}, focus(){}, remove(){}, insertBefore(){},
    getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}) };
  n.appendChild = c => { n.children.push(c); };
  n.parentNode = { insertBefore(){}, removeChild(){} };
  if(id) nodes[id] = n;
  return n;
};

function namedError(kind){
  const e = new Error(kind);
  e.name = kind === 'denied' ? 'NotAllowedError'
         : kind === 'no-mic' ? 'NotFoundError'
         : kind === 'busy'   ? 'NotReadableError'
         : 'TypeError';
  return e;
}
function makeStream(){
  const track = { kind:'audio', stopped:false, onended:null,
                  stop(){ this.stopped = true; } };
  const s = { tracks:[track], getTracks(){ return this.tracks; } };
  streams.push(s);
  return s;
}
function makeMediaRecorder(){
  function MR(stream, opts){
    this.stream = stream;
    this.mimeType = (opts && opts.mimeType) || '';
    if(caps.constructorRefuses && this.mimeType === caps.constructorRefuses){
      throw new Error('NotSupportedError');
    }
    this.state = 'inactive';
    this.ondataavailable = null; this.onstop = null; this.onerror = null;
    MR.made.push(this);
    this.start = () => { this.state = 'recording'; events.push('recorder-start'); };
    this.stop = () => {
      this.state = 'inactive';
      if(caps.chunkBytes > 0 && this.ondataavailable){
        this.ondataavailable({ data: new Blob([new Uint8Array(caps.chunkBytes)],
                                              { type: this.mimeType || 'audio/webm' }) });
      }
      if(this.onstop) this.onstop();
    };
  }
  MR.made = [];
  return MR;
}
// A recording the fluency code can actually decode: raw float samples in,
// the same samples out. Real containers are the browser's business; what
// this file needs to exercise is what happens to the NUMBERS afterwards.
function pcmBlob(samples, sampleRate){
  const f = Float32Array.from(samples);
  const head = new Float64Array([sampleRate]);
  return new Blob([new Uint8Array(head.buffer), new Uint8Array(f.buffer)], { type:'audio/webm' });
}
function makeAudioContext(mode){
  return function AudioCtx(){
    this.state = 'suspended';
    this.resume = () => { this.state = 'running'; return Promise.resolve(); };
    this.close = () => {};
    this.decodeAudioData = (buf) => {
      if(mode === 'throw') return Promise.reject(new Error('EncodingError'));
      const rate = new Float64Array(buf.slice(0, 8))[0];
      const pcm = new Float32Array(buf.slice(8));
      return Promise.resolve({ sampleRate: rate, length: pcm.length,
                               getChannelData: () => pcm });
    };
  };
}

class FakeURL extends URL {}
FakeURL.createObjectURL = () => { const u = 'blob:fake/' + urls.made.length; urls.made.push(u); return u; };
FakeURL.revokeObjectURL = u => { urls.revoked.push(u); };

const store = {};
const sandbox = {
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  document: { getElementById: id => el(id), createElement: () => el(), querySelector: () => el(),
              querySelectorAll: () => [], addEventListener(){}, body: el() },
  window: { addEventListener(){}, scrollTo(){} },
  localStorage: { getItem: k => (k in store ? store[k] : null),
                  setItem: (k, v) => { store[k] = String(v); },
                  removeItem: k => { delete store[k]; } },
  location: { origin:'https://hiajar.com', pathname:'/', hash:'', search:'', href:'https://hiajar.com/' },
  history: { replaceState(){} },
  navigator: {
    language:'en-US', languages:['en-US'],
    mediaDevices: {
      getUserMedia: () => {
        events.push('getUserMedia');
        return new Promise((resolve, reject) => setTimeout(() => {
          if(caps.gum === 'ok') resolve(makeStream());
          else reject(namedError(caps.gum));
        }, caps.gumDelay));
      },
    },
  },
  confirm: () => true,
  Audio: function(){ this.play = () => Promise.resolve(); this.pause = () => {}; },
  SpeechSynthesisUtterance: function(t){ this.text = t; },
  speechSynthesis: { speak(){}, getVoices(){ return []; }, addEventListener(){}, cancel(){} },
  URL: FakeURL, URLSearchParams, Blob, Uint8Array, Float32Array, Float64Array, ArrayBuffer,
  console: { log(){}, info(){}, warn(){}, error(){} },
  Date, Math, JSON, Array, Object, String, Number, Intl, Set, Map, Promise, Function, RegExp, Error,
  setInterval: (...a) => { const t = setInterval(...a); if(t && t.unref) t.unref(); return t; },
  setTimeout: (...a) => { const t = setTimeout(...a); if(t && t.unref) t.unref(); return t; },
  clearInterval, clearTimeout,
};
sandbox.self = sandbox.window;
sandbox.globalThis = sandbox;
const cloudStub = new Proxy({}, { get(_, p){
  if(p === 'pullClassSummaries') return async () => ({});
  if(p === 'currentUser') return () => null;
  return () => Promise.resolve();
} });
sandbox.window.CloudSync = cloudStub;
sandbox.CloudSync = cloudStub;
vm.createContext(sandbox);
vm.runInContext(blocks.join('\n;\n') +
  ';globalThis.__api={startVoiceClip,stopVoiceClip,releaseVoiceClip,voiceClipIsUsable,' +
  'voiceClipMimeType,supportsVoiceCapture,canPracticeAloud,supportsSTT,voiceClipDenialReason,' +
  'voiceClipReasonNote,analyseFluency,fluencyFromSamples,lrRecord,lrRunRecording,lrStopRecording,' +
  'lrPlaybackHtml,interviewFluencyFor,interviewFluencyNote,interviewMicLabel,interviewDraftChanged,' +
  'repeatAccuracy,playMyVoice,VOICE_CLIP_MAX_SECONDS,VOICE_CLIP_MIN_BYTES,FLUENCY_PAUSE_MS,' +
  'FLUENCY_MIN_WORDS_FOR_PACE};', sandbox);
const api = sandbox.__api;

// The two halves are switched on and off independently on purpose: a
// browser having one says nothing about it having the other, and every
// combination below is a device somebody in the class is holding.
const CAPS_DEFAULT = Object.assign({}, caps);
function setCaps(o){
  // Reset to the ordinary device first. A leftover 'denied' from the case
  // above is exactly how a test file starts asserting on the wrong world.
  Object.assign(caps, CAPS_DEFAULT, o);
  const MR = caps.hasMediaRecorder ? makeMediaRecorder() : undefined;
  if(MR && caps.isTypeSupported) MR.isTypeSupported = caps.isTypeSupported;
  sandbox.MediaRecorder = MR;
  sandbox.window.MediaRecorder = MR;
  const SR = caps.hasSTT ? function(){
    this.start = () => {
      events.push('recognition-start');
      setTimeout(() => {
        if(caps.sttError){
          if(this.onerror) this.onerror({ error: caps.sttError });
          if(this.onend) this.onend();
        } else if(this.onresult){
          this.onresult({ results: [[{ transcript: caps.sttResult }]] });
        }
      }, 0).unref && 0;
    };
  } : undefined;
  sandbox.SpeechRecognition = SR;
  sandbox.window.SpeechRecognition = SR;
  sandbox.window.webkitSpeechRecognition = undefined;
  sandbox.AudioContext = makeAudioContext(caps.decode || 'ok');
  sandbox.window.AudioContext = sandbox.AudioContext;
  sandbox.window.webkitAudioContext = undefined;
  return MR;
}
function reset(){
  // The leftover clip goes back BEFORE the counters are cleared, or the
  // previous case's revoke lands in this case's tally.
  api.releaseVoiceClip();
  events = []; streams = [];
  urls.made.length = 0; urls.revoked.length = 0;
  Object.keys(nodes).forEach(k => delete nodes[k]);
}
const settle = () => new Promise(r => setTimeout(r, 30));
const liveTracks = () => streams.reduce((n, s) => n + s.getTracks().filter(t => !t.stopped).length, 0);

// The Listen and Repeat screen, minus the eleven other renderers.
sandbox.currentItem = () => ({ id:'x', type:'listen-repeat', theme:'campus',
  data:{ set:[{ index:1, text:'I went to the library after class', seconds:8, scene:'campus' }] } });
function lrScreen(){
  el('lr-timer'); el('lr-result'); el('lr-playback');
  sandbox.window._lrState = { itemId:'x', step:0, played:true, results:[] };
}

(async () => {
//=====================================================================
// THE NORMAL CASE OF THIS FEATURE: BOTH HALVES, ONE MICROPHONE
//=====================================================================
// Not an edge case — recording runs IN PARALLEL with recognition every
// single time. If they cannot share the device, everything below is built
// on sand, so the order they are started in is asserted before anything
// else. getUserMedia is awaited FIRST, then recognition starts on top: it
// is the half that rejects with a name, and its permission dialog must be
// answered before the countdown, not out of the student's recording time.
{
  reset(); setCaps({ gum:'ok', hasMediaRecorder:true, hasSTT:true, chunkBytes:40000,
                     isTypeSupported: t => t === 'audio/webm;codecs=opus' });
  lrScreen();
  api.lrRecord('I went to the library after class', 8);
  await settle();
  assert('the microphone is opened before recognition is started',
    events.indexOf('getUserMedia') > -1 &&
    events.indexOf('getUserMedia') < events.indexOf('recognition-start'), events);
  assert('and the recorder is running before recognition asks for the same device',
    events.indexOf('recorder-start') > -1 &&
    events.indexOf('recorder-start') < events.indexOf('recognition-start'), events);
  assert('the transcript still scores, exactly as it did before recording existed',
    el('lr-result').innerHTML.indexOf('Repeat Accuracy: 5 / 5') > -1,
    el('lr-result').innerHTML.slice(0, 160));
  assert('and the student is offered their own voice back',
    el('lr-playback').innerHTML.indexOf('playMyVoice()') > -1,
    el('lr-playback').innerHTML.slice(0, 160));
  assert('next to the model clip, which is what makes the comparison teach',
    el('lr-playback').innerHTML.indexOf('data-speak') > -1);
  assert('the sentence is never interpolated into the playback onclick',
    el('lr-playback').innerHTML.indexOf("speak('") === -1);
  assert('the microphone is given back the moment the take ends',
    liveTracks() === 0, liveTracks());
}

//=====================================================================
// THE SAME MICROPHONE, AND ONE OF THE TWO GETS NOTHING
//=====================================================================
// The worst symptom this feature can produce: the transcript comes back,
// the student sees their words, and the recording is empty — so the play
// button would play silence. It must be withheld and named, not offered.
{
  reset(); setCaps({ chunkBytes:0 });   // recogniser won the device
  lrScreen();
  api.lrRecord('I went to the library after class', 8);
  await settle();
  assert('a take that recorded nothing still scores the transcript',
    el('lr-result').innerHTML.indexOf('Repeat Accuracy') > -1);
  assert('and does NOT offer a play button that would play silence',
    el('lr-playback').innerHTML.indexOf('playMyVoice()') === -1,
    el('lr-playback').innerHTML.slice(0, 120));
  assert('it says which of the two lost the microphone',
    el('lr-playback').innerHTML.indexOf('not to both at once') > -1,
    el('lr-playback').innerHTML.slice(0, 200));
  assert('and the microphone is still handed back', liveTracks() === 0);
}
// The mirror: audio arrived, recognition did not. The student loses the
// score and keeps their voice, which is the half worth more in a lesson.
{
  reset(); setCaps({ chunkBytes:40000, sttError:'no-speech' });
  lrScreen();
  api.lrRecord('I went to the library after class', 8);
  await settle();
  assert('a recognition failure still leaves the recording playable',
    el('lr-playback').innerHTML.indexOf('playMyVoice()') > -1,
    el('lr-playback').innerHTML.slice(0, 120));
  assert('and the recognition error is what the student is told about',
    el('lr-result').innerHTML.indexOf("didn't hear anything") > -1,
    el('lr-result').innerHTML.slice(0, 160));
}

//=====================================================================
// THE BROWSER THAT COULD NEVER RECORD SPEECH — FIREFOX, AND SAFARI
// WITH DICTATION OFF
//=====================================================================
// This is the students who had NOTHING. No transcript is possible, so no
// score is possible; a recording is, and hearing yourself against the
// model is the point of the exercise.
{
  reset(); setCaps({ hasSTT:false, hasMediaRecorder:true, chunkBytes:40000 });
  assert('a browser with a recorder and no recogniser can still practice aloud',
    api.canPracticeAloud() === true && api.supportsSTT() === false);
  lrScreen();
  api.lrRecord('I went to the library after class', 8);
  await settle();
  assert('recognition is not even attempted there',
    events.indexOf('recognition-start') === -1, events);
  assert('the student gets a way to end their own take',
    el('lr-playback').innerHTML.indexOf('lrStopRecording()') > -1,
    el('lr-playback').innerHTML.slice(0, 160));
  api.lrStopRecording();
  await settle();
  assert('and afterwards they can hear themselves',
    el('lr-playback').innerHTML.indexOf('playMyVoice()') > -1,
    el('lr-playback').innerHTML.slice(0, 160));
  assert('no score is invented from a transcript that does not exist',
    el('lr-result').innerHTML.indexOf('Repeat Accuracy:') === -1,
    el('lr-result').innerHTML.slice(0, 200));
  assert('and the screen says why there is no score rather than looking broken',
    el('lr-result').innerHTML.indexOf('cannot turn speech into text') > -1,
    el('lr-result').innerHTML.slice(0, 200));
  assert('the microphone does not stay open past the take', liveTracks() === 0);
}

//=====================================================================
// NO MEDIARECORDER AT ALL — THE OLD PATH, UNCHANGED
//=====================================================================
// This is addition, not replacement. A browser that cannot record must
// behave exactly as it did before this feature was written.
{
  reset(); setCaps({ hasMediaRecorder:false, hasSTT:true, chunkBytes:40000 });
  assert('a browser with no MediaRecorder reports no capture',
    api.supportsVoiceCapture() === false);
  assert('and asking to record is refused without touching the microphone',
    (await api.startVoiceClip()).reason === 'unsupported' && events.length === 0, events);
  lrScreen();
  api.lrRecord('I went to the library after class', 8);
  await settle();
  assert('the transcript path scores exactly as before',
    el('lr-result').innerHTML.indexOf('Repeat Accuracy: 5 / 5') > -1);
  assert('and nothing about playback is offered or mentioned',
    el('lr-playback').innerHTML === '', el('lr-playback').innerHTML.slice(0, 120));
}

//=====================================================================
// THE THREE REFUSALS, WHICH NEED THREE DIFFERENT SENTENCES
//=====================================================================
// "Allow it", "there isn't one" and "close Zoom" are three different
// actions. One vague apology sends all three students to the teacher.
{
  const cases = [
    ['denied',  'denied',  'refused for this site'],
    ['no-mic',  'no-mic',  'No microphone was found'],
    ['busy',    'busy',    'Zoom and Meet'],
    ['unknown', 'failed',  'could not be opened'],
  ];
  for(const [gum, reason, says] of cases){
    reset(); setCaps({ gum, hasSTT:true, hasMediaRecorder:true });
    const cap = await api.startVoiceClip();
    assert('a ' + gum + ' microphone is reported as "' + reason + '"',
      cap.ok === false && cap.reason === reason, cap);
    assert('and the student is told ' + JSON.stringify(says),
      api.voiceClipReasonNote(reason).indexOf(says) > -1, api.voiceClipReasonNote(reason));
    assert('a refused microphone leaves no stream held open for a ' + gum + ' device',
      liveTracks() === 0);
  }
}
// The combination the task names explicitly: recognition is permitted and
// getUserMedia is refused. They are separate prompts on some browsers, so
// one saying yes proves nothing about the other. The student must keep the
// score they had before this feature existed.
{
  reset(); setCaps({ gum:'denied', hasSTT:true, hasMediaRecorder:true });
  lrScreen();
  api.lrRecord('I went to the library after class', 8);
  await settle();
  assert('a refused recorder does not block the recogniser',
    events.indexOf('recognition-start') > -1, events);
  assert('and the transcript still scores',
    el('lr-result').innerHTML.indexOf('Repeat Accuracy: 5 / 5') > -1,
    el('lr-result').innerHTML.slice(0, 160));
  assert('with the microphone refusal explained beside it, not silently swallowed',
    el('lr-playback').innerHTML.indexOf('refused for this site') > -1,
    el('lr-playback').innerHTML.slice(0, 200));
}

//=====================================================================
// CODEC — MEDIARECORDER DOES NOT ACCEPT ONE MIMETYPE EVERYWHERE
//=====================================================================
// Safari records audio/mp4 and Chrome records audio/webm. Hardcoding
// either one breaks half a classroom, and this is measured rather than
// assumed because it is the trap that looks like it works on the machine
// the code was written on.
{
  reset();
  let MR = setCaps({ isTypeSupported: t => t === 'audio/webm;codecs=opus' });
  await api.startVoiceClip();
  assert('a Chrome-shaped browser records webm', MR.made[0].mimeType === 'audio/webm;codecs=opus',
    MR.made[0].mimeType);
  reset();
  MR = setCaps({ isTypeSupported: t => t === 'audio/mp4' });
  await api.startVoiceClip();
  assert('a Safari-shaped browser records mp4', MR.made[0].mimeType === 'audio/mp4',
    MR.made[0].mimeType);
  reset();
  MR = setCaps({ isTypeSupported: () => false });
  await api.startVoiceClip();
  assert('a browser that supports none of them falls back to its own default',
    MR.made.length === 1 && MR.made[0].mimeType === '', MR.made[0] && MR.made[0].mimeType);
  reset();
  MR = setCaps({ isTypeSupported: null });
  await api.startVoiceClip();
  assert('and so does one with no isTypeSupported to ask',
    MR.made.length === 1 && MR.made[0].mimeType === '', MR.made[0] && MR.made[0].mimeType);
  // isTypeSupported saying yes and the constructor saying no is a real
  // browser behaviour, and the whole reason no type is hardcoded.
  reset();
  MR = setCaps({ isTypeSupported: t => t === 'audio/webm;codecs=opus',
                 constructorRefuses: 'audio/webm;codecs=opus' });
  const cap = await api.startVoiceClip();
  assert('a type the constructor refuses anyway still yields a recording',
    cap.ok === true && MR.made.length === 1 && MR.made[0].mimeType === '', cap);
  assert('and no stream is stranded by the failed first attempt', liveTracks() === 1);
  api.releaseVoiceClip();
}

//=====================================================================
// THE MICROPHONE LIGHT AFTER THE EXERCISE IS OVER
//=====================================================================
// A stream whose tracks are not stopped leaves the light on. The student
// sees it and is right to mind: the microphone IS still open.
{
  reset(); setCaps({});
  await api.startVoiceClip();
  assert('a recording in progress holds exactly one live track', liveTracks() === 1);
  api.releaseVoiceClip();
  assert('walking off the screen mid-take stops it', liveTracks() === 0);

  // The impatient student pressing record twice.
  reset(); setCaps({});
  await api.startVoiceClip();
  await api.startVoiceClip();
  assert('a second take stops the first rather than stacking two microphones',
    streams.length === 2 && liveTracks() === 1, { streams: streams.length, live: liveTracks() });
  api.releaseVoiceClip();

  // Permission revoked in the browser settings with the page still open.
  reset(); setCaps({});
  await api.startVoiceClip();
  const track = streams[0].getTracks()[0];
  assert('a live track carries an ended handler, or a revoked permission hangs the screen',
    typeof track.onended === 'function');
  track.onended();
  await settle();
  assert('and revoking mid-take ends the recording instead of waiting for audio that is not coming',
    liveTracks() === 0);

  // Seven sentences on an old phone. Each take makes an object URL, and
  // a URL nobody revokes keeps its blob alive until the tab dies.
  reset(); setCaps({});
  for(let i = 0; i < 7; i++){
    await api.startVoiceClip();
    await api.stopVoiceClip();
    assert('take ' + (i+1) + ' of 7 never leaves a second microphone open', liveTracks() === 0);
  }
  api.releaseVoiceClip();
  assert('all seven object URLs are revoked, none left holding a blob',
    urls.made.length === 7 && urls.revoked.length === 7,
    { made: urls.made.length, revoked: urls.revoked.length });

  assert('nothing may hold the microphone open indefinitely',
    Number.isFinite(api.VOICE_CLIP_MAX_SECONDS) && api.VOICE_CLIP_MAX_SECONDS > 0 &&
    api.VOICE_CLIP_MAX_SECONDS <= 180, api.VOICE_CLIP_MAX_SECONDS);
}

//=====================================================================
// FLUENCY — THE NUMBERS A DEGENERATE RECORDING CAN PRODUCE
//=====================================================================
// Every case here is a real recording somebody will make, and every one of
// them divides by something that can be zero. An inflated or nonsensical
// score in a classroom is the worst thing this app can produce, so the
// rule is: no number at all beats a number that means nothing.
const RATE = 16000;
function tone(sec, amp){
  const n = Math.round(sec * RATE), out = new Array(n);
  for(let i = 0; i < n; i++) out[i] = amp * Math.sin(i * 0.07) * (1 + 0.4 * Math.sin(i * 0.0013));
  return out;
}
function hush(sec, amp){
  const n = Math.round(sec * RATE), out = new Array(n);
  for(let i = 0; i < n; i++) out[i] = amp * Math.sin(i * 1.7);   // room tone, not digital zero
  return out;
}
const allFinite = f => f === null || [f.durationSec, f.speechSec, f.pauses, f.longestPauseSec, f.words]
  .every(Number.isFinite) && (f.wpm === null || Number.isFinite(f.wpm));

{
  // Silence, and nothing said. The division that would produce Infinity.
  const silent = api.fluencyFromSamples(hush(6, 0.0008), RATE, '');
  assert('total silence reports no pace rather than Infinity',
    silent && silent.wpm === null, silent);
  assert('and says the recording was silent, so the student knows to check the mic',
    silent && silent.silent === true, silent);
  assert('no NaN reaches the student from a silent recording', allFinite(silent), silent);

  // Constant room noise — a projector fan. An energy threshold measured
  // against zero calls this continuous speech and scores a student who
  // said nothing as perfectly fluent.
  const fan = api.fluencyFromSamples(hush(6, 0.02), RATE, '');
  assert('a room with a constant fan in it is not counted as speaking',
    fan && fan.silent === true && fan.speechSec === 0, fan);

  // One word. Dividing one word by a fraction of a second yields any pace
  // you like, and it would be printed with two significant figures.
  const one = api.fluencyFromSamples(hush(0.4, 0.0008).concat(tone(0.5, 0.3), hush(0.4, 0.0008)),
                                     RATE, 'library');
  assert('one word is not enough to state a speaking pace',
    one && one.wpm === null, one);
  assert('and the app knows how few words it takes to be sure',
    api.FLUENCY_MIN_WORDS_FOR_PACE >= 2, api.FLUENCY_MIN_WORDS_FOR_PACE);

  // Unbroken speech. Nothing degenerate, and it must produce a real pace.
  const flowing = api.fluencyFromSamples(tone(6, 0.3), RATE,
    'I went to the library after class and read for about an hour before dinner');
  assert('unbroken speech reports no pauses', flowing && flowing.pauses === 0, flowing);
  assert('and a pace that is a real number', flowing && Number.isFinite(flowing.wpm) &&
    flowing.wpm > 0, flowing);
  assert('measured against speaking time, not against the whole recording',
    flowing && flowing.speechSec > 0 && flowing.speechSec <= flowing.durationSec, flowing);

  // Hesitant speech: three chunks with two long gaps.
  const gap = hush(1.2, 0.0008);
  const hesitant = api.fluencyFromSamples(
    tone(1.5, 0.3).concat(gap, tone(1.5, 0.3), gap, tone(1.5, 0.3)), RATE,
    'I went to the library after class and read for an hour');
  assert('two long gaps in the middle are counted as two pauses',
    hesitant && hesitant.pauses === 2, hesitant);
  assert('and the longest is reported in seconds a person can picture',
    hesitant && hesitant.longestPauseSec > 1 && hesitant.longestPauseSec < 1.5, hesitant);

  // Silence before the first word and after the last is not hesitation —
  // it is the recording window being longer than the answer. Counting it
  // would punish every student who finished early.
  const padded = api.fluencyFromSamples(
    hush(2.5, 0.0008).concat(tone(2, 0.3), hush(3, 0.0008)), RATE,
    'I went to the library after class');
  assert('the wait before the first word is not a pause', padded && padded.pauses === 0, padded);
  assert('and neither is the tail of an unused recording window',
    padded && padded.speechSec < padded.durationSec, padded);

  // Shorter than the analysis window itself.
  assert('a recording too short to analyse returns nothing rather than a number',
    api.fluencyFromSamples([0.1, 0.2], RATE, 'hello there my friend') === null);
  assert('and so does one with no samples at all',
    api.fluencyFromSamples([], RATE, 'hello there my friend') === null);
  assert('a zero sample rate cannot divide its way to Infinity',
    api.fluencyFromSamples(tone(2, 0.3), 0, 'hello there my friend') === null);

  // Transcript and audio can each be missing without the other.
  const noWords = api.fluencyFromSamples(tone(4, 0.3), RATE, '');
  assert('audio with an empty transcript reports pauses but no pace',
    noWords && noWords.wpm === null && noWords.speechSec > 0, noWords);
  assert('and still contains no NaN', allFinite(noWords), noWords);
}

//=====================================================================
// FLUENCY, END TO END, THROUGH THE DECODER
//=====================================================================
{
  reset(); setCaps({});
  const said = 'I went to the library after class and read for about an hour';
  const good = await api.analyseFluency(pcmBlob(tone(5, 0.3), RATE), said);
  assert('a decodable recording is measured', good && Number.isFinite(good.wpm), good);

  assert('an empty blob is not measured', await api.analyseFluency(new Blob([]), said) === null);
  assert('and neither is a missing one', await api.analyseFluency(null, said) === null);

  // A container the browser recorded but cannot read back is a real
  // outcome, and it gets "not measured" rather than a guess.
  sandbox.AudioContext = makeAudioContext('throw');
  sandbox.window.AudioContext = sandbox.AudioContext;
  assert('an undecodable recording is not measured rather than guessed',
    await api.analyseFluency(pcmBlob(tone(5, 0.3), RATE), said) === null);

  // iOS hands back a suspended AudioContext until a user gesture.
  sandbox.AudioContext = makeAudioContext('ok');
  sandbox.window.AudioContext = sandbox.AudioContext;
  const resumed = await api.analyseFluency(pcmBlob(tone(5, 0.3), RATE), said);
  assert('a suspended AudioContext is resumed rather than abandoned',
    resumed && Number.isFinite(resumed.wpm), resumed);

  // No AudioContext at all.
  sandbox.AudioContext = undefined; sandbox.window.AudioContext = undefined;
  sandbox.window.webkitAudioContext = undefined;
  assert('a browser with no AudioContext measures nothing and says nothing false',
    await api.analyseFluency(pcmBlob(tone(5, 0.3), RATE), said) === null);
  sandbox.AudioContext = makeAudioContext('ok');
  sandbox.window.AudioContext = sandbox.AudioContext;
}

//=====================================================================
// WHAT THE STUDENT ACTUALLY READS UNDER THE WORD "FLUENCY"
//=====================================================================
// Every branch above has to arrive as a sentence, and not one of them may
// print NaN, Infinity, or a pace it does not have.
{
  const sentences = [
    ['a typed answer', api.interviewFluencyNote(null)],
    ['a refused microphone', api.interviewFluencyNote({ state:'unavailable',
      why: api.voiceClipReasonNote('denied') })],
    ['a lost microphone', api.interviewFluencyNote({ state:'unavailable',
      why: api.voiceClipReasonNote('lost') })],
    ['a silent recording', api.interviewFluencyNote(
      Object.assign({ state:'ready' }, api.fluencyFromSamples(hush(6, 0.0008), RATE, '')))],
    ['one word', api.interviewFluencyNote(
      Object.assign({ state:'ready' }, api.fluencyFromSamples(
        hush(0.4, 0.0008).concat(tone(0.5, 0.3), hush(0.4, 0.0008)), RATE, 'library')))],
    ['unbroken speech', api.interviewFluencyNote(
      Object.assign({ state:'ready' }, api.fluencyFromSamples(tone(6, 0.3), RATE,
        'I went to the library after class and read for about an hour before dinner')))],
  ];
  sentences.forEach(([what, text]) => {
    assert('the fluency line for ' + what + ' never shows NaN or Infinity',
      text.indexOf('NaN') === -1 && text.indexOf('Infinity') === -1 &&
      text.indexOf('undefined') === -1 && text.indexOf('null') === -1, text);
    assert('the fluency line for ' + what + ' says something a student can act on',
      text.length > 40, text);
  });
  assert('a silent recording tells the student to check the microphone',
    sentences[3][1].indexOf('silent') > -1, sentences[3][1]);
  assert('a typed answer is told fluency is not measured from the clock',
    sentences[0][1].indexOf('not from the clock') > -1, sentences[0][1]);
  assert('a measured answer says where the number came from',
    sentences[5][1].indexOf('from your recording') > -1, sentences[5][1]);
}

//=====================================================================
// THE INTERVIEW SIDE
//=====================================================================
{
  reset(); setCaps({});
  el('interview-playback');
  const usable = await api.interviewFluencyFor(
    { blob: pcmBlob(tone(5, 0.3), RATE), url:'blob:x' },
    'I went to the library after class and read for about an hour', { ok:true });
  assert('a usable interview recording is measured', usable.state === 'ready', usable);
  assert('and the student is offered their own answer back',
    el('interview-playback').innerHTML.indexOf('playMyVoice()') > -1,
    el('interview-playback').innerHTML.slice(0, 160));
  assert('with the promise that it stays on the device stated where they can see it',
    el('interview-playback').innerHTML.indexOf('never uploaded') > -1,
    el('interview-playback').innerHTML.slice(0, 300));

  const denied = await api.interviewFluencyFor(null, 'some words here', { ok:false, reason:'denied' });
  assert('a refused microphone leaves fluency unmeasured and explained',
    denied.state === 'unavailable' && denied.why.indexOf('refused') > -1, denied);
  assert('and takes the play button away with it',
    el('interview-playback').innerHTML === '', el('interview-playback').innerHTML);

  // Pace comes from what was SAID. Typing over the answer must not leave a
  // speaking measurement attached to text nobody spoke.
  sandbox.window._interviewState = { draft:'' };
  sandbox.window._interviewFluency = { state:'ready' };
  sandbox.window._interviewFluencyPending = Promise.resolve();
  api.interviewDraftChanged('a completely different typed answer');
  assert('typing over the answer drops the measurement of the one that was spoken',
    sandbox.window._interviewFluency === null &&
    sandbox.window._interviewFluencyPending === null);
  assert('and the draft is still kept',
    sandbox.window._interviewState.draft === 'a completely different typed answer');

  // The mic button turns into a stop button in place, rather than the step
  // re-rendering and replacing the answer box under the student's cursor.
  const mic = el('interview-mic');
  api.interviewMicLabel(true);
  assert('the mic button becomes a stop button while recording',
    mic.textContent.indexOf('Stop') > -1 && mic.getAttribute('onclick') === 'interviewStopRecording()',
    { text: mic.textContent, onclick: mic.getAttribute('onclick') });
  api.interviewMicLabel(false);
  assert('and goes back to offering a new take afterwards',
    mic.getAttribute('onclick') === 'tryAnswer()', mic.getAttribute('onclick'));
}

//=====================================================================
// PRIVACY — THE RECORDING GOES NOWHERE
//=====================================================================
// A requirement, not a detail. This is a minor's voice in a school.
{
  const FORBIDDEN = ['localStorage', 'sessionStorage', 'CloudSync', 'fetch(', 'XMLHttpRequest',
                     'sendBeacon', 'WebSocket', 'FormData', 'setDoc', 'uploadBytes', 'indexedDB'];
  // Comments stripped first: this section's own prose PROMISES that none
  // of these appear near the recording, so scanning it unstripped catches
  // the promise instead of a breach of it.
  // From the OPENING of the banner comment, not from its title: a slice
  // that starts inside a block comment has no /* for the stripper to find,
  // and the whole banner survives as if it were code.
  const banner = html.indexOf("THE STUDENT'S OWN VOICE");
  const section = html.slice(html.lastIndexOf('/*', banner),
                             html.indexOf('STORAGE + GENERATION'))
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
  assert('the capture code was found where this check expects it', section.length > 2000, section.length);
  FORBIDDEN.forEach(tok => {
    assert('the recording code contains no ' + tok, section.indexOf(tok) === -1);
  });
  // And nowhere else in the file either: a future line that hands the clip
  // to any of those is the failure this assertion exists to stop.
  const lines = html.split('\n');
  const leaks = lines.filter(l => {
    const code = l.replace(/^\s*\/\/.*$/, '');
    if(code.indexOf('_voiceClip') === -1 && code.indexOf('clip.blob') === -1 &&
       code.indexOf('voiceClipIsUsable') === -1) return false;
    return FORBIDDEN.some(tok => code.indexOf(tok) > -1);
  });
  assert('the recorded clip is never handed to storage, to Firestore or to the network',
    leaks.length === 0, leaks.slice(0, 3));
  assert('the student is told, on the screen, that it stays on the device',
    html.indexOf('never uploaded, never saved') > -1);
  // The state of the world today, written where the next person will read
  // it: the SpeechRecognition already in use is not local.
  assert('it is written down that Chrome sends the student audio to Google',
    /Chrome streams the[\s\S]{0,80}Google/.test(html));
  // getUserMedia is dead on arrival if the deployed policy forbids it, and
  // nothing in the app would report that.
  const headers = fs.readFileSync(path.join(path.dirname(SRC), '_headers'), 'utf8');
  assert('the deployed permissions policy still allows the microphone',
    /Permissions-Policy:[^\n]*microphone=\(self\)/.test(headers));
}

//=====================================================================
// WHAT MUST NOT HAVE CHANGED
//=====================================================================
{
  // The wall clock is gone, not demoted to a fallback. A pace measured
  // from network latency is not a rougher fluency, it is a different
  // quantity wearing the name.
  assert('the wall-clock fluency proxy is deleted, not kept as a fallback',
    html.indexOf('_interviewTiming') === -1);
  assert('and nothing measures speaking with Date.now() any more',
    /elapsedSec/.test(html) === false);

  // repeatAccuracy already separates content words, function words, plural
  // and past markers, and transposition. None of that is touched by this.
  const r = api.repeatAccuracy('the students visited the library yesterday',
                               'the student visit library yesterday');
  assert('repeat accuracy still tells a plural ending from a missing word',
    r.markerErr >= 1, r);
  assert('and still reports which words went missing',
    r.ops.some(o => o.op === 'del'), r.ops);
  const perfect = api.repeatAccuracy('I went to the library', 'I went to the library');
  assert('an exact repetition is still 5 / 5', perfect.score === 5, perfect);

  // The disclaimers. An inflated score in a classroom is the worst failure
  // this app can produce, so no line here may quietly get more confident.
  assert('Listen and Repeat still says pronunciation is not measured',
    html.indexOf("that needs your teacher's ear") > -1);
  assert('the interview still says intelligibility is not measured',
    html.indexOf('Intelligibility (pronunciation):</b> not measured') > -1);
  assert('the new fluency line still says it is not the exam\'s judgement',
    html.indexOf("not the exam's full Fluency judgement") > -1);

  // Four places gated the microphone on the transcript alone. That is the
  // gate that told a Firefox student to type.
  assert('no microphone control is gated on the recogniser alone any more',
    html.indexOf("supportsSTT()?'':'disabled'") === -1);
  assert('the Listen and Repeat mic is gated on either half',
    html.indexOf("canPracticeAloud()?'':'disabled'") > -1);
  assert('and so is the interview mic',
    html.indexOf("btn ${canPracticeAloud()?'':'ghost'}") > -1);

  // Every way off a practice screen has to give the microphone back, or
  // the light stays on over whatever the student went to look at.
  ['function renderPracticeInner', 'function backToMyPage', 'function setView',
   'function finishExam', 'function lrSkip'].forEach(fn => {
    const start = html.indexOf(fn);
    const body = html.slice(start, start + 900);
    assert('leaving through ' + fn.replace('function ', '') + '() releases the microphone',
      start > -1 && body.indexOf('releaseVoiceClip()') > -1);
  });
  assert('and so does a reload with a recording in flight',
    /addEventListener\('pagehide', releaseVoiceClip\)/.test(html));

  // The exercise clock outranks the recording. When 45 seconds run out the
  // interview moves on, and on the real test the recording would stop at
  // that moment too — so the microphone must not survive the question it
  // belongs to. The path is advanceInterviewQuestion -> renderPractice ->
  // renderPracticeInner -> releaseVoiceClip, asserted link by link.
  const advance = html.slice(html.indexOf('function advanceInterviewQuestion'),
                             html.indexOf('MOCK EXAM'));
  assert('the interview clock running out moves the question on',
    advance.indexOf('renderPractice()') > -1);
  const renderPractice = html.slice(html.indexOf('function renderPractice()'),
                                    html.indexOf('function renderPractice()') + 200);
  assert('and that redraw goes through the release',
    renderPractice.indexOf('renderPracticeInner()') > -1);

  // The recording must not outrun the exercise clock it sits inside.
  assert('the hard cap on a recording is longer than the longest task clock',
    api.VOICE_CLIP_MAX_SECONDS > 45, api.VOICE_CLIP_MAX_SECONDS);
  assert('the countdown is still what ends a Listen and Repeat take',
    /if\(left <= 0\)\{ clearInterval\(tick\)/.test(html));
}

console.log(results.join('\n'));
const fails = results.filter(r => r.includes('FAIL'));
console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                         : ('ALL ' + results.length + ' CHECKS PASS'));
if(fails.length) process.exitCode = 1;
})().catch(e => { console.error('RUNTIME ERROR:', e.stack); process.exitCode = 1; });

// ---------------------------------------------------------------------
// VERIFICAÇÃO MANUAL PENDENTE — what a stubbed microphone cannot answer.
//
// Everything above runs against a fake getUserMedia and a fake
// MediaRecorder, so it proves the app's REACTIONS are right. It cannot
// prove the browser behaves the way the fake does. These are the exact
// steps, in the order they are worth doing, on real devices:
//
//   1. Chrome, desktop. Listen and Repeat, one sentence. Confirm the
//      transcript AND the playback both arrive from the same take — this
//      is the parallel-microphone claim, and it is the one that would
//      silently half-fail.
//   2. Safari, iPhone, Dictation ON. Same. Confirm the clip plays back
//      (Safari records audio/mp4) and that the fluency line appears —
//      decodeAudioData refusing its own container is the risk here.
//   3. Safari, iPhone, Dictation OFF. Confirm the record button is live,
//      Stop works, playback works, and no score is shown.
//   4. Firefox, desktop. Same as (3). This is the browser the feature was
//      written for.
//   5. Any device: deny the microphone at the prompt, then reload and
//      allow it. Confirm both sentences are the right one.
//   6. Any device: allow, record once, then revoke the microphone in the
//      site settings WITHOUT reloading. Record again.
//   7. Open Zoom, join a meeting, then record. Expect the "another app is
//      holding the microphone" sentence, and the transcript path intact.
//   8. Record, then watch the microphone indicator in the browser tab and
//      in the OS menu bar. It must go out when the take ends, when Skip is
//      pressed mid-take, and when the back button is used mid-take.
//   9. Seven sentences end to end on the oldest phone in the room, then
//      check memory in the browser's task manager. Nothing should grow.
//  10. A real classroom recording with the projector fan running and
//      nobody speaking: the fluency line must say "silent", not report a
//      pace. The noise floor here is calibrated on synthesised tone, and
//      this is the one number worth confirming against a real room.
// ---------------------------------------------------------------------
