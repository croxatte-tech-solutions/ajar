# Ajar — working notes for Claude

Read `README.md` for what the app is. This file is only the things that are
easy to get wrong from the code alone, and the things that have already been
got wrong.

## Shape

One file: `index.html`, ~14,700 lines, plain HTML/CSS/JS. **No package.json,
no build step, no framework — deliberately.** Do not introduce a bundler, a
`node_modules`, or a component library. The whole point is that there is
nothing between the source and what the student's browser runs.

Firebase (Auth + Firestore) for accounts and sync — `firestore.rules`. Hosted
on Cloudflare Pages, not GitHub Pages, because `_headers` carries the cache
policy: the audio is immutable, the page must never be stale.

## Padrão C — the rule that outranks everything

The teacher has the final word. Nothing generated reaches a student, and
nothing a student does counts, until a teacher approves it. This is **data
modelling, not a button**: a suggestion lives as a pending record, and only an
explicit approval makes it visible. Never add a path that skips it.

Also out of scope, permanently: SEVIS/I-20 or any immigration data, and any
clinical diagnosis or label for a student.

## The name

The product is **Ajar**, everywhere a person can see it. `hiajar.com` is the
address only. `hi` must never appear in the product name, in UI text, or in
code that renders a name.

## Silent failure is the bug this project keeps having

Read this before writing any code that talks to Firestore.

Every incident in this app's history is the same shape: a write did not arrive,
the local copy was written first, so the screen in front of the person looked
correct and nobody found out. It has cost a lesson. It has emptied a class
list, pointed QR codes at documents that were never written, and hidden every
student's practice from their teacher — each time by succeeding locally and
failing quietly on the far side.

So: **every CloudSync method that writes must be able to report its failure** —
through a non-empty `.catch()`, inside a `try` whose catch has a body, or via a
named wrapper whose job is reporting. `scripts/check_write_reporting.js`
enforces this and its baseline is zero.

Reads are exempt on purpose: a read that fails leaves the screen as it was,
which is a state the person can already see. A write that fails leaves a lie on
it.

Firestore runs with a persistent local cache, so a dropped second queues the
write instead of losing it. That reduces how often this happens; it does not
remove the need to report.

## Audio is content-addressed — this bites

`audioUrlFor(text)` = `audio/` + `hashStr(text)` + `.m4a`. There is no
manifest. So **editing any spoken string changes its hash, the clip is no
longer found, and that student silently drops to their device's own TTS** —
exactly the inconsistency the pre-rendering exists to remove.

Edit a spoken string ⇒ regenerate its clip (`scripts/gen_audio.py`,
`gen_dialogue.py`, `gen_all.py`) in the same change.

Voices are Piper, MIT-licensed, which is why the generated audio is
redistributable. Do not swap them for a hosted TTS API: it breaks both the
licence and the promise that every student hears the identical voice.

`scripts/check_audio.js` reads the 672 clips themselves — names, truncation,
duration — by parsing MPEG-4 atoms in plain Node, because the suite promises to
run on a machine that has only node.

## The microphone: two of them, one device

`listenOnce()` is SpeechRecognition and returns a **string**. `startVoiceClip()`
is MediaRecorder and returns **audio**. They run at the same time, on the same
microphone, and that is the normal case here rather than an edge one.

**Order is load-bearing.** `getUserMedia` is awaited FIRST, then recognition
starts on top. It is the half that rejects with a name — `NotAllowedError`,
`NotFoundError`, `NotReadableError` — so asking first is the only way to tell
"you refused it" from "there is no microphone" from "Zoom is holding it".
Started second, its prompt lands behind a running recognition session and its
refusal arrives too late to say anything useful.

**The failure to expect** is that one of the two silently gets nothing: the
transcript arrives, the student sees their words, and the recording is empty —
so a play button would play silence. `voiceClipIsUsable()` is the guard, and
the empty case says which half lost the device instead of pretending.

