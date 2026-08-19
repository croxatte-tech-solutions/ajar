// The pre-rendered clips themselves. Every other check in this suite reads
// index.html; nothing has ever looked at the 672 files the student actually
// hears.
//
// The failure this catches is silent by construction. A clip is found by
// hashStr(its own text) with no manifest (see gen_audio.py), so a file that
// is truncated, empty or misnamed does not raise anything — the app just
// falls back to the device's own voice, and one student quietly gets the
// robotic Android reading while everyone else gets Piper. That is exactly
// the inconsistency the pre-rendering exists to remove.
//
// Deliberately parses the MPEG-4 atoms in plain Node rather than shelling
// out to ffprobe: the rest of the suite runs on a machine that has only
// node, and adding a binary dependency to keep that promise is a bad trade.
const fs = require('fs'), path = require('path');
const dir = process.argv[3] || 'audio';

const results = [];
function assert(n, c){ results.push(n + ': ' + (c ? 'PASS' : 'FAIL')); }
// Name at most three offenders: enough to go and look, short enough to read.
function assertNone(n, bad){
  assert(bad.length ? n + ' (' + bad.slice(0, 3).join(', ') +
    (bad.length > 3 ? ' +' + (bad.length - 3) + ' more' : '') + ')' : n, bad.length === 0);
}

// --- duration, straight out of the moov/mvhd atom ---
// Returns null when the box chain does not add up, which is itself the
// truncation signal: a clip cut short mid-upload ends inside an atom.
function probe(buf){
  let o = 0, moov = null, mdat = 0;
  while(o + 8 <= buf.length){
    const size = buf.readUInt32BE(o), type = buf.toString('latin1', o + 4, o + 8);
    if(size < 8 || o + size > buf.length) return null;   // chain broken
    if(type === 'moov') moov = buf.subarray(o + 8, o + size);
    if(type === 'mdat') mdat = size - 8;
    o += size;
  }
  if(o !== buf.length || !moov) return null;             // trailing garbage, or no header
  const i = moov.indexOf('mvhd');
  if(i < 0 || i + 36 > moov.length) return null;
  const v = moov[i + 4];
  // From the 'mvhd' type field: version(1) flags(3), then the times. The
  // v1 layout widens creation/modification to 64 bits, which pushes both
  // fields along -- reading the v0 offsets on a v1 box gives nonsense.
  const timescale = v === 1 ? moov.readUInt32BE(i + 24) : moov.readUInt32BE(i + 16);
  const units     = v === 1 ? Number(moov.readBigUInt64BE(i + 28)) : moov.readUInt32BE(i + 20);
  return timescale ? { sec: units / timescale, mdat } : null;
}

assert('the audio directory exists', fs.existsSync(dir));
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f !== '.DS_Store') : [];
assert('it is not empty', files.length > 0);

// The filename IS the lookup key — audioUrlFor() builds it from hashStr and
// nothing else. Any other name is a file no student can ever reach.
assertNone('every clip is named by its hash and nothing else',
  files.filter(f => !/^\d+\.m4a$/.test(f)));
assertNone('every hash is inside the 32-bit range hashStr can produce',
  files.filter(f => /^\d+\.m4a$/.test(f) && Number(f.slice(0, -4)) > 2147483647));

const clips = files.filter(f => /^\d+\.m4a$/.test(f))
  .map(f => ({ f, probe: probe(fs.readFileSync(path.join(dir, f))) }));

assertNone('no clip is truncated or malformed', clips.filter(c => !c.probe).map(c => c.f));

const ok = clips.filter(c => c.probe);
assertNone('no clip is silent', ok.filter(c => c.probe.mdat < 512).map(c => c.f));
/* MEASURED, NOT GUESSED — and the first pair of numbers were a guess.

   0.35s and 120s were reasoning from how long a word takes to say. The 672
   clips actually run from 1.23s to 71.47s: median 3.47, p95 27.6, p99 62.6.
   So the old floor sat three and a half times below anything real, which
   means a clip cut in half would have sailed through it — the exact failure
   this check exists to catch, waved past by a bound chosen for comfort.

   1.00s is 19% under the shortest real clip: tight enough that half a
   sentence trips it, loose enough that a new short line does not.

   120s stays, and now with a reason rather than a feeling. It is not a cap on
   content — it is the "generation ran away" bound, and the longest thing here
   is an academic talk at 71s, so it leaves 68% of headroom before a legitimate
   longer talk would false-alarm.

   The observed range is printed, so drift is visible without reading this
   comment: the day the shortest clip creeps under 1.2s, somebody sees it. */
const DUR_MIN = 1.0, DUR_MAX = 120;
const secs = ok.map(c => c.probe.sec).sort((a, b) => a - b);
assertNone('no clip is short enough to be a cut-off recording (floor ' + DUR_MIN + 's, shortest is ' +
  (secs.length ? secs[0].toFixed(2) : '?') + 's)', ok.filter(c => c.probe.sec < DUR_MIN).map(c => c.f));
assertNone('no clip is long enough to be two stuck together (ceiling ' + DUR_MAX + 's, longest is ' +
  (secs.length ? secs[secs.length - 1].toFixed(2) : '?') + 's)', ok.filter(c => c.probe.sec > DUR_MAX).map(c => c.f));

/* THE BRANCH THAT HAD NEVER RUN.

   All 672 clips carry a version 0 mvhd, so the version 1 path — where
   creation and modification times widen to 64 bits and push timescale and
   duration eight bytes along each — was written, shipped, and never once
   executed. Offsets checked against ISO/IEC 14496-12: with `i` at the type
   field, the body starts at i+8, so v1 puts timescale at i+24 and duration at
   i+28, which is what the code says.

   Reading a spec and agreeing with it is not the same as running the code, so
   here it runs. A synthetic mvhd is cheaper than finding a v1 file, and it
   fails loudly the day somebody 'simplifies' those offsets — which is the
   only way this branch was ever going to be defended, since no real clip
   exercises it. */
{
  const mvhd = Buffer.alloc(44);
  mvhd.write('mvhd', 0, 'latin1');
  mvhd[4] = 1;                                   // version 1
  mvhd.writeBigUInt64BE(0n, 8);                  // creation_time
  mvhd.writeBigUInt64BE(0n, 16);                 // modification_time
  mvhd.writeUInt32BE(48000, 24);                 // timescale
  mvhd.writeBigUInt64BE(96000n, 28);             // duration = 2.00s
  const moov = Buffer.concat([Buffer.alloc(8), mvhd]);
  const size = 8 + moov.length;
  const box = Buffer.alloc(size);
  box.writeUInt32BE(size, 0); box.write('moov', 4, 'latin1'); moov.copy(box, 8);
  const p = probe(box);
  assert('a version 1 mvhd is read with the 64-bit offsets, not the 32-bit ones',
    !!p && Math.abs(p.sec - 2) < 0.001);
}

console.log(results.join('\n'));
const fails = results.filter(r => r.includes('FAIL'));
console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                         : ('ALL ' + results.length + ' CHECKS PASS'));
if (fails.length) process.exitCode = 1;
