// The deployment surface: headers, special routes, and the manifest.
//
// None of this was checked by anything, and none of it is visible from the app.
// A header that quietly disappears from _headers looks exactly like a header
// that is working, and the audit brief listed missing CSP/HSTS/Permissions-Policy
// and SPA-fallback routes among its prior findings for exactly that reason.
//
// This reads the FILES, not a live response. It cannot prove Cloudflare applied
// them — only a request to the real domain can do that, and there is a smoke
// list at the bottom for whoever runs it. What it can prove is that the
// intended policy is still written down and still says what it should.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = f => { try{ return fs.readFileSync(path.join(root, f), 'utf8'); }catch(e){ return ''; } };

const headers = read('_headers');
const html = fs.readFileSync(process.argv[2] || path.join(root, 'index.html'), 'utf8');
const robots = read('robots.txt');
const sitemap = read('sitemap.xml');
const manifest = read('manifest.json');

const results = [];
function assert(n, c, detail){
  results.push(n + ': ' + (c ? 'PASS' : 'FAIL'));
  if(!c && detail !== undefined) results.push('    ' + detail);
}

//=====================================================================
// SECURITY HEADERS
//=====================================================================
assert('_headers exists and is not empty', headers.length > 200);

const REQUIRED = [
  ['a content security policy',      /Content-Security-Policy:/],
  ['nosniff',                        /X-Content-Type-Options:\s*nosniff/],
  ['a referrer policy',              /Referrer-Policy:/],
  ['a permissions policy',           /Permissions-Policy:/],
  ['HSTS',                           /Strict-Transport-Security:\s*max-age=\d+/],
  ['framing denied',                 /X-Frame-Options:\s*DENY|frame-ancestors\s+'none'/],
];
REQUIRED.forEach(([label, re]) => assert('the deploy sets ' + label, re.test(headers)));

const csp = (headers.match(/Content-Security-Policy:\s*([^\n]+)/) || [])[1] || '';

// connect-src is the directive that earns its place here. script-src cannot
// stop injected inline script in an app built on inline handlers, so what
// remains is denying the injected script anywhere to send what it takes.
assert('the CSP restricts where the page may connect', /connect-src[^;]+/.test(csp));
assert('and does not allow connecting anywhere', !/connect-src[^;]*\*(?!\.)/.test(csp));
assert('every host the app really loads from is allowed',
  csp.indexOf('https://www.gstatic.com') > -1 && /connect-src[^;]*googleapis\.com/.test(csp));

// Things that cost nothing here because the app uses none of them, and that
// close real attacks if one is ever injected.
[['object-src', "'none'"], ['base-uri', "'self'"], ['form-action', "'self'"], ['frame-ancestors', "'none'"]]
  .forEach(([d, v]) => assert('the CSP sets ' + d + ' ' + v, csp.indexOf(d + ' ' + v) > -1));

// eval is not needed by anything in this app, and a CSP that allows it has
// usually been widened to make an unrelated problem go away.
assert('the CSP does not allow eval', csp.indexOf('unsafe-eval') === -1);

// 'unsafe-inline' IS present in script-src and that is a documented ceiling,
// not an oversight. Asserted so nobody removes it and ships a blank app, and
// so the reason stays next to it.
assert('script-src still admits inline, as this architecture requires',
  /script-src[^;]*'unsafe-inline'/.test(csp));
assert('and the file explains why rather than leaving it bare',
  /WHY 'unsafe-inline' IS IN script-src/.test(headers));

// HSTS without preload, deliberately: preload is close to permanent and
// asserts every future subdomain is HTTPS-only.
assert('HSTS does not claim preload', !/Strict-Transport-Security:[^\n]*preload/.test(headers));

// The microphone is needed for Speaking; the camera and location are not, and
// this runs on shared school devices.
const pp = (headers.match(/Permissions-Policy:\s*([^\n]+)/) || [])[1] || '';
assert('the microphone is allowed, since Speaking records', /microphone=\(self\)/.test(pp));
assert('the camera is denied', /camera=\(\)/.test(pp));
assert('geolocation is denied', /geolocation=\(\)/.test(pp));