**Never hardcode a mimeType.** Safari records `audio/mp4`, Chrome records
`audio/webm`, and `isTypeSupported` can say yes to a type the constructor then
refuses. Ask, then fall through to the browser's default.

**The recording never leaves the device.** Not Firestore, not localStorage, not
any network. It lives in `window._voiceClip` and is released on every way off a
practice screen, because a stream whose tracks are not stopped is a microphone
light still on after the exercise — which the student can see, and is right to
mind. Note, separately and already true before this: the Chrome
SpeechRecognition this app uses streams the student's audio to Google.

**Fluency is read out of the waveform, not off the clock.** The old proxy was
the wall time between opening the microphone and the transcript coming back —
mostly the round trip to Google's recogniser, so a slow connection made a
student read as hesitant. It is deleted, not demoted to a fallback. What
replaces it is pace over VOICED seconds (words from the transcript, never from
the typed box) and the pauses between the first and last word. Every degenerate
recording — silence, one word, a clip shorter than one analysis window, a room
with a fan in it — returns no number rather than a wrong one.

`scripts/check_speech_capture.js` runs this against a fake microphone that can
be denied, revoked mid-take or held by another app, and against waveforms built
by hand. What it cannot prove is that real browsers behave like the fake; the
manual list at the foot of that file is the part a person still has to do.

## Which English — three different answers, and one was got wrong

The TOEFL Listening section carries North American, British, Australian and New
Zealand voices **deliberately**; ETS says so. North American is the most common
of four, not the only one.

- **Listening keeps its British English.** Removing it would make this app less
  like the exam, not more. A check fails if it ever reaches zero.
- **Reading uses American spelling**, because ETS writes its own materials that
  way.
- **Writing accepts either and marks consistency** — `colour` and `organize` in
  one essay costs a mark though each is correct somewhere. The app says so.

The instinct "the TOEFL is American, standardise everything" was wrong and was
caught before it shipped. Verify what ETS publishes before acting on what you
remember about it.

## Scoring is honestly approximate — keep it that way

Speaking and writing scores are text and timing proxies, not the real ETS
rubric, and the UI says so in plain words. The Writing band currently covers
Build a Sentence only; email and academic discussion are left to a human.

Never delete or soften one of those disclaimers to make a score look more
authoritative. An inflated score in a classroom is the worst failure this app
can produce.

## Accounts, and what the rules actually enforce

A teacher is somebody with a `teachers/{uid}` record, not somebody with a
login. An administrator is `admins/{uid}`, created in the console and by
nothing else. A teacher signup writes to `teacherRequests` and **grants
nothing** — the school name it carries is evidence for a person to read, never
authority.

`users/{uid}` holds email, country and date of birth. **Read** is the owner or
an administrator; **write and delete** are the owner alone. Never the teacher,
never a classmate. The administrator's read was opened on 18 August 2026 by the
owner's decision, because he answers for the service — ages, data requests,
erasure — and none of that works against records nobody may read.

That change also rewrote the privacy notice, which had promised the opposite
by name. `check_age_gate` now reads `firestore.rules` and fails if the two
disagree in either direction. Before it existed, the rule and the promise
drifted apart with the suite fully green: every assertion checked that the
promise was PRESENT, none that it was TRUE.

A person has **two names**. `fullName` is theirs, in their own language and
alphabet, and never leaves `users/{uid}`. `displayName` is what a room calls
them, and it is the only one copied into `schools/{id}/students/{uid}` where
the class and the teacher read it. Renaming has to write both: the class
record is otherwise only written when somebody practises, so the teacher goes
on seeing the old name — right where the person is looking, stale everywhere
else, which is this app's oldest failure shape.

**`signInAnonymously()` does not return whoever is already signed in.** With a
real session in place it mints a new anonymous user and REPLACES it. Restoring
a saved session is asynchronous, so calling it at module load races the
restore, and when it wins a signed-in person silently becomes a stranger. It
cost a day, reported as two unrelated bugs — "it keeps asking me to log in"
and "it does not take me to my screen". Call it only from the first
`onAuthStateChanged` callback, and only when that callback has no user.

