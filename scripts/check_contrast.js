// Every colour pair in the app, measured against WCAG 2.1.
//
// This exists because a contrast bug is invisible to the person who wrote it.
// The dark theme shipped with white text on a light mint primary button —
// 2.01:1, below the floor for any text size, on Start, Approve and Generate —
// and nobody saw it, because whoever picked the mint was looking at the light
// theme. A number catches that; an eye does not.
//
// The palette is READ OUT OF index.html rather than copied here. A copy would
// agree with itself forever while the app drifted away from it.
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');

const results = [];
function assert(n, c){ results.push(n + ': ' + (c ? 'PASS' : 'FAIL')); }

// --- WCAG 2.1 relative luminance and contrast ratio ---
const chan = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
function lum(hex){
  let h = hex.replace('#', '').trim();
  if(h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}
function ratio(a, b){
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// --- pull the three theme blocks out of the stylesheet ---
// :root{...} is the light theme; the two dark blocks redefine the same names.
function tokensIn(block){
  const out = {};
  for(const m of block.matchAll(/--([a-z-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) out[m[1]] = m[2];
  return out;
}
function blockAfter(marker){
  const i = html.indexOf(marker);
  if(i === -1) return '';
  return html.slice(i, html.indexOf('}', i));
}
const light = tokensIn(blockAfter(':root{'));
const darkAuto = tokensIn(blockAfter('@media (prefers-color-scheme: dark)'));
const darkStamped = tokensIn(blockAfter(':root[data-theme="dark"]'));

assert('the light palette was found in the file', Object.keys(light).length > 10);
assert('so was the system-dark palette', Object.keys(darkAuto).length > 10);
assert('and the explicitly-chosen dark palette', Object.keys(darkStamped).length > 10);

// The two dark blocks must stay identical. If they drift, a viewer who picked
// dark and a viewer whose OS is dark see different colours — the kind of bug
// that only shows up on somebody else's phone.
const drift = Object.keys(darkAuto).filter(k => darkAuto[k] !== darkStamped[k]);
assert('both dark blocks define the same colours', drift.length === 0);
if(drift.length) results.push('    drift: ' + drift.join(', '));

// --- every pair the stylesheet actually puts together ---
// fg, bg, and whether the text is small (4.5:1) or large/bold (3.0:1).
const PAIRS = [
  ['primary button',            'btn-ink',  'accent',        4.5],
  ['ghost button',              'text',     'surface-alt',   4.5],
  ['discard button',            'red',      'red-soft',      4.5],
  ['approve button',            'green',    'green-soft',    4.5],
  ['audio button',              'purple',   'purple-soft',   4.5],
  ['body text on the page',     'text',     'bg',            4.5],
  ['body text on a panel',      'text',     'surface',       4.5],
  ['small notes on a panel',    'text-dim', 'surface',       4.5],
  ['small notes on the page',   'text-dim', 'bg',            4.5],
  ['small notes on a tint',     'text-dim', 'accent-soft',   4.5],
  ['small notes on alt',        'text-dim', 'surface-alt',   4.5],
  ['accent text on a panel',    'accent',   'surface',       4.5],
  ['accent text on a tint',     'accent',   'accent-soft',   4.5],
  ['pending status chip',       'amber',    'amber-soft',    4.5],
  ['the timer turning amber',   'amber',    'amber-soft',    4.5],
  ['red warnings on a panel',   'red',      'surface',       4.5],
  ['text on a tinted panel',    'text',     'accent-soft',   4.5],
];

[['light', light], ['dark', darkAuto]].forEach(([name, pal]) => {
  PAIRS.forEach(([label, fg, bg, need]) => {
    const f = pal[fg] || light[fg], b = pal[bg] || light[bg];
    if(!f || !b){ assert(name + ': ' + label + ' — tokens exist', false); return; }
    const r = ratio(f, b);
    assert(name + ': ' + label + ' reaches AA (' + r.toFixed(2) + ':1)', r >= need);
  });
});

// --- and nothing may hardcode a colour onto a themed background ---
// #fff baked into a rule whose background is a token is exactly how the dark
// theme broke: the background followed the theme and the ink did not.
const cssStart = html.indexOf('<style>'), cssEnd = html.indexOf('</style>', cssStart);
const css = html.slice(cssStart, cssEnd);
const baked = [...css.matchAll(/([^{}]+)\{([^}]*color\s*:\s*#(?:fff|ffffff|000|000000)[^}]*)\}/gi)]
  .filter(m => /background\s*:\s*var\(--/.test(m[2]))
  .map(m => m[1].trim().slice(0, 40));
assert('no rule pairs a hardcoded ink with a themed background', baked.length === 0);
if(baked.length) results.push('    ' + baked.join(' | '));

//===================================================================
// A FIELD'S EDGE IS NOT DECORATION
//===================================================================
/* WCAG 2.2 1.4.11 asks for 3:1 on whatever identifies a UI component. For a
   text field that is its border, and --border gave 1.35:1 against the card it
   sits on — with the field's own fill at 1.06:1 from that card, so nothing at
   all marked where the input began. Fine for anybody with good eyes and a
   wall between them and a lit window; not fine for a student on a phone in a
   classroom, which is the whole audience.

   --field-line is separate from --border on purpose: the decorative hairlines
   around panels and between rows are allowed to stay quiet, and darkening one
   token would have changed every one of them.

   Checked against all three surfaces a field can be drawn on, because a field
   inside a card and a field on the bare page are different backgrounds and
   only one of them was ever looked at. */
{
  // tokensIn strips the leading dashes — keys are 'surface', not '--surface'.
  const surfaces = ['surface', 'bg', 'surface-alt'];
  for(const [name, pal] of [['light', light], ['dark', darkStamped]]){
    const line = pal['field-line'];
    assert(name + ': a form field defines its own edge colour', !!line);
    if(!line) continue;
    for(const sfc of surfaces){
      const r = ratio(line, pal[sfc]);
      assert(name + ': the field edge reaches 3:1 on ' + sfc + ' (' + r.toFixed(2) + ':1)', r >= 3);
    }
  }
  assert('and every form control uses it, not the decorative border',
    html.indexOf('input[type=date]{ width:100%; font-family:inherit; font-size:.88rem; padding:.6rem .7rem; border-radius:9px; border:1px solid var(--field-line);') > -1);
}

console.log(results.join('\n'));
const fails = results.filter(r => r.includes('FAIL'));
console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                         : ('ALL ' + results.length + ' CHECKS PASS'));
if(fails.length) process.exitCode = 1;