//=====================================================================
// SPECIAL ROUTES
//=====================================================================
// The brief reported these once answering with the application HTML.
assert('robots.txt exists', robots.length > 0);
// The failure this guards against is the SPA fallback answering with the
// application HTML, which the brief listed as a prior finding. So it looks for
// actual markup, not for any angle bracket — the first version fired on `<id>`
// inside a comment in this very file explaining share-link URLs.
assert('and is plain text, not the app HTML',
  !/<!doctype|<html|<script/i.test(robots));
assert('robots.txt is typed as text by the deploy', /\/robots\.txt[\s\S]{0,120}Content-Type:\s*text\/plain/.test(headers));

assert('sitemap.xml exists', sitemap.length > 0);
assert('and is valid-looking XML',
  /^<\?xml/.test(sitemap.trim()) && sitemap.indexOf('<urlset') > -1
  && !/<html|<script/i.test(sitemap));
assert('sitemap.xml is typed as XML by the deploy', /\/sitemap\.xml[\s\S]{0,120}Content-Type:\s*application\/xml/.test(headers));

//=====================================================================
// THE SHARE LINKS MUST NOT BE INDEXED
//=====================================================================
// A share link is /?s=1&school=<id>, and that id is what separates one
// school's material from another's for reading. An indexed share link makes a
// school's material searchable, which is the one thing the long random id
// exists to prevent.
assert('robots.txt asks crawlers to skip query-string URLs',
  /Disallow:\s*\/\?/.test(robots) || /Disallow:\s*\/\*\?/.test(robots));
assert('and a canonical link makes it not depend on the crawler being polite',
  /rel="canonical"\s+href="https:\/\/hiajar\.com\/"/.test(html));
assert('the canonical points at the bare domain, not at a share link',
  !/rel="canonical"[^>]*\?/.test(html));

//=====================================================================
// CACHE POLICY, WHICH WAS THE ORIGINAL REASON FOR THIS FILE
//=====================================================================
assert('the app itself is never cached stale', /\/index\.html[\s\S]{0,80}no-cache/.test(headers));
assert('the service worker is never cached stale', /\/sw\.js[\s\S]{0,80}no-cache/.test(headers));
// Audio is content-addressed — the filename is a hash of the words spoken — so
// immutable is a fact here rather than a gamble.
assert('audio is immutable for a year', /\/audio\/\*[\s\S]{0,120}immutable/.test(headers));

//=====================================================================
// MANIFEST
//=====================================================================
let m = null;
try{ m = JSON.parse(manifest); }catch(e){}
assert('manifest.json parses', !!m);
if(m){
  assert('the manifest carries no byline', JSON.stringify(m).indexOf('croxatte') === -1);
  assert('it has a start_url and a scope', !!m.start_url && !!m.scope);
  assert('and both are relative, so the app works on any host',
    String(m.start_url).indexOf('http') !== 0 && String(m.scope).indexOf('http') !== 0);
  assert('it declares both icon sizes', (m.icons || []).length >= 2);
  (m.icons || []).forEach(i => {
    assert('icon ' + i.src + ' exists on disk', fs.existsSync(path.join(root, i.src)));
  });
}

console.log(results.join('\n'));
const fails = results.filter(r => r.includes('FAIL'));
console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                         : ('ALL ' + results.length + ' CHECKS PASS'));
if(fails.length) process.exitCode = 1;

// Not checkable from here: whether Cloudflare actually applied any of it.
// Run this against the real domain after a deploy.
if(process.env.AJAR_SMOKE){
  console.log('\n  Smoke list for the live domain — run by hand after deploy:');
  [ 'curl -sI https://hiajar.com/ | grep -i "content-security-policy\\|strict-transport\\|x-content-type\\|referrer-policy\\|permissions-policy"',
    'curl -s -o /dev/null -w "%{content_type}\\n" https://hiajar.com/robots.txt   # expect text/plain',
    'curl -s -o /dev/null -w "%{content_type}\\n" https://hiajar.com/sitemap.xml  # expect application/xml',
    'curl -s -o /dev/null -w "%{http_code}\\n" https://hiajar.com/nao-existe-nada  # expect 404, not 200',
  ].forEach(c => console.log('    ' + c));
}