Nothing in the suite can catch that class of bug: every check runs against a
stubbed CloudSync, so the real listener is never exercised. What the checks
assert is the shape.

## The routes into an exercise, and the order the questions come in

Three parameters reach an exercise: `?ex=<id>` (one exercise), `?s=1` (the
whole class), and the legacy `#batch=<payload>` that carries everything in the
URL. `?school=<id>` rides along with all of them.

`loadSharedClassroomContent()` asks three questions and **the order is
load-bearing**, the same way the microphone's is:

1. **Is there a connection?** Firebase comes from a CDN, so a school network
   that blocks gstatic leaves `window.CloudSync` undefined — and `hasAccount()`
   reads CloudSync, so it answers false for a signed-in student too. Asked
   after the account gate, that gate answered for everybody: a student on that
   wifi scanning the code on the wall was told to sign in, sent to a screen
   that needs the connection they do not have. `SCAN_ERRORS.offline` was
   written for exactly that person and was unreachable.
2. **Is there an account?** Then, and only for a link that names a class.
3. **What does the id resolve to?**

Two more things that are easy to undo:

- `params.get('ex')` is `null` when absent and `''` when the link says `?ex=`
  and stops. Test `!== null`, not truthiness — `''` used to skip the branch
  that never falls back and resolve like a plain visit, which is the QR
  incident by another door.
- A published item's document is never deleted, so its code keeps resolving
  after the teacher takes the exercise back. The route filters on
  `status === 'approved'` and reports `gone` otherwise. Padrão C is not a
  screen further down; a route may not be the exception to it.

`scripts/check_links.js` runs every route against a fake CloudSync that can be
absent, denied or empty, and also walks every anchor in the file: no `<a>`
without an href, no `javascript:` URL, `noopener noreferrer` on the one
`target="_blank"`, and no two links on one screen saying the same words and
going to different places. The complete list of external destinations is a
comment at the foot of that file — read it before adding a new one.

`isSignedIn()` is **not** an access check. Every visitor is signed in, because
students sign in anonymously. Three separate holes in this file came from
using it as one. Use `hasAccount()`, `isMemberOf()`, `isTeacherOf()` or
`isAdmin()`.

## Before you finish

```
sh scripts/qa.sh
```

Must be green — 3,400+ checks across 41 `scripts/check_*.js`. The pre-commit
hook enforces it and GitHub Actions re-runs it (`.github/workflows/qa.yml`).
New behaviour gets a check in the same style: named assertions that say what
would be wrong, not what the code does.

```
AJAR_RULES=1 sh scripts/qa.sh
```

runs `firestore.rules` against the real Firestore emulator — 118 assertions,
needs Java. Run it before publishing rules to the console. It has found live
holes on its first run more than once.

**When a check disagrees with the app, ask which one is wrong.** It has been
both. Do not loosen a check to make it pass.

Two traps that have cost real time:

- `scripts/ip_audit.js` is **not** in that suite and not in CI — it needs the
  ETS corpus, which must never be committed. Run it locally before a release;
  any 7-word sequence shared with ETS material fails.
- `scripts/dump_texts.js` writes its output to `argv[3]` and does not exit on
  its own — fine when piped to a generator, do not put it in a blocking check.

And one that has cost it a dozen times in one day: **a probe that lives inside
a template literal loses its backslashes.** `\s` becomes the letter `s`, `\b`
vanishes, and the check passes while measuring the wrong thing. Write `\\s` in
the file, or avoid the regex entirely — a substring count cannot lose a
backslash.

## Where history lives

`PROGRESS.md` — hours and commits per session. `AUDITORIA-CLINICA.md` — the
clinical audit and its verdict. `PROMPT-CONTAS.md` and
`PROMPT-REVISAO-LINGUISTICA.md` — the reasoning behind the accounts work and
the linguistic review, written before the code.
