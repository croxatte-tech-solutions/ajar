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

`isSignedIn()` is **not** an access check. Every visitor is signed in, because
students sign in anonymously. Three separate holes in this file came from
using it as one. Use `hasAccount()`, `isMemberOf()`, `isTeacherOf()` or
`isAdmin()`.

## Before you finish

```
sh scripts/qa.sh
```

Must be green — 3,300+ checks across 40 `scripts/check_*.js`. The pre-commit
hook enforces it and GitHub Actions re-runs it (`.github/workflows/qa.yml`).
New behaviour gets a check in the same style: named assertions that say what
would be wrong, not what the code does.

```
AJAR_RULES=1 sh scripts/qa.sh
```

runs `firestore.rules` against the real Firestore emulator — 113 assertions,
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
